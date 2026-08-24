import { render } from '@testing-library/react'
import { screen } from '@testing-library/dom'
import { describe, it, expect } from 'vitest'

import { Feature } from './feature'

describe('Feature', () => {
    it('renders the section label', () => {
        render(<Feature />)
        expect(screen.getByText(/what wrench does/i)).toBeInTheDocument()
    })

    it('renders the modification logging feature', () => {
        render(<Feature />)
        expect(screen.getByText(/Every modification, logged\./i)).toBeInTheDocument()
    })

    it('renders the build stage tracking feature', () => {
        render(<Feature />)
        expect(screen.getByText(/Every build stage, tracked\./i)).toBeInTheDocument()
    })

    it('renders the service record feature', () => {
        render(<Feature />)
        expect(screen.getByText(/Every service record, in one place\./i)).toBeInTheDocument()
    })
})
