import { render } from '@testing-library/react'
import { screen, waitFor } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { Toaster } from '@/components/ui/sonner'
import { GarageCars } from '@/components/app/garageCars'

const listCars = vi.fn()
const createCar = vi.fn()
const uploadCarPhoto = vi.fn()
vi.mock('@/app/actions/cars', () => ({
  listCars: (...args: unknown[]) => listCars(...args),
  createCar: (...args: unknown[]) => createCar(...args),
  uploadCarPhoto: (...args: unknown[]) => uploadCarPhoto(...args),
}))
// The sheet searches the catalogue as fields are typed into; these tests are
// about the row, so every search simply finds nothing.
vi.mock('@/app/actions/catalogue', () => ({
  searchMakes: vi.fn(async () => ({ status: 'success', items: [] })),
  searchModels: vi.fn(async () => ({ status: 'success', items: [] })),
  findGenerations: vi.fn(async () => ({ status: 'success', items: [] })),
}))

const refresh = vi.fn()
let session: { accessToken: string } | null = { accessToken: 'token-1' }
vi.mock('@/components/auth/sessionProvider', () => ({
  useSession: () => ({ session, isLoading: false, refresh }),
}))

const car = (id: string, make = 'Nissan') => ({
  id,
  make,
  model: '350Z',
  year: 2003,
  engine: 'VQ35DE 3.5L V6',
  usageType: 'track',
})

const page = (
  cars: ReturnType<typeof car>[],
  extra: Partial<{ nextCursor: string | null; hasMore: boolean; total: number }> = {}
) => ({
  status: 'success' as const,
  page: { cars, nextCursor: null, hasMore: false, total: cars.length, ...extra },
})

const renderGarage = () =>
  render(
    <>
      <Toaster />
      <GarageCars />
    </>
  )

