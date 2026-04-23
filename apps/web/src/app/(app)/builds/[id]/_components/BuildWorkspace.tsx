"use client"

import Image from "next/image"
import * as React from "react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { generateParts, updateBuild, uploadBuildImage } from "@/lib/api/builds"
import type { BuildDetail, Part, VisionData } from "@/lib/api/builds"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PartDetailDrawer } from "./PartDetailDrawer"

// ── Constants ─────────────────────────────────────────────────────────────

const GOAL_COLOURS = ["#D97706", "#3B8BD4", "#1D9E75", "#9333EA", "#DC2626"]

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  planning:    { label: "Planning",     className: "bg-amber-100 text-amber-800" },
  in_progress: { label: "In progress",  className: "bg-blue-100 text-blue-800" },
  complete:    { label: "Complete",     className: "bg-emerald-100 text-emerald-800" },
}

const PART_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  needed:    { label: "Needed",    className: "bg-slate-100 text-slate-700" },
  ordered:   { label: "Ordered",   className: "bg-yellow-100 text-yellow-700" },
  sourced:   { label: "Sourced",   className: "bg-blue-100 text-blue-700" },
  installed: { label: "Installed", className: "bg-emerald-100 text-emerald-700" },
}

// ── Helpers ───────────────────────────────────────────────────────────────

type WorkspaceState = "A" | "B" | "C"

function getState(build: BuildDetail): WorkspaceState {
  if (!build.modification_goal) return "A"
  if (build.parts.length === 0) return "B"
  return "C"
}

function goalColour(index: number) {
  return GOAL_COLOURS[index % GOAL_COLOURS.length]
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount)
}

// ── Sub-components ────────────────────────────────────────────────────────

function CarPlaceholder() {
  return (
    <div
      aria-label="Car placeholder"
      className="flex h-40 w-full items-center justify-center rounded-lg bg-secondary"
    >
      <svg
        viewBox="0 0 64 32"
        fill="none"
        className="w-24 text-muted-foreground"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 20h56M8 20l6-10h28l6 10" />
        <circle cx="16" cy="22" r="4" />
        <circle cx="48" cy="22" r="4" />
        <path d="M14 10h10l4-6h8l4 6h4" />
      </svg>
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.planning
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", cfg.className)}>
      {cfg.label}
    </span>
  )
}

function PartStatusPill({ status }: { status: string }) {
  const cfg = PART_STATUS_CONFIG[status] ?? PART_STATUS_CONFIG.needed
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", cfg.className)}>
      {cfg.label}
    </span>
  )
}

// ── Left panel ────────────────────────────────────────────────────────────

