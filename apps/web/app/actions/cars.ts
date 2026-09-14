'use server'

import { carSchema } from '@/lib/validation/car'
import { MAX_PHOTO_BYTES } from '@/lib/validation/photo'

/**
 * The garage's two API calls.
 *
 * Both run on the server for the same reason the waitlist action does: /v1 sits
 * behind Kong's key-auth and CHANNEL_TOKEN must never reach the browser.
 * Fetching from a client component would need NEXT_PUBLIC_CHANNEL_TOKEN, which
 * puts the gateway credential in the JS bundle.
 *
 * The access token is the other half, and it travels the other way: per ADR-005
 * it lives only in the client's memory, so the caller passes it in rather than
 * these functions re-deriving one. Minting a fresh one per request would rotate
 * the refresh token family on every car added and every page load.
 */

/** A car as the API returns it, narrowed to what the garage renders. */
/** The image a car is shown with, resolved by the API (ADR-010). */
export type CarPhoto = {
  url: string
  source: 'upload' | 'catalogue'
  /** Required credit for a catalogue image; null for the owner's own upload. */
  attribution: string | null
}

export type Car = {
  id: string
  make: string
  model: string
  year: number
  engine: string
  usageType: string
  generationId?: string | null
  bodyStyle?: string | null
  photo?: CarPhoto | null
}

/** One page of the garage, from GET /v1/cars. */
export type CarPage = {
  cars: Car[]
  nextCursor: string | null
  hasMore: boolean
  total: number
}

export type ListCarsResult =
  | { status: 'success'; page: CarPage }
  /** The token was refused. The caller refreshes and retries once. */
  | { status: 'unauthenticated' }
  | { status: 'error'; message: string }

export type CreateCarResult =
  | { status: 'success'; car: Car }
  /** Per-field messages, keyed by the field name the form uses. */
  | { status: 'invalid'; fieldErrors: Record<string, string>; message?: string }
  | { status: 'unauthenticated' }
  | { status: 'error'; message: string }

const REQUEST_TIMEOUT_MS = 10_000

const GENERIC_FAILURE = 'Something went wrong. Please try again.'

/** RFC 7807's invalid-params, which the API fills with one entry per field. */
type InvalidParam = { name: string; reason: string }

const isInvalidParam = (value: unknown): value is InvalidParam => {
  if (typeof value !== 'object' || value === null) return false

  const { name, reason } = value as Record<string, unknown>

  return typeof name === 'string' && typeof reason === 'string'
}

/**
 * Reads a problem body's per-field reasons. The API names fields exactly as the
 * client sent them — "usageType", not "UsageType" — so each entry maps straight
 * onto its input without translation.
 */
const fieldErrorsFrom = (payload: unknown): Record<string, string> => {
  if (typeof payload !== 'object' || payload === null) return {}

  const params = (payload as Record<string, unknown>)['invalid-params']

  if (!Array.isArray(params)) return {}

  const errors: Record<string, string> = {}
  for (const param of params) {
    if (isInvalidParam(param) && !(param.name in errors)) {
      errors[param.name] = param.reason
    }
  }

  return errors
}

const isCar = (value: unknown): value is Car => {
  if (typeof value !== 'object' || value === null) return false

  const { id, make, model, year } = value as Record<string, unknown>

  return (
    typeof id === 'string' &&
    id.length > 0 &&
    typeof make === 'string' &&
    typeof model === 'string' &&
    typeof year === 'number'
  )
}

/**
 * Parses a page. The API is a separate service, so its answer is checked rather
 * than trusted: a malformed body should surface as a failed load, not as an
 * undefined make halfway along the row.
 */
