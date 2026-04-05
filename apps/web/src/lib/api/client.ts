// apps/web/src/lib/api/client.ts
import { createClient } from "@/lib/supabase/server"

const API_URL = process.env.INTERNAL_API_URL ?? "http://localhost:8000"

async function getAuthToken(): Promise<string> {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.access_token) {
    throw new Error("No active session")
  }

  return session.access_token
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getAuthToken()

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Unknown error" }))
    throw new Error(error.detail ?? `API error ${res.status}`)
  }

  return res.json()
}