function VisionBadges({ vision }: { vision: VisionData }) {
  const items = [
    vision.make && { label: "Make", value: vision.make, conf: vision.confidence?.make },
    vision.model && { label: "Model", value: vision.model, conf: vision.confidence?.model },
    vision.year_range && { label: "Year", value: vision.year_range, conf: vision.confidence?.year },
  ].filter(Boolean) as { label: string; value: string; conf?: number }[]

  if (items.length === 0) return null

  return (
    <div className="space-y-1 rounded-lg border border-border bg-muted/30 p-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Vision ID
      </p>
      {items.map(({ label, value, conf }) => (
        <div key={label} className="flex items-center justify-between gap-1">
          <span className="text-xs text-muted-foreground">{label}</span>
          <span className="flex items-center gap-1 text-xs font-medium">
            {value}
            {conf != null && (
              <span
                className={cn(
                  "rounded px-1 py-0.5 text-[10px]",
                  conf >= 0.8
                    ? "bg-emerald-100 text-emerald-700"
                    : conf >= 0.5
                    ? "bg-amber-100 text-amber-700"
                    : "bg-slate-100 text-slate-500"
                )}
              >
                {Math.round(conf * 100)}%
              </span>
            )}
          </span>
        </div>
      ))}
      {(vision.visible_mods ?? []).length > 0 && (
        <div className="pt-0.5">
          <p className="text-[10px] text-muted-foreground">Mods detected:</p>
          <ul className="mt-0.5 space-y-0.5">
            {vision.visible_mods!.map((mod) => (
              <li key={mod} className="text-[11px] text-foreground">
                · {mod}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function LeftPanel({
  build,
  onImageUploaded,
}: {
  build: BuildDetail
  onImageUploaded: (url: string) => void
}) {
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [addingGoal, setAddingGoal] = React.useState(false)
  const [newGoal, setNewGoal] = React.useState("")

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error("Not signed in")
      const { image_url } = await uploadBuildImage(build.id, file, session.access_token)
      onImageUploaded(image_url)
      toast.success("Photo uploaded — analysing…")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed")
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  async function handleAddGoal() {
    const trimmed = newGoal.trim()
    if (!trimmed) return

    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error("Not signed in")
      await updateBuild(build.id, { goals: [...(build.goals ?? []), trimmed] }, session.access_token)
      toast.success("Goal added.")
      setNewGoal("")
      setAddingGoal(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add goal")
    }
  }

  return (
    <aside className="flex flex-col gap-4 overflow-y-auto border-r border-border p-4">
      {/* Image */}
      {build.image_url ? (
        <Image
          src={build.image_url}
          alt={build.title}
          width={800}
          height={320}
          unoptimized
          className="h-40 w-full rounded-lg object-cover"
        />
      ) : (
        <CarPlaceholder />
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label="Upload build photo"
        className="sr-only"
        onChange={handleFileChange}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full text-xs"
        onClick={() => fileInputRef.current?.click()}
      >
        Upload photo
      </Button>

      {/* Build info */}
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Car</p>
        <p className="text-sm font-medium">{build.car ?? "—"}</p>
        <div className="pt-1">
          <StatusPill status={build.status ?? "planning"} />
        </div>
      </div>

      {/* Vision data — shown when image has been analysed */}
      {build.vision_data && Object.keys(build.vision_data).length > 0 && (
        <VisionBadges vision={build.vision_data} />
      )}

      {/* Goals */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Goals</p>
        {(build.goals ?? []).map((goal, i) => {
          const count = build.parts.filter((p) => p.goal === goal).length
          return (
            <div key={goal} className="flex items-center gap-2">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: goalColour(i) }}
              />
              <span className="flex-1 truncate text-sm">{goal}</span>
              {count > 0 && (
                <span className="text-xs text-muted-foreground">{count}</span>
              )}
            </div>
          )
        })}

        {addingGoal ? (
          <div className="flex gap-1">
            <Input
              autoFocus
              value={newGoal}
              onChange={(e) => setNewGoal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddGoal()
                if (e.key === "Escape") { setAddingGoal(false); setNewGoal("") }
              }}
              placeholder="New goal…"
              className="h-7 text-xs"
            />
            <Button type="button" size="sm" className="h-7 px-2 text-xs" onClick={handleAddGoal}>
              Add
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAddingGoal(true)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            + Add another goal
          </button>
        )}
      </div>

      {/* Similar builds placeholder */}
      <div className="space-y-1 border-t border-border pt-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Similar builds</p>
        <a href="#" className="block text-xs text-brand hover:underline">2JZ E30 street build</a>
        <a href="#" className="block text-xs text-brand hover:underline">RB26 into 180SX</a>
      </div>
    </aside>
  )
}

// ── Centre panel ──────────────────────────────────────────────────────────

function StateBPanel({
  build,
  onPartsGenerated,
}: {
  build: BuildDetail
  onPartsGenerated: (updatedBuild: BuildDetail) => void
}) {
  const [generating, setGenerating] = React.useState(false)

  async function handleGenerate() {
    setGenerating(true)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error("Not signed in")
      const result = await generateParts(build.id, session.access_token)
      toast.success(`${result.parts_created} parts generated`)
      onPartsGenerated(result.build)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generation failed")
    } finally {
      setGenerating(false)
    }
  }

  return (
    <main className="flex flex-col items-center justify-center gap-6 p-8">
      <blockquote className="max-w-md rounded-xl border border-border bg-card px-6 py-4 text-sm italic text-foreground">
        &ldquo;{build.modification_goal}&rdquo;
      </blockquote>
      <Button
        type="button"
        disabled={generating}
        className="bg-brand text-white hover:bg-brand/90"
        onClick={handleGenerate}
      >
        {generating ? "Generating…" : "Generate parts list"}
      </Button>
      {generating && (
        <p className="text-xs text-muted-foreground">
          Building your parts list — this takes ~15 seconds.
        </p>
      )}
    </main>
  )
}

function CentrePanel({
  build,
  state,
  onPartsGenerated,
  onAdvisorOpen,
  onPartClick,
  advisorButtonRef,
  hasUnread,
}: {
  build: BuildDetail
  state: WorkspaceState
  onPartsGenerated: (updatedBuild: BuildDetail) => void
  onAdvisorOpen: () => void
  onPartClick?: (part: Part) => void
  advisorButtonRef: React.RefObject<HTMLButtonElement | null>
  hasUnread: boolean
}) {
  if (state === "A") {
    return (
      <main className="flex flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-secondary">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="size-6 text-muted-foreground">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l5.654-4.654m5.656-4.656 4.654-5.654a2.548 2.548 0 0 1 3.586 3.585l-5.654 4.655m-4.58 4.581-1.656-1.656M2.25 12 5 9.75M12 2.25 9.75 5M15.75 18.75 18 21M18.75 8.25 21 6" />
          </svg>
        </div>
        <h2 className="text-base font-semibold">No parts yet</h2>
        <p className="max-w-xs text-sm text-muted-foreground">
          Tell the advisor what you want to do — it will generate your parts list once it understands your goal.
        </p>
      </main>
    )
  }

  if (state === "B") {
    return <StateBPanel build={build} onPartsGenerated={onPartsGenerated} />
  }

  // State C — has parts
  const byGoal = (build.goals ?? []).map((goal, i) => ({
    goal,
    colour: goalColour(i),
    parts: build.parts.filter((p) => p.goal === goal),
    cost: build.parts
      .filter((p) => p.goal === goal)
      .reduce((sum, p) => sum + (p.price_estimate ?? 0), 0),
  }))

  const ungrouped = build.parts.filter((p) => !p.goal || !build.goals?.includes(p.goal))
  if (ungrouped.length > 0) {
    byGoal.push({ goal: "Other", colour: "#6B7280", parts: ungrouped, cost: ungrouped.reduce((sum, p) => sum + (p.price_estimate ?? 0), 0) })
  }

  const totalCost = build.parts.reduce((sum, p) => sum + (p.price_estimate ?? 0), 0)

  return (
    <main className="flex flex-col overflow-hidden relative">
      {/* Toolbar */}
      <div className="flex items-center gap-4 border-b border-border px-4 py-2">
        <button type="button" className="text-sm font-medium text-foreground border-b-2 border-brand pb-2">
          Parts list
        </button>
        <button type="button" className="text-sm text-muted-foreground hover:text-foreground pb-2">
          Cost summary
        </button>
        <button type="button" className="text-sm text-muted-foreground hover:text-foreground pb-2">
          Notes
        </button>
      </div>

      {/* Floating Ask Advisor Button */}
      <button
        ref={advisorButtonRef}
        onClick={onAdvisorOpen}
        style={{
          position: 'absolute',
          bottom: '68px',
          right: '20px',
          zIndex: 10,
          background: '#D97706',
          color: 'white',
          border: 'none',
          borderRadius: '99px',
          padding: '10px 18px',
          fontSize: '13px',
          fontWeight: 500,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontFamily: 'inherit',
        }}
        aria-label="Open advisor"
      >
        <svg width="16" height="16" viewBox="0 0 16 16"
             fill="none" stroke="white" strokeWidth="1.5"
             strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 10c0 .884-.716 1.6-1.6 1.6H4.8L2 14V4.6C2 3.716 2.716 3 3.6 3h8.8c.884 0 1.6.716 1.6 1.6V10z"/>
        </svg>
        <span>Ask advisor</span>
        {hasUnread && (
          <div style={{
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            background: 'white',
            border: '2px solid #D97706',
            position: 'absolute',
            top: '-3px',
            right: '-3px',
          }}/>
        )}
      </button>

      {/* Parts grouped by goal */}
      <div className="flex-1 overflow-y-auto">
        {byGoal.map(({ goal, colour, parts, cost }) => (
          <div key={goal}>
            <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-4 py-2">
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: colour }} />
              <span className="flex-1 text-sm font-medium">{goal}</span>
              <span className="text-xs text-muted-foreground">{parts.length} part{parts.length !== 1 ? "s" : ""}</span>
              {cost > 0 && <span className="text-xs text-muted-foreground">{formatCurrency(cost)}</span>}
            </div>
            {parts.map((part) => (
              <PartRow key={part.id} part={part} onPartClick={onPartClick} />
            ))}
          </div>
        ))}
      </div>

      {/* Cost bar */}
      <div className="flex items-center gap-6 border-t border-border bg-card px-4 py-3 text-sm">
        <span className="text-muted-foreground">{build.parts_total ?? build.parts.length} parts</span>
        <span className="font-medium">{formatCurrency(totalCost)}</span>
        <span className="text-muted-foreground">{build.parts_sourced ?? 0} sourced</span>
      </div>
    </main>
  )
}

function getCategoryColor(category?: string): string {
  switch (category?.toLowerCase()) {
    case "engine":
    case "drivetrain":
      return "#FEF3C7"
    case "electrical":
      return "#F0FDF4"
    case "cooling":
      return "#FEF3C7"
    case "safety":
      return "#FEF2F2"
    default:
      return "var(--color-background-secondary)"
  }
}

function CategoryIcon({ category }: { category?: string }) {
  const size = 16

  switch (category?.toLowerCase()) {
    case "engine":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="size-4">
          <rect x="3" y="3" width="18" height="18" rx="1" strokeWidth="1.5" />
          <path d="M7 9h10M7 12h10M7 15h6" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )
    case "electrical":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="size-4">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      )
    case "safety":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="size-4">
          <path d="M12 1L4 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-8-4z" strokeWidth="1.5" />
          <circle cx="12" cy="12" r="4" strokeWidth="1.5" fill="currentColor" />
        </svg>
      )
    case "drivetrain":
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className="size-4">
          <circle cx="7" cy="12" r="3" />
          <circle cx="17" cy="12" r="3" />
          <path d="M10 12h4" strokeWidth="1.5" stroke="currentColor" />
        </svg>
      )
    default:
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className="size-4">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
        </svg>
      )
  }
}

