/**
 * The first check on a car photo, made before anything is sent.
 *
 * The API is the authority and decides by the file's content (FR-37). This
 * copy exists so a person choosing a 40MB video or a PDF is told at once,
 * rather than after waiting for an upload that was always going to be refused.
 */

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024

/** What the file picker offers. HEIC is listed by extension too, see below. */
export const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif'

const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])

/** A message to show, or null when the photo may be sent. */
export function photoProblem(file: { name: string; type: string; size: number }): string | null {
  if (file.size === 0) return 'This photo is empty.'
  if (file.size > MAX_PHOTO_BYTES) return 'This photo is larger than 10MB.'

  // Several browsers report a HEIC file with no type at all, so there — and
  // only there — the extension stands in for it. The API still reads the bytes.
  const known =
    PHOTO_TYPES.has(file.type) || (file.type === '' && /\.(heic|heif)$/i.test(file.name))

  return known ? null : 'Choose a JPEG, PNG, WebP or HEIC photo.'
}
