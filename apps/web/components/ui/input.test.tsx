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
})