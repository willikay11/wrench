// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { createCar, listCars, uploadCarPhoto } from './cars'

const validCar = {
  make: 'Mitsubishi',
  model: 'Evolution 10',
  year: 2018,
  engine: '4B11T',
  usageType: 'weekend',
}

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const carRow = {
  id: '1',
  make: 'Nissan',
  model: '350Z',
  year: 2003,
  engine: 'VQ',
  usageType: 'track',
}

describe('the cars actions', () => {
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

  describe('createCar', () => {
    it('sends the channel token and the bearer token', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { id: 'c1', ...validCar }))
      vi.stubGlobal('fetch', fetchMock)

      const result = await createCar('access-token', validCar)

      expect(result.status).toBe('success')

      const [url, init] = fetchMock.mock.calls[0]
      expect(url).toBe('https://api.test/v1/cars')
      expect(init.headers['X-Channel-Token']).toBe('channel-token')
      expect(init.headers.Authorization).toBe('Bearer access-token')
      // The owner is the token's. Nothing in the body may claim it.
      expect(JSON.parse(init.body)).not.toHaveProperty('userId')
    })

    it('maps a 422 to per-field messages, named as the form names them', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          jsonResponse(422, {
            'invalid-params': [
              { name: 'usageType', reason: 'This field must be one of: daily, track' },
            ],
          })
        )
      )

      const result = await createCar('access-token', validCar)

      expect(result).toEqual({
        status: 'invalid',
        fieldErrors: { usageType: 'This field must be one of: daily, track' },
      })
    })

    it('validates server-side even when the client did not', async () => {
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)

      const result = await createCar('access-token', { ...validCar, year: 1700 })

      expect(result.status).toBe('invalid')
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('never logs the car or the credentials on failure', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('t', 'TimeoutError')))

      await createCar('access-token', validCar)

      const logged = JSON.stringify(error.mock.calls)
      expect(logged).not.toContain('access-token')
      expect(logged).not.toContain('channel-token')
      expect(logged).not.toContain('Mitsubishi')
    })
  })

  describe('listCars', () => {
    it('reads a page and passes the cursor back opaquely', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse(200, {
          data: [carRow],
          pagination: { nextCursor: 'a+b/c=', hasMore: true, total: 9 },
        })
      )
      vi.stubGlobal('fetch', fetchMock)

      const result = await listCars('access-token', 'a+b/c=')

      expect(result).toEqual({
        status: 'success',
        page: { cars: [carRow], nextCursor: 'a+b/c=', hasMore: true, total: 9 },
      })
      // Encoded rather than trusted to be URL-safe.
      expect(fetchMock.mock.calls[0][0]).toBe('https://api.test/v1/cars?cursor=a%2Bb%2Fc%3D')
    })

    it('omits the cursor on the first page', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          jsonResponse(200, { data: [], pagination: { hasMore: false, total: 0 } })
        )
      vi.stubGlobal('fetch', fetchMock)

      await listCars('access-token')

      expect(fetchMock.mock.calls[0][0]).toBe('https://api.test/v1/cars')
    })

    it('reports a 401 as unauthenticated, so the caller can refresh', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, {})))

      expect(await listCars('access-token')).toEqual({ status: 'unauthenticated' })
    })

    // Showing four of five cars is worse than saying the load failed.
    it('rejects a page containing a row it cannot read', async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            jsonResponse(200, { data: [carRow, { id: '2' }], pagination: { hasMore: false } })
          )
      )

      expect((await listCars('access-token')).status).toBe('error')
    })

    it('treats a missing data array as a failure, not an empty garage', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { pagination: {} })))

      expect((await listCars('access-token')).status).toBe('error')
    })

    it('defaults paging fields when the API omits them', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { data: [carRow] })))

      const result = await listCars('access-token')

      expect(result).toEqual({
        status: 'success',
        page: { cars: [carRow], nextCursor: null, hasMore: false, total: 1 },
      })
    })

    it('refuses to call the API when it is not configured', async () => {
      delete process.env.CHANNEL_TOKEN
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)

      expect((await listCars('access-token')).status).toBe('error')
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })
})

describe('uploadCarPhoto', () => {
  const CAR_ID = '33333333-3333-4333-8333-333333333333'

  const withFile = (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return form
  }

  const png = () =>
    new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'car.png', { type: 'image/png' })

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

  it('forwards the file as multipart with both tokens, and lets fetch set the boundary', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(201, { url: 'https://signed.test/x', source: 'upload', attribution: null })
      )
    vi.stubGlobal('fetch', fetchMock)

    const result = await uploadCarPhoto('access-token', CAR_ID, withFile(png()))

    expect(result).toEqual({
      status: 'success',
      photo: { url: 'https://signed.test/x', source: 'upload', attribution: null },
    })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`https://api.test/v1/cars/${CAR_ID}/photo`)
    expect(init.method).toBe('POST')
    expect(init.headers['X-Channel-Token']).toBe('channel-token')
    expect(init.headers.Authorization).toBe('Bearer access-token')
    expect(init.headers['Content-Type']).toBeUndefined()
    expect((init.body as FormData).get('file')).toBeInstanceOf(File)
  })

  // The id reaches a URL path, and came from the browser.
  it.each(['../../cars', 'not-a-uuid', ''])(
    'refuses a car id that is not a UUID (%s)',
    async (carId) => {
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)

      expect((await uploadCarPhoto('access-token', carId, withFile(png()))).status).toBe('error')
      expect(fetchMock).not.toHaveBeenCalled()
    }
  )

  it('refuses a missing or empty file without calling the API', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    expect((await uploadCarPhoto('access-token', CAR_ID, new FormData())).status).toBe('invalid')
    expect(
      (await uploadCarPhoto('access-token', CAR_ID, withFile(new File([], 'empty.png')))).status
    ).toBe('invalid')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not send a file over 10MB', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' })

    expect(await uploadCarPhoto('access-token', CAR_ID, withFile(big))).toEqual({
      status: 'invalid',
      message: 'This photo is larger than 10MB.',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("shows the API's reason when it refuses the file", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(422, {
          'invalid-params': [
            { name: 'file', reason: 'This file must be a JPEG, PNG, WebP or HEIC image' },
          ],
        })
      )
    )

    expect(await uploadCarPhoto('access-token', CAR_ID, withFile(png()))).toEqual({
      status: 'invalid',
      message: 'This file must be a JPEG, PNG, WebP or HEIC image',
    })
  })

  it('says uploads are unavailable when the API has no media storage', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(503, {})))

    const result = await uploadCarPhoto('access-token', CAR_ID, withFile(png()))

    expect(result.status).toBe('error')
    if (result.status === 'error') expect(result.message).toMatch(/unavailable/i)
  })

  it('reports a 401 as unauthenticated', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, {})))

    expect(await uploadCarPhoto('access-token', CAR_ID, withFile(png()))).toEqual({
      status: 'unauthenticated',
    })
  })
})
