import { isAuthResponse, type AuthResponse } from "@/lib/auth/session";

/**
 * The one place an authorization code becomes a Wrench session.
 *
 * The API owns the exchange with Google and the ID token verification — this
 * only forwards the code and the PKCE verifier. It runs server-side because
 * /v1 sits behind Kong's key-auth (infra/kong/kong.yaml) and CHANNEL_TOKEN
 * must never reach the browser, exactly as app/actions/waitlist.ts explains.
 */

type CodeExchange =
    /** 201 from the API — the account was created by this sign-in. */
    | { status: "created"; session: AuthResponse }
    /** 200 — a returning user. */
    | { status: "signed_in"; session: AuthResponse }
    /** `reason` is for our logs. Nothing from it is shown to the user. */
    | { status: "failed"; reason: string };

const REQUEST_TIMEOUT_MS = 10_000;

const exchangeGoogleCode = async ({
    code,
    verifier,
}: {
    code: string;
    verifier: string;
}): Promise<CodeExchange> => {
    const baseUrl = process.env.API_BASE_URL;
    const channelToken = process.env.CHANNEL_TOKEN;

    if (!baseUrl || !channelToken) {
        // Misconfiguration, not user error. Never name which one is missing.
        console.error("google oauth: API_BASE_URL or CHANNEL_TOKEN is not configured");
        return { status: "failed", reason: "not_configured" };
    }

    let response: Response;

    try {
        response = await fetch(`${baseUrl}/v1/auth/login/google`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Channel-Token": channelToken,
            },
            body: JSON.stringify({ code, verifier }),
            // Without this a hung API leaves the user on a blank callback
            // until the platform's own timeout fires.
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            cache: "no-store",
        });
    } catch (cause) {
        // The shape only. The code and verifier are single-use credentials and
        // never belong in a log line.
        console.error("google oauth: session request failed", {
            reason: cause instanceof Error ? cause.name : "unknown",
        });
        return { status: "failed", reason: "unreachable" };
    }

    if (!response.ok) {
        console.error("google oauth: API rejected the exchange", { status: response.status });
        return { status: "failed", reason: `http_${response.status}` };
    }

    let payload: unknown;

    try {
        payload = await response.json();
    } catch {
        return { status: "failed", reason: "malformed_response" };
    }

    if (!isAuthResponse(payload)) {
        console.error("google oauth: API returned a session we cannot use");
        return { status: "failed", reason: "unusable_session" };
    }

    // 201 and 200 are both successes; the API uses the code to distinguish a
    // new account from a returning one, and only the greeting differs.
    return {
        status: response.status === 201 ? "created" : "signed_in",
        session: payload,
    };
};

export { exchangeGoogleCode };
export type { CodeExchange };