describe('GarageCars', () => {
  beforeEach(() => {
    listCars.mockReset()
    createCar.mockReset()
    refresh.mockReset()
    session = { accessToken: 'token-1' }
  })

  it('shows the cars the API returned, in the order it returned them', async () => {
    listCars.mockResolvedValue(page([car('1', 'Nissan'), car('2', 'Mazda')]))

    renderGarage()

    expect(await screen.findByRole('article', { name: /2003 Nissan 350Z/i })).toBeInTheDocument()

    const names = screen.getAllByRole('article').map((a) => a.getAttribute('aria-label'))
    expect(names).toEqual(['2003 Nissan 350Z', '2003 Mazda 350Z'])
  })

  it('shows the skeleton first, never the empty state, for a user with cars', async () => {
    let resolve: (value: unknown) => void = () => {}
    listCars.mockReturnValue(new Promise((r) => (resolve = r)))

    renderGarage()

    expect(screen.getByText(/Loading your garage/i)).toBeInTheDocument()
    // The lie the three states exist to prevent.
    expect(screen.queryByText(/garage is empty/i)).not.toBeInTheDocument()

    resolve(page([car('1')]))
    expect(await screen.findByRole('article')).toBeInTheDocument()
  })

  it('shows the empty state only when the API really returned none', async () => {
    listCars.mockResolvedValue(page([]))

    renderGarage()

    expect(
      await screen.findByRole('heading', { name: /Your garage is empty/i })
    ).toBeInTheDocument()
  })

  it('shows a failure, not an empty garage, when the request fails', async () => {
    listCars.mockResolvedValue({ status: 'error', message: 'nope' })

    renderGarage()

    expect(await screen.findByText(/could not load your garage/i)).toBeInTheDocument()
    expect(screen.queryByText(/garage is empty/i)).not.toBeInTheDocument()
  })

  it('retries the request when asked, without a page reload', async () => {
    const user = userEvent.setup()
    listCars.mockResolvedValueOnce({ status: 'error', message: 'nope' })
    listCars.mockResolvedValueOnce(page([car('1')]))

    renderGarage()

    await user.click(await screen.findByRole('button', { name: /Try again/i }))

    expect(await screen.findByRole('article')).toBeInTheDocument()
  })

  /*
   * The access token expires in 15 minutes and a garage tab can be open for
   * hours, so a 401 is expiry rather than refusal.
   */
  it('refreshes the token once and retries on a 401', async () => {
    listCars.mockResolvedValueOnce({ status: 'unauthenticated' })
    refresh.mockResolvedValue('token-2')
    listCars.mockResolvedValueOnce(page([car('1')]))

    renderGarage()

    expect(await screen.findByRole('article')).toBeInTheDocument()
    expect(refresh).toHaveBeenCalledTimes(1)
    // The retry used the new token, not the stale one.
    expect(listCars).toHaveBeenNthCalledWith(2, 'token-2')
  })

  it('gives up after a second 401 rather than looping', async () => {
    listCars.mockResolvedValue({ status: 'unauthenticated' })
    refresh.mockResolvedValue('token-2')

    renderGarage()

    expect(await screen.findByText(/could not load your garage/i)).toBeInTheDocument()
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(listCars).toHaveBeenCalledTimes(2)
  })

  it('follows the cursor for a second page and appends to the row', async () => {
    const user = userEvent.setup()
    listCars.mockResolvedValueOnce(
      page([car('1', 'Nissan')], { nextCursor: 'cursor-2', hasMore: true })
    )
    listCars.mockResolvedValueOnce(page([car('2', 'Mazda')]))

    renderGarage()

    await user.click(await screen.findByRole('button', { name: /Show more cars/i }))

    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2))
    expect(listCars).toHaveBeenNthCalledWith(2, 'token-1', 'cursor-2')
    // Appended, not replaced.
    expect(screen.getByRole('article', { name: /Nissan/i })).toBeInTheDocument()
  })

  it('issues exactly one request for a garage smaller than a page', async () => {
    listCars.mockResolvedValue(page([car('1')]))

    renderGarage()

    await screen.findByRole('article')
    expect(listCars).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: /Show more cars/i })).not.toBeInTheDocument()
  })

  it('puts a newly added car into the row without re-reading the list', async () => {
    const user = userEvent.setup()
    listCars.mockResolvedValue(page([car('1', 'Nissan')]))
    createCar.mockResolvedValue({ status: 'success', car: car('2', 'Subaru') })

    renderGarage()

    await user.click(await screen.findByRole('button', { name: /Add another car/i }))
    await user.type(await screen.findByLabelText(/^YEAR$/i), '2004')
    await user.type(screen.getByLabelText(/^MAKE$/i), 'Subaru')
    await user.type(screen.getByLabelText(/^MODEL$/i), 'Impreza')
    await user.type(screen.getByLabelText(/^ENGINE$/i), 'EJ257')
    await user.click(screen.getByRole('radio', { name: 'Track Build' }))
    await user.click(screen.getByRole('button', { name: /^Add car$/i }))

    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2))
    // The list was read once, at mount. The new car came from the response.
    expect(listCars).toHaveBeenCalledTimes(1)
  })

  it('does not invent a photo, a mod count or a status for a car', async () => {
    listCars.mockResolvedValue(page([car('1')]))

    renderGarage()

    await screen.findByRole('article')

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.queryByText(/\bmods?\b/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/service due|up to date|stage \d/i)).not.toBeInTheDocument()
  })

  it('shows a photo added from a card in place of its placeholder', async () => {
    const user = userEvent.setup()
    listCars.mockResolvedValue(page([car('1')]))
    uploadCarPhoto.mockResolvedValue({
      status: 'success',
      photo: {
        url: 'https://res.cloudinary.com/demo/image/authenticated/s--x--/car.jpg',
        source: 'upload',
        attribution: null,
      },
    })

    renderGarage()

    await user.upload(
      await screen.findByLabelText('Add photo of the 2003 Nissan 350Z'),
      new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'car.png', { type: 'image/png' })
    )

    expect(await screen.findByRole('img', { name: '2003 Nissan 350Z' })).toBeInTheDocument()
    expect(screen.queryByText('No photo yet')).not.toBeInTheDocument()
    // Put in place from the upload's answer, not by reading the list again.
    expect(listCars).toHaveBeenCalledTimes(1)
  })
})
