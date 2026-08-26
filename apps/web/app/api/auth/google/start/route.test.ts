// @vitest-environment node
import { NextRequest } from 'next/server'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { decodeHandshake, OAUTH_HANDSHAKE_COOKIE } from '@/lib/auth/googleOAuth'
import { GET } from './route'

const start = (intent?: string) =>
    GET(
        new NextRequest(
            `http://localhost:3000/api/auth/google/start${intent ? `?intent=${intent}` : ''}`,
        ),
    )

const locationOf = (response: Response) => new URL(response.headers.get('location') ?? '')

describe('GET /api/auth/google/start', () => {
    beforeEach(() => {
        process.env.GOOGLE_CLIENT_ID = 'client-id'
        process.env.GOOGLE_CLIENT_SECRET = 'client-secret'
        vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
        delete process.env.GOOGLE_CLIENT_ID
        delete process.env.GOOGLE_CLIENT_SECRET
        vi.restoreAllMocks()
    })

    it('redirects to Google', async () => {
        const response = await start('signup')

        expect(response.status).toBe(307)
        expect(locationOf(response).host).toBe('accounts.google.com')
    })

    it('stashes the state and verifier where only the callback can read them', async () => {
        const response = await start('login')
        const cookie = response.cookies.get(OAUTH_HANDSHAKE_COOKIE)

        expect(cookie?.httpOnly).toBe(true)
        // Lax rather than Strict: Google's callback is a cross-site top-level
        // navigation, and Strict would withhold the cookie on arrival.
        expect(cookie?.sameSite).toBe('lax')
        expect(cookie?.path).toBe('/api/auth/google')
        expect(cookie?.maxAge).toBe(600)

        const handshake = decodeHandshake(cookie?.value)
        expect(handshake?.intent).toBe('login')
        // The state Google is shown is the state we kept, or the callback can
        // never match them.
        expect(locationOf(response).searchParams.get('state')).toBe(handshake?.state)
    })

    // The verifier is the half of PKCE that must not travel to Google.
    it('sends the challenge to Google and keeps the verifier', async () => {
        const response = await start('signup')
        const handshake = decodeHandshake(response.cookies.get(OAUTH_HANDSHAKE_COOKIE)?.value)
        const sent = locationOf(response).toString()

        expect(handshake?.verifier).toBeTruthy()
        expect(sent).not.toContain(handshake?.verifier)
        expect(locationOf(response).searchParams.get('code_challenge_method')).toBe('S256')
    })

    it('never sends the client secret to the browser', async () => {
        const response = await start('signup')
        expect(JSON.stringify([...response.headers])).not.toContain('client-secret')
    })

    it('treats an unrecognised intent as a signup rather than failing', async () => {
        const response = await start('nonsense')
        const handshake = decodeHandshake(response.cookies.get(OAUTH_HANDSHAKE_COOKIE)?.value)

        expect(handshake?.intent).toBe('signup')
        expect(locationOf(response).host).toBe('accounts.google.com')
    })

    it('sends the user back with an error when the client is not configured', async () => {
        delete process.env.GOOGLE_CLIENT_ID

        const response = await start('login')

        expect(locationOf(response).pathname).toBe('/login')
        expect(locationOf(response).searchParams.get('auth')).toBe('error')
        // No half-formed handshake left behind for a later callback to trust.
        expect(response.cookies.get(OAUTH_HANDSHAKE_COOKIE)).toBeUndefined()
    })
})
