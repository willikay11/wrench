import { render } from '@testing-library/react'
import { screen } from '@testing-library/dom'
import { describe, it, expect } from 'vitest'

import type { GarageSummary } from '@/lib/garage/data'
import { GarageStatus } from './garageStatus'

const summary: GarageSummary = {
    car: {
        id: 'car-1',
        year: 2003,
        make: 'Nissan',
        model: '350Z',
        mileage: 91204,
        lastServicedAt: new Date(Date.now() - 14 * 86_400_000).toISOString(),
    },
}

describe('GarageStatus', () => {
    it('renders the car the way the design draws it', () => {
        render(<GarageStatus summary={summary} />)

        expect(screen.getByText("'03 Nissan 350Z")).toBeInTheDocument()
        expect(screen.getByText('91,204 mi')).toBeInTheDocument()
        expect(screen.getByText('2 wks ago')).toBeInTheDocument()
    })

    // The main panel already says the garage is empty. A card saying "—"
    // beside it is the same sentence twice, in the quieter place.
    it('renders nothing at all when there is no car', () => {
        const { container } = render(<GarageStatus summary={null} />)
        expect(container).toBeEmptyDOMElement()
    })

    it('omits the service line for a car that has never been serviced', () => {
        render(<GarageStatus summary={{ car: { ...summary.car, lastServicedAt: null } }} />)

        expect(screen.getByText("'03 Nissan 350Z")).toBeInTheDocument()
        expect(screen.queryByText(/Last service/i)).not.toBeInTheDocument()
    })
})
