"use client"

import * as React from "react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { updateBuild, uploadBuildImage } from "@/lib/api/builds"
import type { BuildDetail, Part } from "@/lib/api/builds"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

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
      toast.success("Photo uploaded.")
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
      await updateBuild(build.id, { goals: [...build.goals, trimmed] }, session.access_token)
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
        <img
          src={build.image_url}
          alt={build.title}
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

function CentrePanel({ build, state }: { build: BuildDetail; state: WorkspaceState }) {
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
    return (
      <main className="flex flex-col items-center justify-center gap-6 p-8">
        <blockquote className="max-w-md rounded-xl border border-border bg-card px-6 py-4 text-sm italic text-foreground">
          &ldquo;{build.modification_goal}&rdquo;
        </blockquote>
        <Button
          type="button"
          className="bg-brand text-white hover:bg-brand/90"
          onClick={() => toast.info("Generation coming soon")}
        >
          Generate parts list
        </Button>
      </main>
    )
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
    <main className="flex flex-col overflow-hidden">
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
              <PartRow key={part.id} part={part} />
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

function PartRow({ part }: { part: Part }) {
  return (
    <div className="flex items-center gap-3 border-b border-border/50 px-4 py-2.5 hover:bg-muted/20">
      <span className="flex-1 truncate text-sm">{part.name}</span>
      <PartStatusPill status={part.status} />
      {part.price_estimate != null && (
        <span className="w-16 text-right text-xs text-muted-foreground">
          {formatCurrency(part.price_estimate)}
        </span>
      )}
      {part.is_safety_critical && (
        <span title="Safety critical" className="text-red-500">
          <svg viewBox="0 0 20 20" fill="currentColor" className="size-3.5">
            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
          </svg>
        </span>
      )}
    </div>
  )
}

// ── Right panel (Advisor) ─────────────────────────────────────────────────

function AdvisorPanel({ build, state }: { build: BuildDetail; state: WorkspaceState }) {
  const [input, setInput] = React.useState("")

  const message =
    state === "A"
      ? `I can see you're working on your ${build.car ?? "build"}. What are you looking to do with it?`
      : state === "B"
      ? `You want to ${build.modification_goal}. Ready to generate your parts list when you are.`
      : `Your parts list is ready — ${build.parts_total ?? build.parts.length} parts across ${(build.goals ?? []).length} goals.`

  const chips: string[] =
    state === "A"
      ? []
      : state === "B"
      ? ["Tell me more about this build", "Generate now"]
      : ["What should I do first?", "Find a mechanic in Nairobi", "What's the total timeline?"]

  return (
    <aside className="flex flex-col border-l border-border">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span className="size-2 rounded-full bg-emerald-500" />
        <span className="text-sm font-semibold">Advisor</span>
        <span className="ml-auto text-xs text-muted-foreground truncate">
          {build.car ?? build.title}
        </span>
      </div>

      {/* Context pill */}
      <div className="px-4 py-2">
        <span className="inline-flex max-w-full truncate rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
          {(build.goals ?? []).slice(0, 2).join(" · ")}
          {(build.goals ?? []).length > 2 && ` +${(build.goals ?? []).length - 2}`}
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        <div className="rounded-xl bg-muted px-3 py-2.5 text-sm text-foreground">
          {message}
        </div>

        {chips.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {chips.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => toast.info("Advisor streaming coming soon")}
                className="rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground hover:border-brand/60 hover:text-foreground transition-colors"
              >
                {chip}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border p-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                toast.info("Advisor streaming coming soon")
                setInput("")
              }
            }}
            placeholder="Ask about your build…"
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <Button
            type="button"
            size="sm"
            className="bg-brand text-white hover:bg-brand/90 shrink-0"
            onClick={() => {
              toast.info("Advisor streaming coming soon")
              setInput("")
            }}
          >
            Send
          </Button>
        </div>
      </div>
    </aside>
  )
}

// ── Root ──────────────────────────────────────────────────────────────────

export function BuildWorkspace({ build: initialBuild }: { build: BuildDetail }) {
  const [imageUrl, setImageUrl] = React.useState(initialBuild.image_url)
  const build = { ...initialBuild, image_url: imageUrl }
  const state = getState(build)

  return (
    <div className="grid h-screen grid-cols-[200px_1fr_256px] overflow-hidden">
      <LeftPanel build={build} onImageUploaded={setImageUrl} />
      <CentrePanel build={build} state={state} />
      <AdvisorPanel build={build} state={state} />
    </div>
  )
}
