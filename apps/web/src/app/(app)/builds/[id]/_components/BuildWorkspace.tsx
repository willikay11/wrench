"use client"

import * as React from "react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { uploadBuildImage } from "@/lib/api/builds"
import type { BuildDetail, Part } from "@/lib/api/builds"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { PartDetailDrawer } from "./PartDetailDrawer"

const GOAL_COLOURS = ["#D97706", "#3B8BD4", "#1D9E75", "#9333EA", "#DC2626"]

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  planning: { label: "Planning", className: "bg-amber-100 text-amber-800" },
  in_progress: { label: "In progress", className: "bg-blue-100 text-blue-800" },
  complete: { label: "Complete", className: "bg-emerald-100 text-emerald-800" },
}

const PART_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  needed: { label: "Needed", className: "bg-slate-100 text-slate-700" },
  ordered: { label: "Ordered", className: "bg-yellow-100 text-yellow-700" },
  sourced: { label: "Sourced", className: "bg-blue-100 text-blue-700" },
  installed: { label: "Installed", className: "bg-emerald-100 text-emerald-700" },
}

function goalColour(index: number) {
  return GOAL_COLOURS[index % GOAL_COLOURS.length]
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
    <span style={{ padding: "3px 8px", fontSize: "11px" }} className={cn("rounded-full font-medium", cfg.className)}>
      {cfg.label}
    </span>
  )
}

