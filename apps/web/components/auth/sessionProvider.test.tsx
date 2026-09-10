import { render, waitFor } from '@testing-library/react'
import { screen } from '@testing-library/dom'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { SessionProvider, useSession } from './sessionProvider'

const SESSION = {
    accessToken: 'the-access-token',
    expiresIn: 900,
    user: {
        id: '11111111-1111-1111-1111-111111111111',
        email: 'someone@example.com',
        displayName: 'Kamau',
        avatarUrl: 'https://example.com/a.png',
        emailVerified: true,
    },
}

const Probe = () => {
    const { session, isLoading } = useSession()

    if (isLoading) return <p>loading</p>

    return <p>{session ? `signed in as ${session.user.displayName}` : 'signed out'}</p>
}

const fetchMock = vi.fn()

const renderProbe = () =>
    render(
        <SessionProvider>
            <Probe />
        </SessionProvider>,
    )

describe('SessionProvider', () => {
    beforeEach(() => {
        fetchMock.mockReset()
        vi.stubGlobal('fetch', fetchMock)
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    const answerWith = (body: unknown, status = 200) =>
        fetchMock.mockResolvedValue(
            body === null
                ? new Response(null, { status })
                : new Response(JSON.stringify(body), {
                      status,
                      headers: { 'Content-Type': 'application/json' },
                  }),
        )

    it('loads the session from the one-time handoff', async () => {
        answerWith(SESSION)
        renderProbe()

        await waitFor(() => {
            expect(screen.getByText('signed in as Kamau')).toBeInTheDocument()
        })
        expect(fetchMock).toHaveBeenCalledWith('/api/auth/session', { cache: 'no-store' })
    })

    it('asks for the handoff exactly once', async () => {
        answerWith(SESSION)
        renderProbe()

        await waitFor(() => expect(screen.getByText(/signed in/)).toBeInTheDocument())
        // The handoff is single-use: a second request would find nothing and
        // blank a session that had already loaded.
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('is signed out when there is no handoff', async () => {
        answerWith(null, 204)
        renderProbe()

        await waitFor(() => {
            expect(screen.getByText('signed out')).toBeInTheDocument()
        })
    })

    it('is signed out, not broken, when the request fails', async () => {
        fetchMock.mockRejectedValue(new Error('offline'))
        renderProbe()

        await waitFor(() => {
            expect(screen.getByText('signed out')).toBeInTheDocument()
        })
    })

    it('refuses a payload that is not a session', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        answerWith({ accessToken: '', user: null })
        renderProbe()

        await waitFor(() => {
            expect(screen.getByText('signed out')).toBeInTheDocument()
        })
    })
})
