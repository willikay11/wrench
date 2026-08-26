// @vitest-environment node
import { createHash } from 'node:crypto'
import { NextRequest } from 'next/server'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import {
    buildAuthorizeUrl,
    createPkcePair,
    createState,
    decodeHandshake,
    encodeHandshake,
    exchangeCodeForIdToken,
    readOAuthConfig,
    redirectToAuthPage,
    resolveRedirectUri,
    stateMatches,
    GOOGLE_TOKEN_URL,
} from './googleOAuth'

const config = { clientId: 'client-id', clientSecret: 'client-secret' }

const request = (url = 'http://localhost:3000/api/auth/google/callback') => new NextRequest(url)

describe('buildAuthorizeUrl', () => {
    const url = () =>
        new URL(
            buildAuthorizeUrl({
                clientId: config.clientId,
                redirectUri: 'http://localhost:3000/api/auth/google/callback',
                state: 'the-state',
                codeChallenge: 'the-challenge',
            }),
        )

    it('points at Google with the authorization code flow', () => {
        expect(url().origin + url().pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
        expect(url().searchParams.get('response_type')).toBe('code')
        expect(url().searchParams.get('client_id')).toBe('client-id')
        expect(url().searchParams.get('redirect_uri')).toBe(
            'http://localhost:3000/api/auth/google/callback',
        )
    })

    it('asks for the claims an ID token needs', () => {
        expect(url().searchParams.get('scope')).toBe('openid email profile')
    })

    it('carries the state and a S256 PKCE challenge', () => {
        expect(url().searchParams.get('state')).toBe('the-state')
        expect(url().searchParams.get('code_challenge')).toBe('the-challenge')
        expect(url().searchParams.get('code_challenge_method')).toBe('S256')
    })

    // Silently reusing the signed-in account is the wrong default on a shared
    // machine, and is what Google does without this.
    it('makes the user pick an account', () => {
        expect(url().searchParams.get('prompt')).toBe('select_account')
    })

    it('never puts the client secret in the URL', () => {
        expect(url().toString()).not.toContain('client-secret')
    })
})

describe('createPkcePair', () => {
    it('derives the challenge as the SHA-256 of the verifier', () => {
        const { verifier, challenge } = createPkcePair()
        expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'))
    })

    it('is fresh on every call', () => {
        expect(createPkcePair().verifier).not.toBe(createPkcePair().verifier)
        expect(createState()).not.toBe(createState())
    })
})

describe('handshake cookie', () => {
    const handshake = { state: 'the-state', verifier: 'the-verifier', intent: 'login' } as const

    it('round trips', () => {
        expect(decodeHandshake(encodeHandshake(handshake))).toEqual(handshake)
    })

    it('rejects a missing, malformed or half-filled cookie', () => {
        expect(decodeHandshake(undefined)).toBeNull()
        expect(decodeHandshake('')).toBeNull()
        expect(decodeHandshake('not-base64-json')).toBeNull()
        expect(decodeHandshake(Buffer.from('{"state":"s"}').toString('base64url'))).toBeNull()
    })

    // An intent off the URL decides where the user is sent back to; anything
    // outside the union would put an attacker-chosen path in a redirect.
    it('rejects an intent that is not one of ours', () => {
        const forged = Buffer.from(
            JSON.stringify({ ...handshake, intent: 'https://evil.example' }),
        ).toString('base64url')
        expect(decodeHandshake(forged)).toBeNull()
    })
})

describe('stateMatches', () => {
    it('accepts only the exact state', () => {
        expect(stateMatches('abc', 'abc')).toBe(true)
        expect(stateMatches('abc', 'abd')).toBe(false)
        expect(stateMatches('abc', 'abcd')).toBe(false)
        expect(stateMatches('abc', '')).toBe(false)
        expect(stateMatches('abc', null)).toBe(false)
    })
})

describe('resolveRedirectUri', () => {
    afterEach(() => {
        delete process.env.GOOGLE_REDIRECT_URI
    })

    it('derives from the request when unset, so local needs no extra config', () => {
        expect(resolveRedirectUri(request())).toBe(
            'http://localhost:3000/api/auth/google/callback',
        )
    })

    it('defers to the env var where a proxy makes that derivation wrong', () => {
        process.env.GOOGLE_REDIRECT_URI = 'https://wrench.it.com/api/auth/google/callback'
        expect(resolveRedirectUri(request())).toBe(
            'https://wrench.it.com/api/auth/google/callback',
        )
    })
})

describe('readOAuthConfig', () => {
    afterEach(() => {
        delete process.env.GOOGLE_CLIENT_ID
        delete process.env.GOOGLE_CLIENT_SECRET
    })

    it('is null unless both halves are present', () => {
        expect(readOAuthConfig()).toBeNull()

        process.env.GOOGLE_CLIENT_ID = 'id'
        expect(readOAuthConfig()).toBeNull()

        process.env.GOOGLE_CLIENT_SECRET = 'secret'
        expect(readOAuthConfig()).toEqual({ clientId: 'id', clientSecret: 'secret' })
    })
})

describe('redirectToAuthPage', () => {
    it('sends each intent back where it started, carrying the status', () => {
        expect(redirectToAuthPage(request(), 'signup', 'pending').headers.get('location')).toBe(
            'http://localhost:3000/signup?auth=pending',
        )
        expect(redirectToAuthPage(request(), 'login', 'cancelled').headers.get('location')).toBe(
            'http://localhost:3000/login?auth=cancelled',
        )
    })
})

describe('exchangeCodeForIdToken', () => {
    const fetchMock = vi.fn()

    beforeEach(() => {
        fetchMock.mockReset()
        vi.stubGlobal('fetch', fetchMock)
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    const exchange = () =>
        exchangeCodeForIdToken({
            config,
            code: 'the-code',
            verifier: 'the-verifier',
            redirectUri: 'http://localhost:3000/api/auth/google/callback',
        })

    const respondWith = (body: unknown, init: ResponseInit = {}) =>
        fetchMock.mockResolvedValue(
            new Response(typeof body === 'string' ? body : JSON.stringify(body), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
                ...init,
            }),
        )

    it('posts the code, the verifier and the secret to Google', async () => {
        respondWith({ id_token: 'the-id-token' })
        await exchange()

        const [url, init] = fetchMock.mock.calls[0]
        expect(url).toBe(GOOGLE_TOKEN_URL)
        expect(init.method).toBe('POST')

        const body = new URLSearchParams(init.body.toString())
        expect(body.get('grant_type')).toBe('authorization_code')
        expect(body.get('code')).toBe('the-code')
        expect(body.get('code_verifier')).toBe('the-verifier')
        expect(body.get('client_secret')).toBe('client-secret')
        expect(init.signal).toBeInstanceOf(AbortSignal)
    })

    it('returns the ID token', async () => {
        respondWith({ id_token: 'the-id-token' })
        await expect(exchange()).resolves.toEqual({ status: 'ok', idToken: 'the-id-token' })
    })

    it('fails on a rejected exchange', async () => {
        respondWith({ error: 'invalid_grant' }, { status: 400 })
        await expect(exchange()).resolves.toEqual({ status: 'failed', reason: 'http_400' })
    })

    it('fails on a response that is not the JSON it claims', async () => {
        respondWith('<html>502</html>')
        await expect(exchange()).resolves.toMatchObject({ status: 'failed' })
    })

    // A 200 with no id_token is the case that would otherwise sail through as
    // a successful sign-in carrying nothing.
    it('fails when the response carries no ID token', async () => {
        respondWith({ access_token: 'not-the-one' })
        await expect(exchange()).resolves.toEqual({ status: 'failed', reason: 'no_id_token' })
    })

    it('fails on a network error or timeout rather than throwing', async () => {
        fetchMock.mockRejectedValue(Object.assign(new Error('timed out'), { name: 'TimeoutError' }))
        await expect(exchange()).resolves.toEqual({ status: 'failed', reason: 'TimeoutError' })
    })
})