const carPageFrom = (payload: unknown): CarPage | null => {
  if (typeof payload !== 'object' || payload === null) return null

  const { data, pagination } = payload as Record<string, unknown>

  if (!Array.isArray(data)) return null
  // One bad row invalidates the page rather than being dropped: silently
  // showing four of five cars is worse than saying the load failed.
  if (!data.every(isCar)) return null

  const details =
    typeof pagination === 'object' && pagination !== null
      ? (pagination as Record<string, unknown>)
      : {}

  return {
    cars: data,
    nextCursor: typeof details.nextCursor === 'string' ? details.nextCursor : null,
    hasMore: details.hasMore === true,
    total: typeof details.total === 'number' ? details.total : data.length,
  }
}

export async function listCars(
  accessToken: string,
  cursor?: string | null
): Promise<ListCarsResult> {
  if (!accessToken) return { status: 'unauthenticated' }

  const baseUrl = process.env.API_BASE_URL
  const channelToken = process.env.CHANNEL_TOKEN

  if (!baseUrl || !channelToken) {
    console.error('cars: API_BASE_URL or CHANNEL_TOKEN is not configured')
    return { status: 'error', message: GENERIC_FAILURE }
  }

  // The cursor is opaque and goes back as it came. Encoded rather than
  // trusted to be URL-safe: it is a value that arrived over the wire.
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''

  let response: Response

  try {
    response = await fetch(`${baseUrl}/v1/cars${query}`, {
      headers: {
        'X-Channel-Token': channelToken,
        Authorization: `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: 'no-store',
    })
  } catch (cause) {
    console.error('cars: list request failed', {
      reason: cause instanceof Error ? cause.name : 'unknown',
    })
    return { status: 'error', message: GENERIC_FAILURE }
  }

  if (response.status === 401) return { status: 'unauthenticated' }

  if (!response.ok) {
    console.error('cars: upstream rejected the list request', { status: response.status })
    return { status: 'error', message: GENERIC_FAILURE }
  }

  const page = carPageFrom(await response.json().catch(() => null))

  if (!page) {
    console.error('cars: list response could not be parsed')
    return { status: 'error', message: GENERIC_FAILURE }
  }

  return { status: 'success', page }
}

export async function createCar(accessToken: string, input: unknown): Promise<CreateCarResult> {
  if (!accessToken) return { status: 'unauthenticated' }

  // Re-validated server-side even though the form already did: a server
  // action is a public endpoint, reachable without going through our form.
  const parsed = carSchema.safeParse(input)

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const field = issue.path[0]
      if (typeof field === 'string' && !(field in fieldErrors)) {
        fieldErrors[field] = issue.message
      }
    }
    return { status: 'invalid', fieldErrors }
  }

  const baseUrl = process.env.API_BASE_URL
  const channelToken = process.env.CHANNEL_TOKEN

  if (!baseUrl || !channelToken) {
    console.error('cars: API_BASE_URL or CHANNEL_TOKEN is not configured')
    return { status: 'error', message: GENERIC_FAILURE }
  }

  let response: Response

  try {
    response = await fetch(`${baseUrl}/v1/cars`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Channel-Token': channelToken,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(parsed.data),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: 'no-store',
    })
  } catch (cause) {
    // The shape only: the body carries the user's own car details and the
    // header carries a bearer token. Neither belongs in a log line.
    console.error('cars: create request failed', {
      reason: cause instanceof Error ? cause.name : 'unknown',
    })
    return { status: 'error', message: GENERIC_FAILURE }
  }

  if (response.status === 201) {
    const payload: unknown = await response.json().catch(() => null)

    if (!isCar(payload)) {
      // The car was created; we just cannot describe it. Saying "failed"
      // would invite a duplicate, so this is a soft failure and the
      // caller re-reads the list.
      console.error('cars: created car could not be parsed')
      return {
        status: 'error',
        message: 'Your car was added, but we could not show it yet.',
      }
    }

    return { status: 'success', car: payload }
  }

  if (response.status === 401) return { status: 'unauthenticated' }

  if (response.status === 422) {
    const fieldErrors = fieldErrorsFrom(await response.json().catch(() => null))

    return Object.keys(fieldErrors).length > 0
      ? { status: 'invalid', fieldErrors }
      : {
          status: 'invalid',
          fieldErrors: {},
          message: 'Please check the details and try again.',
        }
  }

  console.error('cars: upstream rejected the request', { status: response.status })
  return { status: 'error', message: GENERIC_FAILURE }
}

export type UploadPhotoResult =
  | { status: 'success'; photo: CarPhoto }
  /** Something about the file itself, which the user can fix by choosing another. */
  | { status: 'invalid'; message: string }
  | { status: 'unauthenticated' }
  | { status: 'error'; message: string }

// A photo is uploaded after its car exists, so it has a real id to go under
// (ADR-007, amended). The id reaches the path from the browser, so it is
// checked to be one.
const CAR_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Longer than the list and create calls: this one carries up to 10MB.
const UPLOAD_TIMEOUT_MS = 30_000

const isCarPhoto = (value: unknown): value is CarPhoto => {
  if (typeof value !== 'object' || value === null) return false

  const { url, source, attribution } = value as Record<string, unknown>

  return (
    typeof url === 'string' &&
    url.length > 0 &&
    (source === 'upload' || source === 'catalogue') &&
    (attribution === null || typeof attribution === 'string')
  )
}

/**
 * Sets a car's photo.
 *
 * The file's type is not judged here: the API decides by its content (FR-37),
 * and a check on the name or declared type would only disagree with it. What
 * is checked is what can be known without reading the file — that there is one,
 * and that it is not so large the request is pointless to send.
 */
export async function uploadCarPhoto(
  accessToken: string,
  carId: string,
  formData: FormData
): Promise<UploadPhotoResult> {
  if (!accessToken) return { status: 'unauthenticated' }

  if (!CAR_ID_PATTERN.test(carId)) {
    return { status: 'error', message: GENERIC_FAILURE }
  }

  const file = formData.get('file')

  if (!(file instanceof File) || file.size === 0) {
    return { status: 'invalid', message: 'Choose a photo to upload.' }
  }

  if (file.size > MAX_PHOTO_BYTES) {
    return { status: 'invalid', message: 'This photo is larger than 10MB.' }
  }

  const baseUrl = process.env.API_BASE_URL
  const channelToken = process.env.CHANNEL_TOKEN

  if (!baseUrl || !channelToken) {
    console.error('cars: API_BASE_URL or CHANNEL_TOKEN is not configured')
    return { status: 'error', message: GENERIC_FAILURE }
  }

  const body = new FormData()
  body.append('file', file, file.name)

  let response: Response

  try {
    response = await fetch(`${baseUrl}/v1/cars/${carId}/photo`, {
      method: 'POST',
      // No Content-Type: fetch sets multipart/form-data with the boundary it
      // chose, and a hand-written one would not match the body.
      headers: {
        'X-Channel-Token': channelToken,
        Authorization: `Bearer ${accessToken}`,
      },
      body,
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
      cache: 'no-store',
    })
  } catch (cause) {
    console.error('cars: photo upload failed', {
      reason: cause instanceof Error ? cause.name : 'unknown',
    })
    return { status: 'error', message: GENERIC_FAILURE }
  }

  if (response.status === 201) {
    const payload: unknown = await response.json().catch(() => null)

    if (!isCarPhoto(payload)) {
      console.error('cars: uploaded photo could not be parsed')
      return { status: 'error', message: 'Your photo was saved, but we could not show it yet.' }
    }

    return { status: 'success', photo: payload }
  }

  if (response.status === 401) return { status: 'unauthenticated' }

  if (response.status === 422) {
    const reasons = fieldErrorsFrom(await response.json().catch(() => null))
    return { status: 'invalid', message: reasons.file ?? 'This file could not be used as a photo.' }
  }

  if (response.status === 503) {
    return {
      status: 'error',
      message: 'Photo uploads are unavailable right now. Please try again later.',
    }
  }

  console.error('cars: upstream rejected the photo', { status: response.status })
  return { status: 'error', message: GENERIC_FAILURE }
}
