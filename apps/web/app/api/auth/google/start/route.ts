import { NextResponse, type NextRequest } from "next/server";

import { isGoogleSignInIntent } from "@/lib/auth/google";
import {
    buildAuthorizeUrl,
    createPkcePair,
    createState,
    encodeHandshake,
    readOAuthConfig,
    redirectToAuthPage,
    resolveRedirectUri,
    HANDSHAKE_TTL_SECONDS,
    OAUTH_COOKIE_PATH,
    OAUTH_HANDSHAKE_COOKIE,
} from "@/lib/auth/googleOAuth";

/**
 * Step one: send the user to Google's consent screen.
 *
 * A GET rather than a POST because it is reached by a top-level navigation,
 * and it changes nothing on our side beyond a single-use handshake cookie.
 */
const GET = async (request: NextRequest) => {
    const intentParam = request.nextUrl.searchParams.get("intent");
    // An unrecognised intent is a hand-typed URL, not an error worth showing:
    // signing up is the safe reading, and the callback still routes them back.
    const intent = isGoogleSignInIntent(intentParam) ? intentParam : "signup";

    const config = readOAuthConfig();

    if (!config) {
        // Misconfiguration, not user error. Named in the log, never in the UI.
        console.error("google oauth: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is not configured");
        return redirectToAuthPage(request, intent, "error");
    }

    const { verifier, challenge } = createPkcePair();
    const state = createState();

    const response = NextResponse.redirect(
        buildAuthorizeUrl({
            clientId: config.clientId,
            redirectUri: resolveRedirectUri(request),
            state,
            codeChallenge: challenge,
        }),
    );

    response.cookies.set(OAUTH_HANDSHAKE_COOKIE, encodeHandshake({ state, verifier, intent }), {
        // The verifier is the half of PKCE that must stay ours: readable by
        // script, it would let an intercepted code be redeemed by the reader.
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        // Lax, not Strict: Google's callback is a cross-site top-level GET,
        // and Strict would withhold the cookie exactly when it is needed.
        sameSite: "lax",
        path: OAUTH_COOKIE_PATH,
        maxAge: HANDSHAKE_TTL_SECONDS,
    });

    return response;
};

export { GET };
