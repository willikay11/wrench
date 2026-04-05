// apps/web/src/app/dashboard/page.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import DashboardPage from "../(app)/dashboard/page"

// ── Mock API ───────────────────────────────────────────────────────────────
vi.mock("@/lib/api/builds", () => ({
  getBuilds: vi.fn(),
}))

// ── Mock next/link ─────────────────────────────────────────────────────────
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

// ── Mock Logo ──────────────────────────────────────────────────────────────
vi.mock("@/components/brand/logo", () => ({
  Logo: () => <div data-testid="logo">Wrench</div>,
}))

import { getBuilds } from "@/lib/api/builds"
const mockGetBuilds = vi.mocked(getBuilds)

// ── Fixtures ───────────────────────────────────────────────────────────────
const mockBuild = {
  id: "build-001",
  user_id: "user-001",
  title: "E30 K24 swap",
  donor_car: "1991 BMW E30 325i",
  engine_swap: "Honda K24A2",
  goals: ["daily", "track"],
  image_url: null,
  status: "in_progress",
  is_public: false,
  created_at: "2026-01-01T00:00:00+00:00",
  updated_at: "2026-01-01T00:00:00+00:00",
  embedding: null,
  vision_data: {},
}

// ── Tests ──────────────────────────────────────────────────────────────────
describe("DashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("rendering with builds", () => {
    beforeEach(() => {
      mockGetBuilds.mockResolvedValue([mockBuild])
    })

    it("renders the page heading", async () => {
      render(await DashboardPage())
      expect(screen.getByText("My builds")).toBeInTheDocument()
    })

    it("renders the new build button", async () => {
      render(await DashboardPage())
      expect(screen.getByRole("link", { name: /new build/i })).toBeInTheDocument()
    })

    it("renders a build card for each build", async () => {
      render(await DashboardPage())
      expect(screen.getByText("E30 K24 swap")).toBeInTheDocument()
    })

    it("renders the build donor car and engine", async () => {
      render(await DashboardPage())
      expect(
        screen.getByText(/1991 BMW E30 325i · Honda K24A2/i)
      ).toBeInTheDocument()
    })

    it("renders the status pill", async () => {
      render(await DashboardPage())
      expect(screen.getByText("In progress")).toBeInTheDocument()
    })

    it("does not render the empty state", async () => {
      render(await DashboardPage())
      expect(screen.queryByText("No builds yet")).not.toBeInTheDocument()
    })
  })

  describe("empty state", () => {
    beforeEach(() => {
      mockGetBuilds.mockResolvedValue([])
    })

    it("renders the empty state when no builds", async () => {
      render(await DashboardPage())
      expect(screen.getByText("No builds yet")).toBeInTheDocument()
    })

    it("renders create build CTA in empty state", async () => {
      render(await DashboardPage())
      expect(
        screen.getByRole("link", { name: /create your first build/i })
      ).toBeInTheDocument()
    })

    it("does not render any build cards", async () => {
      render(await DashboardPage())
      expect(screen.queryByText("E30 K24 swap")).not.toBeInTheDocument()
    })
  })

  describe("error state", () => {
    beforeEach(() => {
      mockGetBuilds.mockRejectedValue(new Error("Failed to connect to API"))
    })

    it("renders the error message", async () => {
      render(await DashboardPage())
      expect(
        screen.getByText(/Failed to connect to API/i)
      ).toBeInTheDocument()
    })

    it("does not render build cards on error", async () => {
      render(await DashboardPage())
      expect(screen.queryByText("E30 K24 swap")).not.toBeInTheDocument()
    })

    it("does not render empty state on error", async () => {
      render(await DashboardPage())
      expect(screen.queryByText("No builds yet")).not.toBeInTheDocument()
    })
  })

  describe("stats bar", () => {
    it("shows total build count", async () => {
      mockGetBuilds.mockResolvedValue([mockBuild])
      render(await DashboardPage())
      expect(screen.getByText("1")).toBeInTheDocument()
    })

    it("shows zero builds in stats when empty", async () => {
      mockGetBuilds.mockResolvedValue([])
      render(await DashboardPage())
      expect(screen.getByText("0")).toBeInTheDocument()
    })

    it("renders all four stat cards", async () => {
      mockGetBuilds.mockResolvedValue([mockBuild])
      render(await DashboardPage())
      expect(screen.getByText("Total builds")).toBeInTheDocument()
      expect(screen.getByText("Parts sourced")).toBeInTheDocument()
      expect(screen.getByText("Est. spend")).toBeInTheDocument()
      expect(screen.getByText("Advisor messages")).toBeInTheDocument()
    })
  })

  describe("multiple builds", () => {
    it("renders a card for each build", async () => {
      mockGetBuilds.mockResolvedValue([
        mockBuild,
        { ...mockBuild, id: "build-002", title: "Golf VR6 swap" },
      ])
      render(await DashboardPage())
      expect(screen.getByText("E30 K24 swap")).toBeInTheDocument()
      expect(screen.getByText("Golf VR6 swap")).toBeInTheDocument()
    })
  })
})