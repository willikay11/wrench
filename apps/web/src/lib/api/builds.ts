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

export interface PartVendor {
  id: string
  part_id: string
  vendor_name: string
  vendor_url: string | null
  price: number | null
  currency: string
  ships_from: string | null
  estimated_days_min: number | null
  estimated_days_max: number | null
  shipping_cost: number | null
  is_primary: boolean
  created_at: string
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
  image_url: string | null
  is_safety_critical: boolean
  notes: string | null
  goal: string | null
  vendors: PartVendor[]
  ordered_from_vendor_id: string | null
  ordered_at: string | null
  created_at: string
  updated_at: string
}

export interface VisionExtracted {
  make: string | null
  model: string | null
  year: string | null
  confidence: number | null
  part_name: string | null
  specifications: Record<string, string> | null
  mods_detected: string[]
  notes: string | null
}

export interface VisionData {
  image_type: 'car' | 'rims' | 'engine_bay' | 'suspension' | 'inspiration' | 'part' | 'unknown'
  summary: string
  extracted: VisionExtracted
}

export interface BuildDetail extends Omit<Build, "vision_data"> {
  parts: Part[]
  vision_data: VisionData | null
}

export interface GenerateResponse {
  parts_created: number
  build: BuildDetail
}

export interface GeneratePartsResponse {
  build_id: string
  parts: Part[]
  total_parts: number
  estimated_total: number
  safety_critical_count: number
  message: string
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

export async function generateParts(
  buildId: string,
  accessToken: string
): Promise<GenerateResponse> {
  const res = await fetch(`${CLIENT_API_URL}/v1/builds/${buildId}/generate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Unknown error" }))
    throw new Error(error.detail ?? `API error ${res.status}`)
  }

  return res.json()
}

export async function generatePartsNew(
  buildId: string,
  accessToken: string,
  forceRegenerate: boolean = false
): Promise<GeneratePartsResponse> {
  const res = await fetch(`${CLIENT_API_URL}/v1/builds/${buildId}/parts/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ force_regenerate: forceRegenerate }),
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

export async function orderPart(
  buildId: string,
  partId: string,
  vendorId: string,
  accessToken: string
): Promise<Part> {
  const res = await fetch(`${CLIENT_API_URL}/v1/builds/${buildId}/parts/${partId}/order`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ vendor_id: vendorId }),
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Unknown error" }))
    throw new Error(error.detail ?? `API error ${res.status}`)
  }

  return res.json()
}
