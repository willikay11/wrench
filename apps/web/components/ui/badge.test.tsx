import { render } from '@testing-library/react'
import { screen } from '@testing-library/dom'
import { describe, it, expect } from 'vitest'

import { Badge } from './badge'

describe('Badge', () => {
    it('renders the badge component', () => {
        render(<Badge variant="primary">New</Badge>)
        const badgeElement = screen.getByText(/New/i)
        expect(badgeElement).toBeInTheDocument()
        expect(badgeElement).toHaveClass('border border-primary bg-primary/20 text-primary px-3 py-0.5 text-[0.8125rem]')
    })

    it('renders the badge component with different variants (green, blue, red, teal, purple, gray)', () => {
        const variants = ['green', 'blue', 'red', 'teal', 'purple', 'gray'] as const

        variants.forEach((variant) => {
            render(<Badge variant={variant}>{variant}</Badge>)
            const badgeElement = screen.getByText(new RegExp(variant, 'i'))
            expect(badgeElement).toBeInTheDocument()
            expect(badgeElement).toHaveClass(`border border-${variant}-500 bg-${variant}-500/20 text-${variant}-500 px-3 py-0.5 text-[0.8125rem]`)
        })
    })

    it('renders the badge component with different sizes (sm, md)', () => {
        const sizes = ['sm', 'md'] as const

        sizes.forEach((size) => {
            render(<Badge size={size}>{size}</Badge>)
            const badgeElement = screen.getByText(new RegExp(size, 'i'))
            expect(badgeElement).toBeInTheDocument()
            if (size === 'sm') {
                expect(badgeElement).toHaveClass('px-2 py-0.5 text-[0.6875rem]')
            } else if (size === 'md') {
                expect(badgeElement).toHaveClass('px-3 py-0.5 text-[0.8125rem]')
            }
        })
    })
})