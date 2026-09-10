import { render } from '@testing-library/react'
import { screen, waitFor } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { Toaster } from '@/components/ui/sonner'
import { AddCarSheet } from '@/components/app/addCarSheet'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

const createCar = vi.fn()
vi.mock('@/app/actions/cars', () => ({ createCar: (...args: unknown[]) => createCar(...args) }))

vi.mock('@/components/auth/sessionProvider', () => ({
  useSession: () => ({ session: { accessToken: 'access-token' }, isLoading: false }),
}))

const openSheet = () => {
  const onOpenChange = vi.fn()
  render(
    <>
      <Toaster />
      <AddCarSheet open onOpenChange={onOpenChange} />
    </>
  )
  return { onOpenChange }
}

const fillValidCar = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(screen.getByLabelText(/^YEAR$/i), '2018')
  await user.type(screen.getByLabelText(/^MAKE$/i), 'Mitsubishi')
  await user.type(screen.getByLabelText(/^MODEL$/i), 'Evolution 10')
  await user.type(screen.getByLabelText(/^ENGINE$/i), '4B11T')
  await user.click(screen.getByRole('radio', { name: 'Weekend Driver' }))
}

describe('AddCarSheet', () => {
  beforeEach(() => {
    createCar.mockReset()
    refresh.mockReset()
  })

  it('sends what was typed and closes on success', async () => {
    const user = userEvent.setup()
    createCar.mockResolvedValue({
      status: 'success',
      car: { id: '1', make: 'Mitsubishi', model: 'Evolution 10', year: 2018 },
    })

    const { onOpenChange } = openSheet()
    await fillValidCar(user)
    await user.click(screen.getByRole('button', { name: /^Add car$/i }))

    await waitFor(() => expect(createCar).toHaveBeenCalledTimes(1))

    const [token, payload] = createCar.mock.calls[0]
    expect(token).toBe('access-token')
    expect(payload).toMatchObject({
      year: 2018,
      make: 'Mitsubishi',
      model: 'Evolution 10',
      engine: '4B11T',
      usageType: 'weekend',
    })
    // Optional and empty: omitted rather than sent as "", which the API's
    // min=3 rule would reject.
    expect(payload.notes).toBeUndefined()

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(refresh).toHaveBeenCalled()
  })

  it("shows the API's per-field messages on the fields they name", async () => {
    const user = userEvent.setup()
    createCar.mockResolvedValue({
      status: 'invalid',
      fieldErrors: { engine: 'This field must be at least 3 characters' },
    })

    openSheet()
    await fillValidCar(user)
    await user.click(screen.getByRole('button', { name: /^Add car$/i }))

    expect(await screen.findByText(/This field must be at least 3 characters/i)).toBeInTheDocument()
  })

  // Losing five filled fields to a failed request is worse than the failure.
  it('keeps everything typed when the request fails', async () => {
    const user = userEvent.setup()
    createCar.mockResolvedValue({ status: 'error', message: 'Something went wrong.' })

    openSheet()
    await fillValidCar(user)
    await user.click(screen.getByRole('button', { name: /^Add car$/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/Something went wrong/i)
    expect(screen.getByLabelText(/^MAKE$/i)).toHaveValue('Mitsubishi')
    expect(screen.getByLabelText(/^MODEL$/i)).toHaveValue('Evolution 10')
    expect(screen.getByLabelText(/^ENGINE$/i)).toHaveValue('4B11T')
    expect(screen.getByRole('radio', { name: 'Weekend Driver' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
  })

  it('validates before spending a request', async () => {
    const user = userEvent.setup()

    openSheet()
    await user.click(screen.getByRole('button', { name: /^Add car$/i }))

    expect(await screen.findByText(/Pick how you use this car/i)).toBeInTheDocument()
    expect(createCar).not.toHaveBeenCalled()
  })

  it('cannot be submitted twice by double-clicking', async () => {
    const user = userEvent.setup()
    createCar.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({ status: 'success', car: { id: '1', make: 'M', model: 'E', year: 2018 } }),
            50
          )
        )
    )

    openSheet()
    await fillValidCar(user)

    const submit = screen.getByRole('button', { name: /^Add car$/i })
    await user.dblClick(submit)

    await waitFor(() => expect(createCar).toHaveBeenCalled())
    expect(createCar).toHaveBeenCalledTimes(1)
  })

  it('counts notes against the same ceiling the API enforces', async () => {
    const user = userEvent.setup()

    openSheet()
    expect(screen.getByText('0 / 1000')).toBeInTheDocument()

    await user.type(screen.getByLabelText(/NOTES/i), 'Stage 2')
    expect(screen.getByText('7 / 1000')).toBeInTheDocument()

    expect(screen.getByLabelText(/NOTES/i)).toHaveAttribute('maxLength', '1000')
  })

  it('tells the user to sign in again when the session has gone', async () => {
    const user = userEvent.setup()
    createCar.mockResolvedValue({ status: 'unauthenticated' })

    openSheet()
    await fillValidCar(user)
    await user.click(screen.getByRole('button', { name: /^Add car$/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/sign in again/i)
  })
})

/*
 * The slide-in depends on Base UI seeing a closed-to-open change: it marks the
 * popup with data-starting-style only then, and that attribute is what the
 * translate-x-full class hangs off. A sheet whose first render is already open
 * has no change to mark, renders in its final position, and appears with no
 * animation — which is what happened when the reset remounted it on open.
 *
 * jsdom cannot show motion, but it can show the attribute the motion needs.
 */
describe('AddCarSheet enter transition', () => {
  it('is marked as starting when it opens, which is what drives the slide-in', () => {
    const { rerender } = render(<AddCarSheet open={false} onOpenChange={vi.fn()} />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    rerender(<AddCarSheet open onOpenChange={vi.fn()} />)

    expect(screen.getByRole('dialog')).toHaveAttribute('data-starting-style')
  })

  it('is not marked as starting when it mounts already open, so it would not slide', () => {
    render(<AddCarSheet open onOpenChange={vi.fn()} />)

    // Documents the failure mode rather than the fix: if this ever starts
    // passing, Base UI has changed and the reason for onClosed has gone.
    expect(screen.getByRole('dialog')).not.toHaveAttribute('data-starting-style')
  })
})
