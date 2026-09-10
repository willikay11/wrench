'use client'

import { useId, useState } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon } from '@hugeicons/core-free-icons'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createCar, type Car } from '@/app/actions/cars'
import { useSession } from '@/components/auth/sessionProvider'
import { carSchema, NOTES_MAX, USAGE_TYPES } from '@/lib/validation/car'
import { toastError, toastSuccess } from '@/lib/toast'
import { cn } from '@/lib/utils'

/**
 * The add-car form.
 *
 * Held in local state rather than react-hook-form: the server is the authority
 * on validation and returns per-field reasons, so the form's job is to carry
 * what was typed and show what came back. A resolver would duplicate the rules
 * without removing the need to render the server's.
 *
 * Reset by remounting rather than by an effect, and the remount happens after
 * the closing transition finishes — onClosed, not on open. Remounting at open
 * time gives Base UI a Root whose first render is already open, so there is no
 * closed-to-open change to animate and the sheet appears with no slide.
 *
 * Values survive every failure. Losing five filled fields to a timeout is worse
 * than the timeout.
 */

type Values = {
  year: string
  make: string
  model: string
  engine: string
  usageType: string
  notes: string
}

const EMPTY: Values = { year: '', make: '', model: '', engine: '', usageType: '', notes: '' }

const AddCarSheet = ({
  open,
  onOpenChange,
  onClosed,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called once the closing transition has finished, not when it starts. */
  onClosed?: () => void
  /** The new car, so the garage can show it without re-reading the list. */
  onCreated?: (car: Car) => void
}) => {
  const { session } = useSession()

  const [values, setValues] = useState<Values>(EMPTY)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const notesId = useId()

  const set = (field: keyof Values) => (value: string) => {
    setValues((current) => ({ ...current, [field]: value }))
    // Clear the field's error as it is edited: an error about what the
    // value used to be is noise once it has changed.
    setFieldErrors((current) => {
      if (!(field in current)) return current
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()

    // The guard against a double submit is state, not just a disabled
    // attribute: a fast second Enter can land before React re-renders.
    if (isSaving) return

    setFormError(null)

    // Year is typed, so it reaches the schema as a number or as NaN, which
    // the schema reports as the required-field message rather than a cast.
    const parsed = carSchema.safeParse({
      ...values,
      year: values.year === '' ? undefined : Number(values.year),
    })

    if (!parsed.success) {
      const errors: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const field = issue.path[0]
        if (typeof field === 'string' && !(field in errors)) errors[field] = issue.message
      }
      setFieldErrors(errors)
      return
    }

    if (!session?.accessToken) {
      setFormError('Your session has expired. Please sign in again.')
      return
    }

    setIsSaving(true)
    const result = await createCar(session.accessToken, parsed.data)
    setIsSaving(false)

    if (result.status === 'success') {
      toastSuccess({
        title: `${result.car.year} ${result.car.make} ${result.car.model} added`,
        description: 'Rex is learning about it now.',
      })
      onCreated?.(result.car)
      onOpenChange(false)
      return
    }

    if (result.status === 'invalid') {
      setFieldErrors(result.fieldErrors)
      if (result.message) setFormError(result.message)
      return
    }

    if (result.status === 'unauthenticated') {
      setFormError('Your session has expired. Please sign in again.')
      return
    }

    setFormError(result.message)
    toastError({ title: 'Could not add your car', description: result.message })
  }

  const notesLength = values.notes.trim().length

  return (
    <Dialog.Root
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen) onClosed?.()
      }}
    >
      <Dialog.Portal>
        {/* Base UI holds the popup mounted until these transitions finish,
                    and marks each phase with data-starting-style / data-ending-style.
                    Under motion-safe only: someone who has asked for reduced motion
                    gets no transition to wait on, so the sheet appears at once. */}
        <Dialog.Backdrop
          className={cn(
            'fixed inset-0 z-50 bg-black/60 backdrop-blur-[1px]',
            'motion-safe:transition-opacity motion-safe:duration-200 motion-safe:ease-out',
            'data-[starting-style]:opacity-0 data-[ending-style]:opacity-0'
          )}
        />

        <Dialog.Popup
          className={cn(
            'fixed inset-y-0 right-0 z-50 flex w-full max-w-[480px] flex-col border-l border-border-default bg-surface-raised outline-none',
            'motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out',
            // Off-screen at both ends, so one class pair describes
            // the slide in and the slide out.
            'data-[starting-style]:translate-x-full data-[ending-style]:translate-x-full'
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-primary px-6 py-5">
            <div>
              <Dialog.Title className="text-xl font-semibold text-text-primary">
                Add a car
              </Dialog.Title>
              <Dialog.Description className="mt-1 flex items-center gap-2 text-sm text-text-secondary">
                {/* Rex's eyes, the mark from the design. The Rex
                                    component itself is the launcher disc — glow,
                                    pulse and all — which is wrong at 16px. */}
                <svg
                  viewBox="0 0 28 20"
                  className="w-4 shrink-0"
                  aria-hidden="true"
                  focusable="false"
                >
                  <rect x="4" y="7" width="7" height="5" rx="1.5" fill="#E8693C" />
                  <rect x="17" y="7" width="7" height="5" rx="1.5" fill="#E8693C" />
                </svg>
                Tell Rex about your car so he knows what he&rsquo;s working with
              </Dialog.Description>
            </div>

            <Dialog.Close
              aria-label="Close"
              className="cursor-pointer rounded p-1 text-text-muted transition-colors hover:text-text-primary"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={18} />
            </Dialog.Close>
          </div>

          <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Input
                    label="Year"
                    // Not type="number": the spinners and
                    // scroll-to-change are a liability on a
                    // four-digit field, and iOS still gets
                    // the numeric keypad from inputMode.
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="e.g. 2003"
                    value={values.year}
                    onChange={(event) => set('year')(event.target.value)}
                    error={fieldErrors.year}
                  />
                </div>
                <div>
                  <Input
                    label="Make"
                    placeholder="e.g. Nissan"
                    value={values.make}
                    onChange={(event) => set('make')(event.target.value)}
                    error={fieldErrors.make}
                  />
                </div>
              </div>

              <Input
                label="Model"
                placeholder="e.g. 350Z"
                value={values.model}
                onChange={(event) => set('model')(event.target.value)}
                error={fieldErrors.model}
              />

              <Input
                label="Engine"
                placeholder="e.g. VQ35DE 3.5L V6"
                helperText="This helps Rex give engine-specific advice"
                value={values.engine}
                onChange={(event) => set('engine')(event.target.value)}
                error={fieldErrors.engine}
              />

              <fieldset>
                <legend className="mb-2 text-xs font-medium tracking-wide text-text-secondary uppercase">
                  Primary use
                </legend>

                <div className="grid grid-cols-2 gap-3">
                  {USAGE_TYPES.map((usage) => {
                    const selected = values.usageType === usage.value

                    return (
                      <button
                        key={usage.value}
                        type="button"
                        // Radio semantics, not six unrelated
                        // buttons: one of these is chosen and
                        // a screen reader should say which.
                        role="radio"
                        aria-checked={selected}
                        onClick={() => set('usageType')(usage.value)}
                        className={cn(
                          'cursor-pointer rounded-md border px-3 py-2.5 text-sm transition-colors',
                          selected
                            ? 'border-primary bg-primary/10 text-text-primary'
                            : 'border-border-default text-text-secondary hover:border-border-hover hover:text-text-primary'
                        )}
                      >
                        {usage.label}
                      </button>
                    )
                  })}
                </div>

                {fieldErrors.usageType ? (
                  <p className="mt-2 text-xs text-error">{fieldErrors.usageType}</p>
                ) : null}
              </fieldset>

              <div>
                <Label htmlFor={notesId}>NOTES (OPTIONAL)</Label>
                <textarea
                  id={notesId}
                  rows={4}
                  // The same ceiling the API enforces, so the
                  // counter cannot promise room it refuses.
                  maxLength={NOTES_MAX}
                  placeholder="Anything else Rex should know? Current mileage, history, quirks, goals for the build…"
                  value={values.notes}
                  onChange={(event) => set('notes')(event.target.value)}
                  aria-invalid={fieldErrors.notes ? true : undefined}
                  className="mt-1.5 w-full resize-none rounded-md border border-border-default bg-surface-card px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus-visible:border-primary"
                />
                <div className="mt-1 flex items-start justify-between gap-3">
                  <p className="text-xs text-error">{fieldErrors.notes ?? ''}</p>
                  <p className="shrink-0 text-xs text-text-muted" aria-live="polite">
                    {notesLength} / {NOTES_MAX}
                  </p>
                </div>
              </div>
            </div>

            <div className="shrink-0 space-y-3 border-t border-border-default px-6 py-5">
              {formError ? (
                <p role="alert" className="text-center text-sm text-error">
                  {formError}
                </p>
              ) : null}

              <Button type="submit" size="lg" className="w-full" isLoading={isSaving}>
                {isSaving ? 'Adding car…' : 'Add car'}
              </Button>

              <Button
                type="button"
                variant="link"
                className="w-full text-text-secondary"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>

              <p className="text-center text-xs text-text-muted">
                Rex will use this info to give you car-specific advice
              </p>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export { AddCarSheet }
