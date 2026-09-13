'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon } from '@hugeicons/core-free-icons'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CatalogueField } from '@/components/app/catalogueField'
import { createCar, uploadCarPhoto, type Car } from '@/app/actions/cars'
import {
  findGenerations,
  searchMakes,
  searchModels,
  type VehicleGeneration,
  type VehicleMake,
  type VehicleModel,
} from '@/app/actions/catalogue'
import { useSession } from '@/components/auth/sessionProvider'
import { carSchema, NOTES_MAX, USAGE_TYPES } from '@/lib/validation/car'
import { PHOTO_ACCEPT, photoProblem } from '@/lib/validation/photo'
import { toastError, toastSuccess, toastWarning } from '@/lib/toast'
import { cn } from '@/lib/utils'

/**
 * The add-car form.
 *
 * Held in local state rather than react-hook-form: the server is the authority
 * on validation and returns per-field reasons, so the form's job is to carry
 * what was typed and show what came back.
 *
 * Make and model search the catalogue and accept anything (ADR-010). When the
 * typed make, model and year name exactly one generation, the car is linked to
 * it and the sheet shows what the garage will: a representative image, or the
 * body-style outline. The owner's own photo takes precedence over both.
 *
 * The car is created first and its photo uploaded after, so the photo has a
 * real car to belong to (ADR-007, amended). If the photo fails the car is kept
 * and the sheet still closes — staying open to retry would invite a second car.
 *
 * Reset by remounting, after the closing transition finishes (see AddCarButton)
 * rather than on open, which would cost the slide-in.
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

type Stage = 'idle' | 'saving' | 'uploading'

const generationLabel = (generation: VehicleGeneration) => {
  const years = `${generation.startYear}–${generation.endYear ?? 'present'}`
  return [generation.code, generation.bodyStyle, years].filter(Boolean).join(' · ')
}

// Fields the form shows an error beside. A rule broken anywhere else — the
// catalogue link, which has no input of its own — would otherwise be recorded,
// shown nowhere, and leave the form quietly refusing to submit.
const FIELDS_WITH_INPUTS = new Set(['year', 'make', 'model', 'engine', 'usageType', 'notes'])

const unshownError = (errors: Record<string, string>): string | null => {
  const entry = Object.entries(errors).find(([field]) => !FIELDS_WITH_INPUTS.has(field))
  if (!entry) return null

  // A generation removed between the lookup and the save, most likely.
  return entry[0] === 'generationId'
    ? 'The catalogue match for this car is no longer valid. Change the make, model or year and try again.'
    : entry[1]
}

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
  const token = session?.accessToken

  const [values, setValues] = useState<Values>(EMPTY)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [stage, setStage] = useState<Stage>('idle')

  // What the typed make and model name in the catalogue, if anything.
  const [matchedMake, setMatchedMake] = useState<VehicleMake | null>(null)
  const [generations, setGenerations] = useState<VehicleGeneration[]>([])
  const [generationId, setGenerationId] = useState<string | null>(null)

  const [photo, setPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)

  const notesId = useId()
  const photoInputId = useId()

  // Read by callbacks that finish after the render that made them — a search
  // result, a generation lookup — so they act on current values, not stale ones.
  const yearRef = useRef('')
  const makeRef = useRef<VehicleMake | null>(null)
  const modelRef = useRef<VehicleModel | null>(null)
  const lookupRef = useRef(0)
  const previewRef = useRef<string | null>(null)

  // A preview URL holds the file in memory until revoked.
  useEffect(() => {
    const preview = previewRef
    return () => {
      if (preview.current) URL.revokeObjectURL(preview.current)
    }
  }, [])

  const clearError = (field: string) =>
    setFieldErrors((current) => {
      if (!(field in current)) return current
      const next = { ...current }
      delete next[field]
      return next
    })

  const set = (field: keyof Values) => (value: string) => {
    setValues((current) => ({ ...current, [field]: value }))
    // An error about what the value used to be is noise once it has changed.
    clearError(field)
  }

  const lookupGenerations = () => {
    const id = ++lookupRef.current
    const model = modelRef.current
    const yearText = yearRef.current.trim()

    setGenerationId(null)

    if (!model || !token || !/^\d{4}$/.test(yearText)) {
      setGenerations([])
      return
    }

    void findGenerations(token, model.id, Number(yearText))
      .then((result) => {
        if (id !== lookupRef.current) return

        const found = result?.status === 'success' ? result.items : []
        setGenerations(found)
        // One generation is a match. Several — a hatch and a sedan sold in the
        // same years — are a question for the person, not a guess.
        setGenerationId(found.length === 1 ? found[0].id : null)
      })
      .catch(() => {
        if (id === lookupRef.current) setGenerations([])
      })
  }

  const setYear = (value: string) => {
    yearRef.current = value
    set('year')(value)
    lookupGenerations()
  }

  const matchMake = (make: VehicleMake | null) => {
    if (make?.id === makeRef.current?.id) return

    makeRef.current = make
    setMatchedMake(make)
    // A model belongs to its make, so a different make unlinks it.
    modelRef.current = null
    lookupGenerations()
  }

  const matchModel = (model: VehicleModel | null) => {
    if (model?.id === modelRef.current?.id) return

    modelRef.current = model
    lookupGenerations()
  }

  const findMakes = async (text: string) => {
    if (!token) return []
    const result = await searchMakes(token, text)
    return result?.status === 'success' ? result.items : []
  }

  const findModels = async (text: string) => {
    const make = makeRef.current
    // No catalogue make, no catalogue models: the model is free text.
    if (!token || !make) return []
    const result = await searchModels(token, make.id, text)
    return result?.status === 'success' ? result.items : []
  }

  const choosePhoto = (file: File | undefined) => {
    if (!file) return

    const problem = photoProblem(file)
    if (problem) {
      setPhotoError(problem)
      return
    }

    setPhotoError(null)
    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    previewRef.current = URL.createObjectURL(file)
    setPhoto(file)
    setPhotoPreview(previewRef.current)
  }

  const removePhoto = () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    previewRef.current = null
    setPhoto(null)
    setPhotoPreview(null)
  }

  const isBusy = stage !== 'idle'

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()

    // State, not only a disabled attribute: a fast second Enter can land before
    // React re-renders.
    if (isBusy) return

    setFormError(null)

    const parsed = carSchema.safeParse({
      ...values,
      year: values.year === '' ? undefined : Number(values.year),
      // Sent only when the sheet found exactly the generation this car is.
      generationId: generationId ?? undefined,
    })

    if (!parsed.success) {
      const errors: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const field = issue.path[0]
        if (typeof field === 'string' && !(field in errors)) errors[field] = issue.message
      }
      setFieldErrors(errors)
      setFormError(unshownError(errors))
      return
    }

    if (!token) {
      setFormError('Your session has expired. Please sign in again.')
      return
    }

    setStage('saving')
    const result = await createCar(token, parsed.data)

    if (result.status !== 'success') {
      setStage('idle')

      if (result.status === 'invalid') {
        setFieldErrors(result.fieldErrors)
        setFormError(result.message ?? unshownError(result.fieldErrors))
        return
      }

      if (result.status === 'unauthenticated') {
        setFormError('Your session has expired. Please sign in again.')
        return
      }

      setFormError(result.message)
      toastError({ title: 'Could not add your car', description: result.message })
      return
    }

    let created: Car = result.car

    if (photo) {
      setStage('uploading')

      const form = new FormData()
      form.append('file', photo)
      const upload = await uploadCarPhoto(token, created.id, form)

      if (upload.status === 'success') {
        created = { ...created, photo: upload.photo }
      } else {
        toastWarning({
          title: 'Your car was added, but its photo was not',
          description:
            upload.status === 'unauthenticated'
              ? 'Your session expired before the photo could upload.'
              : upload.message,
        })
      }
    }

    setStage('idle')
    toastSuccess({
      title: `${created.year} ${created.make} ${created.model} added`,
      description: 'Rex is learning about it now.',
    })
    onCreated?.(created)
    onOpenChange(false)
  }

  const matchedGeneration = generations.find((generation) => generation.id === generationId) ?? null
  const needsChoice = generations.length > 1 && !generationId
  const carName = [values.year, values.make, values.model].filter(Boolean).join(' ')
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
        {/* Base UI holds the popup mounted until these transitions finish, and
            marks each phase with data-starting-style / data-ending-style. Under
            motion-safe only: reduced motion gets no transition to wait on. */}
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
            // Off-screen at both ends: one class pair for the slide in and out.
            'data-[starting-style]:translate-x-full data-[ending-style]:translate-x-full'
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-primary px-6 py-5">
            <div>
              <Dialog.Title className="text-xl font-semibold text-text-primary">
                Add a car
              </Dialog.Title>
              <Dialog.Description className="mt-1 flex items-center gap-2 text-sm text-text-secondary">
                {/* Rex's eyes, the mark from the design. */}
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
                <Input
                  label="Year"
                  // Not type="number": spinners and scroll-to-change are a
                  // liability on a four-digit field; inputMode still gets iOS
                  // the numeric keypad.
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="e.g. 2003"
                  value={values.year}
                  onChange={(event) => setYear(event.target.value)}
                  error={fieldErrors.year}
                />
                <CatalogueField<VehicleMake>
                  label="Make"
                  placeholder="e.g. Nissan"
                  value={values.make}
                  onValueChange={set('make')}
                  search={findMakes}
                  itemLabel={(make) => make.name}
                  itemKey={(make) => make.id}
                  onMatch={matchMake}
                  error={fieldErrors.make}
                />
              </div>

              <CatalogueField<VehicleModel>
                label="Model"
                placeholder="e.g. 350Z"
                value={values.model}
                onValueChange={set('model')}
                search={findModels}
                itemLabel={(model) => model.name}
                itemKey={(model) => model.id}
                onMatch={matchModel}
                error={fieldErrors.model}
                helperText={
                  matchedMake ? undefined : 'Suggestions appear once the make is recognised'
                }
              />

              <Input
                label="Engine"
                placeholder="e.g. VQ35DE 3.5L V6"
                helperText="This helps Rex give engine-specific advice"
                value={values.engine}
                onChange={(event) => set('engine')(event.target.value)}
                error={fieldErrors.engine}
              />

              {needsChoice ? (
                <fieldset>
                  <legend className="mb-2 text-xs font-medium tracking-wide text-text-secondary uppercase">
                    Which one is it?
                  </legend>
                  <div className="grid gap-2">
                    {generations.map((generation) => (
                      <button
                        key={generation.id}
                        type="button"
                        role="radio"
                        aria-checked={false}
                        onClick={() => setGenerationId(generation.id)}
                        className="cursor-pointer rounded-md border border-border-default px-3 py-2 text-left text-sm text-text-secondary transition-colors hover:border-border-hover hover:text-text-primary"
                      >
                        {generationLabel(generation)}
                      </button>
                    ))}
                  </div>
                </fieldset>
              ) : null}

              {photoPreview || matchedGeneration?.image ? (
                <figure className="rounded-lg border border-border-default bg-surface-card p-3">
                  {photoPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a local blob: preview of a file not yet uploaded; there is nothing for Next's optimiser to fetch.
                    <img
                      src={photoPreview}
                      alt="Your photo of this car"
                      className="aspect-[16/9] w-full rounded-md object-cover"
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element -- Cloudinary already sizes and formats this image; Next's optimiser would transform it a second time.
                    <img
                      src={matchedGeneration?.image?.url}
                      alt={`Representative image of a ${carName}`}
                      className="aspect-[16/9] w-full rounded-md object-cover"
                    />
                  )}

                  <figcaption className="mt-2 flex items-center justify-between gap-3 text-xs text-text-secondary">
                    {photoPreview ? (
                      <>
                        <span>Your photo</span>
                        <button
                          type="button"
                          onClick={removePhoto}
                          className="cursor-pointer text-text-muted underline-offset-2 hover:text-text-primary hover:underline"
                        >
                          Remove
                        </button>
                      </>
                    ) : (
                      <span>
                        Representative image · {matchedGeneration?.image?.attribution} ·{' '}
                        {matchedGeneration?.image?.license}
                      </span>
                    )}
                  </figcaption>
                </figure>
              ) : null}

              {/* Confirms the link in words. With no catalogue image there is no
                  honest picture of this car to show, so nothing is pictured. */}
              {matchedGeneration ? (
                <p className="text-xs text-text-secondary">
                  Catalogue match · {generationLabel(matchedGeneration)}
                </p>
              ) : null}

              <div>
                <input
                  id={photoInputId}
                  type="file"
                  accept={PHOTO_ACCEPT}
                  className="sr-only"
                  onChange={(event) => {
                    choosePhoto(event.target.files?.[0])
                    // Cleared so choosing the same file again still counts.
                    event.target.value = ''
                  }}
                />
                <label
                  htmlFor={photoInputId}
                  className="inline-flex cursor-pointer items-center rounded-md border border-border-default px-3 py-2 text-sm text-text-secondary transition-colors hover:border-border-hover hover:text-text-primary"
                >
                  {photo ? 'Choose a different photo' : 'Upload your own photo'}
                </label>
                <p className="mt-1 text-xs text-text-muted">JPEG, PNG, WebP or HEIC, up to 10MB.</p>
                {photoError ? (
                  <p role="alert" className="mt-1 text-xs text-error">
                    {photoError}
                  </p>
                ) : null}
              </div>

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
                        // Radio semantics: one of these is chosen, and a
                        // screen reader should say which.
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
                  // The API's ceiling, so the counter cannot promise room it refuses.
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

              <Button type="submit" size="lg" className="w-full" isLoading={isBusy}>
                {stage === 'saving'
                  ? 'Adding car…'
                  : stage === 'uploading'
                    ? 'Uploading photo…'
                    : 'Add car'}
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
