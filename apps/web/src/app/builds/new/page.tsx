"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Logo } from "@/components/brand/logo"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

const GOAL_OPTIONS = [
  { value: "daily", label: "Daily driver" },
  { value: "track", label: "Track use" },
  { value: "show", label: "Show car" },
  { value: "restoration", label: "Restoration" },
] as const

const STEPS = [
  {
    id: 1,
    title: "Build basics",
    description: "Car, goals",
  },
  {
    id: 2,
    title: "Reference image",
    description: "Upload a photo",
  },
  {
    id: 3,
    title: "Review",
    description: "Confirm and create",
  },
] as const

type GoalValue = (typeof GOAL_OPTIONS)[number]["value"]

type FormState = {
  title: string
  car: string
  goals: GoalValue[]
  image: File | null
}

type FormErrors = {
  title?: string
  car?: string
  goals?: string
}

function validateStepOne(values: FormState): FormErrors {
  const errors: FormErrors = {}

  if (values.title.trim().length < 2) {
    errors.title = "Enter a build title"
  }

  if (values.car.trim().length < 2) {
    errors.car = "Enter the car for this build"
  }

  if (values.goals.length === 0) {
    errors.goals = "Select at least one build goal"
  }

  return errors
}

export default function NewBuildPage() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = React.useState(1)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [errors, setErrors] = React.useState<FormErrors>({})
  const [formState, setFormState] = React.useState<FormState>({
    title: "",
    car: "",
    goals: [],
    image: null,
  })

  const isStepOneValid = React.useMemo(() => {
    return Object.keys(validateStepOne(formState)).length === 0
  }, [formState])

  function updateField<K extends keyof FormState>(field: K, value: FormState[K]) {
    const nextState = {
      ...formState,
      [field]: value,
    }

    setFormState(nextState)

    if (field === "title" || field === "car" || field === "goals") {
      setErrors(validateStepOne(nextState))
    }
  }

  function toggleGoal(goal: GoalValue) {
    const nextGoals = formState.goals.includes(goal)
      ? formState.goals.filter((item) => item !== goal)
      : [...formState.goals, goal]

    updateField("goals", nextGoals)
  }

  function handleContinue() {
    if (currentStep === 1) {
      const nextErrors = validateStepOne(formState)
      setErrors(nextErrors)

      if (Object.keys(nextErrors).length > 0) {
        return
      }
    }

    setCurrentStep((step) => Math.min(step + 1, 3))
  }

  function handleBack() {
    setCurrentStep((step) => Math.max(step - 1, 1))
  }

  async function handleCreateBuild() {
    const nextErrors = validateStepOne(formState)
    setErrors(nextErrors)

    if (Object.keys(nextErrors).length > 0) {
      setCurrentStep(1)
      return
    }

    setIsSubmitting(true)

    try {
      const supabase = createClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session?.access_token) {
        throw new Error("Please sign in again to create your build.")
      }

      const createRes = await fetch(`${API_URL}/v1/builds/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          title: formState.title.trim(),
          car: formState.car.trim(),
          goals: formState.goals,
        }),
      })

      const createdBuild = await createRes.json().catch(() => null)

      if (!createRes.ok) {
        throw new Error(createdBuild?.detail ?? "Failed to create build")
      }

      if (formState.image && createdBuild?.id) {
        const imageForm = new FormData()
        imageForm.append("image", formState.image)

        const imageRes = await fetch(`${API_URL}/v1/builds/${createdBuild.id}/image`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          body: imageForm,
        })

        if (!imageRes.ok) {
          const imageError = await imageRes.json().catch(() => null)
          throw new Error(imageError?.detail ?? "Build created, but image upload failed")
        }
      }

      toast.success("Build created successfully.")
      router.push("/dashboard")
      router.refresh()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create build"
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8 text-foreground">
      <div className="mx-auto max-w-6xl">
        <Logo variant="full" size="md" theme="light" className="mb-6" />

        <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start">
          <aside className="space-y-3">
            {STEPS.map((step) => {
              const isActive = step.id === currentStep
              const isComplete = step.id < currentStep

              return (
                <div key={step.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div
                      className={cn(
                        "flex size-9 items-center justify-center rounded-full border text-sm font-semibold",
                        isActive || isComplete
                          ? "border-brand bg-brand text-white"
                          : "border-border bg-card text-muted-foreground"
                      )}
                    >
                      {step.id}
                    </div>
                    {step.id < STEPS.length && (
                      <div className="mt-2 h-10 w-px bg-border" />
                    )}
                  </div>

                  <div className="pt-1">
                    <p className="text-base font-semibold">{step.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {step.description}
                    </p>
                  </div>
                </div>
              )
            })}
          </aside>

          <Card className="border-border bg-card/95 shadow-sm">
            {currentStep === 1 ? (
              <>
                <CardHeader>
                  <CardTitle className="text-3xl font-semibold tracking-tight">
                    Tell us about your build
                  </CardTitle>
                  <CardDescription className="text-base">
                    Start with the basics — you can always update this later.
                  </CardDescription>
                </CardHeader>

                <CardContent>
                  <FieldGroup>
                    <Field data-invalid={!!errors.title}>
                      <FieldLabel htmlFor="build-title">Build title</FieldLabel>
                      <Input
                        id="build-title"
                        value={formState.title}
                        onChange={(event) => updateField("title", event.target.value)}
                        placeholder="E30 K24 swap"
                        aria-invalid={!!errors.title}
                      />
                      <FieldDescription>
                        A short name you&apos;ll recognise on the dashboard.
                      </FieldDescription>
                      {errors.title && <FieldError>{errors.title}</FieldError>}
                    </Field>

                    <Field data-invalid={!!errors.car}>
                      <FieldLabel htmlFor="build-car">Car</FieldLabel>
                      <Input
                        id="build-car"
                        value={formState.car}
                        onChange={(event) => updateField("car", event.target.value)}
                        placeholder="1991 BMW E30 325i"
                        aria-invalid={!!errors.car}
                      />
                      {errors.car && <FieldError>{errors.car}</FieldError>}
                    </Field>

                    <Field data-invalid={!!errors.goals}>
                      <FieldLabel>Build goals</FieldLabel>

                      <div className="grid gap-3 sm:grid-cols-2">
                        {GOAL_OPTIONS.map((goal) => {
                          const checked = formState.goals.includes(goal.value)

                          return (
                            <label
                              key={goal.value}
                              className={cn(
                                "flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-4 transition-colors",
                                checked
                                  ? "border-brand bg-brand/15 text-foreground"
                                  : "border-border bg-background hover:border-border/80"
                              )}
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={() => toggleGoal(goal.value)}
                                aria-label={goal.label}
                              />
                              <span className="text-sm font-medium">{goal.label}</span>
                            </label>
                          )
                        })}
                      </div>

                      {errors.goals && <FieldError>{errors.goals}</FieldError>}
                    </Field>
                  </FieldGroup>
                </CardContent>

                <CardFooter className="items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">Step 1 of 3</p>
                  <Button
                    type="button"
                    onClick={handleContinue}
                    disabled={!isStepOneValid}
                    className="bg-brand text-white hover:bg-brand/90"
                  >
                    Continue →
                  </Button>
                </CardFooter>
              </>
            ) : currentStep === 2 ? (
              <>
                <CardHeader>
                  <CardTitle className="text-3xl font-semibold tracking-tight">
                    Add a reference image
                  </CardTitle>
                  <CardDescription className="text-base">
                    Upload a photo of the car to help us identify the build.
                  </CardDescription>
                </CardHeader>

                <CardContent>
                  <Field>
                    <FieldLabel htmlFor="build-image">Reference image</FieldLabel>
                    <Input
                      id="build-image"
                      type="file"
                      accept="image/*"
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null
                        updateField("image", file)
                      }}
                    />
                    <FieldDescription>
                      Optional for now — you can upload a photo later.
                    </FieldDescription>
                  </Field>

                  {formState.image && (
                    <p className="mt-3 text-sm text-muted-foreground">
                      Selected: <span className="font-medium text-foreground">{formState.image.name}</span>
                    </p>
                  )}
                </CardContent>

                <CardFooter className="items-center justify-between gap-3">
                  <Button type="button" variant="outline" onClick={handleBack}>
                    ← Back
                  </Button>
                  <Button
                    type="button"
                    onClick={handleContinue}
                    className="bg-brand text-white hover:bg-brand/90"
                  >
                    Continue →
                  </Button>
                </CardFooter>
              </>
            ) : (
              <>
                <CardHeader>
                  <CardTitle className="text-3xl font-semibold tracking-tight">
                    Review your build
                  </CardTitle>
                  <CardDescription className="text-base">
                    Confirm the details before creating it.
                  </CardDescription>
                </CardHeader>

                <CardContent>
                  <div className="space-y-4 rounded-xl border border-border bg-background p-4">
                    <ReviewRow label="Title" value={formState.title} />
                    <ReviewRow label="Car" value={formState.car} />
                    <ReviewRow
                      label="Goals"
                      value={formState.goals
                        .map((goal) => GOAL_OPTIONS.find((item) => item.value === goal)?.label ?? goal)
                        .join(", ")}
                    />
                    <ReviewRow
                      label="Reference image"
                      value={formState.image?.name ?? "Not added"}
                    />
                  </div>
                </CardContent>

                <CardFooter className="items-center justify-between gap-3">
                  <Button type="button" variant="outline" onClick={handleBack}>
                    ← Back
                  </Button>
                  <Button
                    type="button"
                    onClick={handleCreateBuild}
                    disabled={isSubmitting}
                    className="bg-brand text-white hover:bg-brand/90"
                  >
                    {isSubmitting ? "Creating build…" : "Create build"}
                  </Button>
                </CardFooter>
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value || "—"}</span>
    </div>
  )
}
