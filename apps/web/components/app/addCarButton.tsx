'use client'

import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { PlusSignIcon } from '@hugeicons/core-free-icons'

import { AddCarSheet } from '@/components/app/addCarSheet'
import { Button } from '@/components/ui/button'
import type { Car } from '@/app/actions/cars'

/**
 * Both entry points to adding a car — the header action and the empty state's
 * call to action — are the same button with different labels, and each owns its
 * own sheet so the two cannot fight over one open state.
 */
const AddCarButton = ({
  label,
  compact = false,
  onCreated,
}: {
  label: string
  compact?: boolean
  onCreated?: (car: Car) => void
}) => {
  const [isOpen, setIsOpen] = useState(false)
  // Bumped once the sheet has finished closing, so the next open finds empty
  // fields. Deliberately not bumped on open: a Root that mounts already open
  // has no state change to animate, which costs the slide-in.
  const [attempt, setAttempt] = useState(0)

  return (
    <>
      <Button
        type="button"
        size={compact ? 'sm' : 'md'}
        onClick={() => setIsOpen(true)}
        leftIcon={compact ? <HugeiconsIcon icon={PlusSignIcon} /> : undefined}
      >
        {label}
      </Button>

      {/* Always mounted, so the Dialog owns the open state for the whole of
                both transitions. Unmounting on close would cut the slide-out off
                at the first frame — React would remove the element before the
                animation Base UI is waiting on could run. */}
      <AddCarSheet
        key={attempt}
        open={isOpen}
        onOpenChange={setIsOpen}
        onClosed={() => setAttempt((count) => count + 1)}
        onCreated={onCreated}
      />
    </>
  )
}

export { AddCarButton }
