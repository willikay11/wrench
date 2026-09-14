import { render, fireEvent } from '@testing-library/react'
import { screen, waitFor } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { CarCard } from '@/components/app/carCard'
import type { Car } from '@/app/actions/cars'

const uploadCarPhoto = vi.fn()
vi.mock('@/app/actions/cars', () => ({
  uploadCarPhoto: (...args: unknown[]) => uploadCarPhoto(...args),
}))
vi.mock('@/components/auth/sessionProvider', () => ({
  useSession: () => ({
    session: { accessToken: 'access-token' },
    isLoading: false,
    refresh: vi.fn(),
  }),
}))

/*
The card shows what the API resolved: the owner's photo, a credited
representative image, or the branded placeholder with a way to add a photo. It
must never leave an empty frame, and never picture a car that is not this one
without saying so — which is why the placeholder pictures no car at all.
*/

const baseCar: Car = {
  id: 'car-1',
  make: 'Nissan',
  model: '350Z',
  year: 2003,
  engine: 'VQ35DE 3.5L V6',
  usageType: 'track',
}

const upload = {
  url: 'https://res.cloudinary.com/demo/image/authenticated/s--x--/car.jpg',
  source: 'upload' as const,
  attribution: null,
}

const png = () =>
  new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'car.png', { type: 'image/png' })

describe('CarCard', () => {
  beforeEach(() => uploadCarPhoto.mockReset())

  it("shows the owner's photo, named for the car, with no placeholder or prompt", () => {
    render(<CarCard car={{ ...baseCar, photo: upload }} />)

    expect(screen.getByRole('img', { name: '2003 Nissan 350Z' })).toHaveAttribute('src', upload.url)
    expect(screen.queryByText('Representative')).not.toBeInTheDocument()
    expect(screen.queryByText('No photo yet')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Add photo/i)).not.toBeInTheDocument()
  })

  // Not this car's photo, so it says so, and credits whoever took it.
  it('marks a catalogue image as representative and shows its credit', () => {
    render(
      <CarCard
        car={{
          ...baseCar,
          photo: {
            url: 'https://res.cloudinary.com/demo/image/upload/z33.jpg',
            source: 'catalogue',
            attribution: 'Photo by Someone',
          },
        }}
      />
    )

    expect(
      screen.getByRole('img', { name: 'Representative image of a 2003 Nissan 350Z' })
    ).toBeInTheDocument()
    expect(screen.getByText('Representative')).toBeInTheDocument()
    expect(screen.getByText('Photo: Photo by Someone')).toBeInTheDocument()
  })

  // No picture of any car: nothing here can be mistaken for this one.
  it('shows the branded placeholder when there is no photo, picturing no car', () => {
    const { container } = render(<CarCard car={{ ...baseCar, bodyStyle: 'coupe', photo: null }} />)

    expect(container.querySelector('[data-photo-placeholder]')).toBeInTheDocument()
    expect(screen.getByText('No photo yet')).toBeInTheDocument()
    // The mark is decorative, so there is no image for assistive tech.
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(container.querySelector('img[src="/logo.svg"]')).toHaveAttribute('alt', '')
  })

  // A broken image is an empty frame by another name.
  it('falls back to the placeholder when the photo fails to load', () => {
    render(<CarCard car={{ ...baseCar, photo: upload }} />)

    fireEvent.error(screen.getByRole('img', { name: '2003 Nissan 350Z' }))

    expect(screen.getByText('No photo yet')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('uploads a photo from the placeholder and hands it to the row', async () => {
    const user = userEvent.setup()
    const onPhotoAdded = vi.fn()
    const file = png()
    uploadCarPhoto.mockResolvedValue({ status: 'success', photo: upload })

    render(<CarCard car={baseCar} onPhotoAdded={onPhotoAdded} />)
    await user.upload(screen.getByLabelText('Add photo of the 2003 Nissan 350Z'), file)

    await waitFor(() => expect(onPhotoAdded).toHaveBeenCalledWith('car-1', upload))
    const [token, carId, form] = uploadCarPhoto.mock.calls[0]
    expect(token).toBe('access-token')
    expect(carId).toBe('car-1')
    expect((form as FormData).get('file')).toBe(file)
  })

  it('refuses a file it cannot use without sending anything', async () => {
    const user = userEvent.setup({ applyAccept: false })

    render(<CarCard car={baseCar} />)
    await user.upload(
      screen.getByLabelText('Add photo of the 2003 Nissan 350Z'),
      new File(['%PDF-1.4'], 'car.pdf', { type: 'application/pdf' })
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Choose a JPEG, PNG, WebP or HEIC photo.'
    )
    expect(uploadCarPhoto).not.toHaveBeenCalled()
  })

  it('says why an upload failed, and keeps the prompt to try again', async () => {
    const user = userEvent.setup()
    const onPhotoAdded = vi.fn()
    uploadCarPhoto.mockResolvedValue({
      status: 'error',
      message: 'Photo uploads are unavailable right now.',
    })

    render(<CarCard car={baseCar} onPhotoAdded={onPhotoAdded} />)
    await user.upload(screen.getByLabelText('Add photo of the 2003 Nissan 350Z'), png())

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Photo uploads are unavailable right now.'
    )
    expect(onPhotoAdded).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Add photo of the 2003 Nissan 350Z')).toBeInTheDocument()
  })

  // Nothing moves when a photo loads, fails, or was never there.
  it('reserves the image area at a fixed ratio whatever it shows', () => {
    const withPhoto = render(<CarCard car={{ ...baseCar, photo: upload }} />)
    const frameWithPhoto = withPhoto.container.querySelector('article > div')?.className
    withPhoto.unmount()

    const withoutPhoto = render(<CarCard car={baseCar} />)
    const frameWithout = withoutPhoto.container.querySelector('article > div')?.className

    expect(frameWithPhoto).toContain('aspect-[16/10]')
    expect(frameWithout).toBe(frameWithPhoto)
  })

  it('still invents no mod count or status', () => {
    render(<CarCard car={baseCar} />)

    expect(screen.queryByText(/\bmods?\b/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/service due|up to date|stage \d/i)).not.toBeInTheDocument()
  })
})
