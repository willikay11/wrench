"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { HugeiconsIcon } from "@hugeicons/react"
import { Tick02Icon, Cancel01Icon } from "@hugeicons/core-free-icons"
import { toast } from "sonner"

import { Logo } from "@/components/brand/logo"
import { ImageUpload } from "@/components/build/ImageUpload"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { createClient } from "@/lib/supabase/client"
import { createBuild, uploadBuildImage } from "@/lib/api/builds"
import { cn } from "@/lib/utils"

// ── Constants ─────────────────────────────────────────────────────────────────

const PRESET_GOALS = [
  "K24 engine swap",
  "Coilover suspension",
  "Brake upgrade",
  "Rim change",
  "Custom exhaust",
  "Roll cage",
  "Infotainment upgrade",
  "Paint job",
] as const

const GOAL_COLOURS = ["#D97706", "#3B8BD4", "#1D9E75", "#9333EA", "#DC2626"]

const STEPS = [
  { id: 1, label: "Your car" },
  { id: 2, label: "Your goals" },
  { id: 3, label: "Reference photo" },
  { id: 4, label: "Review" },
  { id: 5, label: "Generating" },
] as const

// ── Types ─────────────────────────────────────────────────────────────────────

type FormState = {
  title: string
  car: string
  goals: string[]
  modification_goal: string
  images: File[]
}

