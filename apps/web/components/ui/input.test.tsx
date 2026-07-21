import { render } from '@testing-library/react'
import { screen } from '@testing-library/dom'
import { describe, it, expect } from 'vitest'

import { Input } from './input'

describe('Input', () => {
    it('renders the input component', () => {
        render(<Input placeholder="Enter text" />)
        const inputElement = screen.getByPlaceholderText(/Enter text/i)
        expect(inputElement).toBeInTheDocument()
    })

    it('renders the label when provided', () => {
        render(<Input label="Test Label" />)
        const labelElement = screen.getByText(/TEST LABEL/i)
        expect(labelElement).toBeInTheDocument()
    })

    it('renders the error message when provided', () => {
        render(<Input error="This is an error" />)
        const errorElement = screen.getByText(/This is an error/i)
        expect(errorElement).toBeInTheDocument()
    })

    it('renders the helper text when provided', () => {
        render(<Input helperText="This is helper text" />)
        const helperTextElement = screen.getByText(/This is helper text/i)
        expect(helperTextElement).toBeInTheDocument()
    })
    
    it('renders the left icon when provided', () => {
        render(<Input leftIcon={<span data-testid="left-icon">L</span>} />)
        const leftIconElement = screen.getByTestId('left-icon')
        expect(leftIconElement).toBeInTheDocument()
    })

    it('renders the right icon when provided', () => {
        render(<Input rightIcon={<span data-testid="right-icon">R</span>} />)
        const rightIconElement = screen.getByTestId('right-icon')
        expect(rightIconElement).toBeInTheDocument()
    })

    it('renders the input component with disabled state', () => {
        render(<Input placeholder="Enter text" disabled />)
        const inputElement = screen.getByPlaceholderText(/Enter text/i)
        expect(inputElement).toBeInTheDocument()
        expect(inputElement).toBeDisabled()
    })

    it('renders the input component with error state', () => {
        render(<Input placeholder="Enter text" error="This is an error" />)
        const inputElement = screen.getByPlaceholderText(/Enter text/i)
        expect(inputElement).toBeInTheDocument()
        expect(inputElement).toHaveAttribute('aria-invalid', 'true')
    })
})