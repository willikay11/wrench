import { describe, it, expect } from 'vitest'

import { MAX_PHOTO_BYTES, photoProblem } from './photo'

const file = (name: string, type: string, size = 1024) => ({ name, type, size })

describe('photoProblem', () => {
  it.each([
    ['a JPEG', file('car.jpg', 'image/jpeg')],
    ['a PNG', file('car.png', 'image/png')],
    ['a WebP', file('car.webp', 'image/webp')],
    ['a HEIC the browser typed', file('IMG_0001.HEIC', 'image/heic')],
    ['a HEIC the browser left untyped', file('IMG_0001.HEIC', '')],
    ['exactly 10MB', file('car.jpg', 'image/jpeg', MAX_PHOTO_BYTES)],
  ])('accepts %s', (_, candidate) => {
    expect(photoProblem(candidate)).toBeNull()
  })

  it('refuses anything over 10MB', () => {
    expect(photoProblem(file('car.jpg', 'image/jpeg', MAX_PHOTO_BYTES + 1))).toBe(
      'This photo is larger than 10MB.'
    )
  })

  it('refuses an empty file', () => {
    expect(photoProblem(file('car.jpg', 'image/jpeg', 0))).toBe('This photo is empty.')
  })

  it.each([
    ['an SVG', file('car.svg', 'image/svg+xml')],
    ['a PDF', file('car.pdf', 'application/pdf')],
    ['a video', file('car.mp4', 'video/mp4')],
    // Only an untyped HEIC gets the benefit of its extension.
    ['an untyped file with a JPEG name', file('car.jpg', '')],
  ])('refuses %s', (_, candidate) => {
    expect(photoProblem(candidate)).toBe('Choose a JPEG, PNG, WebP or HEIC photo.')
  })
})
