// @vitest-environment node
import { NextRequest } from 'next/server'
import { describe, it, expect, vi, afterEach } from 'vitest'

import { ACCESS_HANDOFF_COOKIE } from '@/lib/auth/session'
import { GET } from './route'

const SESSION = {
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

const encode = (value: unknown) =>
    Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url')

const request = (handoff?: string) => {
    const req = new NextRequest('http://localhost:3000/api/auth/session')
    if (handoff !== undefined) req.cookies.set(ACCESS_HANDOFF_COOKIE, handoff)

    return GET(req)
}

describe('GET /api/auth/session', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('returns the session left by the callback', async () => {
        const response = await request(encode(SESSION))

        expect(response.status).toBe(200)
        await expect(response.json()).resolves.toEqual(SESSION)
    })

    // The handoff is single-use: after this response the access token exists
    // only in the client's memory, which is the whole point of ADR-005.
    it('deletes the handoff as it reads it', async () => {
        const response = await request(encode(SESSION))
        const cookie = response.cookies.get(ACCESS_HANDOFF_COOKIE)

        expect(cookie?.value).toBe('')
        expect(new Date(cookie?.expires ?? 1).getTime()).toBe(0)
        expect(cookie?.path).toBe('/api/auth/session')
    })

    // A shared cache holding this body would serve one user's access token to
    // the next visitor.
    it('forbids caching the response', async () => {
        const response = await request(encode(SESSION))
        expect(response.headers.get('cache-control')).toContain('no-store')
    })

    it('answers 204 when there is no handoff to read', async () => {
        const response = await request()

        expect(response.status).toBe(204)
        expect(await response.text()).toBe('')
    })

    it('answers 204, not 500, on a cookie it cannot read', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {})

        expect((await request('not-base64-json')).status).toBe(204)
        expect((await request(encode({ accessToken: '', user: null }))).status).toBe(204)
    })

    it('clears an unreadable handoff too, so it cannot be retried forever', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {})

        const response = await request('not-base64-json')
        expect(response.cookies.get(ACCESS_HANDOFF_COOKIE)?.value).toBe('')
    })
})
