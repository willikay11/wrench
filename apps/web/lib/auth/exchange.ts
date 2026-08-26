/**
 * The one place a Google ID token turns into a Wrench session.
 *
 * That endpoint does not exist yet — the API has no users, userIdentities or
 * refreshTokens tables — so the token is verified nowhere and kept nowhere.
 * When POST /v1/auth/login/google lands, this function is the only thing that
 * changes: it posts { idToken } through a server-side fetch, exactly as
 * app/actions/waitlist.ts does, and grows a success case.
 *
 * The token is deliberately not logged, cached or written to a cookie in the
 * meantime. An unverified ID token is not evidence of anything, and the whole
 * point of the seam is that only the API ever gets to decide it is.
 */

type IdTokenHandoff = {
    /** Google authenticated the user; we have nowhere to send the proof yet. */
    status: "not_implemented";
};

const exchangeGoogleIdToken = async (idToken: string): Promise<IdTokenHandoff> => {
    // Referenced so the signature is the real one the API call will need,
    // rather than something that has to be rewritten when the endpoint lands.
    void idToken;

    return { status: "not_implemented" };
};

export { exchangeGoogleIdToken };
export type { IdTokenHandoff };
