/**
 * Session shapes and the two cookies the OAuth callback sets.
 *
 * Per ADR-005 the access token lives in client memory and nowhere else. It
 * still has to travel from the callback — which is a redirect, with no
 * component mounted to hand it to — so it makes exactly one hop in a short
 * lived, httpOnly cookie that /api/auth/session deletes as it reads it. Script
 * can never read it, and it stops existing at the first page load.
 */

type SessionUser = {
    id: string;
    email: string;
    displayName: string;
    avatarUrl: string;
    emailVerified: boolean;
};

/** What the client holds in memory. Deliberately no refresh token. */
type WrenchSession = {
    accessToken: string;
    /** Seconds until the access token expires. 900 today, per ADR-005. */
    expiresIn: number;
    user: SessionUser;
};

/**
 * What the API returns. The refresh token is split off into an httpOnly
 * cookie by the callback and never reaches the client half of the app, so it
 * is the one field WrenchSession does not carry.
 */
type AuthResponse = WrenchSession & { refreshToken: string };

/** Long lived, and the only thing that survives a page load. */
const REFRESH_TOKEN_COOKIE = "wrench_refresh_token";

/** One hop, one read. Scoped so the browser sends it to nothing else. */
const ACCESS_HANDOFF_COOKIE = "wrench_access_handoff";

const SESSION_ENDPOINT = "/api/auth/session";

/** 7 days, matching the refresh token lifetime the API issues. */
const REFRESH_TOKEN_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

/** Long enough for a redirect and a page load, short enough to be forgotten. */
const ACCESS_HANDOFF_MAX_AGE_SECONDS = 60;

const isSessionUser = (value: unknown): value is SessionUser => {
    if (typeof value !== "object" || value === null) return false;

    const { id, email, displayName } = value as Record<string, unknown>;

    return typeof id === "string" && typeof email === "string" && typeof displayName === "string";
};

/**
 * The API is a separate service, so its response is parsed rather than
 * trusted. A malformed body should fail the sign-in, not surface later as an
 * undefined display name.
 */
const isWrenchSession = (value: unknown): value is WrenchSession => {
    if (typeof value !== "object" || value === null) return false;

    const { accessToken, expiresIn, user } = value as Record<string, unknown>;

    return (
        typeof accessToken === "string" &&
        accessToken.length > 0 &&
        typeof expiresIn === "number" &&
        isSessionUser(user)
    );
};

/** Applied to the API's response before any of it is trusted. */
const isAuthResponse = (value: unknown): value is AuthResponse => {
    if (!isWrenchSession(value)) return false;

    const { refreshToken } = value as unknown as Record<string, unknown>;

    return typeof refreshToken === "string" && refreshToken.length > 0;
};

export {
    isAuthResponse,
    isSessionUser,
    isWrenchSession,
    ACCESS_HANDOFF_COOKIE,
    ACCESS_HANDOFF_MAX_AGE_SECONDS,
    REFRESH_TOKEN_COOKIE,
    REFRESH_TOKEN_MAX_AGE_SECONDS,
    SESSION_ENDPOINT,
};
export type { AuthResponse, SessionUser, WrenchSession };
