import { render } from '@testing-library/react'
import { screen, waitFor } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'

import { AddCarButton } from '@/components/app/addCarButton'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/app/actions/cars', () => ({ createCar: vi.fn() }))
vi.mock('@/components/auth/sessionProvider', () => ({
  useSession: () => ({ session: { accessToken: 'access-token' }, isLoading: false }),
}))

describe('AddCarButton', () => {
  it('opens the sheet', async () => {
    const user = userEvent.setup()
    render(<AddCarButton label="Add car" />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Add car' }))

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  /*
   * The sheet stays mounted while closed so its slide-out can play, which
   * means its state outlives a close. Reopening must still start empty — the
   * remount key is what guarantees that, and this is the test that fails if
   * someone removes it.
   */
  it('starts empty when reopened, rather than showing the last attempt', async () => {
    const user = userEvent.setup()
    render(<AddCarButton label="Add car" />)

    await user.click(screen.getByRole('button', { name: 'Add car' }))
    await user.type(await screen.findByLabelText(/^MAKE$/i), 'Mitsubishi')
    expect(screen.getByLabelText(/^MAKE$/i)).toHaveValue('Mitsubishi')

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Add car' }))

    expect(await screen.findByLabelText(/^MAKE$/i)).toHaveValue('')
  })

  it('closes on Escape, so the sheet is dismissible from the keyboard', async () => {
    const user = userEvent.setup()
    render(<AddCarButton label="Add car" />)

    await user.click(screen.getByRole('button', { name: 'Add car' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()

    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})
