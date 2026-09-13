import { HugeiconsIcon } from '@hugeicons/react'
import { Car03Icon } from '@hugeicons/core-free-icons'

import { usageLabel } from '@/lib/validation/car'
import type { Car } from '@/app/actions/cars'

/**
 * One car in the garage row.
 *
 * The design puts a photo, a mod count and a status badge here. None of the
 * three has an API behind it — there is no photos, modifications, build or
 * service table — so the card shows what the car actually has and no more.
 *
 * Deliberately not stubbed. A placeholder photo beside a real car reads as that
 * car's photo, and "0 mods" beside a car with fourteen is worse than no count.
 */
const CarCard = ({ car }: { car: Car }) => (
  <article
    // Named for the listing, so a screen reader moving by article hears
    // which car it is on rather than "article".
    aria-label={`${car.year} ${car.make} ${car.model}`}
    className="flex h-full flex-col justify-between rounded-lg border border-border-default bg-surface-card p-5 transition-colors hover:border-border-hover hover:bg-surface-card-hover"
  >
    <div className="flex items-start justify-between gap-3">
      <HugeiconsIcon icon={Car03Icon} size={28} className="text-text-muted" strokeWidth={1.2} />

      <span className="rounded-full border border-border-default px-2.5 py-1 text-[0.6875rem] tracking-wide text-text-secondary uppercase">
        {usageLabel(car.usageType)}
      </span>
    </div>

    <div className="mt-6">
      <h3 className="text-lg font-semibold text-text-primary">
        &rsquo;{String(car.year).slice(-2)} {car.make} {car.model}
      </h3>
      <p className="mt-1 text-sm text-text-secondary">{car.engine}</p>
    </div>
  </article>
)

export { CarCard }
