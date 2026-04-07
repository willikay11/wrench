// apps/web/src/lib/api/builds.ts
// Client-safe — no server-only imports. Server fetches live in builds.server.ts.
import type { Database } from "@/types/database"

type BuildRow = Database["public"]["Tables"]["builds"]["Row"]

export type Build = Omit<BuildRow, "donor_car" | "engine_swap"> & {
  car?: string | null
  donor_car?: string | null
  engine_swap?: string | null
  modification_goal?: string | null
  parts_total?: number
  parts_sourced?: number
}

export interface Part {
  id: string
  build_id: string
  name: string
  description: string | null
  category: string | null
  status: "needed" | "ordered" | "sourced" | "installed"
  price_estimate: number | null
  vendor_url: string | null
  is_safety_critical: boolean
  notes: string | null
  goal: string | null
  created_at: string
  updated_at: string
}

export interface BuildDetail extends Build {
  parts: Part[]
}

export interface CreateBuildPayload {
  title: string
  car?: string
  modification_goal?: string
  goals: string[]
}

export interface BuildsResponse {
  builds: Build[]
  totalParts: number
  sourcedParts: number
  estimatedSpend: number
}

const CLIENT_API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

export async function createBuild(
  payload: CreateBuildPayload,
  accessToken: string
): Promise<Build> {
  const res = await fetch(`${CLIENT_API_URL}/v1/builds/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Unknown error" }))
    throw new Error(error.detail ?? `API error ${res.status}`)
  }

  return res.json()
}

export async function updateBuild(
  id: string,
  payload: Partial<Pick<Build, "title" | "car" | "modification_goal" | "goals" | "status">>,
  accessToken: string
): Promise<BuildDetail> {
  const res = await fetch(`${CLIENT_API_URL}/v1/builds/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Unknown error" }))
    throw new Error(error.detail ?? `API error ${res.status}`)
  }

  return res.json()
}

export async function uploadBuildImage(
  buildId: string,
  image: File,
  accessToken: string
): Promise<{ image_url: string }> {
  const form = new FormData()
  form.append("image", image)

  const res = await fetch(`${CLIENT_API_URL}/v1/builds/${buildId}/image`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: form,
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Unknown error" }))
    throw new Error(error.detail ?? `API error ${res.status}`)
  }

  return res.json()
}
