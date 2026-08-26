import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import {
    AUTH_STATUS_PARAM,
    authPagePath,
    isGoogleSignInIntent,
    type AuthStatus,
    type GoogleSignInIntent,
} from "@/lib/auth/google";

/**
 * The server half of Google sign-in.
 *
 * Importing node:crypto keeps this module out of any client bundle by
 * construction: a client component importing it fails the build rather than
 * shipping GOOGLE_CLIENT_SECRET to the browser.
 */

const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

/** Holds the PKCE verifier and CSRF state across the trip to Google. */
const OAUTH_HANDSHAKE_COOKIE = "wrench_google_oauth";

/** Scoped to the routes that read it, so it is not sent with page requests. */
const OAUTH_COOKIE_PATH = "/api/auth/google";

/** Long enough to read a consent screen, short enough that a stale tab fails. */
const HANDSHAKE_TTL_SECONDS = 10 * 60;

const TOKEN_REQUEST_TIMEOUT_MS = 10_000;

type OAuthConfig = { clientId: string; clientSecret: string };

/** What the start route stashes for the callback route to check. */
type OAuthHandshake = {
    state: string;
    verifier: string;
    intent: GoogleSignInIntent;
};

const readOAuthConfig = (): OAuthConfig | null => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) return null;

    return { clientId, clientSecret };
};

/**
 * Where Google sends the user back.
 *
 * Derived from the incoming request so local, preview and production each work
 * without their own env var; GOOGLE_REDIRECT_URI overrides it for deployments
 * that sit behind a proxy rewriting the host. Either way Google only accepts
 * a URI registered on the OAuth client, so a spoofed Host fails at Google.
 */
const resolveRedirectUri = (request: NextRequest) =>
    process.env.GOOGLE_REDIRECT_URI ??
    new URL(`${OAUTH_COOKIE_PATH}/callback`, request.nextUrl.origin).toString();

/** RFC 7636 S256: a random verifier, and the SHA-256 hash Google is shown. */
const createPkcePair = () => {
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");

    return { verifier, challenge };
};

const createState = () => randomBytes(16).toString("base64url");

const encodeHandshake = (handshake: OAuthHandshake) =>
    Buffer.from(JSON.stringify(handshake)).toString("base64url");

const decodeHandshake = (raw: string | undefined): OAuthHandshake | null => {
    if (!raw) return null;

    let parsed: unknown;

    try {
        parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    } catch {
        return null;
    }

    if (typeof parsed !== "object" || parsed === null) return null;

    const { state, verifier, intent } = parsed as Record<string, unknown>;

    if (typeof state !== "string" || state.length === 0) return null;
    if (typeof verifier !== "string" || verifier.length === 0) return null;
    if (!isGoogleSignInIntent(intent)) return null;

    return { state, verifier, intent };
};

/**
 * Compared in constant time. The state is ours rather than a secret, but a
 * length-revealing early exit is a habit worth not forming.
 */
const stateMatches = (expected: string, received: string | null) => {
    if (received === null) return false;

    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(received, "utf8");

    if (a.length !== b.length) return false;

    return timingSafeEqual(a, b);
};

const buildAuthorizeUrl = ({
    clientId,
    redirectUri,
    state,
    codeChallenge,
}: {
    clientId: string;
    redirectUri: string;
    state: string;
    codeChallenge: string;
}) => {
    const url = new URL(GOOGLE_AUTHORIZE_URL);

    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    // Without this Google silently reuses whichever account the device is
    // already signed in on, which is the wrong default on a shared machine.
    url.searchParams.set("prompt", "select_account");

    return url.toString();
};

type TokenExchangeResult =
    | { status: "ok"; idToken: string }
    /** `reason` is for our logs only — it is never shown to the user. */
    | { status: "failed"; reason: string };

/**
 * Trades the authorization code for Google's ID token.
 *
 * Neither the code, the verifier, nor the token is ever logged: a code plus a
 * verifier is a session for whoever reads the log line.
 */
const exchangeCodeForIdToken = async ({
    config,
    code,
    verifier,
    redirectUri,
}: {
    config: OAuthConfig;
    code: string;
    verifier: string;
    redirectUri: string;
}): Promise<TokenExchangeResult> => {
    let response: Response;

    try {
        response = await fetch(GOOGLE_TOKEN_URL, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                client_id: config.clientId,
                client_secret: config.clientSecret,
                code,
                code_verifier: verifier,
                grant_type: "authorization_code",
                redirect_uri: redirectUri,
            }),
            // Without this a hung token endpoint leaves the user on a blank
            // callback until the platform's own timeout fires.
            signal: AbortSignal.timeout(TOKEN_REQUEST_TIMEOUT_MS),
            cache: "no-store",
        });
    } catch (cause) {
        return { status: "failed", reason: cause instanceof Error ? cause.name : "unknown" };
    }

    if (!response.ok) return { status: "failed", reason: `http_${response.status}` };

    let payload: unknown;

    try {
        payload = await response.json();
    } catch {
        return { status: "failed", reason: "malformed_response" };
    }

    const idToken = (payload as { id_token?: unknown })?.id_token;

    if (typeof idToken !== "string" || idToken.length === 0) {
        return { status: "failed", reason: "no_id_token" };
    }

    return { status: "ok", idToken };
};

/**
 * Sends the user back to whichever screen they started on, carrying the
 * outcome as a query parameter. The status is all that travels: the ID token
 * never appears in a URL, where it would reach history and the referer header.
 */
const redirectToAuthPage = (request: NextRequest, intent: GoogleSignInIntent, status: AuthStatus) => {
    const url = new URL(authPagePath(intent), request.nextUrl.origin);
    url.searchParams.set(AUTH_STATUS_PARAM, status);

    return NextResponse.redirect(url);
};

export {
    buildAuthorizeUrl,
    createPkcePair,
    createState,
    decodeHandshake,
    encodeHandshake,
    exchangeCodeForIdToken,
    readOAuthConfig,
    redirectToAuthPage,
    resolveRedirectUri,
    stateMatches,
    GOOGLE_AUTHORIZE_URL,
    GOOGLE_TOKEN_URL,
    HANDSHAKE_TTL_SECONDS,
    OAUTH_COOKIE_PATH,
    OAUTH_HANDSHAKE_COOKIE,
};
export type { OAuthConfig, OAuthHandshake, TokenExchangeResult };
