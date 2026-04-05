"use client"

import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowUp01Icon } from "@hugeicons/core-free-icons"

import { cn } from "@/lib/utils"
import { ImagePreviewGrid } from "./ImagePreviewGrid"

interface ImageUploadProps {
  files: File[]
  onChange: (files: File[]) => void
  inputId?: string
  className?: string
  maxFiles?: number
}

function fileKey(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`
}

export function ImageUpload({
  files,
  onChange,
  inputId = "build-images",
  className,
  maxFiles = 8,
}: ImageUploadProps) {
  const [isDragging, setIsDragging] = React.useState(false)

  function mergeFiles(selected: FileList | File[]) {
    const incoming = Array.from(selected).filter((file) =>
      file.type.startsWith("image/")
    )

    const merged = [...files]

    for (const file of incoming) {
      if (!merged.some((existing) => fileKey(existing) === fileKey(file))) {
        merged.push(file)
      }
    }

    onChange(merged.slice(0, maxFiles))
  }

  function handleInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    if (event.target.files?.length) {
      mergeFiles(event.target.files)
      event.target.value = ""
    }
  }

  function handleDrop(event: React.DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    setIsDragging(false)

    if (event.dataTransfer.files?.length) {
      mergeFiles(event.dataTransfer.files)
    }
  }

  function handleRemove(index: number) {
    onChange(files.filter((_, currentIndex) => currentIndex !== index))
  }

  return (
    <div className={cn("space-y-4", className)}>
      <input
        id={inputId}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        aria-label="Upload build images"
        className="sr-only"
        onChange={handleInputChange}
      />

      <label
        htmlFor={inputId}
        onDragOver={(event) => {
          event.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "flex min-h-[220px] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-8 text-center transition-colors",
          isDragging
            ? "border-brand bg-brand/10"
            : files.length > 0
              ? "border-brand bg-brand/5"
              : "border-border bg-background/40 hover:border-brand/60"
        )}
      >
        <div className="mb-4 flex size-14 items-center justify-center rounded-full border border-border bg-card/80">
          <HugeiconsIcon
            icon={ArrowUp01Icon}
            strokeWidth={1.8}
            className="size-5 text-muted-foreground"
          />
        </div>

        <p className="text-xl font-medium text-foreground">
          {files.length > 0
            ? "Add more photos"
            : "Drop photos here or click to browse"}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          JPG, PNG or WEBP · max 10MB
        </p>
      </label>

      <ImagePreviewGrid files={files} onRemove={handleRemove} />
    </div>
  )
}
