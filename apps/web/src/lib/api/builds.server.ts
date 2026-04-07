// apps/web/src/lib/api/builds.server.ts
// Server-only — imports next/headers via ./client. Never import this from a client component.
import { apiFetch } from "./client"
import type { Build, BuildDetail } from "./builds"

export async function getBuilds(): Promise<Build[]> {
  return await apiFetch<Build[]>("/v1/builds/")
}

export async function getBuild(id: string): Promise<BuildDetail> {
  return await apiFetch<BuildDetail>(`/v1/builds/${id}`)
}
