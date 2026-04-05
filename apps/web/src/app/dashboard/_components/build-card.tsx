// apps/web/src/components/build/BuildCard.tsx
"use client"

import * as React from "react"
import Link from "next/link"
import Image from "next/image"
import { formatDistanceToNow } from "date-fns"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { Build } from "@/lib/api/builds"

interface BuildCardProps {
  build: Build
}

const statusConfig = {
  planning: {
    label: "Planning",
    className: "bg-warning/10 text-warning-foreground border-warning/20",
  },
  in_progress: {
    label: "In progress",
    className: "bg-success/10 text-success-foreground border-success/20",
  },
  complete: {
    label: "Complete",
    className: "bg-info/10 text-info-foreground border-info/20",
  },
} as const

export function BuildCard({ build }: BuildCardProps) {
  const [imageFailed, setImageFailed] = React.useState(false)

  React.useEffect(() => {
    setImageFailed(false)
  }, [build.image_url])

  const status =
    statusConfig[build.status as keyof typeof statusConfig] ??
    statusConfig.planning
  const car = build.car ?? build.donor_car

  const updatedAt = formatDistanceToNow(new Date(build.updated_at), {
    addSuffix: true,
  })

  const progressPercent =
    (build.parts_total ?? 0) > 0
      ? Math.round(((build.parts_sourced ?? 0) / (build.parts_total ?? 0)) * 100)
      : 0

  return (
    <Link href={`/builds/${build.id}`} className="block h-full">
      <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-lg">
        <div className="relative aspect-[16/10] w-full overflow-hidden bg-secondary">
          {build.image_url && !imageFailed ? (
            <Image
              src={build.image_url}
              alt={build.title}
              fill
              sizes="(min-width: 1280px) 20vw, (min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
              unoptimized
              onError={() => setImageFailed(true)}
              className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-secondary">
              <CarPlaceholder />
            </div>
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />

          <div className="absolute right-3 top-3">
            <Badge
              variant="outline"
              className={cn(
                "border-white/20 bg-black/40 text-[10px] font-medium text-white backdrop-blur-sm",
                status.className
              )}
            >
              {status.label}
            </Badge>
          </div>

          <div className="absolute inset-x-0 bottom-0 p-4">
            <h3 className="truncate text-base font-semibold text-white">
              {build.title}
            </h3>
            {car && (
              <p className="mt-1 truncate text-xs text-white/85">
                {car}
                {build.engine_swap && ` · ${build.engine_swap}`}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-4 p-4">
          <div className="grid grid-cols-2 gap-3">
            <MetaItem
              label="Goals"
              value={build.goals?.join(", ") || "None set"}
            />
            <MetaItem label="Updated" value={updatedAt} />
            <MetaItem
              label="Parts"
              value={
                (build.parts_total ?? 0) > 0
                  ? `${build.parts_sourced ?? 0} of ${build.parts_total ?? 0} sourced`
                  : "None added yet"
              }
            />
          </div>

          <div className="mt-auto space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">
                Progress
              </span>
              <span className="text-[10px] font-medium text-muted-foreground">
                {progressPercent}%
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-brand transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>
      </article>
    </Link>
  )
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-muted/30 p-2.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-[11px] font-medium text-foreground/90">
        {value}
      </p>
    </div>
  )
}

function CarPlaceholder() {
  return (
    <svg
      width="52"
      height="28"
      viewBox="0 0 52 28"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-border opacity-50"
    >
      <rect x="2" y="12" width="48" height="12" rx="2" />
      <path d="M8 12L12 4h28l4 8" />
      <circle cx="12" cy="26" r="3" />
      <circle cx="40" cy="26" r="3" />
    </svg>
  )
}