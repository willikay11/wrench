import { render, waitFor } from '@testing-library/react'
import { screen } from '@testing-library/dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { Toaster } from '@/components/ui/sonner'
import { AuthStatusToast } from './authStatusToast'

const replace = vi.fn()
let params = new URLSearchParams()

vi.mock('next/navigation', () => ({
    useRouter: () => ({ replace }),
    usePathname: () => '/signup',
    useSearchParams: () => params,
}))

const renderWith = (search: string) => {
    params = new URLSearchParams(search)
    return render(
        <>
            <Toaster />
            <AuthStatusToast />
        </>,
    )
}

describe('AuthStatusToast', () => {
    beforeEach(() => {
        replace.mockClear()
    })

    it('confirms a completed sign-in and says why nothing happens yet', async () => {
        renderWith('auth=pending')

        await waitFor(() => {
            expect(screen.getByText(/Signed in with Google/i)).toBeInTheDocument()
        })
        expect(screen.getByText(/Accounts open with early access/i)).toBeInTheDocument()
    })

    // Backing out of the consent screen is a decision. Telling the user
    // something went wrong would be a lie.
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
        renderWith('auth=pending')

        await waitFor(() => {
            expect(replace).toHaveBeenCalledWith('/signup', { scroll: false })
        })
    })

    it('stays silent with no status, or one it does not recognise', async () => {
        const { unmount } = renderWith('')
        expect(screen.queryByText(/Signed in with Google/i)).not.toBeInTheDocument()
        expect(replace).not.toHaveBeenCalled()
        unmount()

        renderWith('auth=whatever')
        expect(screen.queryByText(/Signed in with Google/i)).not.toBeInTheDocument()
        expect(replace).not.toHaveBeenCalled()
    })
})
