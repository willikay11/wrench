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
        const featuresLink = screen.getByText(/Features/i)
        const assistantLink = screen.getByText(/AI Assistant/i)
        const contactLink = screen.getByText(/App/i)

        expect(featuresLink).toBeInTheDocument()
        expect(assistantLink).toBeInTheDocument()
        expect(contactLink).toBeInTheDocument()
    })

    it('renders the get started button in the navbar', () => {
        render(<Navbar />)
        const getStartedButton = screen.getByRole('button', { name: /Get Started/i })
        expect(getStartedButton).toBeInTheDocument()
    })
})