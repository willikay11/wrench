'use client'

import { useId, useState } from 'react'
import Image from 'next/image'

import { CarPhotoPlaceholder } from '@/components/app/carPhotoPlaceholder'
import { useSession } from '@/components/auth/sessionProvider'
import { uploadCarPhoto, type Car, type CarPhoto } from '@/app/actions/cars'
import { usageLabel } from '@/lib/validation/car'
import { PHOTO_ACCEPT, photoProblem } from '@/lib/validation/photo'

/**
 * One car in the garage row (FR-14): its photo, a credited representative
 * catalogue image, or the branded placeholder with a way to add a photo.
 *
 * The API decides which image, in one order — the owner's upload, then the
 * linked generation's catalogue image (ADR-010) — so the card only shows what
 * it is given. It never borrows another car's picture and never leaves an empty
 * frame: with no photo, or one that fails to load, it shows the placeholder,
 * which pictures no car at all.
 *
 * The design's mod count and status badge stay out. There is still no data for
 * either, and a guessed "0 mods" is worse than none.
 */
const CarCard = ({
  car,
  onPhotoAdded,
}: {
  car: Car
  /** The photo the owner just uploaded, so the row can show it at once. */
  onPhotoAdded?: (carId: string, photo: CarPhoto) => void
}) => {
  const { session } = useSession()
  const inputId = useId()

  const [failed, setFailed] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const name = `${car.year} ${car.make} ${car.model}`
  const photo = failed ? null : (car.photo ?? null)
  const isCatalogue = photo?.source === 'catalogue'

  const addPhoto = async (file: File | undefined) => {
    if (!file || isUploading) return

    // A first check before sending; the API still decides by the file's content.
    const problem = photoProblem(file)
    if (problem) {
      setUploadError(problem)
      return
    }

    if (!session?.accessToken) {
      setUploadError('Your session has expired. Please sign in again.')
      return
    }

    setUploadError(null)
    setIsUploading(true)

    const form = new FormData()
    form.append('file', file)
    const result = await uploadCarPhoto(session.accessToken, car.id, form)

    setIsUploading(false)

    if (result.status === 'success') {
      setFailed(false)
      onPhotoAdded?.(car.id, result.photo)
      return
    }

    setUploadError(
      result.status === 'unauthenticated'
        ? 'Your session has expired. Please sign in again.'
        : result.message
    )
  }

  return (
    <article
      // Named for the listing, so a screen reader moving by article hears
      // which car it is on rather than "article".
      aria-label={name}
      className="overflow-hidden rounded-lg border border-border-default bg-surface-card transition-colors hover:border-border-hover"
    >
      {/* A fixed ratio reserves the space before any image arrives, so the row
          does not shift as photos load, fail, or are absent. */}
      <div className="relative aspect-[16/10] bg-surface-base">
        {photo ? (
          <Image
            src={photo.url}
            alt={isCatalogue ? `Representative image of a ${name}` : name}
            fill
            unoptimized
            sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
            className="object-cover"
            onError={() => setFailed(true)}
          />
        ) : (
          // Padded at the bottom so the prompt clears the title laid over it.
          <CarPhotoPlaceholder className="pb-16">
            <input
              id={inputId}
              type="file"
              accept={PHOTO_ACCEPT}
              className="sr-only"
              disabled={isUploading}
              onChange={(event) => {
                void addPhoto(event.target.files?.[0])
                // Cleared so choosing the same file again still counts.
                event.target.value = ''
              }}
            />
            <label
              htmlFor={inputId}
              className="relative z-10 cursor-pointer rounded-md border border-white/15 bg-black/30 px-3 py-1.5 text-xs text-white/80 transition-colors hover:border-white/30 hover:text-white"
            >
              {isUploading ? 'Uploading…' : 'Add photo'}
              {/* Every card has this prompt, so its accessible name says which car. */}
              <span className="sr-only"> of the {name}</span>
            </label>
            {uploadError ? (
              <p
                role="alert"
                className="relative z-10 max-w-[85%] text-center text-[0.6875rem] text-red-300"
              >
                {uploadError}
              </p>
            ) : null}
          </CarPhotoPlaceholder>
        )}

        {/* Legibility for the title over a photo. */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />

        <span className="absolute top-3 right-3 rounded-full border border-white/15 bg-black/40 px-2.5 py-1 text-[0.6875rem] tracking-wide text-white/85 uppercase backdrop-blur-sm">
          {usageLabel(car.usageType)}
        </span>

        {isCatalogue ? (
          <span className="absolute top-3 left-3 rounded-full bg-black/40 px-2.5 py-1 text-[0.6875rem] text-white/75 backdrop-blur-sm">
            Representative
          </span>
        ) : null}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 p-4">
          <h3 className="text-lg font-semibold text-white">
            &rsquo;{String(car.year).slice(-2)} {car.make} {car.model}
          </h3>
          <p className="mt-0.5 text-sm text-white/70">{car.engine}</p>

          {/* The credit the image's licence requires, shown with the image. */}
          {isCatalogue && photo?.attribution ? (
            <p className="mt-1 truncate text-[0.6875rem] text-white/55" title={photo.attribution}>
              Photo: {photo.attribution}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  )
}

export { CarCard }
