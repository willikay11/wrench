import { NextResponse, type NextRequest } from "next/server";

import { refreshWrenchSession } from "@/lib/auth/refresh";
import {
    isWrenchSession,
    ACCESS_HANDOFF_COOKIE,
    REFRESH_TOKEN_COOKIE,
    REFRESH_TOKEN_MAX_AGE_SECONDS,
    SESSION_ENDPOINT,
    type AuthResponse,
    type WrenchSession,
} from "@/lib/auth/session";

/**
 * Gives the client its access token, from whichever source still has one.
 *
 * Two paths, in order:
 *
 *  1. The one-time handoff cookie the OAuth callback leaves behind, read and
 *     deleted here so a fresh sign-in costs no round trip to the API.
 *  2. Failing that, the refresh token cookie — which is what makes a session
 *     survive a page reload, since the access token is memory-only and dies
 *     with the tab (ADR-005).
 *
 * The access token is only ever returned in the body. The refresh token never
 * is: it goes straight back into its httpOnly cookie, where no script reaches
 * it. 204 means signed out.
 */

/** Strips the refresh token. The client half of the app must never see it. */
const toClientSession = ({ accessToken, expiresIn, user }: AuthResponse): WrenchSession => ({
    accessToken,
    expiresIn,
    user,
});

const noStore = <T extends NextResponse>(response: T) => {
    // The body carries a bearer token, and a shared cache holding it would
    // serve one user's session to the next.
    response.headers.set("Cache-Control", "no-store, private");
    return response;
};

const GET = async (request: NextRequest) => {
    const handoff = request.cookies.get(ACCESS_HANDOFF_COOKIE)?.value;

    const dropHandoff = <T extends NextResponse>(response: T) => {
        response.cookies.delete({ name: ACCESS_HANDOFF_COOKIE, path: SESSION_ENDPOINT });
        return noStore(response);
    };

    if (handoff) {
        let payload: unknown;

        try {
            payload = JSON.parse(Buffer.from(handoff, "base64url").toString("utf8"));
        } catch {
            console.error("session: handoff cookie was not readable");
            payload = null;
        }

        if (isWrenchSession(payload)) return dropHandoff(NextResponse.json(payload));

        // A handoff we cannot read is spent either way; fall through and let
        // the refresh token answer rather than reporting a signed-out page to
        // someone who is signed in.
        console.error("session: handoff cookie did not hold a usable session");
    }

    const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;

    if (!refreshToken) return dropHandoff(new NextResponse(null, { status: 204 }));

    const refreshed = await refreshWrenchSession(refreshToken);

    if (refreshed.status === "failed") {
        console.error("session: refresh failed", { reason: refreshed.reason });

        const response = dropHandoff(new NextResponse(null, { status: 204 }));
        // Clear the cookie rather than leave a token that cannot mint a
        // session: the app shell gates on its presence, so keeping it would
        // hold the user on a signed-in page that can do nothing.
        response.cookies.delete({ name: REFRESH_TOKEN_COOKIE, path: "/" });

        return response;
    }

    const response = dropHandoff(NextResponse.json(toClientSession(refreshed.session)));

    // Rotation: the API revoked the token we just presented, so the cookie has
    // to carry the replacement. Leaving the old one there would present a
    // spent token on the next load, which the API reads as theft and answers
    // by revoking the entire family.
    response.cookies.set(REFRESH_TOKEN_COOKIE, refreshed.session.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: REFRESH_TOKEN_MAX_AGE_SECONDS,
    });

    return response;
};

export { GET };
