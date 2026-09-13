import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

import { BODY_STYLES, CarSilhouette } from '@/components/app/carSilhouette'

describe('CarSilhouette', () => {
  // The same list the API's CHECK constraint allows, so no car the catalogue
  // can link to falls through to the generic outline.
  it('draws every body style the catalogue allows', () => {
    expect([...BODY_STYLES].sort()).toEqual(
      ['convertible', 'coupe', 'hatchback', 'pickup', 'sedan', 'suv', 'van', 'wagon'].sort()
    )
  })

  it('gives each body style its own outline', () => {
    const outlines = BODY_STYLES.map((style) => {
      const { container } = render(<CarSilhouette bodyStyle={style} />)
      return container.querySelector('path')?.getAttribute('d')
    })

    expect(new Set(outlines).size).toBe(BODY_STYLES.length)
  })

  it.each([null, undefined, 'spaceship'])('falls back to a generic outline for %s', (bodyStyle) => {
    const { container } = render(<CarSilhouette bodyStyle={bodyStyle} />)

    expect(container.querySelector('svg')).toHaveAttribute('data-body-style', 'generic')
  })

  // It stands in for a car; whatever shows it names the car in text.
  it('is hidden from assistive tech', () => {
    const { container } = render(<CarSilhouette bodyStyle="coupe" />)

    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })
})
