// @vitest-environment node
import { NextRequest } from 'next/server'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import {
    encodeHandshake,
    OAUTH_HANDSHAKE_COOKIE,
    type OAuthHandshake,
} from '@/lib/auth/googleOAuth'
import { ACCESS_HANDOFF_COOKIE, REFRESH_TOKEN_COOKIE } from '@/lib/auth/session'
import { GET } from './route'

const HANDSHAKE: OAuthHandshake = {
    state: 'the-state',
    verifier: 'the-verifier',
    intent: 'signup',
}

const SESSION = {
    accessToken: 'the-access-token',
    expiresIn: 900,
    refreshToken: 'the-refresh-token',
    user: {
        id: '11111111-1111-1111-1111-111111111111',
        email: 'someone@example.com',
        displayName: 'Someone',
        avatarUrl: 'https://example.com/a.png',
        emailVerified: true,
    },
}

const fetchMock = vi.fn()

const apiReturns = (status: number, body: unknown = SESSION) =>
    fetchMock.mockResolvedValue(
        new Response(JSON.stringify(body), {
            status,
            headers: { 'Content-Type': 'application/json' },
        }),
    )

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

const signIn = (status = 200, handshake: OAuthHandshake | null = HANDSHAKE) => {
    apiReturns(status)
    return callback({ code: 'the-code', state: HANDSHAKE.state }, handshake)
}

const locationOf = (response: Response) => new URL(response.headers.get('location') ?? '')

describe('GET /api/auth/google/callback', () => {
    beforeEach(() => {
        process.env.API_BASE_URL = 'https://api.example.com'
        process.env.CHANNEL_TOKEN = 'channel-token'
        fetchMock.mockReset()
        vi.stubGlobal('fetch', fetchMock)
        vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
        delete process.env.API_BASE_URL
        delete process.env.CHANNEL_TOKEN
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    describe('on a successful sign-in', () => {
        it('greets a new account and a returning user differently', async () => {
            expect(locationOf(await signIn(201)).searchParams.get('auth')).toBe('welcome')
            expect(locationOf(await signIn(200)).searchParams.get('auth')).toBe('signed-in')
        })

        // Signing up and logging in both end in the same place: the garage.
        // The intent only decides where a *failed* attempt returns to.
        it('lands on the garage whichever screen it started from', async () => {
            expect(locationOf(await signIn(201)).pathname).toBe('/garage')

            const fromLogin = await signIn(200, { ...HANDSHAKE, intent: 'login' })
            expect(locationOf(fromLogin).pathname).toBe('/garage')
        })

        it('keeps the refresh token in an httpOnly cookie the browser cannot read', async () => {
            const cookie = (await signIn()).cookies.get(REFRESH_TOKEN_COOKIE)

            expect(cookie?.value).toBe('the-refresh-token')
            expect(cookie?.httpOnly).toBe(true)
            expect(cookie?.sameSite).toBe('lax')
            expect(cookie?.path).toBe('/')
            expect(cookie?.maxAge).toBe(604800)
        })

        it('scopes the access token handoff to the one route that consumes it', async () => {
            const cookie = (await signIn()).cookies.get(ACCESS_HANDOFF_COOKIE)

            expect(cookie?.httpOnly).toBe(true)
            expect(cookie?.path).toBe('/api/auth/session')
            // A minute, not a session: it is read and deleted on first load.
            expect(cookie?.maxAge).toBe(60)

            const handed = JSON.parse(
                Buffer.from(cookie?.value ?? '', 'base64url').toString('utf8'),
            )
            expect(handed.accessToken).toBe('the-access-token')
            expect(handed.user.displayName).toBe('Someone')
            // ADR-005: the refresh token is the server's, not the client's.
            expect(handed.refreshToken).toBeUndefined()
        })

        // Anything in a URL reaches browser history, the referer header and
        // any analytics reading location.
        it('puts no token in the redirect', async () => {
            const response = await signIn()
            const headers = JSON.stringify([...response.headers])

            expect(response.headers.get('location')).not.toContain('the-access-token')
            expect(response.headers.get('location')).not.toContain('the-refresh-token')
            expect(headers).toContain('the-refresh-token') // in Set-Cookie, as intended
        })

        it('burns the handshake so the callback cannot be replayed', async () => {
            const cookie = (await signIn()).cookies.get(OAUTH_HANDSHAKE_COOKIE)

            expect(cookie?.value).toBe('')
            expect(new Date(cookie?.expires ?? 1).getTime()).toBe(0)
        })
    })

    describe('when the sign-in does not complete', () => {
        const assertNoSession = (response: Awaited<ReturnType<typeof GET>>) => {
            expect(locationOf(response).searchParams.get('auth')).toBe('error')
            expect(response.cookies.get(REFRESH_TOKEN_COOKIE)).toBeUndefined()
            expect(response.cookies.get(ACCESS_HANDOFF_COOKIE)).toBeUndefined()
        }

        it('sets no session when the API rejects the exchange', async () => {
            apiReturns(500, { error: 'Something went wrong' })
            assertNoSession(await callback({ code: 'the-code', state: HANDSHAKE.state }))
        })

        it('sets no session when the API returns an unusable body', async () => {
            apiReturns(200, { accessToken: '', user: null })
            assertNoSession(await callback({ code: 'the-code', state: HANDSHAKE.state }))
        })

        it('sets no session when the API is unreachable', async () => {
            fetchMock.mockRejectedValue(new Error('econnrefused'))
            assertNoSession(await callback({ code: 'the-code', state: HANDSHAKE.state }))
        })

        it('refuses a forged state without spending the code', async () => {
            const response = await callback({ code: 'the-code', state: 'forged' })

            expect(fetchMock).not.toHaveBeenCalled()
            assertNoSession(response)
        })

        it('refuses a callback with no handshake cookie', async () => {
            const response = await callback({ code: 'the-code', state: HANDSHAKE.state }, null)

            expect(fetchMock).not.toHaveBeenCalled()
            expect(locationOf(response).pathname).toBe('/signup')
            assertNoSession(response)
        })

        // A failure must not drop the user on a screen with no way forward.
        it('returns a failed login to /login, not the garage', async () => {
            apiReturns(500, { error: 'Something went wrong' })

            const response = await callback(
                { code: 'the-code', state: HANDSHAKE.state },
                { ...HANDSHAKE, intent: 'login' },
            )

            expect(locationOf(response).pathname).toBe('/login')
            assertNoSession(response)
        })

        it('refuses a callback with no code', async () => {
            const response = await callback({ state: HANDSHAKE.state })

            expect(fetchMock).not.toHaveBeenCalled()
            assertNoSession(response)
        })

        it('treats a cancelled consent screen as cancelled, not an error', async () => {
            const response = await callback({ error: 'access_denied' })

            expect(fetchMock).not.toHaveBeenCalled()
            expect(locationOf(response).searchParams.get('auth')).toBe('cancelled')
            expect(response.cookies.get(REFRESH_TOKEN_COOKIE)).toBeUndefined()
        })

        it('treats any other Google error as an error', async () => {
            assertNoSession(await callback({ error: 'server_error' }))
        })
    })

    it('never logs a token, the code or the verifier', async () => {
        const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
        apiReturns(500, {})

        await callback({ code: 'the-code', state: HANDSHAKE.state })

        const lines = JSON.stringify(logged.mock.calls)
        expect(lines).not.toContain('the-code')
        expect(lines).not.toContain('the-verifier')
        expect(lines).not.toContain('the-access-token')
    })
})
