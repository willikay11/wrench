import { render, waitFor } from '@testing-library/react'
import { screen } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { describe, it, expect } from 'vitest'
import { Toaster } from '@/components/ui/sonner'
import { GoogleSignInButton } from './googleSignInButton'

describe('GoogleSignInButton', () => {
    it('renders the label', () => {
        render(<GoogleSignInButton intent="signup" label="Continue with Google" />)
        expect(screen.getByRole('button', { name: /Continue with Google/i })).toBeInTheDocument()
    })

    // The OAuth endpoint does not exist yet, so the click has to say so rather
    // than fail silently or leave the button stuck in its loading state.
    it('tells the user sign-in is not open yet, and re-enables', async () => {
        const user = userEvent.setup()
        render(
            <>
                <Toaster />
                <GoogleSignInButton intent="signup" label="Continue with Google" />
            </>,
        )

        const button = screen.getByRole('button', { name: /Continue with Google/i })
        await user.click(button)

        await waitFor(() => {
            expect(screen.getByText(/not open yet/i)).toBeInTheDocument()
        })
        expect(button).not.toBeDisabled()
    })
})
