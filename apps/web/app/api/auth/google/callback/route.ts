import { type NextRequest } from "next/server";

import type { AuthStatus } from "@/lib/auth/google";
import { exchangeGoogleIdToken } from "@/lib/auth/exchange";
import {
    decodeHandshake,
    exchangeCodeForIdToken,
    readOAuthConfig,
    redirectToAuthPage,
    resolveRedirectUri,
    stateMatches,
    OAUTH_COOKIE_PATH,
    OAUTH_HANDSHAKE_COOKIE,
} from "@/lib/auth/googleOAuth";

/**
 * Step two: Google sends the user back here with an authorization code.
 *
 * Every path out of this handler is a redirect to the page the user started
 * on, carrying only a status. Nothing renders here, so a failure can never
 * strand the user on a blank callback URL.
 */
const GET = async (request: NextRequest) => {
    const handshake = decodeHandshake(request.cookies.get(OAUTH_HANDSHAKE_COOKIE)?.value);
    // With no handshake there is no intent to honour; signup is where an
    // unrecognised visitor should land.
    const intent = handshake?.intent ?? "signup";
    const params = request.nextUrl.searchParams;

    const finish = (status: AuthStatus) => {
        const response = redirectToAuthPage(request, intent, status);
        // Single-use whatever the outcome: leaving it set would let a replayed
        // callback URL reuse the verifier.
        response.cookies.delete({ name: OAUTH_HANDSHAKE_COOKIE, path: OAUTH_COOKIE_PATH });

        return response;
    };

    const error = params.get("error");

    if (error) {
        // Closing the consent screen is a decision, not a fault, and should
        // not be reported to the user as something going wrong.
        if (error === "access_denied") return finish("cancelled");

        console.error("google oauth: authorization failed", { error });
        return finish("error");
    }

    if (!handshake) {
        // Either the tab sat past the cookie's ten minutes, or this URL was
        // opened without ever passing through the start route.
        console.error("google oauth: callback without a handshake cookie");
        return finish("error");
    }

    if (!stateMatches(handshake.state, params.get("state"))) {
        // A forged callback. Return before the code is touched: exchanging it
        // is the step that would mint a session for an attacker's account.
        console.error("google oauth: state did not match the handshake");
        return finish("error");
    }

    const code = params.get("code");

    if (!code) {
        console.error("google oauth: callback carried no authorization code");
        return finish("error");
    }

    const config = readOAuthConfig();

    if (!config) {
        console.error("google oauth: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is not configured");
        return finish("error");
    }

    const exchange = await exchangeCodeForIdToken({
        config,
        code,
        verifier: handshake.verifier,
        redirectUri: resolveRedirectUri(request),
    });

    if (exchange.status === "failed") {
        console.error("google oauth: code exchange failed", { reason: exchange.reason });
        return finish("error");
    }

    // We hold a Google ID token. Handing it on is the seam the API task fills;
    // until then the only honest thing to tell the user is that they are
    // authenticated and accounts are not open.
    const handoff = await exchangeGoogleIdToken(exchange.idToken);

    if (handoff.status === "not_implemented") return finish("pending");

    return finish("error");
};

export { GET };
