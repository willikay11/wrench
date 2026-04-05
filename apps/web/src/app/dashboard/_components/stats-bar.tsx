// apps/web/src/app/dashboard/_components/stats-bar.tsx
import type { Build } from "@/lib/api/builds"

interface StatsBarProps {
  builds: Build[]
}

export function StatsBar({ builds }: StatsBarProps) {
  const totalBuilds = builds.length
  const activeBuilds = builds.filter(
    (b) => b.status === "in_progress"
  ).length

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-6">
      <StatCard label="Total builds" value={totalBuilds} sub={`${activeBuilds} active`} />
      <StatCard label="Parts sourced" value={24} sub="of 61 total" />
      <StatCard label="Est. spend" value="$4,200" sub="across all builds" />
      <StatCard label="Advisor messages" value={18} sub="this week" />
    </div>
  )
}

interface StatCardProps {
  label: string
  value: string | number
  sub: string
}

function StatCard({ label, value, sub }: StatCardProps) {
  return (
    <div className="bg-secondary rounded-md p-4">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="text-2xl font-medium">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{sub}</p>
    </div>
  )
}