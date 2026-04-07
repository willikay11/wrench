"use client"

import Image from "next/image"
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
  const [previews, setPreviews] = React.useState<
    Array<{
      index: number
      file: File
      url: string
    }>
  >([])

  React.useEffect(() => {
    if (typeof window === "undefined" || files.length === 0) {
      setPreviews([])
      return
    }

    const nextPreviews = files.map((file, index) => ({
      index,
      file,
      url: URL.createObjectURL(file),
    }))

    setPreviews(nextPreviews)

    return () => {
      nextPreviews.forEach((preview) => URL.revokeObjectURL(preview.url))
    }
  }, [files])

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
            <Image
              src={preview.url}
              alt={`Preview of ${preview.file.name}`}
              fill
              unoptimized
              sizes="(min-width: 640px) 33vw, 50vw"
              className="object-cover"
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
