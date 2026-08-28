import { type NextRequest } from "next/server";

import type { AuthStatus } from "@/lib/auth/google";
import { exchangeGoogleCode } from "@/lib/auth/exchange";
import {
    ACCESS_HANDOFF_COOKIE,
    ACCESS_HANDOFF_MAX_AGE_SECONDS,
    REFRESH_TOKEN_COOKIE,
    REFRESH_TOKEN_MAX_AGE_SECONDS,
    SESSION_ENDPOINT,
    type AuthResponse,
} from "@/lib/auth/session";
import {
    decodeHandshake,
    redirectToAuthPage,
    stateMatches,
    OAUTH_COOKIE_PATH,
    OAUTH_HANDSHAKE_COOKIE,
} from "@/lib/auth/googleOAuth";

/**
 * Step two: Google sends the user back here with an authorization code.
 *
 * The code goes to the API, which exchanges it with Google, verifies the ID
 * token and returns a Wrench session. Every path out is a redirect carrying
 * only a status — no token has ever appeared in a URL.
 */
const GET = async (request: NextRequest) => {
    const handshake = decodeHandshake(request.cookies.get(OAUTH_HANDSHAKE_COOKIE)?.value);
    // With no handshake there is no intent to honour; signup is where an
    // unrecognised visitor should land.
    const intent = handshake?.intent ?? "signup";
    const params = request.nextUrl.searchParams;

    const finish = (status: AuthStatus, session?: AuthResponse) => {
        const response = redirectToAuthPage(request, intent, status);
        // Single-use whatever the outcome: leaving it set would let a replayed
        // callback URL reuse the verifier.
        response.cookies.delete({ name: OAUTH_HANDSHAKE_COOKIE, path: OAUTH_COOKIE_PATH });

        if (!session) return response;

        const secure = process.env.NODE_ENV === "production";

        // The only part of the session that survives a page load.
        response.cookies.set(REFRESH_TOKEN_COOKIE, session.refreshToken, {
            httpOnly: true,
            secure,
            sameSite: "lax",
            path: "/",
            maxAge: REFRESH_TOKEN_MAX_AGE_SECONDS,
        });

        // The access token's single hop to the client, scoped to the one route
        // that reads it and deletes it. See lib/auth/session.ts.
        response.cookies.set(
            ACCESS_HANDOFF_COOKIE,
            Buffer.from(
                JSON.stringify({
                    accessToken: session.accessToken,
                    expiresIn: session.expiresIn,
                    user: session.user,
                }),
            ).toString("base64url"),
            {
                httpOnly: true,
                secure,
                sameSite: "lax",
                path: SESSION_ENDPOINT,
                maxAge: ACCESS_HANDOFF_MAX_AGE_SECONDS,
            },
        );

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
        // A forged callback. Return before the code is spent: exchanging it is
        // the step that would mint a session for an attacker's account.
        console.error("google oauth: state did not match the handshake");
        return finish("error");
    }

    const code = params.get("code");

    if (!code) {
        console.error("google oauth: callback carried no authorization code");
        return finish("error");
    }

    const exchange = await exchangeGoogleCode({ code, verifier: handshake.verifier });

    if (exchange.status === "failed") return finish("error");

    return finish(exchange.status === "created" ? "welcome" : "signed-in", exchange.session);
};

export { GET };
