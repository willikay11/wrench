import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { PartDetailDrawer } from "./PartDetailDrawer"
import type { Part } from "@/lib/api/builds"

// Mocks
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
    orderPart: vi.fn(),
  }
})

// Test data
const mockVendor1: Part["vendors"][0] = {
  id: "vendor-001",
  part_id: "part-001",
  vendor_name: "Japanese Engines Inc",
  vendor_url: "https://japaneseenginesinc.com",
  price: 1200,
  currency: "USD",
  ships_from: "Japan",
  estimated_days_min: 14,
  estimated_days_max: 21,
  shipping_cost: 180,
  is_primary: true,
  created_at: "2026-01-01T00:00:00Z",
}

const mockVendor2: Part["vendors"][0] = {
  id: "vendor-002",
  part_id: "part-001",
  vendor_name: "eBay",
  vendor_url: "https://ebay.com/sch/k24a2",
  price: 1350,
  currency: "USD",
  ships_from: "United States",
  estimated_days_min: 7,
  estimated_days_max: 10,
  shipping_cost: 0,
  is_primary: false,
  created_at: "2026-01-01T00:00:00Z",
}

const mockPart: Part = {
  id: "part-001",
  build_id: "build-001",
  name: "K24A2 engine",
  description: "JDM K24A2 with under 80k miles",
  category: "engine",
  status: "needed",
  price_estimate: 1200,
  vendor_url: "https://japaneseenginesinc.com",
  image_url: null,
  is_safety_critical: false,
  notes: "Verify compression before purchase",
  goal: "K24 engine swap",
  vendors: [mockVendor1, mockVendor2],
  ordered_from_vendor_id: null,
  ordered_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
}

const safetyPart: Part = {
  ...mockPart,
  id: "part-002",
  is_safety_critical: true,
}

