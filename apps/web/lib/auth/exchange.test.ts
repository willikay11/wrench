// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { exchangeGoogleCode } from './exchange'

const SESSION = {
    accessToken: 'access-token',
    expiresIn: 900,
    refreshToken: 'refresh-token',
    user: {
        id: '11111111-1111-1111-1111-111111111111',
        email: 'someone@example.com',
        displayName: 'Someone',
        avatarUrl: 'https://example.com/a.png',
        emailVerified: true,
    },
}

const fetchMock = vi.fn()

const respondWith = (body: unknown, status = 200) =>
    fetchMock.mockResolvedValue(
        new Response(typeof body === 'string' ? body : JSON.stringify(body), {
            status,
            headers: { 'Content-Type': 'application/json' },
        }),
    )

const exchange = () => exchangeGoogleCode({ code: 'the-code', verifier: 'the-verifier' })

describe('exchangeGoogleCode', () => {
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

    it('posts the code and verifier to the API through Kong', async () => {
        respondWith(SESSION)
        await exchange()

        const [url, init] = fetchMock.mock.calls[0]
        expect(url).toBe('https://api.example.com/v1/auth/login/google')
        expect(init.method).toBe('POST')
        // /v1 sits behind Kong key-auth, so the call cannot come from the
        // browser — this header is why it is server-side.
        expect(init.headers['X-Channel-Token']).toBe('channel-token')
        expect(JSON.parse(init.body)).toEqual({ code: 'the-code', verifier: 'the-verifier' })
        expect(init.signal).toBeInstanceOf(AbortSignal)
    })

    it('reads 201 as a new account and 200 as a returning user', async () => {
        respondWith(SESSION, 201)
        await expect(exchange()).resolves.toEqual({ status: 'created', session: SESSION })

        respondWith(SESSION, 200)
        await expect(exchange()).resolves.toEqual({ status: 'signed_in', session: SESSION })
    })

    it('fails when the API rejects the exchange', async () => {
        respondWith({ error: 'Something went wrong' }, 500)
        await expect(exchange()).resolves.toEqual({ status: 'failed', reason: 'http_500' })
    })

    it('fails when the API is unreachable', async () => {
        fetchMock.mockRejectedValue(Object.assign(new Error('timeout'), { name: 'TimeoutError' }))
        await expect(exchange()).resolves.toEqual({ status: 'failed', reason: 'unreachable' })
    })

    // A 200 carrying the wrong shape would otherwise surface later as an
    // undefined display name on a page that believes it is signed in.
    it('fails on a response that is not a usable session', async () => {
        respondWith({ accessToken: '', user: null })
        await expect(exchange()).resolves.toEqual({ status: 'failed', reason: 'unusable_session' })

        respondWith({ ...SESSION, refreshToken: undefined })
        await expect(exchange()).resolves.toEqual({ status: 'failed', reason: 'unusable_session' })

        respondWith('<html>502</html>')
        await expect(exchange()).resolves.toMatchObject({ status: 'failed' })
    })

    it('refuses to call out at all when it is not configured', async () => {
        delete process.env.CHANNEL_TOKEN

        await expect(exchange()).resolves.toEqual({ status: 'failed', reason: 'not_configured' })
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('never logs the code or the verifier', async () => {
        const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
        respondWith({}, 500)

        await exchange()

        const lines = JSON.stringify(logged.mock.calls)
        expect(lines).not.toContain('the-code')
        expect(lines).not.toContain('the-verifier')
    })
})
