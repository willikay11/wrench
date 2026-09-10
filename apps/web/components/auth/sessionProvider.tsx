'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import { isWrenchSession, SESSION_ENDPOINT, type WrenchSession } from '@/lib/auth/session'

/**
 * Holds the signed-in session in memory, and nowhere else.
 *
 * ADR-005: the access token is never written to localStorage or a readable
 * cookie, so it lives in React state and dies with the tab. A reload rebuilds
 * it from the refresh token cookie — /api/auth/session falls back to
 * POST /v1/auth/refresh when the sign-in handoff is gone — so the session
 * survives, while the token itself never touches storage the browser exposes.
 */

type SessionState = {
  session: WrenchSession | null
  /** True until the one-time handoff has been asked for. */
  isLoading: boolean
}

type SessionValue = SessionState & {
  /**
   * Mints a fresh access token from the refresh cookie and returns it.
   *
   * The access token expires in 15 minutes while a screen can stay open for
   * hours, so a request that comes back 401 is ordinary rather than
   * exceptional. Callers use this to retry once before giving up. Null means
   * the refresh token is gone too, and the answer is to sign in again.
   */
  refresh: () => Promise<string | null>
}

const SessionContext = createContext<SessionValue>({
  session: null,
  isLoading: true,
  refresh: async () => null,
})

const SessionProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<SessionState>({ session: null, isLoading: true })

  useEffect(() => {
    // Guards against the effect firing twice in strict mode: the handoff
    // is single-use, so the second call would find nothing and blank a
    // session the first call had already loaded.
    let active = true

    const load = async () => {
      try {
        const response = await fetch(SESSION_ENDPOINT, { cache: 'no-store' })

        // 204 is the ordinary "not signed in" answer, not a failure.
        if (!response.ok || response.status === 204) {
          if (active) setState({ session: null, isLoading: false })
          return
        }

        const payload: unknown = await response.json()

        if (active) {
          setState({
            session: isWrenchSession(payload) ? payload : null,
            isLoading: false,
          })
        }
      } catch {
        // A failed handoff is a signed-out page, not an error screen.
        if (active) setState({ session: null, isLoading: false })
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [])

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(SESSION_ENDPOINT, { cache: 'no-store' })

      if (!response.ok || response.status === 204) {
        setState({ session: null, isLoading: false })
        return null
      }

      const payload: unknown = await response.json()

      if (!isWrenchSession(payload)) {
        setState({ session: null, isLoading: false })
        return null
      }

      setState({ session: payload, isLoading: false })
      return payload.accessToken
    } catch {
      return null
    }
  }, [])

  const value = useMemo(() => ({ ...state, refresh }), [state, refresh])

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

const useSession = () => useContext(SessionContext)

export { SessionProvider, useSession }
export type { SessionState }