function PartRow({ part, onPartClick }: { part: Part; onPartClick?: (part: Part) => void }) {
  const [imageError, setImageError] = React.useState(false)
  const bgColor = getCategoryColor(part.category)

  const openVendor = () => {
    if (part.vendor_url) {
      window.open(part.vendor_url, "_blank")
    }
  }

  return (
    <div
      className="border-b border-border/50 px-4 py-2.5 hover:bg-muted/20 cursor-pointer"
      onClick={() => onPartClick?.(part)}
    >
      <div className="flex items-center gap-3">
        {/* Image or Category Icon */}
        <div
          className="size-10 shrink-0 rounded flex items-center justify-center border border-border/50 cursor-pointer hover:opacity-80"
          style={{ backgroundColor: imageError || !part.image_url ? bgColor : "transparent" }}
          onClick={openVendor}
          title={part.vendor_url ? "Click to view on vendor website" : "No vendor link"}
        >
          {!imageError && part.image_url ? (
            <img
              src={part.image_url}
              alt={part.name}
              className="size-full object-cover rounded"
              onError={() => setImageError(true)}
            />
          ) : (
            <CategoryIcon category={part.category} />
          )}
        </div>

        {/* Name and Description */}
        <div className="flex-1 min-w-0">
          <span className="block truncate text-sm font-medium">{part.name}</span>
          {part.description && (
            <p className="text-xs text-muted-foreground line-clamp-1">{part.description}</p>
          )}
        </div>

        {/* Status */}
        <PartStatusPill status={part.status} />

        {/* Price */}
        {part.price_estimate != null && (
          <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">
            {formatCurrency(part.price_estimate)}
          </span>
        )}

        {/* Safety Flag */}
        {part.is_safety_critical && (
          <span title="Safety critical" className="shrink-0 text-red-500">
            <svg viewBox="0 0 20 20" fill="currentColor" className="size-3.5">
              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
            </svg>
          </span>
        )}
      </div>

      {/* Notes */}
      {part.notes && (
        <p className="mt-0.5 text-xs text-amber-700 line-clamp-1">
          <span className="font-medium">Note: </span>{part.notes}
        </p>
      )}
    </div>
  )
}

