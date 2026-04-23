import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
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
  image_url: null,
  is_safety_critical: false,
  notes: null,
  goal: "K24 engine swap",
  vendors: [],
  ordered_from_vendor_id: null,
  ordered_at: null,
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

const partWithVendors: Part = {
  ...mockPart,
  vendors: [
    {
      id: "vendor-1",
      part_id: "part-001",
      vendor_name: "Vendor 1",
      vendor_url: "https://vendor1.com",
      price: 1200,
      currency: "USD",
      ships_from: "USA",
      estimated_days_min: 5,
      estimated_days_max: 7,
      shipping_cost: 15,
      is_primary: true,
      created_at: "2026-01-01T00:00:00+00:00",
    },
    {
      id: "vendor-2",
      part_id: "part-001",
      vendor_name: "Vendor 2",
      vendor_url: "https://vendor2.com",
      price: 950,
      currency: "USD",
      ships_from: "USA",
      estimated_days_min: 3,
      estimated_days_max: 5,
      shipping_cost: 10,
      is_primary: false,
      created_at: "2026-01-01T00:00:00+00:00",
    },
  ],
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
    })

    it("shows image when image_url is present", () => {
      const build = { ...baseBuild, image_url: "https://example.com/car.jpg" }
      render(<BuildWorkspace build={build} />)
      const img = screen.getByRole("img", { name: build.title })
      expect(img).toHaveAttribute("src", "https://example.com/car.jpg")
    })

    it("renders the car name", () => {
      render(<BuildWorkspace build={baseBuild} />)
      expect(screen.getByText("1991 BMW E30 325i")).toBeInTheDocument()
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

    it("vision pill shown when vision_data present", () => {
      const build = {
        ...baseBuild,
        vision_data: {
          image_type: "car",
          summary: "1991 BMW E30 325i",
          extracted: {
            make: "BMW",
            model: "E30",
            year: "1991",
            confidence: 95,
            part_name: null,
            specifications: null,
            mods_detected: [],
            notes: null,
          },
        },
      }
      render(<BuildWorkspace build={build} />)
      expect(screen.getByText(/AI identified/i)).toBeInTheDocument()
    })

    it("vision pill hidden when no vision_data", () => {
      render(<BuildWorkspace build={baseBuild} />)
      expect(screen.queryByText(/AI identified/i)).not.toBeInTheDocument()
    })

    it("vision pill expands on click", async () => {
      const build = {
        ...baseBuild,
        vision_data: {
          image_type: "car" as const,
          summary: "1991 BMW E30 325i",
          extracted: {
            make: "BMW",
            model: "E30",
            year: "1991",
            confidence: 95,
            part_name: null,
            specifications: null,
            mods_detected: [],
            notes: null,
          },
        },
      }
      render(<BuildWorkspace build={build} />)
      const pill = screen.getByText(/AI identified/i)
      fireEvent.click(pill)
      await waitFor(() => {
        expect(screen.getByText("Make")).toBeInTheDocument()
        expect(screen.getByText("BMW")).toBeInTheDocument()
      })
    })

    it("vision pill expands without overlapping other sections", async () => {
      const build = {
        ...baseBuild,
        vision_data: {
          image_type: "car" as const,
          summary: "1991 BMW E30 325i",
          extracted: {
            make: "BMW",
            model: "E30",
            year: "1991",
            confidence: 95,
            part_name: null,
            specifications: null,
            mods_detected: [],
            notes: null,
          },
        },
      }
      render(<BuildWorkspace build={build} />)
      const pill = screen.getByText(/AI identified/i)
      const pillButton = pill.closest("button")
      expect(pillButton).toHaveStyle({ borderRadius: "99px" })
      fireEvent.click(pill)
      await waitFor(() => {
        expect(pillButton).toHaveStyle({ borderRadius: "8px 8px 0 0" })
      })
    })

    it("vision pill collapses back to pill shape", async () => {
      const build = {
        ...baseBuild,
        vision_data: {
          image_type: "car" as const,
          summary: "1991 BMW E30 325i",
          extracted: {
            make: "BMW",
            model: "E30",
            year: "1991",
            confidence: 95,
            part_name: null,
            specifications: null,
            mods_detected: [],
            notes: null,
          },
        },
      }
      render(<BuildWorkspace build={build} />)
      const pill = screen.getByText(/AI identified/i)
      const pillButton = pill.closest("button")
      fireEvent.click(pill)
      await waitFor(() => {
        expect(screen.getByText("Make")).toBeInTheDocument()
      })
      fireEvent.click(pillButton!)
      await waitFor(() => {
        expect(screen.queryByText("Make")).not.toBeInTheDocument()
        expect(pillButton).toHaveStyle({ borderRadius: "99px" })
      })
    })

    it("expanded state renders make/model/year rows", async () => {
      const build = {
        ...baseBuild,
        vision_data: {
          image_type: "car" as const,
          summary: "1991 BMW E30 325i",
          extracted: {
            make: "BMW",
            model: "E30",
            year: "1991",
            confidence: 95,
            part_name: null,
            specifications: null,
            mods_detected: [],
            notes: null,
          },
        },
      }
      render(<BuildWorkspace build={build} />)
      fireEvent.click(screen.getByText(/AI identified/i))
      await waitFor(() => {
        expect(screen.getByText("Make")).toBeInTheDocument()
        expect(screen.getByText("Model")).toBeInTheDocument()
        expect(screen.getByText("Year")).toBeInTheDocument()
        expect(screen.getByText("BMW")).toBeInTheDocument()
        expect(screen.getByText("E30")).toBeInTheDocument()
        expect(screen.getByText("1991")).toBeInTheDocument()
      })
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
      expect(
        screen.getByText(/I want to do a K24 swap for daily driving/i)
      ).toBeInTheDocument()
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
      expect(screen.getAllByText("Roll cage").length).toBeGreaterThanOrEqual(1)
    })

    it("renders part status pills", () => {
      render(<BuildWorkspace build={stateCBuild} />)
      expect(screen.getByText("Needed")).toBeInTheDocument()
      expect(screen.getByText("Sourced")).toBeInTheDocument()
    })

    it("renders the goal group headers", () => {
      render(<BuildWorkspace build={stateCBuild} />)
      const k24Instances = screen.getAllByText("K24 engine swap")
      expect(k24Instances.length).toBeGreaterThanOrEqual(1)
    })

    it("renders the cost bar with total", () => {
      render(<BuildWorkspace build={stateCBuild} />)
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

    it("description is truncated with ellipsis", () => {
      const partWithDesc = {
        ...mockPart,
        description: "This is a very long description that should be truncated",
      }
      const build = {
        ...stateCBuild,
        parts: [partWithDesc],
      }
      render(<BuildWorkspace build={build} />)
      const desc = screen.getByText(partWithDesc.description)
      expect(desc).toHaveStyle({
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        display: "block",
      })
    })

    it("description container has whiteSpace nowrap style", () => {
      const partWithDesc = {
        ...mockPart,
        description: "This is a long description that wraps normally but should not wrap here",
      }
      const build = {
        ...stateCBuild,
        parts: [partWithDesc],
      }
      const { container } = render(<BuildWorkspace build={build} />)
      const desc = screen.getByText(partWithDesc.description)
      expect(desc).toHaveStyle({ whiteSpace: "nowrap" })
    })

    it("description container parent has minWidth 0", () => {
      const partWithDesc = {
        ...mockPart,
        description: "A moderately long description that tests the container",
      }
      const build = {
        ...stateCBuild,
        parts: [partWithDesc],
      }
      const { container } = render(<BuildWorkspace build={build} />)
      const descContainer = screen.getByText(partWithDesc.description).closest("div.min-w-0")
      expect(descContainer).toHaveClass("min-w-0")
      expect(descContainer).toHaveStyle({ overflow: "hidden" })
    })

    it("vendors hint shows lowest price when vendors exist", () => {
      const build = {
        ...stateCBuild,
        parts: [partWithVendors],
      }
      render(<BuildWorkspace build={build} />)
      expect(screen.getByText(/\[2\] vendors from \$950/)).toBeInTheDocument()
    })

    it("vendors hint hidden when no vendors", () => {
      const partNoVendors = { ...mockPart, vendors: [] }
      const build = { ...stateCBuild, parts: [partNoVendors] }
      render(<BuildWorkspace build={build} />)
      expect(screen.queryByText(/vendors from/)).not.toBeInTheDocument()
    })

    it("safety icon shown when is_safety_critical", () => {
      const build = { ...stateCBuild, parts: [safetyPart] }
      const { container } = render(<BuildWorkspace build={build} />)
      const safetyIcon = container.querySelector('div[title="Safety critical"]')
      expect(safetyIcon).toBeInTheDocument()
      expect(safetyIcon?.textContent).toBe("!")
    })

    it("safety icon hidden when not safety critical", () => {
      const build = { ...stateCBuild, parts: [mockPart] }
      const { container } = render(<BuildWorkspace build={build} />)
      const safetyIcon = container.querySelector('div[title="Safety critical"]')
      expect(safetyIcon).not.toBeInTheDocument()
    })

    it("shows tabs toolbar", () => {
      render(<BuildWorkspace build={stateCBuild} />)
      expect(screen.getByText("Parts list")).toBeInTheDocument()
      expect(screen.getByText("Cost summary")).toBeInTheDocument()
      expect(screen.getByText("Notes")).toBeInTheDocument()
    })
  })

  // ── Advisor drawer ──────────────────────────────────────────────────────

  describe("Advisor drawer", () => {
    it("renders Ask advisor button in State C", () => {
      const build = { ...baseBuild, modification_goal: "K24 swap", parts: [mockPart] }
      render(<BuildWorkspace build={build} />)
      expect(screen.getByRole("button", { name: /open advisor/i })).toBeInTheDocument()
    })

    it("drawer is not visible on initial render", () => {
      render(<BuildWorkspace build={baseBuild} />)
      const drawer = screen.queryByRole("dialog", { name: /build advisor/i })
      expect(drawer).not.toBeVisible()
    })

    it("clicking Ask advisor opens the drawer", async () => {
      const build = { ...baseBuild, modification_goal: "K24 swap", parts: [mockPart] }
      render(<BuildWorkspace build={build} />)
      const button = screen.getByRole("button", { name: /open advisor/i })
      fireEvent.click(button)
      await waitFor(() => {
        expect(screen.getByRole("dialog", { name: /build advisor/i })).toBeVisible()
      })
    })

    it("clicking backdrop closes the drawer", async () => {
      const build = { ...baseBuild, modification_goal: "K24 swap", parts: [mockPart] }
      render(<BuildWorkspace build={build} />)
      fireEvent.click(screen.getByRole("button", { name: /open advisor/i }))
      await waitFor(() => expect(screen.getByRole("dialog")).toBeVisible())
      const backdrop = screen.getByRole("dialog").parentElement?.previousElementSibling
      if (backdrop) fireEvent.click(backdrop)
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeVisible())
    })

    it("clicking × closes the drawer", async () => {
      const build = { ...baseBuild, modification_goal: "K24 swap", parts: [mockPart] }
      render(<BuildWorkspace build={build} />)
      fireEvent.click(screen.getByRole("button", { name: /open advisor/i }))
      await waitFor(() => expect(screen.getByRole("dialog")).toBeVisible())
      fireEvent.click(screen.getByRole("button", { name: /close advisor/i }))
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeVisible())
    })

    it("Escape key closes the drawer", async () => {
      const build = { ...baseBuild, modification_goal: "K24 swap", parts: [mockPart] }
      render(<BuildWorkspace build={build} />)
      fireEvent.click(screen.getByRole("button", { name: /open advisor/i }))
      await waitFor(() => expect(screen.getByRole("dialog")).toBeVisible())
      fireEvent.keyDown(document, { key: "Escape" })
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeVisible())
    })

    it("unread dot visible before drawer opened", () => {
      const build = { ...baseBuild, modification_goal: "K24 swap", parts: [mockPart] }
      const { container } = render(<BuildWorkspace build={build} />)
      const button = screen.getByRole("button", { name: /open advisor/i })
      const dot = button.querySelector("div[style*='border']")
      expect(dot).toBeInTheDocument()
    })

    it("unread dot hidden after drawer opened", async () => {
      const build = { ...baseBuild, modification_goal: "K24 swap", parts: [mockPart] }
      const { container } = render(<BuildWorkspace build={build} />)
      fireEvent.click(screen.getByRole("button", { name: /open advisor/i }))
      await waitFor(() => {
        const button = screen.getByRole("button", { name: /open advisor/i })
        const dot = button.querySelector("div[style*='border']")
        expect(dot).not.toBeInTheDocument()
      })
    })

    it("shows no-goal message when no modification_goal", async () => {
      render(<BuildWorkspace build={baseBuild} />)
      // Ask advisor button only shows in State C
      // For State A/B, message is in centre panel, not drawer
      expect(screen.queryByRole("button", { name: /open advisor/i })).not.toBeInTheDocument()
    })

    it("shows has-goal message when goal set but no parts", () => {
      const build = { ...baseBuild, modification_goal: "K24 swap" }
      render(<BuildWorkspace build={build} />)
      // Button not shown in State B (has goal but no parts)
      expect(screen.queryByRole("button", { name: /open advisor/i })).not.toBeInTheDocument()
    })

    it("shows parts-ready message when parts exist", async () => {
      const build = { ...baseBuild, modification_goal: "K24 swap", parts: [mockPart] }
      render(<BuildWorkspace build={build} />)
      fireEvent.click(screen.getByRole("button", { name: /open advisor/i }))
      await waitFor(() => {
        expect(screen.getByText(/Your parts list is ready/i)).toBeInTheDocument()
      })
    })

    it("shows safety warning when safety-critical parts exist", async () => {
      const build = {
        ...baseBuild,
        modification_goal: "K24 swap",
        parts: [mockPart, safetyPart],
      }
      render(<BuildWorkspace build={build} />)
      fireEvent.click(screen.getByRole("button", { name: /open advisor/i }))
      await waitFor(() => {
        expect(screen.getByText(/Safety flags/i)).toBeInTheDocument()
      })
    })

    it("shows suggestion chips when parts exist", async () => {
      const build = { ...baseBuild, modification_goal: "K24 swap", parts: [mockPart] }
      render(<BuildWorkspace build={build} />)
      fireEvent.click(screen.getByRole("button", { name: /open advisor/i }))
      await waitFor(() => {
        expect(screen.getByText(/What should I do first/i)).toBeInTheDocument()
      })
    })

    it("chip click populates textarea with chip text", async () => {
      const build = { ...baseBuild, modification_goal: "K24 swap", parts: [mockPart] }
      render(<BuildWorkspace build={build} />)
      fireEvent.click(screen.getByRole("button", { name: /open advisor/i }))
      await waitFor(() => {
        const chip = screen.getByText(/What should I do first/i)
        fireEvent.click(chip)
        const textarea = screen.getByPlaceholderText(/ask about your build/i)
        expect((textarea as HTMLTextAreaElement).value).toBe("What should I do first?")
      })
    })

    it("drawer has role=dialog", async () => {
      const build = { ...baseBuild, modification_goal: "K24 swap", parts: [mockPart] }
      render(<BuildWorkspace build={build} />)
      fireEvent.click(screen.getByRole("button", { name: /open advisor/i }))
      await waitFor(() => {
        expect(screen.getByRole("dialog", { name: /build advisor/i })).toBeInTheDocument()
      })
    })

    it("drawer has aria-modal=true", async () => {
      const build = { ...baseBuild, modification_goal: "K24 swap", parts: [mockPart] }
      render(<BuildWorkspace build={build} />)
      fireEvent.click(screen.getByRole("button", { name: /open advisor/i }))
      await waitFor(() => {
        expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true")
      })
    })
  })

  // ── Part Detail Drawer ──────────────────────────────────────────────────

  describe("Part Detail Drawer", () => {
    it("clicking part row opens PartDetailDrawer", async () => {
      const build = { ...baseBuild, modification_goal: "K24 swap", parts: [mockPart] }
      render(<BuildWorkspace build={build} />)
      const partRows = screen.getAllByText("K24A2 Engine")
      fireEvent.click(partRows[0])
      await waitFor(() => {
        expect(screen.getByText("Where to buy")).toBeInTheDocument()
      })
    })

    it("selectedPart is set when row clicked", async () => {
      const build = { ...baseBuild, modification_goal: "K24 swap", parts: [mockPart] }
      render(<BuildWorkspace build={build} />)
      const partRows = screen.getAllByText("K24A2 Engine")
      fireEvent.click(partRows[0])
      await waitFor(() => {
        expect(screen.getByText("JDM K24A2 with 100k miles")).toBeInTheDocument()
      })
    })

    it("part status updates optimistically on order", async () => {
      vi.mocked(require("@/lib/api/builds").orderPart).mockResolvedValueOnce({
        ...mockPart,
        status: "ordered",
        ordered_from_vendor_id: "vendor-001",
        ordered_at: new Date().toISOString(),
      })
      const build = { ...baseBuild, modification_goal: "K24 swap", parts: [mockPart] }
      render(<BuildWorkspace build={build} />)
      const partRows = screen.getAllByText("K24A2 Engine")
      fireEvent.click(partRows[0])
      await waitFor(() => {
        expect(screen.getByText("Where to buy")).toBeInTheDocument()
      })
      const confirmButtons = screen.getAllByText(/Yes, confirm/i)
      fireEvent.click(confirmButtons[0])
      await waitFor(() => {
        expect(screen.getByText("Ordered ✓")).toBeInTheDocument()
      })
    })
  })
})
