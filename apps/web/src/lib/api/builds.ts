// apps/web/src/lib/api/builds.ts
import { apiFetch } from "./client"
import type { Database } from "@/types/database"

type BuildRow = Database["public"]["Tables"]["builds"]["Row"]

export type Build = Omit<BuildRow, "donor_car"> & {
  car?: string | null
  donor_car?: string | null
  parts_total?: number
  parts_sourced?: number
}

export interface BuildsResponse {
  builds: Build[]
  totalParts: number
  sourcedParts: number
  estimatedSpend: number
}

export async function getBuilds(): Promise<Build[]> {
    return await apiFetch<Build[]>("/v1/builds/")
}