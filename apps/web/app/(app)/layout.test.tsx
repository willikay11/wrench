import { describe, it, expect, vi, beforeEach } from 'vitest'

import { REFRESH_TOKEN_COOKIE } from '@/lib/auth/session'
import AppLayout from './layout'

const get = vi.fn()
const redirect = vi.fn((url: string): never => {
    // The real redirect() throws to unwind rendering; mirroring that keeps the
    // test honest about the layout never continuing past the gate.
    throw new Error(`NEXT_REDIRECT ${url}`)
})

vi.mock('next/headers', () => ({ cookies: async () => ({ get }) }))
vi.mock('next/navigation', () => ({ redirect: (url: string) => redirect(url) }))

describe('AppLayout', () => {
    beforeEach(() => {
        get.mockReset()
        redirect.mockClear()
    })

    // The gate is the refresh token, not the access token: the access token is
    // memory-only, so guarding on it would bounce people out on every reload.
    it('sends a visitor with no refresh token to /login', async () => {
        get.mockReturnValue(undefined)

        await expect(AppLayout({ children: null })).rejects.toThrow('NEXT_REDIRECT /login')
        expect(redirect).toHaveBeenCalledWith('/login')
        expect(get).toHaveBeenCalledWith(REFRESH_TOKEN_COOKIE)
    })

    it('renders the shell for a visitor who has one', async () => {
        get.mockReturnValue({ name: REFRESH_TOKEN_COOKIE, value: 'a-refresh-token' })

        const tree = await AppLayout({ children: null })

        expect(redirect).not.toHaveBeenCalled()
        expect(tree).toBeTruthy()
    })
})
