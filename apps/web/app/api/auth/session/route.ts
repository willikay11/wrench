import { NextResponse, type NextRequest } from "next/server";

import { isWrenchSession, ACCESS_HANDOFF_COOKIE, SESSION_ENDPOINT } from "@/lib/auth/session";

/**
 * Hands the freshly signed-in client its access token, once.
 *
 * The callback is a redirect, so there is no component in flight to return a
 * session to. It leaves the session in a 60-second httpOnly cookie and this
 * route trades it for JSON on the first page load, deleting it in the same
 * response. After that the access token exists only in the client's memory,
 * which is what ADR-005 asks for; a second call returns 204.
 */
const GET = async (request: NextRequest) => {
    const handoff = request.cookies.get(ACCESS_HANDOFF_COOKIE)?.value;

    const clear = (response: NextResponse) => {
        response.cookies.delete({ name: ACCESS_HANDOFF_COOKIE, path: SESSION_ENDPOINT });
        // Never cached: the body carries a bearer token, and a shared cache
        // holding it would serve one user's session to the next.
        response.headers.set("Cache-Control", "no-store, private");

        return response;
    };

    if (!handoff) return clear(new NextResponse(null, { status: 204 }));

    let payload: unknown;

    try {
        payload = JSON.parse(Buffer.from(handoff, "base64url").toString("utf8"));
    } catch {
        console.error("session: handoff cookie was not readable");
        return clear(new NextResponse(null, { status: 204 }));
    }

    if (!isWrenchSession(payload)) {
        console.error("session: handoff cookie did not hold a usable session");
        return clear(new NextResponse(null, { status: 204 }));
    }

    return clear(NextResponse.json(payload));
};

export { GET };