type FormErrors = {
  title?: string
  car?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function goalColour(index: number) {
  return GOAL_COLOURS[index % GOAL_COLOURS.length]
}

function validateStepOne(values: FormState): FormErrors {
  const errors: FormErrors = {}
  if (values.title.trim().length < 2) errors.title = "Enter a build name"
  if (values.car.trim().length < 2) errors.car = "Enter the car for this build"
  return errors
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function NewBuildPage() {
  const router = useRouter()

  const [currentStep, setCurrentStep] = React.useState(1)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [errors, setErrors] = React.useState<FormErrors>({})
  const [customGoalInput, setCustomGoalInput] = React.useState("")
  const [buildId, setBuildId] = React.useState<string | null>(null)
  const [completedGenSteps, setCompletedGenSteps] = React.useState(1)

  const [formState, setFormState] = React.useState<FormState>({
    title: "",
    car: "",
    goals: [],
    modification_goal: "",
    images: [],
  })

  const genSteps = React.useMemo(
    () => [
      "Build created",
      ...formState.goals.map((g) => `Analysing ${g}...`),
      "Fetching vendor pricing",
    ],
    [formState.goals],
  )

  // Drive generation progress
  React.useEffect(() => {
    if (currentStep !== 5 || !buildId) return
    const interval = Math.min(
      3000,
      Math.floor(12000 / Math.max(formState.goals.length, 1)),
    )
    const timer = setInterval(() => {
      setCompletedGenSteps((prev) => Math.min(prev + 1, genSteps.length))
    }, interval)
    return () => clearInterval(timer)
  }, [currentStep, buildId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Redirect once generation finishes
  React.useEffect(() => {
    if (completedGenSteps >= genSteps.length && buildId) {
      router.push(`/builds/${buildId}`)
    }
  }, [completedGenSteps, buildId, genSteps.length, router])

  // ── Field helpers ──────────────────────────────────────────────────────────

  function updateField<K extends keyof FormState>(
    field: K,
    value: FormState[K],
  ) {
    const next = { ...formState, [field]: value }
    setFormState(next)
    if (field === "title" || field === "car") setErrors(validateStepOne(next))
  }

  function togglePresetGoal(goal: string) {
    const next = formState.goals.includes(goal)
      ? formState.goals.filter((g) => g !== goal)
      : [...formState.goals, goal]
    updateField("goals", next)
  }

  function addCustomGoal() {
    const trimmed = customGoalInput.trim()
    if (!trimmed || formState.goals.includes(trimmed)) {
      setCustomGoalInput("")
      return
    }
    updateField("goals", [...formState.goals, trimmed])
    setCustomGoalInput("")
  }

  function removeGoal(goal: string) {
    updateField("goals", formState.goals.filter((g) => g !== goal))
  }

  // ── Navigation ─────────────────────────────────────────────────────────────

  function handleStepOneContinue() {
    const errs = validateStepOne(formState)
    setErrors(errs)
    if (Object.keys(errs).length > 0) return
    setCurrentStep(2)
  }

  function handleBack() {
    setCurrentStep((s) => Math.max(s - 1, 1))
  }

  // ── Submit ─────────────────────────────────────────────────────────────────

  async function handleCreateBuild() {
    setIsSubmitting(true)
    try {
      const supabase = createClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error("Please sign in again.")

      const created = await createBuild(
        {
          title: formState.title.trim(),
          car: formState.car.trim(),
          modification_goal: formState.modification_goal.trim() || undefined,
          goals: formState.goals,
        },
        session.access_token,
      )

      if (formState.images.length > 0) {
        await uploadBuildImage(created.id, formState.images[0], session.access_token)
      }

      setBuildId(created.id)
      setCompletedGenSteps(1)
      setCurrentStep(5)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create build")
    } finally {
      setIsSubmitting(false)
    }
  }

  const isStepOneValid = Object.keys(validateStepOne(formState)).length === 0

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Topbar ── */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
          <Logo variant="full" size="md" theme="light" className="shrink-0" />

          {formState.title.trim() && (
            <span className="max-w-[160px] truncate text-sm text-muted-foreground">
              {formState.title.trim()}
            </span>
          )}

          {/* Step tracker */}
          <div className="ml-auto flex items-center gap-1.5">
            {STEPS.map((step, i) => {
              const isDone = step.id < currentStep
              const isActive = step.id === currentStep
              return (
                <React.Fragment key={step.id}>
                  {i > 0 && (
                    <div
                      className={cn(
                        "h-px w-5 shrink-0 transition-colors",
                        isDone ? "bg-emerald-500" : "bg-border",
                      )}
                    />
                  )}
                  <div
                    title={step.label}
                    aria-label={`Step ${step.id}: ${step.label}${isDone ? " (complete)" : isActive ? " (current)" : ""}`}
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors",
                      isDone
                        ? "border-emerald-600 bg-emerald-600 text-white"
                        : isActive
                          ? "border-brand bg-brand text-white"
                          : "border-border bg-card text-muted-foreground",
                    )}
                  >
                    {isDone ? (
                      <HugeiconsIcon
                        icon={Tick02Icon}
                        className="size-3.5"
                        strokeWidth={2.5}
                      />
                    ) : (
                      step.id
                    )}
                  </div>
                </React.Fragment>
              )
            })}
          </div>
        </div>
      </header>

      {/* ── Step content ── */}
      <main className="mx-auto max-w-xl px-4 py-10">
        {currentStep === 1 && (
          <StepOne
            formState={formState}
            errors={errors}
            isValid={isStepOneValid}
            onChange={updateField}
            onContinue={handleStepOneContinue}
          />
        )}

        {currentStep === 2 && (
          <StepTwo
            formState={formState}
            customGoalInput={customGoalInput}
            onChange={updateField}
            onCustomGoalInput={setCustomGoalInput}
            onTogglePreset={togglePresetGoal}
            onAddCustom={addCustomGoal}
            onRemoveGoal={removeGoal}
            onBack={handleBack}
            onContinue={() => setCurrentStep(3)}
          />
        )}

        {currentStep === 3 && (
          <StepThree
            formState={formState}
            onChange={updateField}
            onBack={handleBack}
            onContinue={() => setCurrentStep(4)}
          />
        )}

        {currentStep === 4 && (
          <StepFour
            formState={formState}
            isSubmitting={isSubmitting}
            onBack={handleBack}
            onSubmit={handleCreateBuild}
          />
        )}

        {currentStep === 5 && (
          <StepFive
            genSteps={genSteps}
            completedGenSteps={completedGenSteps}
          />
        )}
      </main>
    </div>
  )
}

// ── Step 1 — Your car ─────────────────────────────────────────────────────────

function StepOne({
  formState,
  errors,
  isValid,
  onChange,
  onContinue,
}: {
  formState: FormState
  errors: FormErrors
  isValid: boolean
  onChange: <K extends keyof FormState>(field: K, value: FormState[K]) => void
  onContinue: () => void
}) {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Your car</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Let&apos;s start with the basics — you can update everything later.
        </p>
      </div>

      <FieldGroup>
        <Field data-invalid={!!errors.title}>
          <FieldLabel htmlFor="build-name">Build name</FieldLabel>
          <Input
            id="build-name"
            value={formState.title}
            onChange={(e) => onChange("title", e.target.value)}
            placeholder="E30 K24 swap"
            aria-invalid={!!errors.title}
          />
          {errors.title && <FieldError>{errors.title}</FieldError>}
        </Field>

        <Field data-invalid={!!errors.car}>
          <FieldLabel htmlFor="build-car">Car</FieldLabel>
          <Input
            id="build-car"
            value={formState.car}
            onChange={(e) => onChange("car", e.target.value)}
            placeholder="e.g. 1991 BMW E30 325i"
            aria-invalid={!!errors.car}
          />
          {errors.car && <FieldError>{errors.car}</FieldError>}
        </Field>
      </FieldGroup>

      <div className="flex justify-end">
        <Button
          type="button"
          onClick={onContinue}
          disabled={!isValid}
          className="bg-brand text-white hover:bg-brand/90"
        >
          Continue →
        </Button>
      </div>
    </div>
  )
}

