import { render } from '@testing-library/react'
import { screen } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'

// The sheet refreshes the garage on success; the router is not mounted here.
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { Toaster } from '@/components/ui/sonner'
import GaragePage from './page'

// The page is an async server component; awaiting it gives the element tree.
const renderGarage = async () => {
  const ui = await GaragePage()
  return render(
    <>
      <Toaster />
      {ui}
    </>
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
      screen.getByRole('heading', { level: 2, name: /Your garage is empty/i })
    ).toBeInTheDocument()
    expect(screen.getByText(/mods, service and budget/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Add your first car/i })).toBeInTheDocument()
  })

  it('opens the add-car sheet from the empty state', async () => {
    const user = userEvent.setup()
    await renderGarage()

    await user.click(screen.getByRole('button', { name: /Add your first car/i }))

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Add a car/i })).toBeInTheDocument()
  })
})
