import { render } from '@testing-library/react'
import { screen, waitFor, within } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { Toaster } from '@/components/ui/sonner'
import { AddCarSheet } from '@/components/app/addCarSheet'

const createCar = vi.fn()
const uploadCarPhoto = vi.fn()
vi.mock('@/app/actions/cars', () => ({
  createCar: (...args: unknown[]) => createCar(...args),
  uploadCarPhoto: (...args: unknown[]) => uploadCarPhoto(...args),
}))

const searchMakes = vi.fn()
const searchModels = vi.fn()
const findGenerations = vi.fn()
vi.mock('@/app/actions/catalogue', () => ({
  searchMakes: (...args: unknown[]) => searchMakes(...args),
  searchModels: (...args: unknown[]) => searchModels(...args),
  findGenerations: (...args: unknown[]) => findGenerations(...args),
}))

vi.mock('@/components/auth/sessionProvider', () => ({
  useSession: () => ({
    session: { accessToken: 'access-token' },
    isLoading: false,
    refresh: vi.fn(),
  }),
}))

const NISSAN = { id: '1a2b3c4d-0000-4000-8000-000000000001', name: 'Nissan' }
const Z350 = { id: '1a2b3c4d-0000-4000-8000-000000000002', makeId: NISSAN.id, name: '350Z' }
const Z33 = {
  id: '1a2b3c4d-0000-4000-8000-000000000033',
  modelId: Z350.id,
  code: 'Z33',
  startYear: 2002,
  endYear: 2009,
  bodyStyle: 'coupe',
  image: null,
}

const found = <T,>(items: T[]) => ({ status: 'success', items })

const openSheet = () => {
  const onOpenChange = vi.fn()
  const onCreated = vi.fn()
  render(
    <>
      <Toaster />
      <AddCarSheet open onOpenChange={onOpenChange} onCreated={onCreated} />
    </>
  )
  return { onOpenChange, onCreated }
}

const fillValidCar = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(screen.getByLabelText(/^YEAR$/i), '2018')
  await user.type(screen.getByLabelText(/^MAKE$/i), 'Mitsubishi')
  await user.type(screen.getByLabelText(/^MODEL$/i), 'Evolution 10')
  await user.type(screen.getByLabelText(/^ENGINE$/i), '4B11T')
  await user.click(screen.getByRole('radio', { name: 'Weekend Driver' }))
}

// A Nissan 350Z from 2005: a make, a model and a year the catalogue knows.
const fillCatalogueCar = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(screen.getByLabelText(/^YEAR$/i), '2005')
  await user.type(screen.getByLabelText(/^MAKE$/i), 'Nissan')
  await waitFor(() => expect(searchMakes).toHaveBeenCalled())
  await user.type(screen.getByLabelText(/^MODEL$/i), '350Z')
  await user.type(screen.getByLabelText(/^ENGINE$/i), 'VQ35DE')
  await user.click(screen.getByRole('radio', { name: 'Track Build' }))
}

const createdCar = (overrides: Record<string, unknown> = {}) => ({
  status: 'success',
  car: { id: 'car-1', make: 'Nissan', model: '350Z', year: 2005, ...overrides },
})

const pngFile = () =>
  new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'car.png', { type: 'image/png' })