// ── Step 2 — Your goals ───────────────────────────────────────────────────────

function StepTwo({
  formState,
  customGoalInput,
  onChange,
  onCustomGoalInput,
  onTogglePreset,
  onAddCustom,
  onRemoveGoal,
  onBack,
  onContinue,
}: {
  formState: FormState
  customGoalInput: string
  onChange: <K extends keyof FormState>(field: K, value: FormState[K]) => void
  onCustomGoalInput: (val: string) => void
  onTogglePreset: (goal: string) => void
  onAddCustom: () => void
  onRemoveGoal: (goal: string) => void
  onBack: () => void
  onContinue: () => void
}) {
  const hasGoals = formState.goals.length > 0

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Your goals</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          What do you want to achieve with this build?
        </p>
      </div>

      {/* Preset chips */}
      <div className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Suggestions
        </p>
        <div className="flex flex-wrap gap-2">
          {PRESET_GOALS.map((goal) => {
            const selected = formState.goals.includes(goal)
            return (
              <button
                key={goal}
                type="button"
                onClick={() => onTogglePreset(goal)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                  selected
                    ? "border-brand bg-brand/15 text-foreground"
                    : "border-border bg-background text-muted-foreground hover:border-brand/60 hover:text-foreground",
                )}
              >
                {goal}
              </button>
            )
          })}
        </div>
      </div>

      {/* Custom goal input */}
      <div className="flex gap-2">
        <Input
          value={customGoalInput}
          onChange={(e) => onCustomGoalInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              onAddCustom()
            }
          }}
          placeholder="Add a custom goal…"
          className="flex-1"
        />
        <Button
          type="button"
          variant="outline"
          onClick={onAddCustom}
          disabled={!customGoalInput.trim()}
        >
          Add
        </Button>
      </div>

      {/* Selected goals as coloured tags */}
      {hasGoals && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Selected goals
          </p>
          <div className="flex flex-wrap gap-2">
            {formState.goals.map((goal, i) => (
              <span
                key={goal}
                className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium"
                style={{
                  borderColor: goalColour(i),
                  backgroundColor: goalColour(i) + "20",
                  color: goalColour(i),
                }}
              >
                {goal}
                <button
                  type="button"
                  onClick={() => onRemoveGoal(goal)}
                  aria-label={`Remove ${goal}`}
                  className="opacity-70 transition-opacity hover:opacity-100"
                >
                  <HugeiconsIcon
                    icon={Cancel01Icon}
                    className="size-3.5"
                    strokeWidth={2}
                  />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Modification goal textarea */}
      <Field>
        <FieldLabel htmlFor="modification-goal">
          Describe your goal in your own words{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </FieldLabel>
        <Textarea
          id="modification-goal"
          value={formState.modification_goal}
          onChange={(e) => onChange("modification_goal", e.target.value)}
          placeholder="e.g. I want to do a K24 swap for daily driving and occasional track days on a budget of $4k"
          rows={3}
        />
      </Field>

      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" onClick={onBack}>
          ← Back
        </Button>
        <Button
          type="button"
          onClick={onContinue}
          disabled={!hasGoals}
          className="bg-brand text-white hover:bg-brand/90"
        >
          Continue →
        </Button>
      </div>
    </div>
  )
}

// ── Step 3 — Reference photo ──────────────────────────────────────────────────

function StepThree({
  formState,
  onChange,
  onBack,
  onContinue,
}: {
  formState: FormState
  onChange: <K extends keyof FormState>(field: K, value: FormState[K]) => void
  onBack: () => void
  onContinue: () => void
}) {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Reference photo
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Optional — Wrench uses AI to identify your car and spot visible mods.
        </p>
      </div>

      <ImageUpload
        files={formState.images}
        onChange={(files) => onChange("images", files)}
      />

      <button
        type="button"
        onClick={onContinue}
        className="mx-auto block text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        Skip for now — I&apos;ll add a photo later
      </button>

      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" onClick={onBack}>
          ← Back
        </Button>
        <Button
          type="button"
          onClick={onContinue}
          className="bg-brand text-white hover:bg-brand/90"
        >
          Continue →
        </Button>
      </div>
    </div>
  )
}

// ── Step 4 — Review ───────────────────────────────────────────────────────────

function StepFour({
  formState,
  isSubmitting,
  onBack,
  onSubmit,
}: {
  formState: FormState
  isSubmitting: boolean
  onBack: () => void
  onSubmit: () => void
}) {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Review your build
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Confirm the details before we generate your parts list.
        </p>
      </div>

      {/* Summary */}
      <div className="space-y-4 rounded-xl border border-border bg-card/60 p-5">
        <SummaryRow label="Build name" value={formState.title} />
        <SummaryRow label="Car" value={formState.car} />

        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between">
          <span className="text-sm text-muted-foreground">Goals</span>
          <div className="flex flex-wrap gap-1.5 sm:justify-end">
            {formState.goals.map((goal, i) => (
              <span
                key={goal}
                className="rounded-full border px-2.5 py-0.5 text-xs font-medium"
                style={{
                  borderColor: goalColour(i),
                  backgroundColor: goalColour(i) + "20",
                  color: goalColour(i),
                }}
              >
                {goal}
              </span>
            ))}
          </div>
        </div>

        {formState.modification_goal.trim() && (
          <SummaryRow
            label="Your goal"
            value={formState.modification_goal.trim()}
          />
        )}

        <SummaryRow
          label="Photos"
          value={
            formState.images.length > 0
              ? `${formState.images.length} photo${formState.images.length === 1 ? "" : "s"}`
              : "None added"
          }
        />
      </div>

      {/* Notice */}
      <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        Generating your parts list takes 10–20 seconds. You&apos;ll land
        straight in the workspace when it&apos;s done.
      </div>

      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          disabled={isSubmitting}
        >
          ← Back
        </Button>
        <Button
          type="button"
          onClick={onSubmit}
          disabled={isSubmitting}
          className="bg-brand text-white hover:bg-brand/90"
        >
          {isSubmitting ? "Creating build…" : "Create build"}
        </Button>
      </div>
    </div>
  )
}

