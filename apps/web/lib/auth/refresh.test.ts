// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { refreshWrenchSession } from './refresh'

const SESSION = {
    accessToken: 'new-access-token',
    expiresIn: 900,
    refreshToken: 'rotated-refresh-token',
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

describe('refreshWrenchSession', () => {
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

    it('posts the refresh token to the API through Kong', async () => {
        respondWith(SESSION)
        await refreshWrenchSession('the-refresh-token')

        const [url, init] = fetchMock.mock.calls[0]
        expect(url).toBe('https://api.example.com/v1/auth/refresh')
        expect(init.method).toBe('POST')
        expect(init.headers['X-Channel-Token']).toBe('channel-token')
        expect(JSON.parse(init.body)).toEqual({ refreshToken: 'the-refresh-token' })
        expect(init.signal).toBeInstanceOf(AbortSignal)
    })

    it('returns the rotated session', async () => {
        respondWith(SESSION)
        await expect(refreshWrenchSession('the-refresh-token')).resolves.toEqual({
            status: 'ok',
            session: SESSION,
        })
    })

    // The API answers 401 for expired, unknown, revoked and suspended alike.
    it('fails on a rejected refresh', async () => {
        respondWith({ message: 'Unauthorized' }, 401)
        await expect(refreshWrenchSession('spent')).resolves.toEqual({
            status: 'failed',
            reason: 'http_401',
        })
    })

    it('fails when the API is unreachable', async () => {
        fetchMock.mockRejectedValue(Object.assign(new Error('timeout'), { name: 'TimeoutError' }))
        await expect(refreshWrenchSession('x')).resolves.toEqual({
            status: 'failed',
            reason: 'unreachable',
        })
    })

    // A 200 without a refresh token would rotate the cookie to undefined and
    // sign the user out on the following load.
    it('fails on a response missing the rotated token', async () => {
        respondWith({ ...SESSION, refreshToken: undefined })
        await expect(refreshWrenchSession('x')).resolves.toEqual({
            status: 'failed',
            reason: 'unusable_session',
        })

        respondWith('<html>502</html>')
        await expect(refreshWrenchSession('x')).resolves.toMatchObject({ status: 'failed' })
    })

    it('refuses to call out at all when it is not configured', async () => {
        delete process.env.CHANNEL_TOKEN

        await expect(refreshWrenchSession('x')).resolves.toEqual({
            status: 'failed',
            reason: 'not_configured',
        })
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('never logs the refresh token', async () => {
        const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
        fetchMock.mockRejectedValue(new Error('boom'))

        await refreshWrenchSession('super-secret-refresh-token')

        expect(JSON.stringify(logged.mock.calls)).not.toContain('super-secret-refresh-token')
    })
})
