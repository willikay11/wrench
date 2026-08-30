import { render } from '@testing-library/react'
import { screen } from '@testing-library/dom'
import { describe, it, expect, vi } from 'vitest'

import { SidebarNav } from './sidebarNav'

let pathname = '/garage'

vi.mock('next/navigation', () => ({
    usePathname: () => pathname,
}))

const renderAt = (path: string) => {
    pathname = path
    return render(<SidebarNav />)
}

describe('SidebarNav', () => {
    it('lists every destination in the design', () => {
        renderAt('/garage')

        for (const label of ['Garage', 'Build', 'Budget', 'Tools', 'Settings']) {
            expect(screen.getByText(label)).toBeInTheDocument()
        }
    })

    it('marks the current screen for assistive tech, not just with colour', () => {
        renderAt('/garage')

        expect(screen.getByRole('link', { name: /Garage/ })).toHaveAttribute('aria-current', 'page')
    })

    // A nav item that 404s teaches people not to trust the nav. Same call the
    // auth panel makes for Terms and Privacy.
    it('offers only Garage as a link, since nothing else has a route', () => {
        renderAt('/garage')

        expect(screen.getAllByRole('link')).toHaveLength(1)
        expect(screen.getByRole('link', { name: /Garage/ })).toHaveAttribute('href', '/garage')

        for (const label of ['Build', 'Budget', 'Tools', 'Settings']) {
            expect(screen.getByText(label).closest('[aria-disabled]')).toHaveAttribute(
                'aria-disabled',
                'true',
            )
        }
    })
})
