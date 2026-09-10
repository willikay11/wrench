import { HugeiconsIcon } from '@hugeicons/react'
import { Car03Icon } from '@hugeicons/core-free-icons'

import { AddCarButton } from '@/components/app/addCarButton'

/**
 * What a new account sees, and only ever that: loading has its own skeleton and
 * a failed load has its own screen, so this component never has to stand in for
 * either. It can therefore say "empty" as a fact rather than a guess.
 *
 * The heading states the fact and the body names what a car unlocks. "Your
 * garage is empty" on its own is a complaint; the three things it turns on are
 * the reason to act.
 */
const EmptyGarage = () => (
  <section
    aria-labelledby="empty-garage-heading"
    className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center"
  >
    <HugeiconsIcon icon={Car03Icon} size={56} className="text-text-muted" strokeWidth={1.2} />

    <h2 id="empty-garage-heading" className="mt-6 text-2xl font-semibold text-text-primary">
      Your garage is empty
    </h2>
    <p className="mt-3 max-w-sm text-sm leading-relaxed text-text-secondary">
      Add your first car to start tracking mods, service and budget — and to give Rex something to
      work with.
    </p>

    <div className="mt-7">
      <AddCarButton label="Add your first car" />
    </div>

    {/* The form asks for five things. Saying so up front is the difference
            between starting it and wondering how long it will take. */}
    <p className="mt-4 text-xs text-text-muted">Year, make, model, engine and how you use it.</p>
  </section>
)

export { EmptyGarage }
