// apps/web/src/app/auth/reset/page.tsx
"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm } from "react-hook-form"
import { toast } from "sonner"

import { resetPasswordSchema, type ResetPasswordValues } from "@/lib/schemas/auth"
import { createClient } from "@/lib/supabase/client"
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
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Logo } from "@/components/brand/logo"

export default function ResetPasswordPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = React.useState(false)
  const [isSessionReady, setIsSessionReady] = React.useState(false)
  const [isCheckingSession, setIsCheckingSession] = React.useState(true)
  const supabase = React.useMemo(() => createClient({ flowType: "implicit" }), [])

  React.useEffect(() => {
    async function initializeRecoverySession() {
      setIsCheckingSession(true)

      const searchParams = new URLSearchParams(window.location.search)
      const hashParams = new URLSearchParams(
        window.location.hash.startsWith("#")
          ? window.location.hash.slice(1)
          : window.location.hash
      )

      const urlError =
        searchParams.get("error_description") ??
        searchParams.get("error") ??
        hashParams.get("error_description") ??
        hashParams.get("error")

      if (urlError) {
        toast.error(urlError)
        setIsSessionReady(false)
        setIsCheckingSession(false)
        return
      }

      const code = searchParams.get("code")
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)

        if (error) {
          toast.error(error.message ?? "Reset link is invalid or has expired.")
          setIsSessionReady(false)
          setIsCheckingSession(false)
          return
        }

        window.history.replaceState(null, "", window.location.pathname)
      }

      const tokenHash = searchParams.get("token_hash")
      const tokenType = searchParams.get("type")
      if (tokenHash && tokenType === "recovery") {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: "recovery",
        })

        if (error) {
          toast.error(error.message ?? "Reset link is invalid or has expired.")
          setIsSessionReady(false)
          setIsCheckingSession(false)
          return
        }

        window.history.replaceState(null, "", window.location.pathname)
      }

      const accessToken = hashParams.get("access_token")
      const refreshToken = hashParams.get("refresh_token")

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })

        if (error) {
          toast.error(error.message ?? "Reset link is invalid or has expired.")
          setIsSessionReady(false)
          setIsCheckingSession(false)
          return
        }

        // Remove tokens from the URL after establishing session.
        window.history.replaceState(null, "", window.location.pathname)
      }

      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session) {
        toast.error("Reset link is invalid or has expired.")
        setIsSessionReady(false)
        setIsCheckingSession(false)
        return
      }

      setIsSessionReady(true)
      setIsCheckingSession(false)
    }

    void initializeRecoverySession()
  }, [supabase])

  const form = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  })

  async function onSubmit(values: ResetPasswordValues) {
    if (!isSessionReady) {
      toast.error("Reset link is invalid or has expired.")
      return
    }

    setIsLoading(true)

    const { error } = await supabase.auth.updateUser({
      password: values.password,
    })

    if (error) {
      toast.error(error.message ?? "Something went wrong. Please try again.")
      setIsLoading(false)
      return
    }

    toast.success("Password updated. Welcome back.")
    router.push("/dashboard")
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <Logo variant="full" size="md" theme="light" className="mb-6" />

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">
              Set a new password
            </CardTitle>
            <CardDescription>
              Choose a strong password for your account.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form id="reset-password-form" onSubmit={form.handleSubmit(onSubmit)}>
              <FieldGroup>
                <Controller
                  name="password"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="reset-password">
                        New password
                      </FieldLabel>
                      <Input
                        {...field}
                        id="reset-password"
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
                      <FieldLabel htmlFor="reset-confirm-password">
                        Confirm new password
                      </FieldLabel>
                      <Input
                        {...field}
                        id="reset-confirm-password"
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
              </FieldGroup>
            </form>
          </CardContent>

          <CardFooter>
            <Button
              type="submit"
              form="reset-password-form"
              className="w-full bg-brand hover:bg-brand/90 text-white"
              disabled={isLoading || isCheckingSession || !isSessionReady}
            >
              {isLoading
                ? "Updating password…"
                : isCheckingSession
                  ? "Validating reset link…"
                  : "Update password"}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}   