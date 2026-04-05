"use client"

import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Cancel01Icon } from "@hugeicons/core-free-icons"

import { cn } from "@/lib/utils"

interface ImagePreviewGridProps {
  files: File[]
  onRemove?: (index: number) => void
  className?: string
}

export function ImagePreviewGrid({
  files,
  onRemove,
  className,
}: ImagePreviewGridProps) {
  const previews = React.useMemo(
    () =>
      files.map((file, index) => ({
        index,
        file,
        url: URL.createObjectURL(file),
      })),
    [files]
  )

  React.useEffect(() => {
    return () => {
      previews.forEach((preview) => URL.revokeObjectURL(preview.url))
    }
  }, [previews])

  if (previews.length === 0) {
    return null
  }

  return (
    <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3", className)}>
      {previews.map((preview) => (
        <div
          key={`${preview.file.name}-${preview.file.lastModified}-${preview.index}`}
          className="overflow-hidden rounded-xl border border-border bg-background"
        >
          <div className="relative aspect-[4/3] bg-muted/30">
            <img
              src={preview.url}
              alt={`Preview of ${preview.file.name}`}
              className="h-full w-full object-cover"
            />

            {onRemove && (
              <button
                type="button"
                aria-label={`Remove ${preview.file.name}`}
                onClick={() => onRemove(preview.index)}
                className="absolute right-2 top-2 inline-flex size-8 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm transition-colors hover:bg-background"
              >
                <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-4" />
              </button>
            )}
          </div>

          <div className="truncate px-3 py-2 text-xs text-muted-foreground">
            {preview.file.name}
          </div>
        </div>
      ))}
    </div>
  )
}
