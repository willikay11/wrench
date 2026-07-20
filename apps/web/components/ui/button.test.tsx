import { render } from '@testing-library/react'
import { screen } from '@testing-library/dom'
import { describe, it, expect } from 'vitest'
import { Button } from './button'

describe('Button', () => {
    it('renders the primary component', () => {
        render(<Button variant="primary">Click me</Button>)
        const buttonElement = screen.getByText(/Click me/i)
        expect(buttonElement).toBeInTheDocument()
        expect(buttonElement).toHaveClass('bg-primary text-primary-foreground hover:bg-primary/80')
    })

    it('renders the primary component with loading state', () => {
        render(<Button variant="primary" isLoading>Click me</Button>)
        const buttonElement = screen.getByText(/Click me/i)
        expect(buttonElement).toBeInTheDocument()
        expect(buttonElement).toHaveClass('bg-primary text-primary-foreground hover:bg-primary/80')
        expect(buttonElement).toHaveAttribute('aria-busy', 'true')
    })

    it('renders the primary component with disabled state', () => {
        render(<Button variant="primary" disabled>Click me</Button>)
        const buttonElement = screen.getByText(/Click me/i)
        expect(buttonElement).toBeInTheDocument()
        expect(buttonElement).toHaveClass('bg-primary text-primary-foreground hover:bg-primary/80')
        expect(buttonElement).toBeDisabled()
    })

    it('renders the secondary component', () => {
        render(<Button variant="secondary">Click me</Button>)
        const buttonElement = screen.getByText(/Click me/i)
        expect(buttonElement).toBeInTheDocument()
        expect(buttonElement).toHaveClass('bg-secondary text-secondary-foreground')
    })

    it('renders the destructive component', () => {
        render(<Button variant="destructive">Click me</Button>)
        const buttonElement = screen.getByText(/Click me/i)
        expect(buttonElement).toBeInTheDocument()
        expect(buttonElement).toHaveClass('bg-destructive/10 text-destructive')
    })

    it('renders the ghost component', () => {
        render(<Button variant="ghost">Click me</Button>)
        const buttonElement = screen.getByText(/Click me/i)
        expect(buttonElement).toBeInTheDocument()
        expect(buttonElement).toHaveClass('border-border')
    })

    it('renders the link component', () => {
        render(<Button variant="link">Click me</Button>)
        const buttonElement = screen.getByText(/Click me/i)
        expect(buttonElement).toBeInTheDocument()
        expect(buttonElement).toHaveClass('text-primary underline-offset-4')
    })

    it('renders the outline component', () => {
        render(<Button variant="outline">Click me</Button>)
        const buttonElement = screen.getByText(/Click me/i)
        expect(buttonElement).toBeInTheDocument()
        expect(buttonElement).toHaveClass('border-border')
    })
})