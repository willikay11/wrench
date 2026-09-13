import { render, fireEvent } from '@testing-library/react'
import { screen } from '@testing-library/dom'
import { describe, it, expect } from 'vitest'

import { CarCard } from '@/components/app/carCard'
import type { Car } from '@/app/actions/cars'

/*
The card shows what the API resolved and nothing else: the owner's photo, a
credited representative image, or an outline. These tests hold it to each case
and to the two things it must never do — leave an empty frame, or show an image
that is not this car's without saying so.
*/

const baseCar: Car = {
  id: 'car-1',
  make: 'Nissan',
  model: '350Z',
  year: 2003,
  engine: 'VQ35DE 3.5L V6',
  usageType: 'track',
}

describe('CarCard', () => {
  it("shows the owner's photo, named for the car and unmarked", () => {
    render(
      <CarCard
        car={{
          ...baseCar,
          bodyStyle: 'coupe',
          photo: {
            url: 'https://res.cloudinary.com/demo/image/authenticated/s--x--/car.jpg',
            source: 'upload',
            attribution: null,
          },
        }}
      />
    )

    const image = screen.getByRole('img', { name: '2003 Nissan 350Z' })
    expect(image).toHaveAttribute(
      'src',
      'https://res.cloudinary.com/demo/image/authenticated/s--x--/car.jpg'
    )
    expect(screen.queryByText('Representative')).not.toBeInTheDocument()
    expect(screen.queryByText(/^Photo:/)).not.toBeInTheDocument()
  })

  // Not this car's photo, so it says so, and credits whoever took it.
  it('marks a catalogue image as representative and shows its credit', () => {
    render(
      <CarCard
        car={{
          ...baseCar,
          bodyStyle: 'coupe',
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

  it('draws the body-style outline when there is no photo', () => {
    const { container } = render(<CarCard car={{ ...baseCar, bodyStyle: 'coupe', photo: null }} />)

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(container.querySelector('svg[data-body-style="coupe"]')).toBeInTheDocument()
  })

  it('draws a generic outline for a car with no catalogue link', () => {
    const { container } = render(<CarCard car={baseCar} />)

    expect(container.querySelector('svg[data-body-style="generic"]')).toBeInTheDocument()
  })

  // A broken image is an empty frame by another name.
  it('falls back to the outline when the photo fails to load', () => {
    const { container } = render(
      <CarCard
        car={{
          ...baseCar,
          bodyStyle: 'hatchback',
          photo: {
            url: 'https://res.cloudinary.com/demo/image/authenticated/s--x--/gone.jpg',
            source: 'upload',
            attribution: null,
          },
        }}
      />
    )

    fireEvent.error(screen.getByRole('img', { name: '2003 Nissan 350Z' }))

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(container.querySelector('svg[data-body-style="hatchback"]')).toBeInTheDocument()
  })

  // The outline sits in the same reserved box, so nothing moves when a photo
  // loads, fails, or was never there.
  it('reserves the image area at a fixed ratio whatever it shows', () => {
    const withPhoto = render(
      <CarCard
        car={{
          ...baseCar,
          photo: {
            url: 'https://res.cloudinary.com/demo/x.jpg',
            source: 'upload',
            attribution: null,
          },
        }}
      />
    )
    const frameWithPhoto = withPhoto.container.querySelector('article > div')
    withPhoto.unmount()

    const withoutPhoto = render(<CarCard car={baseCar} />)
    const frameWithout = withoutPhoto.container.querySelector('article > div')

    expect(frameWithPhoto?.className).toContain('aspect-[16/10]')
    expect(frameWithout?.className).toBe(frameWithPhoto?.className)
  })

  it('still invents no mod count or status', () => {
    render(<CarCard car={baseCar} />)

    expect(screen.queryByText(/\bmods?\b/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/service due|up to date|stage \d/i)).not.toBeInTheDocument()
  })

  it('names the car for assistive tech moving by article', () => {
    render(<CarCard car={baseCar} />)

    expect(screen.getByRole('article', { name: '2003 Nissan 350Z' })).toBeInTheDocument()
  })
})