// ── Step 5 — Generating ───────────────────────────────────────────────────────

function StepFive({
  genSteps,
  completedGenSteps,
}: {
  genSteps: string[]
  completedGenSteps: number
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-10">
      {/* Spinner */}
      <div className="size-16 animate-spin rounded-full border-4 border-brand/20 border-t-brand" />

      {/* Progress steps */}
      <div className="w-full max-w-xs space-y-3">
        {genSteps.map((step, i) => {
          const isDone = i < completedGenSteps
          const isActive = i === completedGenSteps

          return (
            <div key={step} className="flex items-center gap-3">
              {isDone ? (
                <span className="flex size-5 shrink-0 items-center justify-center text-emerald-600">
                  <svg
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="size-4"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
                      clipRule="evenodd"
                    />
                  </svg>
                </span>
              ) : isActive ? (
                <span className="flex size-5 shrink-0 items-center justify-center">
                  <span className="size-3 animate-spin rounded-full border-2 border-brand border-t-transparent" />
                </span>
              ) : (
                <span className="flex size-5 shrink-0 items-center justify-center">
                  <span className="size-2 rounded-full bg-border" />
                </span>
              )}
              <span
                className={cn(
                  "text-sm",
                  isDone
                    ? "text-foreground"
                    : isActive
                      ? "font-medium text-brand"
                      : "text-muted-foreground",
                )}
              >
                {step}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Misc ──────────────────────────────────────────────────────────────────────

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value || "—"}</span>
    </div>
  )
}
