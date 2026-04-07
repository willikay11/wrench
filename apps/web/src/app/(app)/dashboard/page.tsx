// apps/web/src/app/dashboard/page.tsx
import Link from "next/link"
import { getBuilds } from "@/lib/api/builds.server"
import { BuildCard } from "../../dashboard/_components/build-card"
import { StatsBar } from "../../dashboard/_components/stats-bar"
import { EmptyState } from "../../dashboard/_components/empty-state"
import { ErrorState } from "../../dashboard/_components/error-state"
import { Logo } from "@/components/brand/logo"
import { Button } from "@/components/ui/button"

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
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <Logo variant="full" size="md" theme="light" />
          <div className="flex items-center gap-3">
            <Link href="/builds/new">
              <Button
                size="sm"
                className="bg-brand hover:bg-brand/90 text-white"
              >
                + New build
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-4 py-8">

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-lg font-medium">My builds</h1>
        </div>

        <StatsBar builds={builds} />

        {error ? (
          <div className="grid grid-cols-2 gap-4">
            <ErrorState message={error} />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {builds.length === 0 ? (
              <EmptyState />
            ) : (
              builds.map((build) => (
                <BuildCard key={build.id} build={build} />
              ))
            )}
          </div>
        )}

      </main>
    </div>
  )
}