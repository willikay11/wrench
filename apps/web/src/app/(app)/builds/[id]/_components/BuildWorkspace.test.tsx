import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { BuildWorkspace } from "./BuildWorkspace"
import type { BuildDetail, Part } from "@/lib/api/builds"

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("sonner", () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}))

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(() => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: "test-token" } },
      }),
    },
  })),
}))

vi.mock("@/lib/api/builds", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/builds")>()
  return {
    ...actual,
    updateBuild: vi.fn(),
    uploadBuildImage: vi.fn(),
  }
})

// ── Fixtures ───────────────────────────────────────────────────────────────

const mockPart: Part = {
  id: "part-001",
  build_id: "build-001",
  name: "K24A2 Engine",
  description: null,
  category: "engine",
  status: "needed",
  price_estimate: 1500,
  vendor_url: null,
  is_safety_critical: false,
  notes: null,
  goal: "K24 engine swap",
  created_at: "2026-01-01T00:00:00+00:00",
  updated_at: "2026-01-01T00:00:00+00:00",
}

const safetyPart: Part = {
  ...mockPart,
  id: "part-002",
  name: "Roll cage",
  is_safety_critical: true,
  goal: "Roll cage",
  price_estimate: 3000,
  status: "sourced",
}

const baseBuild: BuildDetail = {
  id: "build-001",
  user_id: "user-001",
  title: "E30 K24 swap",
  car: "1991 BMW E30 325i",
  donor_car: "1991 BMW E30 325i",
  modification_goal: null,
  goals: ["K24 engine swap", "Roll cage"],
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

// ── Tests ──────────────────────────────────────────────────────────────────

describe("BuildWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Left panel ─────────────────────────────────────────────────────────

  describe("left panel", () => {
    it("shows car placeholder when no image_url", () => {
      render(<BuildWorkspace build={baseBuild} />)
      expect(screen.getByLabelText("Car placeholder")).toBeInTheDocument()
      expect(screen.queryByRole("img", { name: baseBuild.title })).not.toBeInTheDocument()
    })

    it("shows image when image_url is present", () => {
      const build = { ...baseBuild, image_url: "https://example.com/car.jpg" }
      render(<BuildWorkspace build={build} />)
      const img = screen.getByRole("img", { name: build.title })
      expect(img).toHaveAttribute("src", "https://example.com/car.jpg")
    })

    it("renders the car name", () => {
      render(<BuildWorkspace build={baseBuild} />)
      // Car name appears in both left panel and advisor header
      expect(screen.getAllByText("1991 BMW E30 325i").length).toBeGreaterThanOrEqual(1)
    })

    it("renders the status pill", () => {
      render(<BuildWorkspace build={baseBuild} />)
      expect(screen.getByText("Planning")).toBeInTheDocument()
    })

    it("lists all goals in the left panel", () => {
      render(<BuildWorkspace build={baseBuild} />)
      expect(screen.getByText("K24 engine swap")).toBeInTheDocument()
      expect(screen.getByText("Roll cage")).toBeInTheDocument()
    })

    it("shows part count per goal when parts exist", () => {
      const build = {
        ...baseBuild,
        modification_goal: "K24 swap",
        parts: [mockPart, safetyPart],
        parts_total: 2,
        parts_sourced: 1,
      }
      render(<BuildWorkspace build={build} />)
      // K24 engine swap goal has 1 part, Roll cage goal has 1 part
      const counts = screen.getAllByText("1")
      expect(counts.length).toBeGreaterThanOrEqual(2)
    })

    it("renders upload photo button", () => {
      render(<BuildWorkspace build={baseBuild} />)
      expect(screen.getByRole("button", { name: /upload photo/i })).toBeInTheDocument()
    })

    it("renders similar builds placeholder links", () => {
      render(<BuildWorkspace build={baseBuild} />)
      expect(screen.getByText(/2JZ E30 street build/i)).toBeInTheDocument()
    })
  })

  // ── Centre panel — State A ──────────────────────────────────────────────

  describe("centre panel — State A (no modification_goal)", () => {
    it("renders 'No parts yet' heading", () => {
      render(<BuildWorkspace build={baseBuild} />)
      expect(screen.getByText("No parts yet")).toBeInTheDocument()
    })

    it("renders the advisor prompt text", () => {
      render(<BuildWorkspace build={baseBuild} />)
      expect(
        screen.getByText(/tell the advisor what you want to do/i)
      ).toBeInTheDocument()
    })

    it("does not render the generate button", () => {
      render(<BuildWorkspace build={baseBuild} />)
      expect(screen.queryByRole("button", { name: /generate parts list/i })).not.toBeInTheDocument()
    })
  })

  // ── Centre panel — State B ──────────────────────────────────────────────

  describe("centre panel — State B (has modification_goal, no parts)", () => {
    const stateBBuild = {
      ...baseBuild,
      modification_goal: "I want to do a K24 swap for daily driving",
    }

    it("renders the modification_goal in a blockquote", () => {
      render(<BuildWorkspace build={stateBBuild} />)
      // modification_goal appears in both the blockquote and the advisor message
      expect(
        screen.getAllByText(/I want to do a K24 swap for daily driving/i).length
      ).toBeGreaterThanOrEqual(1)
    })

    it("renders the generate parts list button", () => {
      render(<BuildWorkspace build={stateBBuild} />)
      expect(
        screen.getByRole("button", { name: /generate parts list/i })
      ).toBeInTheDocument()
    })

    it("does not render 'No parts yet'", () => {
      render(<BuildWorkspace build={stateBBuild} />)
      expect(screen.queryByText("No parts yet")).not.toBeInTheDocument()
    })
  })

  // ── Centre panel — State C ──────────────────────────────────────────────

  describe("centre panel — State C (has parts)", () => {
    const stateCBuild = {
      ...baseBuild,
      modification_goal: "K24 swap for daily driving",
      parts: [mockPart, safetyPart],
      parts_total: 2,
      parts_sourced: 1,
    }

    it("renders part names", () => {
      render(<BuildWorkspace build={stateCBuild} />)
      expect(screen.getAllByText("K24A2 Engine").length).toBeGreaterThanOrEqual(1)
      // "Roll cage" appears as goal header + part row + left panel goal — use getAllByText
      expect(screen.getAllByText("Roll cage").length).toBeGreaterThanOrEqual(1)
    })

    it("renders part status pills", () => {
      render(<BuildWorkspace build={stateCBuild} />)
      expect(screen.getByText("Needed")).toBeInTheDocument()
      expect(screen.getByText("Sourced")).toBeInTheDocument()
    })

    it("renders the goal group headers", () => {
      render(<BuildWorkspace build={stateCBuild} />)
      // Goal names appear in left panel AND as group headers in centre
      const k24Instances = screen.getAllByText("K24 engine swap")
      expect(k24Instances.length).toBeGreaterThanOrEqual(2)
    })

    it("renders the cost bar with total", () => {
      render(<BuildWorkspace build={stateCBuild} />)
      // Total cost: 1500 + 3000 = $4,500
      expect(screen.getByText("$4,500")).toBeInTheDocument()
    })

    it("renders parts total in cost bar", () => {
      render(<BuildWorkspace build={stateCBuild} />)
      expect(screen.getByText("2 parts")).toBeInTheDocument()
    })

    it("renders sourced count in cost bar", () => {
      render(<BuildWorkspace build={stateCBuild} />)
      expect(screen.getByText("1 sourced")).toBeInTheDocument()
    })

    it("shows tabs toolbar", () => {
      render(<BuildWorkspace build={stateCBuild} />)
      expect(screen.getByText("Parts list")).toBeInTheDocument()
      expect(screen.getByText("Cost summary")).toBeInTheDocument()
      expect(screen.getByText("Notes")).toBeInTheDocument()
    })
  })

  // ── Advisor panel ───────────────────────────────────────────────────────

  describe("advisor panel", () => {
    it("State A — initial message references the car", () => {
      render(<BuildWorkspace build={baseBuild} />)
      expect(
        screen.getByText(/I can see you're working on your 1991 BMW E30 325i/i)
      ).toBeInTheDocument()
    })

    it("State A — no suggestion chips shown", () => {
      render(<BuildWorkspace build={baseBuild} />)
      expect(screen.queryByText("Generate now")).not.toBeInTheDocument()
      expect(screen.queryByText("Tell me more about this build")).not.toBeInTheDocument()
    })

    it("State B — initial message references modification_goal", () => {
      const build = { ...baseBuild, modification_goal: "daily track build" }
      render(<BuildWorkspace build={build} />)
      expect(screen.getByText(/You want to daily track build/i)).toBeInTheDocument()
    })

    it("State B — shows Generate now chip", () => {
      const build = { ...baseBuild, modification_goal: "K24 swap" }
      render(<BuildWorkspace build={build} />)
      expect(screen.getByText("Generate now")).toBeInTheDocument()
      expect(screen.getByText("Tell me more about this build")).toBeInTheDocument()
    })

    it("State C — initial message references part count", () => {
      const build = {
        ...baseBuild,
        modification_goal: "K24 swap",
        parts: [mockPart],
        parts_total: 1,
        parts_sourced: 0,
      }
      render(<BuildWorkspace build={build} />)
      expect(screen.getByText(/Your parts list is ready — 1 parts/i)).toBeInTheDocument()
    })

    it("State C — shows actionable chips", () => {
      const build = {
        ...baseBuild,
        modification_goal: "K24 swap",
        parts: [mockPart],
        parts_total: 1,
        parts_sourced: 0,
      }
      render(<BuildWorkspace build={build} />)
      expect(screen.getByText("What should I do first?")).toBeInTheDocument()
      expect(screen.getByText("Find a mechanic in Nairobi")).toBeInTheDocument()
    })

    it("renders the advisor text input", () => {
      render(<BuildWorkspace build={baseBuild} />)
      expect(screen.getByPlaceholderText(/ask about your build/i)).toBeInTheDocument()
    })

    it("renders the Send button", () => {
      render(<BuildWorkspace build={baseBuild} />)
      expect(screen.getByRole("button", { name: /send/i })).toBeInTheDocument()
    })
  })
})
