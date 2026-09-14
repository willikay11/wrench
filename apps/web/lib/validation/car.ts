import { z } from 'zod'

/**
 * The same rules the API enforces, mirrored so the form can answer without a
 * round trip. The API remains the authority — every bound here exists there
 * too, on domain.Car's validate tags and again as a CHECK constraint on the
 * cars table — and this copy is only an optimisation for the person typing.
 *
 * Where the two could drift, the API wins: a 422 comes back with per-field
 * reasons and those are shown as-is.
 */

/** The values the API's usageType CHECK constraint accepts, and their labels. */
const USAGE_TYPES = [
  { value: 'daily', label: 'Daily Driver' },
  { value: 'track', label: 'Track Build' },
  { value: 'show', label: 'Show Car' },
  { value: 'project', label: 'Project Car' },
  { value: 'off-road', label: 'Off-Road' },
  { value: 'weekend', label: 'Weekend Driver' },
] as const

const USAGE_TYPE_VALUES = USAGE_TYPES.map((usage) => usage.value) as [string, ...string[]]

/** Matches the year CHECK on the cars table: 1885 is the first motor car. */
const MIN_YEAR = 1885
const MAX_YEAR = 2030

const NOTES_MAX = 1000

/** The label to show for a stored usageType, falling back to the raw value. */
const usageLabel = (value: string) =>
  USAGE_TYPES.find((usage) => usage.value === value)?.label ?? value

const carSchema = z.object({
  make: z
    .string()
    .trim()
    .min(1, { message: 'This field is required' })
    .max(50, { message: 'This field must be at most 50 characters' }),
  model: z
    .string()
    .trim()
    .min(1, { message: 'This field is required' })
    .max(50, { message: 'This field must be at most 50 characters' }),
  year: z
    .number({ message: 'This field is required' })
    .int({ message: 'This field must be a whole number' })
    .min(MIN_YEAR, { message: `This field must be ${MIN_YEAR} or more` })
    .max(MAX_YEAR, { message: `This field must be ${MAX_YEAR} or less` }),
  engine: z
    .string()
    .trim()
    .min(1, { message: 'This field is required' })
    .max(100, { message: 'This field must be at most 100 characters' }),
  usageType: z.enum(USAGE_TYPE_VALUES, { message: 'Pick how you use this car' }),
  // Optional. Trimmed like every other field, and an empty result is sent as
  // no notes at all rather than as "".
  // The catalogue generation the sheet matched, if any (ADR-010). The API
  // decides whether it agrees with make, model and year; this checks only that
  // it is an id.
  generationId: z.uuid({ message: 'This catalogue match is not valid' }).optional(),
  notes: z
    .string()
    .trim()
    .max(NOTES_MAX, { message: `This field must be at most ${NOTES_MAX} characters` })
    .optional()
    .transform((notes) => (notes === '' ? undefined : notes)),
})

type CarInput = z.infer<typeof carSchema>

export { carSchema, USAGE_TYPES, USAGE_TYPE_VALUES, MIN_YEAR, MAX_YEAR, NOTES_MAX, usageLabel }
export type { CarInput }
