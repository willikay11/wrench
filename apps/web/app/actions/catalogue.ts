'use server'

/**
 * Catalogue search for the add-car sheet (ADR-010).
 *
 * Server-side for the same reason as the car actions: CHANNEL_TOKEN must never
 * reach the browser. The caller hands in its in-memory access token.
 *
 * Every id that goes into a URL path here arrived from the browser, so each is
 * checked to be a UUID first. Without that, "../../cars" as a make id would
 * steer a request carrying the user's token and the gateway key at some other
 * API route.
 */

export type VehicleMake = { id: string; name: string }

export type VehicleModel = { id: string; makeId: string; name: string }

export type CatalogueImage = {
  url: string
  attribution: string
  license: string
  sourceUrl: string
}

export type VehicleGeneration = {
  id: string
  modelId: string
  code: string | null
  startYear: number
  endYear: number | null
  bodyStyle: string
  image: CatalogueImage | null
}

export type CatalogueResult<T> =
  { status: 'success'; items: T[] } | { status: 'unauthenticated' } | { status: 'error' }

// Search should be quick. A slow one is abandoned rather than waited on — the
// field still accepts whatever is typed.
const REQUEST_TIMEOUT_MS = 5_000

// What fits in the list without scrolling.
const SEARCH_LIMIT = 8

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isMake = (value: unknown): value is VehicleMake =>
  isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string'

const isModel = (value: unknown): value is VehicleModel =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.makeId === 'string' &&
  typeof value.name === 'string'

const isImage = (value: unknown): value is CatalogueImage =>
  isRecord(value) &&
  typeof value.url === 'string' &&
  // An image without its credit is not one we may show (ADR-010).
  typeof value.attribution === 'string' &&
  value.attribution.length > 0 &&
  typeof value.license === 'string' &&
  value.license.length > 0

const isGeneration = (value: unknown): value is VehicleGeneration =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.startYear === 'number' &&
  (value.endYear === null || typeof value.endYear === 'number') &&
  typeof value.bodyStyle === 'string' &&
  (value.image === null || isImage(value.image))

async function fetchList<T>(
  accessToken: string,
  path: string,
  isItem: (value: unknown) => value is T
): Promise<CatalogueResult<T>> {
  if (!accessToken) return { status: 'unauthenticated' }

  const baseUrl = process.env.API_BASE_URL
  const channelToken = process.env.CHANNEL_TOKEN

  if (!baseUrl || !channelToken) {
    console.error('catalogue: API_BASE_URL or CHANNEL_TOKEN is not configured')
    return { status: 'error' }
  }

  let response: Response

  try {
    response = await fetch(`${baseUrl}${path}`, {
      headers: {
        'X-Channel-Token': channelToken,
        Authorization: `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: 'no-store',
    })
  } catch (cause) {
    console.error('catalogue: request failed', {
      reason: cause instanceof Error ? cause.name : 'unknown',
    })
    return { status: 'error' }
  }

  if (response.status === 401) return { status: 'unauthenticated' }

  // A make or model the catalogue no longer has is simply no suggestions.
  if (response.status === 404) return { status: 'success', items: [] }

  if (!response.ok) {
    console.error('catalogue: upstream rejected the request', { status: response.status })
    return { status: 'error' }
  }

  const payload: unknown = await response.json().catch(() => null)
  const data = isRecord(payload) ? payload.data : undefined

  if (!Array.isArray(data) || !data.every(isItem)) {
    console.error('catalogue: response could not be parsed')
    return { status: 'error' }
  }

  return { status: 'success', items: data }
}

const searchText = (query: string) => encodeURIComponent(query.trim().slice(0, 50))

export async function searchMakes(
  accessToken: string,
  query: string
): Promise<CatalogueResult<VehicleMake>> {
  return fetchList(
    accessToken,
    `/v1/catalogue/makes?q=${searchText(query)}&limit=${SEARCH_LIMIT}`,
    isMake
  )
}

export async function searchModels(
  accessToken: string,
  makeId: string,
  query: string
): Promise<CatalogueResult<VehicleModel>> {
  if (!UUID_PATTERN.test(makeId)) return { status: 'success', items: [] }

  return fetchList(
    accessToken,
    `/v1/catalogue/makes/${makeId}/models?q=${searchText(query)}&limit=${SEARCH_LIMIT}`,
    isModel
  )
}

export async function findGenerations(
  accessToken: string,
  modelId: string,
  year: number
): Promise<CatalogueResult<VehicleGeneration>> {
  if (!UUID_PATTERN.test(modelId) || !Number.isInteger(year) || year < 1885 || year > 2030) {
    return { status: 'success', items: [] }
  }

  return fetchList(
    accessToken,
    `/v1/catalogue/models/${modelId}/generations?year=${year}`,
    isGeneration
  )
}
