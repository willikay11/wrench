/**
 * The single seam between the sign-in UI and Google OAuth.
 *
 * The API (apps/api) has no auth endpoints yet, so nothing here can start a
 * real flow. When they land, `startGoogleSignIn` becomes a redirect to the
 * backend's authorize endpoint and every caller stays as it is.
 */

/** Which screen the user started from, so the backend can route them back. */
type GoogleSignInIntent = "signup" | "login";

type GoogleSignInResult =
    /** The browser is on its way to Google; the caller should stay disabled. */
    | { status: "redirecting" }
    /** Nothing to redirect to yet; the caller should say so and re-enable. */
    | { status: "unavailable" };

/**
 * Flip to true once the backend serves the authorize endpoint. Kept as a
 * constant rather than an env var so the dead branch is obvious in review.
 */
const GOOGLE_SIGN_IN_ENABLED = false;

const startGoogleSignIn = async (intent: GoogleSignInIntent): Promise<GoogleSignInResult> => {
    if (!GOOGLE_SIGN_IN_ENABLED) return { status: "unavailable" };

    // Real implementation, once /v1/auth/google exists:
    // window.location.assign(`${apiBaseUrl}/v1/auth/google?intent=${intent}`);
    void intent;
    return { status: "redirecting" };
};

export { startGoogleSignIn, GOOGLE_SIGN_IN_ENABLED };
export type { GoogleSignInIntent, GoogleSignInResult };
