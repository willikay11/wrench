// @vitest-environment node
import { NextRequest } from 'next/server'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { ACCESS_HANDOFF_COOKIE, REFRESH_TOKEN_COOKIE } from '@/lib/auth/session'
import { GET } from './route'

const CLIENT_SESSION = {
    accessToken: 'the-access-token',
    expiresIn: 900,
    user: {
        id: '11111111-1111-1111-1111-111111111111',
        email: 'someone@example.com',
        displayName: 'Someone',
        avatarUrl: 'https://example.com/a.png',
        emailVerified: true,
    },
}

const API_SESSION = {
    ...CLIENT_SESSION,
    accessToken: 'refreshed-access-token',
    refreshToken: 'rotated-refresh-token',
}

const fetchMock = vi.fn()

const apiReturns = (status: number, body: unknown = API_SESSION) =>
    fetchMock.mockResolvedValue(
        new Response(JSON.stringify(body), {
            status,
            headers: { 'Content-Type': 'application/json' },
        }),
    )

const encode = (value: unknown) =>
    Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url')

const request = ({ handoff, refresh }: { handoff?: string; refresh?: string }) => {
    const req = new NextRequest('http://localhost:3000/api/auth/session')
    if (handoff !== undefined) req.cookies.set(ACCESS_HANDOFF_COOKIE, handoff)
    if (refresh !== undefined) req.cookies.set(REFRESH_TOKEN_COOKIE, refresh)

    return GET(req)
}

describe('GET /api/auth/session', () => {
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

    describe('straight after sign-in', () => {
        it('returns the session the callback left behind', async () => {
            const response = await request({ handoff: encode(CLIENT_SESSION) })

            expect(response.status).toBe(200)
            await expect(response.json()).resolves.toEqual(CLIENT_SESSION)
        })

        // Cheaper and, more importantly, it does not spend a refresh token on
        // a page load that already has a session in hand.
        it('does not call the API when the handoff is readable', async () => {
            await request({ handoff: encode(CLIENT_SESSION), refresh: 'a-refresh-token' })
            expect(fetchMock).not.toHaveBeenCalled()
        })

        it('deletes the handoff as it reads it', async () => {
            const response = await request({ handoff: encode(CLIENT_SESSION) })
            const cookie = response.cookies.get(ACCESS_HANDOFF_COOKIE)

            expect(cookie?.value).toBe('')
            expect(new Date(cookie?.expires ?? 1).getTime()).toBe(0)
            expect(cookie?.path).toBe('/api/auth/session')
        })
    })

    describe('on a reload, with only the refresh cookie left', () => {
        it('rebuilds the session from the API', async () => {
            apiReturns(200)

            const response = await request({ refresh: 'the-refresh-token' })

            expect(response.status).toBe(200)
            await expect(response.json()).resolves.toEqual({
                accessToken: 'refreshed-access-token',
                expiresIn: 900,
                user: CLIENT_SESSION.user,
            })
        })

        // The API revokes the token it was handed. Failing to store the
        // replacement means presenting a spent token next load, which the API
        // reads as theft and answers by revoking the whole family.
        it('stores the rotated refresh token', async () => {
            apiReturns(200)

            const response = await request({ refresh: 'the-refresh-token' })
            const cookie = response.cookies.get(REFRESH_TOKEN_COOKIE)

            expect(cookie?.value).toBe('rotated-refresh-token')
            expect(cookie?.httpOnly).toBe(true)
            expect(cookie?.sameSite).toBe('lax')
            expect(cookie?.path).toBe('/')
            expect(cookie?.maxAge).toBe(604800)
        })

        it('never returns the refresh token to the client', async () => {
            apiReturns(200)

            const response = await request({ refresh: 'the-refresh-token' })
            const body = await response.text()

            expect(body).not.toContain('rotated-refresh-token')
            expect(body).not.toContain('the-refresh-token')
            expect(JSON.parse(body).refreshToken).toBeUndefined()
        })

        it('falls back to the API when the handoff is unreadable', async () => {
            apiReturns(200)

            const response = await request({ handoff: 'not-base64-json', refresh: 'a-token' })

            expect(response.status).toBe(200)
            expect(fetchMock).toHaveBeenCalledOnce()
        })
    })

    describe('when there is no session to rebuild', () => {
        it('answers 204 with no cookies at all', async () => {
            const response = await request({})

            expect(response.status).toBe(204)
            expect(fetchMock).not.toHaveBeenCalled()
            expect(await response.text()).toBe('')
        })

        // The app shell gates on this cookie's presence. Leaving a token that
        // cannot mint a session holds the user on a signed-in page that can do
        // nothing at all.
        it('clears the refresh cookie when the API rejects it', async () => {
            apiReturns(401, { message: 'Unauthorized' })

            const response = await request({ refresh: 'spent-token' })

            expect(response.status).toBe(204)
            expect(response.cookies.get(REFRESH_TOKEN_COOKIE)?.value).toBe('')
            expect(new Date(response.cookies.get(REFRESH_TOKEN_COOKIE)?.expires ?? 1).getTime()).toBe(0)
        })

        // A network blip is not proof the token is bad. It still signs the
        // page out for now, which is the safe reading — but it is the case to
        // revisit if reloads start logging people out on flaky connections.
        it('clears the cookie when the API is unreachable', async () => {
            fetchMock.mockRejectedValue(new Error('econnrefused'))

            const response = await request({ refresh: 'a-token' })

            expect(response.status).toBe(204)
            expect(response.cookies.get(REFRESH_TOKEN_COOKIE)?.value).toBe('')
        })
    })

    it('forbids caching every answer it gives', async () => {
        apiReturns(200)

        for (const cookies of [{ handoff: encode(CLIENT_SESSION) }, { refresh: 'a-token' }, {}]) {
            const response = await request(cookies)
            expect(response.headers.get('cache-control')).toContain('no-store')
        }
    })
})
