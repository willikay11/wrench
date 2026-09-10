import { render } from '@testing-library/react'
import { screen } from '@testing-library/dom'
import { describe, it, expect, vi } from 'vitest'
import { AuthPanel } from './authPanel'

// The panel mounts AuthStatusToast, which reads the router. Its own behaviour
// is covered in authStatusToast.test.tsx; here it just needs to not throw.
vi.mock('next/navigation', () => ({
    useRouter: () => ({ replace: vi.fn() }),
    usePathname: () => '/signup',
    useSearchParams: () => new URLSearchParams(),
}))

const renderSignup = () =>
    render(
        <AuthPanel
            intent="signup"
            heading="Create your account"
            subheading="One tap. No passwords to remember. Free to start."
            buttonLabel="Continue with Google"
            switchPrompt="Already have an account?"
            switchLabel="Log in"
            switchHref="/login"
        />,
    )

describe('AuthPanel', () => {
    it('renders the heading and subheading', () => {
        renderSignup()
        expect(screen.getByRole('heading', { name: /Create your account/i })).toBeInTheDocument()
        expect(screen.getByText(/No passwords to remember/i)).toBeInTheDocument()
    })

    it('offers Google as the only way in', () => {
        renderSignup()
        expect(screen.getByRole('button', { name: /Continue with Google/i })).toBeInTheDocument()
        expect(screen.getAllByRole('button')).toHaveLength(1)
        expect(screen.queryByText(/Apple/i)).not.toBeInTheDocument()
        expect(screen.queryByText(/Facebook/i)).not.toBeInTheDocument()
    })

    it('links across to the other screen', () => {
        renderSignup()
        expect(screen.getByRole('link', { name: /Log in/i })).toHaveAttribute('href', '/login')
    })

    it('names the terms the user is agreeing to', () => {
        renderSignup()
        expect(screen.getByText(/Terms of Service/i)).toBeInTheDocument()
        expect(screen.getByText(/Privacy Policy/i)).toBeInTheDocument()
    })
})
