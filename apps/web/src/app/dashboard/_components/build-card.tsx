// apps/web/src/app/dashboard/_components/build-card.tsx
"use client"

import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import type { Build } from "@/lib/api/builds"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import Image from "next/image"

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
  const status = statusConfig[build.status as keyof typeof statusConfig] ?? statusConfig.planning
  const updatedAt = formatDistanceToNow(new Date(build.updated_at), {
    addSuffix: true,
  })

  return (
    <Link href={`/builds/${build.id}`}>
      <div className="bg-card border border-border rounded-lg p-4 hover:border-border/80 transition-colors cursor-pointer h-full flex flex-col gap-3">

        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-medium text-foreground truncate">
              {build.title}
            </h3>
            {build.donor_car && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {build.donor_car}
                {build.engine_swap && ` · ${build.engine_swap}`}
              </p>
            )}
          </div>
          <Badge
            variant="outline"
            className={cn("text-[10px] shrink-0 font-medium", status.className)}
          >
            {status.label}
          </Badge>
        </div>

        <div className="w-full h-[72px] bg-secondary rounded-md flex items-center justify-center border border-border/50">
          {build.image_url ? (
            <Image
              src={build.image_url}
              alt={build.title}
              className="w-full h-full object-cover rounded-md"
            />
          ) : (
            <CarPlaceholder />
          )}
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-auto">
          <MetaItem label="Goals" value={build?.goals?.join(", ") || "None set"} />
          <MetaItem label="Updated" value={updatedAt} />
        </div>

      </div>
    </Link>
  )
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-[10px] text-muted-foreground">{label} </span>
      <span className="text-[10px] font-medium text-muted-foreground">{value}</span>
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