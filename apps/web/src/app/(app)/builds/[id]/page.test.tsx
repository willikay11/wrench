import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import BuildPage from "./page"

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("@/lib/api/builds.server", () => ({
  getBuild: vi.fn(),
}))

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

// Stub BuildWorkspace so page tests stay focused on fetch/error logic
vi.mock("./_components/BuildWorkspace", () => ({
  BuildWorkspace: ({ build }: { build: { title: string; modification_goal?: string | null; parts: unknown[] } }) => (
    <div data-testid="build-workspace">
      <span data-testid="workspace-title">{build.title}</span>
      {build.modification_goal && (
        <span data-testid="workspace-goal">{build.modification_goal}</span>
      )}
      <span data-testid="workspace-parts-count">{build.parts.length}</span>
    </div>
  ),
}))

import { getBuild } from "@/lib/api/builds.server"
const mockGetBuild = vi.mocked(getBuild)

// ── Fixtures ───────────────────────────────────────────────────────────────

const baseBuild = {
  id: "build-001",
  user_id: "user-001",
  title: "E30 K24 swap",
  car: "1991 BMW E30 325i",
  donor_car: "1991 BMW E30 325i",
  modification_goal: null,
  goals: ["K24 engine swap"],
  image_url: null,
  status: "planning",
  is_public: false,
  created_at: "2026-01-01T00:00:00+00:00",
  updated_at: "2026-01-01T00:00:00+00:00",
  embedding: null,
  vision_data: null,
  parts: [],
  parts_total: 0,
  parts_sourced: 0,
}

const params = Promise.resolve({ id: "build-001" })

// ── Tests ──────────────────────────────────────────────────────────────────

describe("BuildPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders BuildWorkspace with the fetched build", async () => {
    mockGetBuild.mockResolvedValue(baseBuild)
    render(await BuildPage({ params }))
    expect(screen.getByTestId("build-workspace")).toBeInTheDocument()
    expect(screen.getByTestId("workspace-title")).toHaveTextContent("E30 K24 swap")
  })

  it("calls getBuild with the correct id", async () => {
    mockGetBuild.mockResolvedValue(baseBuild)
    await BuildPage({ params })
    expect(mockGetBuild).toHaveBeenCalledWith("build-001")
  })

  it("shows error state when getBuild throws", async () => {
    mockGetBuild.mockRejectedValue(new Error("Not found"))
    render(await BuildPage({ params }))
    expect(screen.getByText(/build not found/i)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /back to dashboard/i })).toBeInTheDocument()
    expect(screen.queryByTestId("build-workspace")).not.toBeInTheDocument()
  })

  it("error state back link points to /dashboard", async () => {
    mockGetBuild.mockRejectedValue(new Error("Not found"))
    render(await BuildPage({ params }))
    expect(screen.getByRole("link", { name: /back to dashboard/i })).toHaveAttribute(
      "href",
      "/dashboard"
    )
  })

  it("passes modification_goal to workspace (State B build)", async () => {
    const stateBBuild = { ...baseBuild, modification_goal: "K24 swap for daily driving" }
    mockGetBuild.mockResolvedValue(stateBBuild)
    render(await BuildPage({ params }))
    expect(screen.getByTestId("workspace-goal")).toHaveTextContent("K24 swap for daily driving")
  })

  it("passes parts count to workspace (State C build)", async () => {
    const mockPart = {
      id: "part-001", build_id: "build-001", name: "K24A2 Engine",
      description: null, category: "engine", status: "needed" as const,
      price_estimate: 1500, vendor_url: null, is_safety_critical: false,
      notes: null, goal: "K24 engine swap",
      created_at: "2026-01-01T00:00:00+00:00",
      updated_at: "2026-01-01T00:00:00+00:00",
    }
    const stateCBuild = {
      ...baseBuild,
      modification_goal: "K24 swap for daily driving",
      parts: [mockPart],
      parts_total: 1,
    }
    mockGetBuild.mockResolvedValue(stateCBuild)
    render(await BuildPage({ params }))
    expect(screen.getByTestId("workspace-parts-count")).toHaveTextContent("1")
  })
})