// ── Right panel (Advisor) ─────────────────────────────────────────────────


// ── Root ──────────────────────────────────────────────────────────────────

export function BuildWorkspace({ build: initialBuild }: { build: BuildDetail }) {
  const [build, setBuild] = React.useState(initialBuild)
  const [advisorOpen, setAdvisorOpen] = React.useState(false)
  const [hasUnread, setHasUnread] = React.useState(true)
  const [selectedPart, setSelectedPart] = React.useState<Part | null>(null)
  const [partDrawerOpen, setPartDrawerOpen] = React.useState(false)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  const advisorButtonRef = React.useRef<HTMLButtonElement>(null)
  const state = getState(build)

  function handleImageUploaded(url: string) {
    setBuild((prev) => ({ ...prev, image_url: url }))
  }

  function handlePartsGenerated(updatedBuild: BuildDetail) {
    setBuild(updatedBuild)
  }

  function openAdvisor() {
    setAdvisorOpen(true)
    setHasUnread(false)
    setTimeout(() => textareaRef.current?.focus(), 260)
  }

  function closeAdvisor() {
    setAdvisorOpen(false)
    setTimeout(() => advisorButtonRef.current?.focus(), 260)
  }

  function openPartDetail(part: Part) {
    setSelectedPart(part)
    setPartDrawerOpen(true)
  }

  function closePartDetail() {
    setPartDrawerOpen(false)
    setSelectedPart(null)
  }

  function handlePartOrdered(updatedPart: Part) {
    setBuild((prev) => ({
      ...prev,
      parts: prev.parts.map((p) => (p.id === updatedPart.id ? updatedPart : p)),
    }))
  }

  React.useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && advisorOpen) {
        closeAdvisor()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [advisorOpen])

  return (
    <>
      <div className="grid h-screen grid-cols-[200px_1fr] overflow-hidden">
        <LeftPanel build={build} onImageUploaded={handleImageUploaded} />
        <CentrePanel
          build={build}
          state={state}
          onPartsGenerated={handlePartsGenerated}
          onAdvisorOpen={openAdvisor}
          onPartClick={openPartDetail}
          advisorButtonRef={advisorButtonRef}
          hasUnread={hasUnread}
        />
      </div>

      {/* Backdrop */}
      {advisorOpen && (
        <div
          onClick={closeAdvisor}
          aria-hidden="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.25)',
            zIndex: 40,
            animation: 'fadeIn 200ms ease'
          }}
        />
      )}

      {/* Drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Build advisor"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          height: '100vh',
          width: 'min(420px, 100vw)',
          background: 'var(--color-background-primary, white)',
          borderLeft: '0.5px solid var(--color-border-tertiary)',
          zIndex: 50,
          display: 'flex',
          flexDirection: 'column',
          transform: advisorOpen
            ? 'translateX(0)'
            : 'translateX(100%)',
          transition: 'transform 250ms ease-out',
        }}
      >
        {/* Drawer header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '12px 16px',
          borderBottom: '0.5px solid var(--color-border-tertiary)',
          flexShrink: 0,
        }}>
          <div style={{
            width: '7px', height: '7px',
            borderRadius: '50%',
            background: 'var(--color-text-success)',
            flexShrink: 0,
          }}/>
          <span style={{
            fontSize: '14px',
            fontWeight: 500,
            color: 'var(--color-text-primary)',
          }}>
            Advisor
          </span>
          <span style={{
            fontSize: '11px',
            color: 'var(--color-text-tertiary)',
            marginLeft: 'auto',
            marginRight: '8px',
          }}>
            {build.parts.length > 0
              ? `${build.parts.length} parts loaded`
              : build.modification_goal
              ? 'goal set'
              : 'waiting for goal'}
          </span>
          <button
            onClick={closeAdvisor}
            aria-label="Close advisor"
            style={{
              width: '28px',
              height: '28px',
              border: '0.5px solid var(--color-border-secondary)',
              borderRadius: '7px',
              background: 'transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '16px',
              color: 'var(--color-text-secondary)',
              fontFamily: 'inherit',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Context pill */}
        <div style={{
          margin: '10px 14px 0',
          padding: '8px 11px',
          background: 'var(--color-background-secondary)',
          borderRadius: '8px',
          border: '0.5px solid var(--color-border-tertiary)',
          flexShrink: 0,
        }}>
          <div style={{
            fontSize: '12px',
            fontWeight: 500,
            color: 'var(--color-text-primary)',
          }}>
            {build.car ?? 'Car not set'}
            {(build.goals?.length ?? 0) > 0
              ? ` · ${build.goals?.length} goals`
              : ''}
          </div>
          {(build.goals?.length ?? 0) > 0 && (
            <div style={{
              fontSize: '11px',
              color: 'var(--color-text-tertiary)',
              marginTop: '2px',
            }}>
              {(build.goals ?? []).slice(0, 3).join(' · ')}
            </div>
          )}
        </div>

        {/* Messages — scrollable */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}>
          {/* Opening message based on build state */}
          <div style={{
            background: 'var(--color-background-secondary)',
            borderRadius: '4px 12px 12px 12px',
            padding: '10px 14px',
            fontSize: '13px',
            color: 'var(--color-text-primary)',
            lineHeight: 1.6,
            maxWidth: '88%',
          }}>
            {build.parts.length > 0
              ? `Your parts list is ready — ${build.parts.length} parts across ${build.goals?.length ?? 1} goal${(build.goals?.length ?? 1) > 1 ? 's' : ''}. What do you need help with?`
              : build.modification_goal
              ? `You want to ${build.modification_goal}. Ready to generate your parts list when you are.`
              : `I can see you're working on your ${build.car ?? 'build'}. What are you looking to do with it?`
            }
          </div>

          {/* Safety flag message if parts have safety items */}
          {build.parts.some(p => p.is_safety_critical) && (
            <div style={{
              background: 'var(--color-background-warning)',
              border: '0.5px solid var(--color-border-warning)',
              borderRadius: '4px 12px 12px 12px',
              padding: '10px 14px',
              fontSize: '13px',
              color: 'var(--color-text-warning)',
              lineHeight: 1.6,
              maxWidth: '88%',
            }}>
              <div style={{
                fontSize: '10px',
                fontWeight: 500,
                marginBottom: '3px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}>
                Safety flags
              </div>
              {build.parts.filter(p => p.is_safety_critical).length} safety-critical items in your build.
              Review these before starting work.
            </div>
          )}
        </div>

        {/* Suggestion chips */}
        {build.parts.length > 0 && (
          <div style={{
            padding: '6px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '5px',
            flexShrink: 0,
          }}>
            {[
              'What should I do first?',
              'Find a mechanic near me',
              'Which parts can I source locally?',
              'What is the total timeline?',
            ].map(chip => (
              <button
                key={chip}
                style={{
                  padding: '8px 11px',
                  background: 'var(--color-background-secondary)',
                  border: '0.5px solid var(--color-border-tertiary)',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontFamily: 'inherit',
                  lineHeight: 1.4,
                }}
                onClick={() => {
                  const ta = textareaRef.current
                  if (ta) {
                    ta.value = chip
                    ta.focus()
                  }
                }}
              >
                {chip}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div style={{
          padding: '10px 14px 16px',
          borderTop: '0.5px solid var(--color-border-tertiary)',
          flexShrink: 0,
        }}>
          <div style={{
            display: 'flex',
            gap: '8px',
            alignItems: 'flex-end',
            background: 'var(--color-background-secondary)',
            border: '0.5px solid var(--color-border-tertiary)',
            borderRadius: '10px',
            padding: '9px 12px',
          }}>
            <textarea
              ref={textareaRef}
              placeholder="Ask about your build..."
              rows={1}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                fontSize: '13px',
                color: 'var(--color-text-primary)',
                fontFamily: 'inherit',
                outline: 'none',
                resize: 'none',
                minHeight: '20px',
                maxHeight: '100px',
                lineHeight: 1.5,
              }}
              onInput={e => {
                const t = e.currentTarget
                t.style.height = 'auto'
                t.style.height = t.scrollHeight + 'px'
              }}
            />
            <button
              style={{
                width: '28px',
                height: '28px',
                background: '#D97706',
                border: 'none',
                borderRadius: '7px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
              aria-label="Send message"
            >
              <svg width="12" height="12" viewBox="0 0 14 14"
                   fill="none" stroke="white"
                   strokeWidth="2.2" strokeLinecap="round"
                   strokeLinejoin="round">
                <line x1="13" y1="1" x2="6" y2="8"/>
                <polygon points="13 1 8 13 6 8 1 6 13 1"
                         fill="white" stroke="none"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0 }
          to { opacity: 1 }
        }
      `}</style>

      <PartDetailDrawer
        part={selectedPart}
        buildId={build.id}
        open={partDrawerOpen}
        onClose={closePartDetail}
        onOrdered={handlePartOrdered}
      />
    </>
  )
}
