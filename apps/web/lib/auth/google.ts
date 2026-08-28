/**
 * The single seam between the sign-in UI and the OAuth flow.
 *
 * The flow itself runs in route handlers under /api/auth/google, so the client
 * secret and the Google ID token stay on the server. All the browser does is
 * hand itself over to them and read the outcome back off the URL.
 */

/** Which screen the user started from, so the callback can route them back. */
type GoogleSignInIntent = "signup" | "login";

/**
 * What a finished round trip reports to the page that started it.
 *
 * `welcome` and `signed-in` are the API's 201 and 200 — a new account versus
 * a returning user. Only the greeting differs.
 */
type AuthStatus = "welcome" | "signed-in" | "cancelled" | "error";

/** The query parameter the callback lands on, read once and then stripped. */
const AUTH_STATUS_PARAM = "auth";

const isGoogleSignInIntent = (value: unknown): value is GoogleSignInIntent =>
    value === "signup" || value === "login";

const isAuthStatus = (value: unknown): value is AuthStatus =>
    value === "welcome" || value === "signed-in" || value === "cancelled" || value === "error";

/** Where each intent started, and so where the callback sends the user back. */
const authPagePath = (intent: GoogleSignInIntent) => (intent === "login" ? "/login" : "/signup");

/**
 * Hands the browser to our authorize route.
 *
 * The navigation is the whole function: callers should leave their button in
 * its loading state rather than re-enable, because the page is on its way out.
 */
const startGoogleSignIn = (intent: GoogleSignInIntent): void => {
    window.location.assign(`/api/auth/google/start?intent=${intent}`);
};

export { startGoogleSignIn, isGoogleSignInIntent, isAuthStatus, authPagePath, AUTH_STATUS_PARAM };
export type { GoogleSignInIntent, AuthStatus };