function DetailPaneOverview({
  build,
  onImageUpload,
}: {
  build: BuildDetail
  onImageUpload: (url: string) => void
}) {
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error("Not signed in")
      const { image_url } = await uploadBuildImage(build.id, file, session.access_token)
      onImageUpload(image_url)
      toast.success("Photo uploaded — analysing…")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed")
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  return (
    <div style={{ padding: "20px", overflowY: "auto", height: "100%", background: "var(--color-background-primary)", borderLeft: "0.5px solid var(--color-border-tertiary)" }}>
      {/* Image */}
      {build.image_url && (
        <div style={{ marginBottom: "16px" }}>
          <img
            src={build.image_url}
            alt={build.title}
            style={{
              width: "100%",
              aspectRatio: "16/9",
              objectFit: "cover",
              borderRadius: "8px",
              display: "block",
              border: "0.5px solid var(--color-border-tertiary)",
            }}
          />
        </div>
      )}

      {/* Check if vision analysis succeeded */}
      {(() => {
        const visionFailed =
          !build.vision_data ||
          build.vision_data.summary === "Could not analyse image" ||
          build.vision_data.summary === "Image uploaded" ||
          build.vision_data.summary === "" ||
          (build.vision_data?.extracted?.notes?.includes("Expecting value") ?? false) ||
          (build.vision_data?.extracted?.notes?.includes("Analysis failed") ?? false)

        return (
          <>
            {!visionFailed && build.vision_data && (
              <div style={{ marginBottom: "20px" }}>

          <div style={{
            fontSize: "11px",
            fontWeight: 500,
            color: "var(--color-text-tertiary)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            marginBottom: "6px",
          }}>
            AI found in this image
          </div>
          <div style={{
            fontSize: "15px",
            fontWeight: 500,
            color: "var(--color-text-primary)",
            marginBottom: "10px",
          }}>
            {build.vision_data.summary}
          </div>

          {/* Car image type */}
          {build.vision_data.image_type === "car" && build.vision_data.extracted.make && (
            <div style={{
              display: "flex",
              flexDirection: "column",
              gap: "4px",
              marginBottom: "10px",
            }}>
              {[
                { label: "Make", value: build.vision_data.extracted.make, conf: build.vision_data.extracted.confidence },
                { label: "Model", value: build.vision_data.extracted.model },
                { label: "Year", value: build.vision_data.extracted.year },
              ].filter(r => r.value).map(row => (
                <div key={row.label} style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "5px 0",
                  borderBottom: "0.5px solid var(--color-border-tertiary)",
                  fontSize: "13px",
                }}>
                  <span style={{ color: "var(--color-text-secondary)" }}>
                    {row.label}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ fontWeight: 500, color: "var(--color-text-primary)" }}>
                      {row.value}
                    </span>
                    {row.conf && (
                      <span style={{
                        fontSize: "10px",
                        padding: "1px 6px",
                        borderRadius: "99px",
                        background: "var(--color-background-success)",
                        color: "var(--color-text-success)",
                        fontWeight: 500,
                      }}>
                        {row.conf}%
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Rims / part image type */}
          {(["rims", "part"] as const).includes(build.vision_data.image_type as "rims" | "part") && (
            <div style={{ marginBottom: "10px" }}>
              {build.vision_data.extracted.part_name && (
                <div style={{
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "var(--color-text-primary)",
                  marginBottom: "8px",
                }}>
                  {build.vision_data.extracted.part_name}
                </div>
              )}
              {build.vision_data.extracted.specifications && (
                <div style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0",
                }}>
                  {Object.entries(build.vision_data.extracted.specifications).map(([key, val]) => (
                    <div key={key} style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "5px 0",
                      borderBottom: "0.5px solid var(--color-border-tertiary)",
                      fontSize: "13px",
                    }}>
                      <span style={{ color: "var(--color-text-secondary)", textTransform: "capitalize" }}>
                        {key.replace(/_/g, " ")}
                      </span>
                      <span style={{ fontWeight: 500, color: "var(--color-text-primary)" }}>
                        {String(val)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Mods detected */}
          {(build.vision_data.extracted.mods_detected ?? []).length > 0 && (
            <div style={{ marginBottom: "10px" }}>
              <div style={{
                fontSize: "11px",
                color: "var(--color-text-tertiary)",
                marginBottom: "5px",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                fontWeight: 500,
              }}>
                Detected mods
              </div>
              {build.vision_data.extracted.mods_detected.map((mod: string) => (
                <div key={mod} style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "3px 0",
                  fontSize: "12px",
                  color: "var(--color-text-secondary)",
                }}>
                  <div style={{
                    width: "4px",
                    height: "4px",
                    borderRadius: "50%",
                    background: "#D97706",
                    flexShrink: 0,
                  }} />
                  {mod}
                </div>
              ))}
            </div>
          )}

          {/* AI note */}
          {build.vision_data.extracted.notes && (
            <div style={{
              background: "#FEF3C7",
              border: "0.5px solid #FDE68A",
              borderRadius: "8px",
              padding: "10px 12px",
              fontSize: "12px",
              color: "#92400E",
              lineHeight: 1.6,
            }}>
              <div style={{
                fontSize: "10px",
                fontWeight: 500,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: "3px",
                color: "#B45309",
              }}>
                AI note
              </div>
              {build.vision_data.extracted.notes}
            </div>
          )}
              </div>
            )}

            {/* Analysis failed but image exists */}
            {visionFailed && build.image_url && (
              <div style={{
                padding: "10px 12px",
                background: "var(--color-background-secondary)",
                borderRadius: "8px",
                marginBottom: "16px",
                fontSize: "12px",
                color: "var(--color-text-secondary)",
              }}>
                Photo uploaded — analysis will run when you regenerate parts
              </div>
            )}
          </>
        )
      })()}

      {/* No image — upload prompt */}
      {!build.image_url && (
        <div
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: "0.5px dashed var(--color-border-secondary)",
            borderRadius: "10px",
            padding: "20px",
            textAlign: "center",
            marginBottom: "20px",
            cursor: "pointer",
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="Upload build photo"
            className="sr-only"
            onChange={handleFileChange}
          />
          <div style={{
            fontSize: "13px",
            fontWeight: 500,
            color: "var(--color-text-primary)",
            marginBottom: "4px",
          }}>
            Add a reference photo
          </div>
          <div style={{
            fontSize: "12px",
            color: "var(--color-text-tertiary)",
            lineHeight: 1.5,
          }}>
            Upload a photo of your target rims, inspiration build, or engine bay — Wrench will use it to refine your parts list
          </div>
        </div>
      )}

      {/* Build stats grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "8px",
      }}>
        {[
          { label: "Total parts", value: build.parts?.length ?? 0 },
          { label: "Safety items", value: build.parts?.filter(p => p.is_safety_critical).length ?? 0, danger: true },
          { label: "Est. spend", value: `$${(build.parts?.reduce((sum, p) => sum + (p.price_estimate ?? 0), 0) ?? 0).toLocaleString()}` },
          { label: "Goals", value: build.goals?.length ?? 0 },
        ].map(stat => (
          <div key={stat.label} style={{
            background: "var(--color-background-secondary)",
            borderRadius: "8px",
            padding: "12px 14px",
          }}>
            <div style={{
              fontSize: "11px",
              color: "var(--color-text-tertiary)",
              marginBottom: "4px",
            }}>
              {stat.label}
            </div>
            <div style={{
              fontSize: "20px",
              fontWeight: 500,
              color: (stat as any).danger && Number(stat.value) > 0 ? "var(--color-text-danger)" : "var(--color-text-primary)",
            }}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function PartRow({
  part,
  isSelected,
  onSelect,
  getGoalColour,
  build,
}: {
  part: Part
  isSelected: boolean
  onSelect: (part: Part) => void
  getGoalColour: (goalName: string | null) => string
  build: BuildDetail
}) {
  const lowestPrice = part.vendors?.length
    ? Math.min(...part.vendors.map((v) => v.price ?? Infinity).filter(p => p !== Infinity))
    : null

  return (
    <div
      onClick={() => onSelect(part)}
      style={{
        display: "grid",
        gridTemplateColumns: "3px 1fr 80px 72px",
        alignItems: "stretch",
        borderBottom: "0.5px solid var(--color-border-tertiary)",
        cursor: "pointer",
        background: isSelected ? "#FEF3C7" : "transparent",
        transition: "background 0.1s",
      }}
      onMouseEnter={(e) => {
        if (!isSelected) {
          (e.currentTarget as HTMLElement).style.background = "var(--color-background-secondary)"
        }
      }}
      onMouseLeave={(e) => {
        if (!isSelected) {
          (e.currentTarget as HTMLElement).style.background = "transparent"
        }
      }}
    >
      {/* Colour bar — goal colour */}
      <div style={{
        background: getGoalColour(part.goal),
        width: "3px",
        alignSelf: "stretch",
      }} />

      {/* Name + vendor hint */}
      <div style={{
        padding: "10px 12px",
        minWidth: 0,
        overflow: "hidden",
      }}>
        <div style={{
          fontSize: "13px",
          fontWeight: 500,
          color: "var(--color-text-primary)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}>
          {part.name}
        </div>
        {part.vendors && part.vendors.length > 0 && lowestPrice && (
          <div style={{
            fontSize: "11px",
            color: "#D97706",
            fontWeight: 500,
            marginTop: "2px",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}>
            {part.vendors.length} vendor{part.vendors.length > 1 ? "s" : ""} · from ${lowestPrice.toLocaleString()}
          </div>
        )}
      </div>

      {/* Status pill */}
      <div style={{
        padding: "10px 8px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        <PartStatusPill status={part.status} />
      </div>

      {/* Price + Safety indicator */}
      <div style={{
        padding: "10px 14px 10px 0",
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        fontSize: "13px",
        fontWeight: 500,
        color: "var(--color-text-primary)",
        whiteSpace: "nowrap",
      }}>
        {part.price_estimate ? `$${part.price_estimate.toLocaleString()}` : "—"}
        {part.is_safety_critical && (
          <div style={{
            width: "16px",
            height: "16px",
            borderRadius: "50%",
            background: "var(--color-background-danger)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginLeft: "6px",
            flexShrink: 0,
          }}>
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="var(--color-text-danger)" strokeWidth="2" strokeLinecap="round">
              <path d="M4 1.5v2M4 5.5v.5" />
            </svg>
          </div>
        )}
      </div>
    </div>
  )
}

export function BuildWorkspace({ build: initialBuild }: { build: BuildDetail }) {
  const [build, setBuild] = React.useState(initialBuild)
  const [selectedPart, setSelectedPart] = React.useState<Part | null>(null)
  const [filter, setFilter] = React.useState<"all" | "needed" | "safety" | "sourced">("all")
  const [search, setSearch] = React.useState("")
  const advisorButtonRef = React.useRef<HTMLButtonElement>(null)
  const [advisorOpen, setAdvisorOpen] = React.useState(false)
  const [hasUnread, setHasUnread] = React.useState(true)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)

  const getGoalColour = (goalName: string | null): string => {
    if (!goalName) return "#D97706"
    const goals = build.goals ?? []
    const idx = goals.indexOf(goalName)
    return GOAL_COLOURS[idx >= 0 ? idx % GOAL_COLOURS.length : 0]
  }

  const filteredParts = build.parts.filter((part) => {
    const matchesSearch =
      search === "" || part.name.toLowerCase().includes(search.toLowerCase())
    const matchesFilter =
      filter === "all"
        ? true
        : filter === "needed"
        ? part.status === "needed"
        : filter === "safety"
        ? part.is_safety_critical
        : filter === "sourced"
        ? ["sourced", "installed"].includes(part.status)
        : true
    return matchesSearch && matchesFilter
  })

  const partsByGoal = (build.goals ?? []).map((goal, i) => {
    const parts = filteredParts.filter((p) => p.goal === goal)
    return {
      goal,
      colour: goalColour(i),
      parts,
      cost: parts.reduce((sum, p) => sum + (p.price_estimate ?? 0), 0),
    }
  })

  const ungrouped = filteredParts.filter((p) => !p.goal || !build.goals?.includes(p.goal))
  if (ungrouped.length > 0) {
    partsByGoal.push({
      goal: "Other",
      colour: "#6B7280",
      parts: ungrouped,
      cost: ungrouped.reduce((sum, p) => sum + (p.price_estimate ?? 0), 0),
    })
  }

  const totalCost = build.parts.reduce((sum, p) => sum + (p.price_estimate ?? 0), 0)
  const safetyCount = build.parts.filter((p) => p.is_safety_critical).length

  function handleImageUploaded(url: string) {
    setBuild((prev) => ({ ...prev, image_url: url }))
  }

  function handlePartOrdered(updatedPart: Part) {
    setBuild((prev) => ({
      ...prev,
      parts: prev.parts.map((p) => (p.id === updatedPart.id ? updatedPart : p)),
    }))
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

  React.useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape" && advisorOpen) {
        closeAdvisor()
      }
    }
    document.addEventListener("keydown", handleKey)
    return () => document.removeEventListener("keydown", handleKey)
  }, [advisorOpen])

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", height: "100vh", backgroundColor: "var(--color-background-primary)" }}>
        {/* Topbar */}
        <div style={{
          padding: "12px 20px",
          borderBottom: "0.5px solid var(--color-border-secondary)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "20px",
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "16px", fontWeight: 600, marginBottom: "4px" }}>
              {build.title}
            </div>
            <div style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>
              {build.car} · {build.modification_goal || "No goal set"} ·{" "}
              {build.goals?.length ?? 0} goal{(build.goals?.length ?? 0) !== 1 ? "s" : ""}
            </div>
          </div>

          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <StatusPill status={build.status ?? "planning"} />
            {[
              { label: `$${Math.round(totalCost / 1000)}K`, value: "Est." },
              { label: `${build.parts.length}`, value: "Parts" },
              { label: `${build.parts_sourced ?? 0}`, value: "Sourced" },
            ].map(({ label, value }) => (
              <div
                key={label}
                style={{
                  padding: "4px 10px",
                  border: "0.5px solid var(--color-border-secondary)",
                  borderRadius: "99px",
                  fontSize: "12px",
                  whiteSpace: "nowrap",
                }}
              >
                <span style={{ color: "var(--color-text-secondary)", fontSize: "10px" }}>
                  {value}
                </span>{" "}
                {label}
              </div>
            ))}
            {safetyCount > 0 && (
              <div
                style={{
                  padding: "4px 10px",
                  border: "0.5px solid var(--color-border-danger)",
                  background: "var(--color-background-danger)",
                  color: "var(--color-text-danger)",
                  borderRadius: "99px",
                  fontSize: "12px",
                  fontWeight: 500,
                }}
              >
                {safetyCount} Safety
              </div>
            )}
          </div>
        </div>

        {/* Main content */}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 340px", flex: 1, overflow: "hidden", gap: 0 }}>
          {/* Left column: Parts list */}
          <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", borderRight: "0.5px solid var(--color-border-secondary)" }}>
            {/* Search */}
            <div style={{ padding: "12px 16px", borderBottom: "0.5px solid var(--color-border-secondary)", flexShrink: 0 }}>
              <Input
                placeholder="Filter parts..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ height: "36px", fontSize: "13px" }}
              />
            </div>

            {/* Filter pills */}
            <div style={{ padding: "8px 12px", display: "flex", gap: "6px", borderBottom: "0.5px solid var(--color-border-secondary)", flexShrink: 0, overflowX: "auto" }}>
              {(["all", "needed", "safety", "sourced"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "99px",
                    border: "0.5px solid var(--color-border-secondary)",
                    fontSize: "11px",
                    fontWeight: 500,
                    cursor: "pointer",
                    background: filter === f ? "#FEF3C7" : "transparent",
                    color: filter === f ? "#D97706" : "var(--color-text-secondary)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {f === "all"
                    ? "All"
                    : f === "needed"
                    ? "Needed"
                    : f === "safety"
                    ? "Safety"
                    : "Sourced"}
                </button>
              ))}
            </div>

            {/* Parts list */}
            <div style={{ flex: 1, overflowY: "auto", position: "relative" }}>
              {filteredParts.length === 0 ? (
                <div style={{
                  padding: "40px 20px",
                  textAlign: "center",
                  color: "var(--color-text-tertiary)",
                  fontSize: "13px",
                }}>
                  No parts match this filter
                </div>
              ) : (
                partsByGoal.map(({ goal, colour, parts }) => (
                  <div key={goal}>
                    {parts.length > 0 && (
                      <>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            padding: "10px 20px",
                            background: "var(--color-background-tertiary)",
                            borderBottom: "0.5px solid var(--color-border-secondary)",
                            fontSize: "13px",
                            fontWeight: 500,
                            position: "sticky",
                            top: 0,
                            zIndex: 1,
                          }}
                        >
                          <span
                            style={{
                              width: "2px",
                              height: "16px",
                              background: colour,
                              borderRadius: "1px",
                            }}
                          />
                          <span style={{ flex: 1 }}>{goal}</span>
                          <span style={{ fontSize: "11px", color: "var(--color-text-tertiary)" }}>
                            {parts.length} part{parts.length !== 1 ? "s" : ""}
                          </span>
                        </div>
                        {parts.map((part) => (
                          <PartRow
                            key={part.id}
                            part={part}
                            isSelected={selectedPart?.id === part.id}
                            onSelect={(p) => setSelectedPart(p)}
                            getGoalColour={getGoalColour}
                            build={build}
                          />
                        ))}
                      </>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Floating advisor button */}
            <button
              ref={advisorButtonRef}
              onClick={openAdvisor}
              style={{
                position: "absolute",
                bottom: "20px",
                right: "20px",
                background: "#D97706",
                color: "white",
                border: "none",
                borderRadius: "99px",
                padding: "10px 18px",
                fontSize: "13px",
                fontWeight: 500,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontFamily: "inherit",
                boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
              }}
              aria-label="Open advisor"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 10c0 .884-.716 1.6-1.6 1.6H4.8L2 14V4.6C2 3.716 2.716 3 3.6 3h8.8c.884 0 1.6.716 1.6 1.6V10z" />
              </svg>
              <span>Ask advisor</span>
              {hasUnread && (
                <div style={{
                  width: "10px",
                  height: "10px",
                  borderRadius: "50%",
                  background: "white",
                  border: "2px solid #D97706",
                  position: "absolute",
                  top: "-3px",
                  right: "-3px",
                }} />
              )}
            </button>
          </div>

          {/* Right column: Detail pane */}
          <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--color-background-primary)" }}>
            {selectedPart ? (
              <>
                <div style={{ padding: "16px", borderBottom: "0.5px solid var(--color-border-secondary)", flexShrink: 0 }}>
                  <button
                    onClick={() => setSelectedPart(null)}
                    style={{
                      fontSize: "13px",
                      color: "var(--color-text-secondary)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: 0,
                      fontFamily: "inherit",
                      marginBottom: "8px",
                    }}
                  >
                    ← Back to overview
                  </button>
                  <div style={{ fontSize: "16px", fontWeight: 600, marginBottom: "4px" }}>
                    {selectedPart.name}
                  </div>
                  {selectedPart.description && (
                    <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginBottom: "8px" }}>
                      {selectedPart.description}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    {selectedPart.is_safety_critical && (
                      <span style={{
                        padding: "2px 8px",
                        background: "var(--color-background-danger)",
                        color: "var(--color-text-danger)",
                        borderRadius: "4px",
                        fontSize: "11px",
                        fontWeight: 500,
                      }}>
                        Safety critical
                      </span>
                    )}
                    {selectedPart.goal && (
                      <span style={{
                        padding: "2px 8px",
                        background: "var(--color-background-secondary)",
                        borderRadius: "4px",
                        fontSize: "11px",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                      }}>
                        <span style={{
                          width: "6px",
                          height: "6px",
                          borderRadius: "50%",
                          background: goalColour((build.goals ?? []).indexOf(selectedPart.goal)),
                        }} />
                        {selectedPart.goal}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ flex: 1, overflowY: "auto" }}>
                  <PartDetailDrawer
                    part={selectedPart}
                    buildId={build.id}
                    open={true}
                    onClose={() => setSelectedPart(null)}
                    onOrdered={handlePartOrdered}
                  />
                </div>
              </>
            ) : (
              <DetailPaneOverview build={build} onImageUpload={handleImageUploaded} />
            )}
          </div>
        </div>
      </div>

      {/* Advisor drawer */}
      {advisorOpen && (
        <div
          onClick={closeAdvisor}
          aria-hidden="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.25)",
            zIndex: 40,
            animation: "fadeIn 200ms ease",
          }}
        />
      )}

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Build advisor"
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          height: "100vh",
          width: "min(420px, 100vw)",
          background: "var(--color-background-primary)",
          borderLeft: "0.5px solid var(--color-border-tertiary)",
          zIndex: 50,
          display: "flex",
          flexDirection: "column",
          transform: advisorOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 250ms ease-out",
        }}
      >
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "12px 16px",
          borderBottom: "0.5px solid var(--color-border-tertiary)",
          flexShrink: 0,
        }}>
          <div style={{
            width: "7px",
            height: "7px",
            borderRadius: "50%",
            background: "var(--color-text-success)",
            flexShrink: 0,
          }} />
          <span style={{
            fontSize: "14px",
            fontWeight: 500,
            color: "var(--color-text-primary)",
          }}>
            Advisor
          </span>
          <span style={{
            fontSize: "11px",
            color: "var(--color-text-tertiary)",
            marginLeft: "auto",
            marginRight: "8px",
          }}>
            {build.parts.length > 0
              ? `${build.parts.length} parts loaded`
              : build.modification_goal
              ? "goal set"
              : "waiting for goal"}
          </span>
          <button
            onClick={closeAdvisor}
            aria-label="Close advisor"
            style={{
              width: "28px",
              height: "28px",
              border: "0.5px solid var(--color-border-secondary)",
              borderRadius: "7px",
              background: "transparent",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "16px",
              color: "var(--color-text-secondary)",
              fontFamily: "inherit",
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <div style={{
          margin: "10px 14px 0",
          padding: "8px 11px",
          background: "var(--color-background-secondary)",
          borderRadius: "8px",
          border: "0.5px solid var(--color-border-tertiary)",
          flexShrink: 0,
        }}>
          <div style={{
            fontSize: "12px",
            fontWeight: 500,
            color: "var(--color-text-primary)",
          }}>
            {build.car ?? "Car not set"}
            {(build.goals?.length ?? 0) > 0 ? ` · ${build.goals?.length} goals` : ""}
          </div>
          {(build.goals?.length ?? 0) > 0 && (
            <div style={{
              fontSize: "11px",
              color: "var(--color-text-tertiary)",
              marginTop: "2px",
            }}>
              {(build.goals ?? []).slice(0, 3).join(" · ")}
            </div>
          )}
        </div>

        <div style={{
          flex: 1,
          overflowY: "auto",
          padding: "12px 14px",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
        }}>
          <div style={{
            background: "var(--color-background-secondary)",
            borderRadius: "4px 12px 12px 12px",
            padding: "10px 14px",
            fontSize: "13px",
            color: "var(--color-text-primary)",
            lineHeight: 1.6,
            maxWidth: "88%",
          }}>
            {build.parts.length > 0
              ? `Your parts list is ready — ${build.parts.length} parts across ${build.goals?.length ?? 1} goal${(build.goals?.length ?? 1) > 1 ? "s" : ""}. What do you need help with?`
              : build.modification_goal
              ? `You want to ${build.modification_goal}. Ready to generate your parts list when you are.`
              : `I can see you're working on your ${build.car ?? "build"}. What are you looking to do with it?`
            }
          </div>

          {build.parts.some((p) => p.is_safety_critical) && (
            <div style={{
              background: "var(--color-background-warning)",
              border: "0.5px solid var(--color-border-warning)",
              borderRadius: "4px 12px 12px 12px",
              padding: "10px 14px",
              fontSize: "13px",
              color: "var(--color-text-warning)",
              lineHeight: 1.6,
              maxWidth: "88%",
            }}>
              <div style={{
                fontSize: "10px",
                fontWeight: 500,
                marginBottom: "3px",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}>
                Safety flags
              </div>
              {build.parts.filter((p) => p.is_safety_critical).length} safety-critical items in your build.
              Review these before starting work.
            </div>
          )}
        </div>

        {build.parts.length > 0 && (
          <div style={{
            padding: "6px 14px",
            display: "flex",
            flexDirection: "column",
            gap: "5px",
            flexShrink: 0,
          }}>
            {[
              "What should I do first?",
              "Which parts can I source locally?",
              "What is the total timeline?",
            ].map((chip) => (
              <button
                key={chip}
                style={{
                  padding: "8px 11px",
                  background: "var(--color-background-secondary)",
                  border: "0.5px solid var(--color-border-tertiary)",
                  borderRadius: "8px",
                  fontSize: "12px",
                  color: "var(--color-text-secondary)",
                  cursor: "pointer",
                  textAlign: "left",
                  fontFamily: "inherit",
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

        <div style={{
          padding: "10px 14px 16px",
          borderTop: "0.5px solid var(--color-border-tertiary)",
          flexShrink: 0,
        }}>
          <div style={{
            display: "flex",
            gap: "8px",
            alignItems: "flex-end",
            background: "var(--color-background-secondary)",
            border: "0.5px solid var(--color-border-tertiary)",
            borderRadius: "10px",
            padding: "9px 12px",
          }}>
            <textarea
              ref={textareaRef}
              placeholder="Ask about your build..."
              rows={1}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                fontSize: "13px",
                color: "var(--color-text-primary)",
                fontFamily: "inherit",
                outline: "none",
                resize: "none",
                minHeight: "20px",
                maxHeight: "100px",
                lineHeight: 1.5,
              }}
              onInput={(e) => {
                const t = e.currentTarget
                t.style.height = "auto"
                t.style.height = t.scrollHeight + "px"
              }}
            />
            <button
              style={{
                width: "28px",
                height: "28px",
                background: "#D97706",
                border: "none",
                borderRadius: "7px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
              aria-label="Send message"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 14 14"
                fill="none"
                stroke="white"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="13" y1="1" x2="6" y2="8" />
                <polygon points="13 1 8 13 6 8 1 6 13 1" fill="white" stroke="none" />
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
    </>
  )
}
