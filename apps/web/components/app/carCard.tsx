'use client'

import { useState } from 'react'
import Image from 'next/image'

import { CarSilhouette } from '@/components/app/carSilhouette'
import { usageLabel } from '@/lib/validation/car'
import type { Car } from '@/app/actions/cars'

/**
 * One car in the garage row (FR-14): its photo, or a representative catalogue
 * image, or an outline of its body style.
 *
 * The API decides which, in one order — the owner's upload, then the linked
 * generation's credited catalogue image, then nothing (ADR-010) — so the card
 * only shows what it is given. It never borrows another car's image and never
 * leaves an empty frame: with no photo, or one that fails to load, it draws the
 * outline, which stands in for the car without claiming to be it.
 *
 * The design's mod count and status badge stay out. There is still no data for
 * either, and a guessed "0 mods" is worse than none.
 */
const CarCard = ({ car }: { car: Car }) => {
  const [failed, setFailed] = useState(false)

  const name = `${car.year} ${car.make} ${car.model}`
  const photo = failed ? null : (car.photo ?? null)
  const isCatalogue = photo?.source === 'catalogue'

  return (
    <article
      // Named for the listing, so a screen reader moving by article hears
      // which car it is on rather than "article".
      aria-label={name}
      className="overflow-hidden rounded-lg border border-border-default bg-surface-card transition-colors hover:border-border-hover"
    >
      {/* A fixed ratio reserves the space before any image arrives, so the row
          does not shift as photos load in. */}
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
          <div className="flex h-full items-center justify-center pb-10">
            <CarSilhouette bodyStyle={car.bodyStyle} className="w-2/3" />
          </div>
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

        <div className="absolute inset-x-0 bottom-0 p-4">
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