describe("PartDetailDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders part name and description", () => {
    render(
      <PartDetailDrawer
        part={mockPart}
        buildId="build-001"
        open={true}
        onClose={vi.fn()}
        onOrdered={vi.fn()}
      />
    )
    expect(screen.getByText("K24A2 engine")).toBeInTheDocument()
    expect(screen.getByText("JDM K24A2 with under 80k miles")).toBeInTheDocument()
  })

  it("shows safety banner when is_safety_critical true", () => {
    render(
      <PartDetailDrawer
        part={safetyPart}
        buildId="build-001"
        open={true}
        onClose={vi.fn()}
        onOrdered={vi.fn()}
      />
    )
    expect(screen.getByText(/Safety-critical part/i)).toBeInTheDocument()
  })

  it("hides safety banner when is_safety_critical false", () => {
    render(
      <PartDetailDrawer
        part={mockPart}
        buildId="build-001"
        open={true}
        onClose={vi.fn()}
        onOrdered={vi.fn()}
      />
    )
    expect(screen.queryByText(/Safety-critical part/i)).not.toBeInTheDocument()
  })

  it("renders vendor card for each vendor", () => {
    render(
      <PartDetailDrawer
        part={mockPart}
        buildId="build-001"
        open={true}
        onClose={vi.fn()}
        onOrdered={vi.fn()}
      />
    )
    expect(screen.getByText("Japanese Engines Inc")).toBeInTheDocument()
    expect(screen.getByText("eBay")).toBeInTheDocument()
  })

  it("shows 'Best price' badge on primary vendor", () => {
    render(
      <PartDetailDrawer
        part={mockPart}
        buildId="build-001"
        open={true}
        onClose={vi.fn()}
        onOrdered={vi.fn()}
      />
    )
    const badge = screen.getByText("Best price")
    expect(badge).toBeInTheDocument()
  })

  it("shows 'Free shipping' when shipping_cost is 0", () => {
    render(
      <PartDetailDrawer
        part={mockPart}
        buildId="build-001"
        open={true}
        onClose={vi.fn()}
        onOrdered={vi.fn()}
      />
    )
    expect(screen.getByText("Free shipping")).toBeInTheDocument()
  })

  it("shows landed cost (price + shipping)", () => {
    render(
      <PartDetailDrawer
        part={mockPart}
        buildId="build-001"
        open={true}
        onClose={vi.fn()}
        onOrdered={vi.fn()}
      />
    )
    expect(screen.getByText(/Landed cost:/)).toBeInTheDocument()
  })

  it("'View listing' opens vendor_url in new tab", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null)
    render(
      <PartDetailDrawer
        part={mockPart}
        buildId="build-001"
        open={true}
        onClose={vi.fn()}
        onOrdered={vi.fn()}
      />
    )
    const links = screen.getAllByText(/View listing/i)
    fireEvent.click(links[0])
    expect(openSpy).toHaveBeenCalledWith("https://japaneseenginesinc.com", "_blank")
    openSpy.mockRestore()
  })

  it("'I've ordered this' transitions to confirming state", async () => {
    render(
      <PartDetailDrawer
        part={mockPart}
        buildId="build-001"
        open={true}
        onClose={vi.fn()}
        onOrdered={vi.fn()}
      />
    )
    const buttons = screen.getAllByText(/I've ordered this/i)
    fireEvent.click(buttons[0])
    await waitFor(() => {
      expect(screen.getByText(/Confirm.*ordered from/i)).toBeInTheDocument()
    })
  })

  it("'Cancel' in confirming state returns to default", async () => {
    render(
      <PartDetailDrawer
        part={mockPart}
        buildId="build-001"
        open={true}
        onClose={vi.fn()}
        onOrdered={vi.fn()}
      />
    )
    const buttons = screen.getAllByText(/I've ordered this/i)
    fireEvent.click(buttons[0])
    await waitFor(() => {
      expect(screen.getByText(/Confirm.*ordered from/i)).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText("Cancel"))
    await waitFor(() => {
      expect(screen.queryByText(/Confirm.*ordered from/i)).not.toBeInTheDocument()
    })
  })

  it("'Not the right part' shows feedback textarea", () => {
    render(
      <PartDetailDrawer
        part={mockPart}
        buildId="build-001"
        open={true}
        onClose={vi.fn()}
        onOrdered={vi.fn()}
      />
    )
    fireEvent.click(screen.getByText("Not the right part"))
    expect(
      screen.getByPlaceholderText(/e\.g\. doesn't fit my year/i)
    ).toBeInTheDocument()
  })

  it("drawer has correct open/closed transform", () => {
    const { rerender } = render(
      <PartDetailDrawer
        part={mockPart}
        buildId="build-001"
        open={false}
        onClose={vi.fn()}
        onOrdered={vi.fn()}
      />
    )
    let drawer = document.querySelector('[style*="translateX"]')
    expect(drawer).toHaveStyle("transform: translateX(100%)")

    rerender(
      <PartDetailDrawer
        part={mockPart}
        buildId="build-001"
        open={true}
        onClose={vi.fn()}
        onOrdered={vi.fn()}
      />
    )
    drawer = document.querySelector('[style*="translateX"]')
    expect(drawer).toHaveStyle("transform: translateX(0)")
  })

  it("shows advisor note when part.notes present", () => {
    render(
      <PartDetailDrawer
        part={mockPart}
        buildId="build-001"
        open={true}
        onClose={vi.fn()}
        onOrdered={vi.fn()}
      />
    )
    expect(screen.getByText("Before you buy")).toBeInTheDocument()
    expect(screen.getByText("Verify compression before purchase")).toBeInTheDocument()
  })

  it("hides advisor note section when notes null", () => {
    const partWithoutNotes = { ...mockPart, notes: null }
    render(
      <PartDetailDrawer
        part={partWithoutNotes}
        buildId="build-001"
        open={true}
        onClose={vi.fn()}
        onOrdered={vi.fn()}
      />
    )
    expect(screen.queryByText("Before you buy")).not.toBeInTheDocument()
  })
})
