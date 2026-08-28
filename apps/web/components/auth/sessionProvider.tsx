'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { isWrenchSession, SESSION_ENDPOINT, type WrenchSession } from "@/lib/auth/session";

/**
 * Holds the signed-in session in memory, and nowhere else.
 *
 * ADR-005: the access token is never written to localStorage or a readable
 * cookie, so it lives in React state and dies with the tab. Reloading the page
 * loses it — restoring it needs POST /v1/auth/refresh, which does not exist
 * yet. Until it does, a reload after sign-in shows a signed-out page.
 */

type SessionState = {
    session: WrenchSession | null;
    /** True until the one-time handoff has been asked for. */
    isLoading: boolean;
};

const SessionContext = createContext<SessionState>({ session: null, isLoading: true });

const SessionProvider = ({ children }: { children: ReactNode }) => {
    const [state, setState] = useState<SessionState>({ session: null, isLoading: true });

    useEffect(() => {
        // Guards against the effect firing twice in strict mode: the handoff
        // is single-use, so the second call would find nothing and blank a
        // session the first call had already loaded.
        let active = true;

        const load = async () => {
            try {
                const response = await fetch(SESSION_ENDPOINT, { cache: "no-store" });

                // 204 is the ordinary "not signed in" answer, not a failure.
                if (!response.ok || response.status === 204) {
                    if (active) setState({ session: null, isLoading: false });
                    return;
                }

                const payload: unknown = await response.json();

                if (active) {
                    setState({
                        session: isWrenchSession(payload) ? payload : null,
                        isLoading: false,
                    });
                }
            } catch {
                // A failed handoff is a signed-out page, not an error screen.
                if (active) setState({ session: null, isLoading: false });
            }
        };

        void load();

        return () => {
            active = false;
        };
    }, []);

    return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
};

const useSession = () => useContext(SessionContext);

export { SessionProvider, useSession };
export type { SessionState };
