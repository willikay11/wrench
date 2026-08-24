import { render } from '@testing-library/react'
import { screen } from '@testing-library/dom'
import { describe, it, expect } from 'vitest'
import { Navbar } from './navbar'

describe('Navbar', () => {
    it('renders the navbar component', () => {
        render(<Navbar />)
        const navbarElement = screen.getByRole('navigation')
        expect(navbarElement).toBeInTheDocument()
    })

    it('renders the logo in the navbar', () => {
        render(<Navbar />)
        const logoElement = screen.getByText(/Wrench/i)
        expect(logoElement).toBeInTheDocument()
    })

    it('renders the navigation links in the navbar', () => {
        render(<Navbar />)

        expect(screen.getByRole('link', { name: /What it does/i })).toHaveAttribute('href', '#features')
        expect(screen.getByRole('link', { name: /Meet Rex/i })).toHaveAttribute('href', '#rex')
        expect(screen.getByRole('link', { name: /Try it/i })).toHaveAttribute('href', '#try')
    })

    it('renders the waitlist call to action in the navbar', () => {
        render(<Navbar />)
        const waitlistButton = screen.getByRole('button', { name: /Join the Waitlist/i })
        expect(waitlistButton).toBeInTheDocument()
    })
})