describe('AddCarSheet', () => {
  beforeEach(() => {
    for (const mock of [createCar, uploadCarPhoto, searchMakes, searchModels, findGenerations])
      mock.mockReset()
    searchMakes.mockResolvedValue(found([]))
    searchModels.mockResolvedValue(found([]))
    findGenerations.mockResolvedValue(found([]))
  })

  it('sends what was typed and closes on success', async () => {
    const user = userEvent.setup()
    createCar.mockResolvedValue(
      createdCar({ make: 'Mitsubishi', model: 'Evolution 10', year: 2018 })
    )

    const { onOpenChange } = openSheet()
    await fillValidCar(user)
    await user.click(screen.getByRole('button', { name: /^Add car$/i }))

    await waitFor(() => expect(createCar).toHaveBeenCalledTimes(1))
    const [token, payload] = createCar.mock.calls[0]
    expect(token).toBe('access-token')
    expect(payload).toMatchObject({ year: 2018, make: 'Mitsubishi', usageType: 'weekend' })
    // Nothing matched, so nothing is linked, and optional notes are omitted.
    expect(payload.generationId).toBeUndefined()
    expect(payload.notes).toBeUndefined()

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it("shows the API's per-field messages on the fields they name", async () => {
    const user = userEvent.setup()
    createCar.mockResolvedValue({
      status: 'invalid',
      fieldErrors: { engine: 'This field is required' },
    })

    openSheet()
    await fillValidCar(user)
    await user.click(screen.getByRole('button', { name: /^Add car$/i }))

    expect(await screen.findByText('This field is required')).toBeInTheDocument()
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
      () => new Promise((resolve) => setTimeout(() => resolve(createdCar()), 50))
    )

    openSheet()
    await fillValidCar(user)
    await user.dblClick(screen.getByRole('button', { name: /^Add car$/i }))

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
})

describe('AddCarSheet with the catalogue', () => {
  beforeEach(() => {
    for (const mock of [createCar, uploadCarPhoto, searchMakes, searchModels, findGenerations])
      mock.mockReset()
    searchMakes.mockResolvedValue(found([NISSAN]))
    searchModels.mockResolvedValue(found([Z350]))
    findGenerations.mockResolvedValue(found([Z33]))
    createCar.mockResolvedValue(createdCar())
  })

  it('links the car to the one generation its make, model and year name', async () => {
    const user = userEvent.setup()

    openSheet()
    await fillCatalogueCar(user)
    await screen.findByText(/Representative outline/i)
    await user.click(screen.getByRole('button', { name: /^Add car$/i }))

    await waitFor(() => expect(createCar).toHaveBeenCalledTimes(1))
    expect(createCar.mock.calls[0][1].generationId).toBe(Z33.id)
    expect(findGenerations).toHaveBeenLastCalledWith('access-token', Z350.id, 2005)
  })

  // The outline stands in without pretending to be the car.
  it('shows the body-style outline for a generation with no image', async () => {
    const user = userEvent.setup()

    openSheet()
    await fillCatalogueCar(user)

    const caption = await screen.findByText(/Representative outline · Z33 · coupe · 2002–2009/i)
    const figure = caption.closest('figure') as HTMLElement
    expect(figure.querySelector('svg[data-body-style="coupe"]')).toBeInTheDocument()
    expect(within(figure).queryByRole('img')).not.toBeInTheDocument()
  })

  // Never an image without its credit (ADR-010).
  it('shows a representative image with its attribution and licence', async () => {
    const user = userEvent.setup()
    findGenerations.mockResolvedValue(
      found([
        {
          ...Z33,
          image: {
            url: 'https://images.test/z33',
            attribution: 'Photo by Someone',
            license: 'CC BY-SA 4.0',
            sourceUrl: 'https://s',
          },
        },
      ])
    )

    openSheet()
    await fillCatalogueCar(user)

    const image = await screen.findByRole('img', { name: /Representative image/i })
    expect(image).toHaveAttribute('src', 'https://images.test/z33')
    expect(screen.getByText(/Photo by Someone/)).toBeInTheDocument()
    expect(screen.getByText(/CC BY-SA 4.0/)).toBeInTheDocument()
  })

  // A generation removed between the lookup and the save comes back on
  // generationId, which has no input to show a message beside.
  it('reports a refused catalogue link instead of silently not saving', async () => {
    const user = userEvent.setup()
    createCar.mockResolvedValue({
      status: 'invalid',
      fieldErrors: { generationId: 'This generation does not exist in the catalogue' },
    })

    openSheet()
    await fillCatalogueCar(user)
    await screen.findByText(/Representative outline/i)
    await user.click(screen.getByRole('button', { name: /^Add car$/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /catalogue match for this car is no longer valid/i
    )
  })

  it('links nothing when no generation covers the year', async () => {
    const user = userEvent.setup()
    findGenerations.mockResolvedValue(found([]))

    openSheet()
    await fillCatalogueCar(user)
    await waitFor(() => expect(findGenerations).toHaveBeenCalled())
    await user.click(screen.getByRole('button', { name: /^Add car$/i }))

    await waitFor(() => expect(createCar).toHaveBeenCalledTimes(1))
    expect(createCar.mock.calls[0][1].generationId).toBeUndefined()
    expect(screen.queryByText(/Representative/i)).not.toBeInTheDocument()
  })

  it('saves a make the catalogue does not know as free text', async () => {
    const user = userEvent.setup()
    searchMakes.mockResolvedValue(found([]))

    openSheet()
    await user.type(screen.getByLabelText(/^YEAR$/i), '1998')
    await user.type(screen.getByLabelText(/^MAKE$/i), 'Caterham')
    await waitFor(() => expect(searchMakes).toHaveBeenCalled())
    await user.type(screen.getByLabelText(/^MODEL$/i), 'Seven')
    await user.type(screen.getByLabelText(/^ENGINE$/i), 'K-series')
    await user.click(screen.getByRole('radio', { name: 'Track Build' }))
    await user.click(screen.getByRole('button', { name: /^Add car$/i }))

    await waitFor(() => expect(createCar).toHaveBeenCalledTimes(1))
    expect(createCar.mock.calls[0][1]).toMatchObject({ make: 'Caterham', model: 'Seven' })
    expect(createCar.mock.calls[0][1].generationId).toBeUndefined()
    // No catalogue make, so there are no catalogue models to ask about.
    expect(searchModels).not.toHaveBeenCalled()
  })

  // A hatch and a sedan sold in the same years: ask, do not guess.
  it('asks which generation when two cover the year, and links the one chosen', async () => {
    const user = userEvent.setup()
    const hatch = {
      ...Z33,
      id: '1a2b3c4d-0000-4000-8000-0000000000a1',
      code: 'GR',
      bodyStyle: 'hatchback',
      startYear: 2008,
      endYear: 2014,
    }
    const sedan = {
      ...Z33,
      id: '1a2b3c4d-0000-4000-8000-0000000000a2',
      code: 'GV',
      bodyStyle: 'sedan',
      startYear: 2011,
      endYear: 2014,
    }
    findGenerations.mockResolvedValue(found([hatch, sedan]))

    openSheet()
    await fillCatalogueCar(user)

    expect(await screen.findByText(/Which one is it/i)).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: /GV · sedan/ }))
    await user.click(screen.getByRole('button', { name: /^Add car$/i }))

    await waitFor(() => expect(createCar).toHaveBeenCalledTimes(1))
    expect(createCar.mock.calls[0][1].generationId).toBe('1a2b3c4d-0000-4000-8000-0000000000a2')
  })
})

describe('AddCarSheet photo upload', () => {
  beforeEach(() => {
    for (const mock of [createCar, uploadCarPhoto, searchMakes, searchModels, findGenerations])
      mock.mockReset()
    searchMakes.mockResolvedValue(found([]))
    searchModels.mockResolvedValue(found([]))
    findGenerations.mockResolvedValue(found([]))
    createCar.mockResolvedValue(
      createdCar({ make: 'Mitsubishi', model: 'Evolution 10', year: 2018 })
    )
  })

  it('refuses a file it cannot use before sending anything', async () => {
    const user = userEvent.setup({ applyAccept: false })

    openSheet()
    await user.upload(
      screen.getByLabelText(/Upload your own photo/i),
      new File(['%PDF-1.4'], 'car.pdf', { type: 'application/pdf' })
    )

    expect(await screen.findByText('Choose a JPEG, PNG, WebP or HEIC photo.')).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /Your photo/i })).not.toBeInTheDocument()
  })

  it('previews a chosen photo, and it can be removed before submitting', async () => {
    const user = userEvent.setup()

    openSheet()
    await user.upload(screen.getByLabelText(/Upload your own photo/i), pngFile())

    const preview = await screen.findByRole('img', { name: 'Your photo of this car' })
    expect(preview).toHaveAttribute('src', 'blob:preview')

    await user.click(screen.getByRole('button', { name: 'Remove' }))
    expect(screen.queryByRole('img', { name: 'Your photo of this car' })).not.toBeInTheDocument()
  })

  it('creates the car first, then uploads the photo to it', async () => {
    const user = userEvent.setup()
    const photo = pngFile()
    uploadCarPhoto.mockResolvedValue({
      status: 'success',
      photo: { url: 'https://signed.test/x', source: 'upload', attribution: null },
    })

    const { onCreated } = openSheet()
    await fillValidCar(user)
    await user.upload(screen.getByLabelText(/Upload your own photo/i), photo)
    await user.click(screen.getByRole('button', { name: /^Add car$/i }))

    await waitFor(() => expect(uploadCarPhoto).toHaveBeenCalledTimes(1))
    expect(createCar.mock.invocationCallOrder[0]).toBeLessThan(
      uploadCarPhoto.mock.invocationCallOrder[0]
    )

    const [token, carId, form] = uploadCarPhoto.mock.calls[0]
    expect(token).toBe('access-token')
    expect(carId).toBe('car-1')
    expect((form as FormData).get('file')).toBe(photo)

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
    expect(onCreated.mock.calls[0][0].photo).toEqual({
      url: 'https://signed.test/x',
      source: 'upload',
      attribution: null,
    })
  })

  // The car exists by the time the photo fails. Keeping the sheet open to retry
  // would invite a second car.
  it('keeps the car when its photo fails, and never makes a second one', async () => {
    const user = userEvent.setup()
    uploadCarPhoto.mockResolvedValue({
      status: 'error',
      message: 'Photo uploads are unavailable right now.',
    })

    const { onCreated, onOpenChange } = openSheet()
    await fillValidCar(user)
    await user.upload(screen.getByLabelText(/Upload your own photo/i), pngFile())
    await user.click(screen.getByRole('button', { name: /^Add car$/i }))

    expect(await screen.findByText(/its photo was not/i)).toBeInTheDocument()
    expect(createCar).toHaveBeenCalledTimes(1)
    expect(onCreated).toHaveBeenCalledTimes(1)
    expect(onCreated.mock.calls[0][0].photo).toBeUndefined()
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it('does not upload anything when the car could not be created', async () => {
    const user = userEvent.setup()
    createCar.mockResolvedValue({ status: 'error', message: 'Something went wrong.' })

    openSheet()
    await fillValidCar(user)
    await user.upload(screen.getByLabelText(/Upload your own photo/i), pngFile())
    await user.click(screen.getByRole('button', { name: /^Add car$/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/Something went wrong/i)
    expect(uploadCarPhoto).not.toHaveBeenCalled()
  })
})

/*
 * The slide-in depends on Base UI seeing a closed-to-open change: it marks the
 * popup with data-starting-style only then. A sheet whose first render is
 * already open renders in its final position and appears with no animation.
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

    // Documents the failure mode: if this ever starts passing, Base UI has
    // changed and the reason for onClosed has gone.
    expect(screen.getByRole('dialog')).not.toHaveAttribute('data-starting-style')
  })
})
