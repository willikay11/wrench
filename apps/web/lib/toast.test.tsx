import { render } from '@testing-library/react'
import { screen } from '@testing-library/dom'
import { describe, it, expect } from 'vitest'

import { toastSuccess, toastError, toastInfo, toastWarning } from './toast'
import { Toaster } from '@/components/ui/sonner'

describe('toastSuccess', () => {
    // beforeEach(() => vi.useFakeTimers())
    // afterEach(() => vi.useRealTimers())

    it('renders the toast component with title and description', async () => {
        render(<Toaster />)
        toastSuccess({ title: "Deployed", description: "Live in 2 regions." })
        expect(await screen.findByText("Deployed")).toBeInTheDocument()
        expect(await screen.findByText("Live in 2 regions.")).toBeInTheDocument()
    })

    it('renders the toast component with only title', async () => {
        render(<Toaster />)
        toastSuccess({ title: "Deployed" })
        expect(await screen.findByText("Deployed")).toBeInTheDocument()
    })

    it('renders the success toast', async () => {
        render(<Toaster />)
        toastSuccess({ title: "Success" })
        const toastElement = await screen.findByRole('success-toast')
        expect(toastElement).toBeInTheDocument()
        expect(toastElement).toHaveClass('border-l-4 border-l-green-500')
    })

    it('renders the error toast', async () => {
        render(<Toaster />)
        toastError({ title: "Error" })
        const toastElement = await screen.findByRole('error-toast')
        expect(toastElement).toBeInTheDocument()
        expect(toastElement).toHaveClass('border-l-4 border-l-red-500')
    })

    it('renders the info toast', async () => {
        render(<Toaster />)
        toastInfo({ title: "Info" })
        const toastElement = await screen.findByRole('info-toast')
        expect(toastElement).toBeInTheDocument()
        expect(toastElement).toHaveClass('border-l-4 border-l-blue-500')
    })

    it('renders the warning toast', async () => {
        render(<Toaster />)
        toastWarning({ title: "Warning" })
        const toastElement = await screen.findByRole('warning-toast')
        expect(toastElement).toBeInTheDocument()
        expect(toastElement).toHaveClass('border-l-4 border-l-warning')
    })

    // it("dismisses after the duration", async () => {
    //     render(<Toaster />)
    //     toastSuccess({ title: "Deployed", duration: 1000 })

    //     await waitFor(() =>
    //     expect(screen.getByText("Deployed")).toBeInTheDocument()
    //     )

    //     act(() => vi.advanceTimersByTime(900))
    //     expect(screen.getByText("Deployed")).toBeInTheDocument()

    //     act(() => vi.advanceTimersByTime(600))
    //     await waitFor(() =>
    //     expect(screen.queryByText("Deployed")).not.toBeInTheDocument()
    //     )
    // })
})