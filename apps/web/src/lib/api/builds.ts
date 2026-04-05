// apps/web/src/lib/api/builds.ts
import { apiFetch } from "./client"
import type { Database } from "@/types/database"

export type Build = Database["public"]["Tables"]["builds"]["Row"]

export interface BuildsResponse {
  builds: Build[]
  totalParts: number
  sourcedParts: number
  estimatedSpend: number
}

export async function getBuilds(): Promise<Build[]> {
    return await apiFetch<Build[]>("/v1/builds/")
}