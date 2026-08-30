import { render, waitFor } from '@testing-library/react'
import { screen } from '@testing-library/dom'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { Toaster } from '@/components/ui/sonner'
import { SessionProvider } from '@/components/auth/sessionProvider'
import { AuthStatusToast } from './authStatusToast'

const replace = vi.fn()
let params = new URLSearchParams()

vi.mock('next/navigation', () => ({
    useRouter: () => ({ replace }),
    usePathname: () => '/signup',
    useSearchParams: () => params,
}))

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

const fetchMock = vi.fn()

const renderWith = (search: string) => {
    params = new URLSearchParams(search)

    return render(
        <SessionProvider>
            <Toaster />
            <AuthStatusToast />
        </SessionProvider>,
    )
}

describe('AuthStatusToast', () => {
    beforeEach(() => {
        replace.mockClear()
        fetchMock.mockReset()
        fetchMock.mockResolvedValue(
            new Response(JSON.stringify(SESSION), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }),
        )
        vi.stubGlobal('fetch', fetchMock)
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('greets a new account by name', async () => {
        renderWith('auth=welcome')

        await waitFor(() => {
            expect(screen.getByText(/Welcome to Wrench, Kamau/i)).toBeInTheDocument()
        })
    })

    it('greets a returning user differently', async () => {
        renderWith('auth=signed-in')

        await waitFor(() => {
            expect(screen.getByText(/Welcome back, Kamau/i)).toBeInTheDocument()
        })
    })

    // The greeting waits on the handoff. If it fired first the user would be
    // welcomed by no name at all, which reads as a bug.
    it('still greets when the handoff returns nothing', async () => {
        fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
        renderWith('auth=welcome')

        await waitFor(() => {
            expect(screen.getByText(/Welcome to Wrench/i)).toBeInTheDocument()
        })
        expect(screen.queryByText(/,/)).not.toBeInTheDocument()
    })

    it('reports a cancelled sign-in without calling it a failure', async () => {
        renderWith('auth=cancelled')

        await waitFor(() => {
            expect(screen.getByText(/Sign-in cancelled/i)).toBeInTheDocument()
        })
        expect(screen.queryByRole('error-toast')).not.toBeInTheDocument()
    })

    it('reports a failure as an error', async () => {
        renderWith('auth=error')

        await waitFor(() => {
            expect(screen.getByText(/could not finish signing you in/i)).toBeInTheDocument()
        })
        expect(screen.getByRole('error-toast')).toBeInTheDocument()
    })

    // Otherwise a refresh or a shared link replays a toast about something
    // that already happened.
    it('strips the status from the URL once it has been shown', async () => {
        renderWith('auth=welcome')

        await waitFor(() => {
            expect(replace).toHaveBeenCalledWith('/signup', { scroll: false })
        })
    })

    it('stays silent with no status, or one it does not recognise', async () => {
        // Waiting for the handoff to settle first, so this asserts silence
        // rather than just outrunning the session load.
        const settled = () => waitFor(() => expect(fetchMock).toHaveBeenCalled())

        const { unmount } = renderWith('')
        await settled()
        expect(screen.queryByText(/Welcome/i)).not.toBeInTheDocument()
        expect(replace).not.toHaveBeenCalled()
        unmount()

        renderWith('auth=whatever')
        await settled()
        expect(screen.queryByText(/Welcome/i)).not.toBeInTheDocument()
        expect(replace).not.toHaveBeenCalled()
    })
})
