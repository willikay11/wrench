// apps/web/src/app/auth/signup/page.tsx
"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm } from "react-hook-form"
import { toast } from "sonner"
import { signupSchema, type SignupValues } from "@/lib/schemas/auth"

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
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button"

// ── Logo ───────────────────────────────────────────────────────────────────
function Logo() {
  return (
    <div className="flex items-center gap-2 mb-6">
      <div className="w-7 h-7 bg-brand rounded-md flex items-center justify-center flex-shrink-0">
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2 10L5 4l3 4 3-4 2 6" />
        </svg>
      </div>
      <span className="text-[15px] font-medium tracking-tight">Wrench</span>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────
export default function SignupPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = React.useState(false)

  const form = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      displayName: "",
      email: "",
      password: "",
      confirmPassword: "",
      region: "",
    },
  })

  async function onSubmit(values: SignupValues) {
    setIsLoading(true)

    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: values.email,
        password: values.password,
        displayName: values.displayName,
        region: values.region,
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      toast.error(data.error ?? "Something went wrong. Please try again.")
      setIsLoading(false)
      return
    }

    toast.success("Account created — welcome to Wrench.")
    router.push("/dashboard")
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <Logo />

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">
              Create an account
            </CardTitle>
            <CardDescription>Start building smarter.</CardDescription>
          </CardHeader>

          <CardContent>
            <form
              id="signup-form"
              onSubmit={form.handleSubmit(onSubmit)}
            >
              <FieldGroup>
                <Controller
                  name="displayName"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="signup-display-name">
                        Display name
                      </FieldLabel>
                      <Input
                        {...field}
                        id="signup-display-name"
                        placeholder="e.g. Will Kamau"
                        autoComplete="name"
                        aria-invalid={fieldState.invalid}
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />

                <Controller
                  name="email"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="signup-email">Email</FieldLabel>
                      <Input
                        {...field}
                        id="signup-email"
                        type="email"
                        placeholder="you@example.com"
                        autoComplete="email"
                        aria-invalid={fieldState.invalid}
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />

                <Controller
                  name="password"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="signup-password">
                        Password
                      </FieldLabel>
                      <Input
                        {...field}
                        id="signup-password"
                        type="password"
                        autoComplete="new-password"
                        aria-invalid={fieldState.invalid}
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />

                <Controller
                  name="confirmPassword"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="signup-confirm-password">
                        Confirm password
                      </FieldLabel>
                      <Input
                        {...field}
                        id="signup-confirm-password"
                        type="password"
                        autoComplete="new-password"
                        aria-invalid={fieldState.invalid}
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />

                <Controller
                  name="region"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="signup-region">
                        Your region
                      </FieldLabel>
                      <Input
                        {...field}
                        id="signup-region"
                        placeholder="e.g. Nairobi, Kenya"
                        autoComplete="country-name"
                        aria-invalid={fieldState.invalid}
                      />
                      <FieldDescription>
                        Used to estimate shipping costs on parts.
                      </FieldDescription>
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
              </FieldGroup>
            </form>
          </CardContent>

          <CardFooter className="flex-col gap-3">
            <Button
              type="submit"
              form="signup-form"
              className="w-full bg-brand hover:bg-brand/90 text-white"
              disabled={isLoading}
            >
              {isLoading ? "Creating account…" : "Create account"}
            </Button>

            <div className="relative w-full">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-card px-2 text-muted-foreground">or</span>
              </div>
            </div>

            <GoogleSignInButton disabled={isLoading} />


            <p className="text-xs text-muted-foreground text-center">
              By signing up you agree to our{" "}
              <Link
                href="/terms"
                className="underline underline-offset-2 hover:text-foreground"
              >
                terms
              </Link>{" "}
              and{" "}
              <Link
                href="/privacy"
                className="underline underline-offset-2 hover:text-foreground"
              >
                privacy policy
              </Link>
              .
            </p>
          </CardFooter>
        </Card>

        <p className="text-center text-sm text-muted-foreground mt-4">
          Already have an account?{" "}
          <Link
            href="/auth/login"
            className="text-foreground font-medium hover:underline underline-offset-2"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}