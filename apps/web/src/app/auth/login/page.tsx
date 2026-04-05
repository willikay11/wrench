// apps/web/src/app/auth/login/page.tsx
"use client"

import * as React from "react"
import Link from "next/link"
import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm } from "react-hook-form"
import { toast } from "sonner"

import { loginSchema, type LoginValues } from "@/lib/schemas/auth"
import { Button } from "@/components/ui/button"
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button"
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
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Logo } from "@/components/brand/logo"

function LoginForm() {
  const searchParams = useSearchParams()
  const [isLoading, setIsLoading] = React.useState(false)

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  })

async function onSubmit(values: LoginValues) {
  setIsLoading(true)
  try {
    const requestedNext = searchParams.get("next")
    const next = requestedNext?.startsWith("/") ? requestedNext : "/dashboard"

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ ...values, next }),
    })

    // Server returned an error — show it
    if (!res.ok && !res.redirected) {
      const data = await res.json().catch(() => ({})) as { error?: string }
      toast.error(data.error ?? "Something went wrong. Please try again.")
      return
    }

    // Server redirected successfully — navigate there
    if (res.redirected) {
      window.location.href = res.url
      return
    }

    // Fallback
    window.location.href = next

  } finally {
    setIsLoading(false)
  }
}

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <Logo />

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">
              Welcome back
            </CardTitle>
            <CardDescription>Sign in to your builds.</CardDescription>
          </CardHeader>

          <CardContent>
            <form id="login-form" onSubmit={form.handleSubmit(onSubmit)}>
              <FieldGroup>
                <Controller
                  name="email"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="login-email">Email</FieldLabel>
                      <Input
                        {...field}
                        id="login-email"
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
                      <div className="flex items-center justify-between">
                        <FieldLabel htmlFor="login-password">
                          Password
                        </FieldLabel>
                        <Link
                          href="/auth/forgot-password"
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          Forgot password?
                        </Link>
                      </div>
                      <Input
                        {...field}
                        id="login-password"
                        type="password"
                        autoComplete="current-password"
                        aria-invalid={fieldState.invalid}
                      />
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
              form="login-form"
              className="w-full bg-brand hover:bg-brand/90 text-white"
              disabled={isLoading}
            >
              {isLoading ? "Signing in…" : "Sign in"}
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
          </CardFooter>
        </Card>

        <p className="text-center text-sm text-muted-foreground mt-4">
          Don&apos;t have an account?{" "}
          <Link
            href="/auth/signup"
            className="text-foreground font-medium hover:underline underline-offset-2"
          >
            Create one
          </Link>
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}