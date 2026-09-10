import { render } from '@testing-library/react'
import { screen } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { startGoogleSignIn } from '@/lib/auth/google'
import { GoogleSignInButton } from './googleSignInButton'

// jsdom cannot navigate, and the real function does nothing else.
vi.mock('@/lib/auth/google', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/auth/google')>()),
    startGoogleSignIn: vi.fn(),
}))

describe('GoogleSignInButton', () => {
    beforeEach(() => {
        vi.mocked(startGoogleSignIn).mockClear()
    })

    it('renders the label', () => {
        render(<GoogleSignInButton intent="signup" label="Continue with Google" />)
        expect(screen.getByRole('button', { name: /Continue with Google/i })).toBeInTheDocument()
    })

    it('starts the flow for the intent it was given', async () => {
        const user = userEvent.setup()
        render(<GoogleSignInButton intent="login" label="Continue with Google" />)

        await user.click(screen.getByRole('button', { name: /Continue with Google/i }))

        expect(startGoogleSignIn).toHaveBeenCalledWith('login')
    })

    // The page is on its way to Google. Re-enabling would let a second click
    // start a second handshake, overwriting the cookie the first one needs.
    it('stays disabled once the browser is leaving', async () => {
        const user = userEvent.setup()
        render(<GoogleSignInButton intent="signup" label="Continue with Google" />)

        const button = screen.getByRole('button', { name: /Continue with Google/i })
        await user.click(button)
        expect(button).toBeDisabled()

        await user.click(button)
        expect(startGoogleSignIn).toHaveBeenCalledTimes(1)
    })
})
