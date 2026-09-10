// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { createCar } from './cars'

/*
The action is the only thing that holds the channel token, so it is also the
only place the API's error shapes are read. What matters here: the credential
never leaves it by accident, and a 422 arrives as per-field messages the form
can attach to its inputs rather than a banner.
*/

const validCar = {
  make: 'Mitsubishi',
  model: 'Evolution 10',
  year: 2018,
  engine: '4B11T',
  usageType: 'weekend',
}

const created = { id: 'car-1', ...validCar }

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('createCar', () => {
  beforeEach(() => {
    process.env.API_BASE_URL = 'https://api.test'
    process.env.CHANNEL_TOKEN = 'channel-token'
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    delete process.env.API_BASE_URL
    delete process.env.CHANNEL_TOKEN
    vi.restoreAllMocks()
  })

  it('sends the channel token and the bearer token, and returns the created car', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, created))
    vi.stubGlobal('fetch', fetchMock)

    const result = await createCar('access-token', validCar)

    expect(result).toEqual({ status: 'success', car: created })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.test/v1/cars')
    expect(init.method).toBe('POST')
    expect(init.headers['X-Channel-Token']).toBe('channel-token')
    expect(init.headers.Authorization).toBe('Bearer access-token')
    // The owner is the token's. Nothing in the body may claim it.
    expect(JSON.parse(init.body)).toEqual(validCar)
    expect(JSON.parse(init.body)).not.toHaveProperty('userId')
  })

  // The whole reason this is a server action: a client fetch would need
  // NEXT_PUBLIC_CHANNEL_TOKEN and ship the gateway key in the bundle.
  it('refuses to call the API when it is not configured, without naming what is missing', async () => {
    delete process.env.CHANNEL_TOKEN
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await createCar('access-token', validCar)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.status).toBe('error')
    expect(result).not.toHaveProperty('message', expect.stringContaining('CHANNEL_TOKEN'))
  })

  it('maps a 422 to per-field messages, named as the form names them', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(422, {
          type: '/problems/validation-failed',
          status: 422,
          'invalid-params': [
            { name: 'usageType', reason: 'This field must be one of: daily, track, show' },
            { name: 'year', reason: 'This field must be 1885 or more' },
          ],
        })
      )
    )

    const result = await createCar('access-token', validCar)

    expect(result).toEqual({
      status: 'invalid',
      fieldErrors: {
        usageType: 'This field must be one of: daily, track, show',
        year: 'This field must be 1885 or more',
      },
    })
  })

  it('falls back to a form-level message when a 422 names no field', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(422, { status: 422 })))

    const result = await createCar('access-token', validCar)

    expect(result.status).toBe('invalid')
    if (result.status === 'invalid') {
      expect(result.fieldErrors).toEqual({})
      expect(result.message).toBeTruthy()
    }
  })

  it('reports a 401 as unauthenticated, so the caller can refresh rather than guess', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, { status: 401 })))

    expect(await createCar('access-token', validCar)).toEqual({ status: 'unauthenticated' })
  })

  it('rejects an empty access token without calling the API', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    expect(await createCar('', validCar)).toEqual({ status: 'unauthenticated' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  // A server action is a public endpoint: it is reachable without the form.
  it('validates server-side even when the client did not', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await createCar('access-token', { ...validCar, year: 1700, make: 'X' })

    expect(result.status).toBe('invalid')
    if (result.status === 'invalid') {
      expect(result.fieldErrors.year).toBeTruthy()
      expect(result.fieldErrors.make).toBeTruthy()
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('survives a network failure without logging the car or the token', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('timeout', 'TimeoutError')))

    const result = await createCar('access-token', validCar)

    expect(result.status).toBe('error')

    const logged = JSON.stringify(error.mock.calls)
    expect(logged).not.toContain('access-token')
    expect(logged).not.toContain('channel-token')
    expect(logged).not.toContain('Mitsubishi')
  })

  it('does not claim failure when the car was created but could not be parsed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(201, { unexpected: true })))

    const result = await createCar('access-token', validCar)

    // Saying "failed" would invite a duplicate car.
    expect(result.status).toBe('error')
    if (result.status === 'error') expect(result.message).toMatch(/was added/i)
  })
})
