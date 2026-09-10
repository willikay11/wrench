import { render } from '@testing-library/react'
import { screen } from '@testing-library/dom'
import { describe, it, expect } from 'vitest'

import { RexUsage } from './rexUsage'

const usage = { used: 47, limit: 100, resetsAt: '2026-08-01T00:00:00Z' }

describe('RexUsage', () => {
    it('renders the meter the way the design draws it', () => {
        render(<RexUsage usage={usage} />)

        expect(screen.getByText('47/100')).toBeInTheDocument()
        expect(screen.getByText('Resets Aug 1')).toBeInTheDocument()
    })

    it('exposes the meter to assistive tech, not just as a coloured bar', () => {
        render(<RexUsage usage={usage} />)

        const meter = screen.getByRole('progressbar')
        expect(meter).toHaveAttribute('aria-valuenow', '47')
        expect(meter).toHaveAttribute('aria-valuemax', '100')
    })

    it('renders nothing when there is no counter to show', () => {
        const { container } = render(<RexUsage usage={null} />)
        expect(container).toBeEmptyDOMElement()
    })

    // A bar wider than its track, or a divide by zero, if the API ever
    // reports either.
    it('never overflows the track', () => {
        const { container } = render(<RexUsage usage={{ ...usage, used: 140 }} />)
        expect(container.querySelector('[style*="width"]')).toHaveStyle({ width: '100%' })
    })

    it('survives a zero limit', () => {
        const { container } = render(<RexUsage usage={{ ...usage, used: 0, limit: 0 }} />)
        expect(container.querySelector('[style*="width"]')).toHaveStyle({ width: '0%' })
    })
})
