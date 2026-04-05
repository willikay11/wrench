import Link from "next/link"

import { Logo } from "@/components/brand/logo"
import { Button } from "@/components/ui/button"
import { getBuilds } from "@/lib/api/builds"

import { BuildCard } from "./_components/build-card"
import { EmptyState } from "./_components/empty-state"
import { ErrorState } from "./_components/error-state"
import { StatsBar } from "./_components/stats-bar"

export default async function DashboardPage() {
  let builds: Awaited<ReturnType<typeof getBuilds>> = []
  let error: string | null = null

  try {
    builds = await getBuilds()
  } catch (err) {
    error = err instanceof Error ? err.message : "Unknown error"
  }

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-border bg-card">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Logo variant="full" size="md" theme="light" />
          <div className="flex items-center gap-3">
            <Link href="/builds/new">
              <Button
                size="sm"
                className="bg-brand text-white hover:bg-brand/90"
              >
                + New build
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-lg font-medium">My builds</h1>
        </div>

        <StatsBar builds={builds} />

        {error ? (
          <div className="grid grid-cols-2 gap-4">
            <ErrorState message={error} />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {builds.length === 0 ? (
              <EmptyState />
            ) : (
              builds.map((build) => <BuildCard key={build.id} build={build} />)
            )}
          </div>
        )}
      </main>
    </div>
  )
}
