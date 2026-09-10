'use server'

import { carSchema } from '@/lib/validation/car'

/**
 * Adding a car.
 *
 * This runs on the server for the same reason the waitlist action does: /v1
 * sits behind Kong's key-auth and CHANNEL_TOKEN must never reach the browser.
 * Fetching straight from a client component would need NEXT_PUBLIC_CHANNEL_TOKEN,
 * which puts the gateway credential in the JS bundle.
 *
 * The access token is the other half, and it goes the other way: per ADR-005 it
 * lives only in the client's memory, so the caller passes it in rather than
 * this module re-deriving one. Minting a fresh one per request would rotate the
 * refresh token family on every car added.
 */

/** The car as the API returns it, narrowed to what the garage renders. */
export type CreatedCar = {
  id: string
  make: string
  model: string
  year: number
  engine: string
  usageType: string
}

export type CreateCarResult =
  | { status: 'success'; car: CreatedCar }
  /** Per-field messages, keyed by the field name the form uses. */
  | { status: 'invalid'; fieldErrors: Record<string, string>; message?: string }
  /** The token was refused. The caller refreshes and retries once. */
  | { status: 'unauthenticated' }
  /** Anything the user cannot fix by editing the form. */
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
    // First reason per field wins; the API sends one entry per field, and a
    // second would be a rule we do not know how to show twice anyway.
    if (isInvalidParam(param) && !(param.name in errors)) {
      errors[param.name] = param.reason
    }
  }

  return errors
}

const isCreatedCar = (value: unknown): value is CreatedCar => {
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
    // Misconfiguration, not user error. Never name which one is missing.
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
      // Without this a hung upstream leaves the button spinning forever.
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

    if (!isCreatedCar(payload)) {
      // The car was created; we just cannot describe it. Saying "failed"
      // would invite a duplicate, so this is reported as a soft failure
      // and the caller re-reads the list.
      console.error('cars: created car could not be parsed')
      return { status: 'error', message: 'Your car was added, but we could not show it yet.' }
    }

    return { status: 'success', car: payload }
  }

  if (response.status === 401) {
    return { status: 'unauthenticated' }
  }

  if (response.status === 422) {
    const payload: unknown = await response.json().catch(() => null)
    const fieldErrors = fieldErrorsFrom(payload)

    return Object.keys(fieldErrors).length > 0
      ? { status: 'invalid', fieldErrors }
      : { status: 'invalid', fieldErrors: {}, message: 'Please check the details and try again.' }
  }

  console.error('cars: upstream rejected the request', { status: response.status })
  return { status: 'error', message: GENERIC_FAILURE }
}
