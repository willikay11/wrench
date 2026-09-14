import { describe, it, expect } from 'vitest'

import { carSchema } from './car'

/*
The form's copy of the API's rules. It must accept everything the API accepts
— otherwise a real car is refused before a request is even made — and refuse
what the API refuses, so the two layers never disagree about a value.
*/

const valid = {
  make: 'Mitsubishi',
  model: 'Evolution 10',
  year: 2018,
  engine: '4B11T',
  usageType: 'weekend',
}

describe('carSchema', () => {
  it.each([
    ['an MG', { make: 'MG' }],
    ['a BMW M3', { model: 'M3' }],
    ['a Nissan Z', { model: 'Z' }],
    ['a Toyota 86', { model: '86' }],
    ['a V8', { engine: 'V8' }],
    ['a two-letter note', { notes: 'ok' }],
  ])('accepts %s', (_, override) => {
    expect(carSchema.safeParse({ ...valid, ...override }).success).toBe(true)
  })

  it.each(['make', 'model', 'engine'])('refuses a %s that is only whitespace', (field) => {
    const result = carSchema.safeParse({ ...valid, [field]: '   ' })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]).toMatchObject({
      path: [field],
      message: 'This field is required',
    })
  })

  it('trims values before sending them', () => {
    const result = carSchema.parse({ ...valid, make: '  Mitsubishi ', model: ' Evo ' })

    expect(result.make).toBe('Mitsubishi')
    expect(result.model).toBe('Evo')
  })

  it('sends whitespace-only notes as no notes', () => {
    expect(carSchema.parse({ ...valid, notes: '   ' }).notes).toBeUndefined()
  })

  it('keeps the maximums', () => {
    expect(carSchema.safeParse({ ...valid, make: 'x'.repeat(51) }).success).toBe(false)
    expect(carSchema.safeParse({ ...valid, engine: 'x'.repeat(101) }).success).toBe(false)
    expect(carSchema.safeParse({ ...valid, notes: 'x'.repeat(1001) }).success).toBe(false)
  })
})
