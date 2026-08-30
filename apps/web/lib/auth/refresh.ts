import { isAuthResponse, type AuthResponse } from "@/lib/auth/session";

/**
 * Trades a refresh token for a fresh session.
 *
 * Server-side because /v1 sits behind Kong's key-auth and CHANNEL_TOKEN must
 * never reach the browser — the same reason app/actions/waitlist.ts runs where
 * it does. It is also where the refresh token itself belongs: it lives in an
 * httpOnly cookie precisely so no script can read it.
 *
 * The API rotates on every call. The token that comes back replaces the one
 * that went in, and the caller MUST write it to the cookie: presenting a spent
 * token again is what the API reads as theft, and it responds by revoking the
 * whole family — logging the user out of that device entirely.
 */

type SessionRefresh =
    | { status: "ok"; session: AuthResponse }
    /** `reason` is for our logs. Nothing from it is shown to the user. */
    | { status: "failed"; reason: string };

const REQUEST_TIMEOUT_MS = 10_000;

const refreshWrenchSession = async (refreshToken: string): Promise<SessionRefresh> => {
    const baseUrl = process.env.API_BASE_URL;
    const channelToken = process.env.CHANNEL_TOKEN;

    if (!baseUrl || !channelToken) {
        // Misconfiguration, not user error. Never name which one is missing.
        console.error("session refresh: API_BASE_URL or CHANNEL_TOKEN is not configured");
        return { status: "failed", reason: "not_configured" };
    }

    let response: Response;

    try {
        response = await fetch(`${baseUrl}/v1/auth/refresh`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Channel-Token": channelToken,
            },
            body: JSON.stringify({ refreshToken }),
            // Without this a hung API leaves every page load waiting on a
            // session that is never going to arrive.
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            cache: "no-store",
        });
    } catch (cause) {
        // The shape only. A refresh token is a live credential and never
        // belongs in a log line.
        console.error("session refresh: request failed", {
            reason: cause instanceof Error ? cause.name : "unknown",
        });
        return { status: "failed", reason: "unreachable" };
    }

    // 401 covers expired, unknown, revoked and suspended alike — the API
    // deliberately does not distinguish, and neither do we.
    if (!response.ok) {
        return { status: "failed", reason: `http_${response.status}` };
    }

    let payload: unknown;

    try {
        payload = await response.json();
    } catch {
        return { status: "failed", reason: "malformed_response" };
    }

    if (!isAuthResponse(payload)) {
        console.error("session refresh: API returned a session we cannot use");
        return { status: "failed", reason: "unusable_session" };
    }

    return { status: "ok", session: payload };
};

export { refreshWrenchSession };
export type { SessionRefresh };
