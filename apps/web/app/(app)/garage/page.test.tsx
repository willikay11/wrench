import { render } from '@testing-library/react'
import { screen } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { describe, it, expect } from 'vitest'

import { Toaster } from '@/components/ui/sonner'
import GaragePage from './page'

// The page is an async server component; awaiting it gives the element tree.
const renderGarage = async () => {
    const ui = await GaragePage()
    return render(
        <>
            <Toaster />
            {ui}
        </>,
    )
}

describe('GaragePage', () => {
    it('names the screen and offers the header action', async () => {
        await renderGarage()

        expect(screen.getByRole('heading', { level: 1, name: 'Your garage' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /Add car/i })).toBeInTheDocument()
    })

    it('shows the empty state, since there are no cars yet', async () => {
        await renderGarage()

        expect(
            screen.getByRole('heading', { level: 2, name: /Your garage is empty/i }),
        ).toBeInTheDocument()
        expect(screen.getByText(/Rex will start learning everything about it/i)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /Add your first car/i })).toBeInTheDocument()
    })

    // There is no add-car flow yet. Saying so beats opening a form that
    // cannot save, and beats a button that appears to do nothing.
    it('says adding a car is not open yet rather than failing silently', async () => {
        const user = userEvent.setup()
        await renderGarage()

        await user.click(screen.getByRole('button', { name: /Add your first car/i }))

        expect(await screen.findByText(/not open yet/i)).toBeInTheDocument()
    })
})
