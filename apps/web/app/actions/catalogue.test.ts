// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { findGenerations, searchMakes, searchModels } from './catalogue'

const MAKE_ID = '11111111-1111-4111-8111-111111111111'
const MODEL_ID = '22222222-2222-4222-8222-222222222222'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('the catalogue actions', () => {
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

  it('searches makes with both tokens and the text encoded', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(json(200, { data: [{ id: MAKE_ID, name: 'Nissan' }] }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await searchMakes('access-token', ' nis & co ')

    expect(result).toEqual({ status: 'success', items: [{ id: MAKE_ID, name: 'Nissan' }] })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.test/v1/catalogue/makes?q=nis%20%26%20co&limit=8')
    expect(init.headers['X-Channel-Token']).toBe('channel-token')
    expect(init.headers.Authorization).toBe('Bearer access-token')
  })

  // The id came from the browser and goes into a path.
  it.each(['../../cars', 'not-a-uuid', `${MAKE_ID}/../../cars`, ''])(
    'refuses a make id that is not a UUID (%s) without calling the API',
    async (makeId) => {
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)

      const result = await searchModels('access-token', makeId, '350')

      expect(result).toEqual({ status: 'success', items: [] })
      expect(fetchMock).not.toHaveBeenCalled()
    }
  )

  it('searches a make’s models', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(json(200, { data: [{ id: MODEL_ID, makeId: MAKE_ID, name: '350Z' }] }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await searchModels('access-token', MAKE_ID, '350')

    expect(result.status).toBe('success')
    expect(fetchMock.mock.calls[0][0]).toBe(
      `https://api.test/v1/catalogue/makes/${MAKE_ID}/models?q=350&limit=8`
    )
  })

  it.each([1884, 2031, 2003.5, Number.NaN])(
    'asks for no generations for a year a car cannot have (%s)',
    async (year) => {
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)

      expect(await findGenerations('access-token', MODEL_ID, year)).toEqual({
        status: 'success',
        items: [],
      })
      expect(fetchMock).not.toHaveBeenCalled()
    }
  )

  it('finds the generations covering a year', async () => {
    const generation = {
      id: 'g1',
      modelId: MODEL_ID,
      code: 'Z33',
      startYear: 2002,
      endYear: 2009,
      bodyStyle: 'coupe',
      image: null,
    }
    const fetchMock = vi.fn().mockResolvedValue(json(200, { data: [generation] }))
    vi.stubGlobal('fetch', fetchMock)

    expect(await findGenerations('access-token', MODEL_ID, 2003)).toEqual({
      status: 'success',
      items: [generation],
    })
    expect(fetchMock.mock.calls[0][0]).toBe(
      `https://api.test/v1/catalogue/models/${MODEL_ID}/generations?year=2003`
    )
  })

  // An image without its credit is not one the sheet may show.
  it('rejects a generation whose image arrives without attribution', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        json(200, {
          data: [
            {
              id: 'g1',
              modelId: MODEL_ID,
              code: null,
              startYear: 2002,
              endYear: null,
              bodyStyle: 'coupe',
              image: {
                url: 'https://images.test/x',
                attribution: '',
                license: 'CC BY 4.0',
                sourceUrl: 'https://s',
              },
            },
          ],
        })
      )
    )

    expect((await findGenerations('access-token', MODEL_ID, 2003)).status).toBe('error')
  })

  it('treats a catalogue entry that has gone as no suggestions', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(404, { status: 404 })))

    expect(await searchModels('access-token', MAKE_ID, '')).toEqual({
      status: 'success',
      items: [],
    })
  })

  it('reports a 401 as unauthenticated', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(401, {})))

    expect(await searchMakes('access-token', 'nis')).toEqual({ status: 'unauthenticated' })
  })

  it('refuses to call the API when it is not configured', async () => {
    delete process.env.CHANNEL_TOKEN
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    expect((await searchMakes('access-token', 'nis')).status).toBe('error')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
