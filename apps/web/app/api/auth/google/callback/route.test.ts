// @vitest-environment node
import { NextRequest } from 'next/server'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import {
    encodeHandshake,
    OAUTH_HANDSHAKE_COOKIE,
    type OAuthHandshake,
} from '@/lib/auth/googleOAuth'
import { GET } from './route'

const HANDSHAKE: OAuthHandshake = {
    state: 'the-state',
    verifier: 'the-verifier',
    intent: 'signup',
}

const ID_TOKEN = 'header.payload.signature'

const fetchMock = vi.fn()

const callback = (
    query: Record<string, string>,
    handshake: OAuthHandshake | null = HANDSHAKE,
) => {
    const url = new URL('http://localhost:3000/api/auth/google/callback')
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)

    const request = new NextRequest(url)
    if (handshake) request.cookies.set(OAUTH_HANDSHAKE_COOKIE, encodeHandshake(handshake))

    return GET(request)
}

const locationOf = (response: Response) => new URL(response.headers.get('location') ?? '')

const succeedingExchange = () =>
    fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ id_token: ID_TOKEN }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        }),
    )

describe('GET /api/auth/google/callback', () => {
    beforeEach(() => {
        process.env.GOOGLE_CLIENT_ID = 'client-id'
        process.env.GOOGLE_CLIENT_SECRET = 'client-secret'
        fetchMock.mockReset()
        vi.stubGlobal('fetch', fetchMock)
        vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
        delete process.env.GOOGLE_CLIENT_ID
        delete process.env.GOOGLE_CLIENT_SECRET
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    describe('when Google sends back a code', () => {
        it('exchanges it and reports the sign-in as pending', async () => {
            succeedingExchange()

            const response = await callback({ code: 'the-code', state: HANDSHAKE.state })

            expect(fetchMock).toHaveBeenCalledOnce()
            expect(locationOf(response).pathname).toBe('/signup')
            expect(locationOf(response).searchParams.get('auth')).toBe('pending')
        })

        it('sends the user back to whichever screen they started on', async () => {
            succeedingExchange()

            const response = await callback(
                { code: 'the-code', state: HANDSHAKE.state },
                { ...HANDSHAKE, intent: 'login' },
            )

            expect(locationOf(response).pathname).toBe('/login')
        })

        // The token would otherwise reach browser history, the referer header
        // and any analytics reading the URL.
        it('keeps the ID token out of the redirect entirely', async () => {
            succeedingExchange()

            const response = await callback({ code: 'the-code', state: HANDSHAKE.state })

            expect(response.headers.get('location')).not.toContain(ID_TOKEN)
            expect(JSON.stringify([...response.headers])).not.toContain(ID_TOKEN)
        })

        it('burns the handshake so the callback cannot be replayed', async () => {
            succeedingExchange()

            const response = await callback({ code: 'the-code', state: HANDSHAKE.state })
            const cookie = response.cookies.get(OAUTH_HANDSHAKE_COOKIE)

            expect(cookie?.value).toBe('')
            expect(new Date(cookie?.expires ?? 1).getTime()).toBe(0)
            // Cleared on the same path it was set on, or the browser keeps it.
            expect(cookie?.path).toBe('/api/auth/google')
        })
    })

    describe('when the round trip cannot be trusted', () => {
        it('refuses a state that does not match, without touching the code', async () => {
            const response = await callback({ code: 'the-code', state: 'forged-state' })

            // The assertion that matters: no exchange means no session minted
            // for whoever forged the callback.
            expect(fetchMock).not.toHaveBeenCalled()
            expect(locationOf(response).searchParams.get('auth')).toBe('error')
        })

        it('refuses a callback carrying no state at all', async () => {
            const response = await callback({ code: 'the-code' })

            expect(fetchMock).not.toHaveBeenCalled()
            expect(locationOf(response).searchParams.get('auth')).toBe('error')
        })

        // A tab left open past the cookie's ten minutes, or a URL opened
        // without ever passing through the start route.
        it('refuses a callback with no handshake cookie', async () => {
            const response = await callback({ code: 'the-code', state: HANDSHAKE.state }, null)

            expect(fetchMock).not.toHaveBeenCalled()
            expect(locationOf(response).pathname).toBe('/signup')
            expect(locationOf(response).searchParams.get('auth')).toBe('error')
        })

        it('refuses a callback with no code', async () => {
            const response = await callback({ state: HANDSHAKE.state })

            expect(fetchMock).not.toHaveBeenCalled()
            expect(locationOf(response).searchParams.get('auth')).toBe('error')
        })
    })

    describe('when the user or Google says no', () => {
        // Closing the consent screen is a decision, not a fault: reporting it
        // as an error tells the user something broke when nothing did.
        it('treats a cancelled consent screen as cancelled, not an error', async () => {
            const response = await callback({ error: 'access_denied' })

            expect(fetchMock).not.toHaveBeenCalled()
            expect(locationOf(response).searchParams.get('auth')).toBe('cancelled')
        })

        it('treats any other Google error as an error', async () => {
            const response = await callback({ error: 'server_error' })

            expect(locationOf(response).searchParams.get('auth')).toBe('error')
        })

        it('reports a rejected code exchange', async () => {
            fetchMock.mockResolvedValue(new Response('{}', { status: 400 }))

            const response = await callback({ code: 'the-code', state: HANDSHAKE.state })

            expect(locationOf(response).searchParams.get('auth')).toBe('error')
        })

        it('reports a token endpoint that never answers', async () => {
            fetchMock.mockRejectedValue(
                Object.assign(new Error('timed out'), { name: 'TimeoutError' }),
            )

            const response = await callback({ code: 'the-code', state: HANDSHAKE.state })

            expect(locationOf(response).searchParams.get('auth')).toBe('error')
        })

        it('reports missing configuration without naming it to the user', async () => {
            delete process.env.GOOGLE_CLIENT_SECRET

            const response = await callback({ code: 'the-code', state: HANDSHAKE.state })

            expect(fetchMock).not.toHaveBeenCalled()
            expect(locationOf(response).searchParams.get('auth')).toBe('error')
            expect(response.headers.get('location')).not.toContain('CLIENT_SECRET')
        })
    })

    it('never logs the code, the verifier or the token', async () => {
        const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
        fetchMock.mockResolvedValue(new Response('{}', { status: 400 }))

        await callback({ code: 'the-code', state: HANDSHAKE.state })

        const lines = JSON.stringify(logged.mock.calls)
        expect(lines).not.toContain('the-code')
        expect(lines).not.toContain('the-verifier')
        expect(lines).not.toContain(ID_TOKEN)
    })
})
