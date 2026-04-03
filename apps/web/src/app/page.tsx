"use client"

import { Suspense, useEffect, useRef } from "react"
import { useSearchParams } from "next/navigation"
import { toast } from "sonner"

function RedirectErrorToast() {
  const searchParams = useSearchParams()
  const hasShownToastRef = useRef(false)

  useEffect(() => {
    if (hasShownToastRef.current) return

    const hashParams = new URLSearchParams(
      window.location.hash.startsWith("#")
        ? window.location.hash.slice(1)
        : window.location.hash
    )

    const error = searchParams.get("error") ?? hashParams.get("error")
    const errorCode = searchParams.get("error_code") ?? hashParams.get("error_code")
    const errorDescription =
      searchParams.get("error_description") ?? hashParams.get("error_description")

    if (!error && !errorCode && !errorDescription) return

    const message = errorDescription ?? errorCode ?? error ?? "Authentication link failed"
    toast.error(message)
    hasShownToastRef.current = true
  }, [searchParams])

  return null
}

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center">
      <Suspense>
        <RedirectErrorToast />
      </Suspense>
      <h1 className="text-4xl font-medium text-brand">Wrench</h1>
      <p className="mt-2 text-gray-500">Wrench — AI-powered car build research</p>
    </main>
  )
}
