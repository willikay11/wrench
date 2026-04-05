// apps/web/src/components/build/BuildCard.test.tsx
import { describe, it, expect, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { BuildCard } from "./build-card"
import type { Build } from "@/lib/api/builds"

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    unoptimized: _unoptimized,
    ...props
  }: React.ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={typeof src === "string" ? src : ""} alt={alt ?? ""} {...props} />
  ),
}))

const mockBuild: Build = {
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
  parts_total: 47,
  parts_sourced: 18,
  embedding: null,
  vision_data: null,
}

describe("BuildCard", () => {
  describe("rendering", () => {
    it("renders the build title", () => {
      render(<BuildCard build={mockBuild} />)
      expect(screen.getByText("E30 K24 swap")).toBeInTheDocument()
    })

    it("renders donor car and engine swap", () => {
      render(<BuildCard build={mockBuild} />)
      expect(
        screen.getByText("1991 BMW E30 325i · Honda K24A2")
      ).toBeInTheDocument()
    })

    it("renders only donor car when no engine swap", () => {
      render(<BuildCard build={{ ...mockBuild, engine_swap: null }} />)
      expect(screen.getByText("1991 BMW E30 325i")).toBeInTheDocument()
    })

    it("renders nothing for donor car when absent", () => {
      render(<BuildCard build={{ ...mockBuild, donor_car: null }} />)
      expect(screen.queryByText(/BMW/)).not.toBeInTheDocument()
    })

    it("links to the correct build page", () => {
      render(<BuildCard build={mockBuild} />)
      expect(screen.getByRole("link")).toHaveAttribute(
        "href",
        "/builds/build-001"
      )
    })
  })

  describe("status pill", () => {
    it("shows In progress for in_progress status", () => {
      render(<BuildCard build={mockBuild} />)
      expect(screen.getByText("In progress")).toBeInTheDocument()
    })

    it("shows Planning for planning status", () => {
      render(<BuildCard build={{ ...mockBuild, status: "planning" }} />)
      expect(screen.getByText("Planning")).toBeInTheDocument()
    })

    it("shows Complete for complete status", () => {
      render(<BuildCard build={{ ...mockBuild, status: "complete" }} />)
      expect(screen.getByText("Complete")).toBeInTheDocument()
    })

    it("defaults to Planning for unknown status", () => {
      render(<BuildCard build={{ ...mockBuild, status: "unknown" }} />)
      expect(screen.getByText("Planning")).toBeInTheDocument()
    })
  })

  describe("progress bar", () => {
    it("renders parts sourced count", () => {
      render(<BuildCard build={mockBuild} />)
      expect(screen.getByText("18 of 47 sourced")).toBeInTheDocument()
    })

    it("shows correct percentage", () => {
      render(<BuildCard build={mockBuild} />)
      expect(screen.getByText("38%")).toBeInTheDocument()
    })

    it("shows 0% when no parts", () => {
      render(
        <BuildCard build={{ ...mockBuild, parts_total: 0, parts_sourced: 0 }} />
      )
      expect(screen.getByText("0%")).toBeInTheDocument()
    })

    it("shows None added yet when no parts", () => {
      render(
        <BuildCard build={{ ...mockBuild, parts_total: 0, parts_sourced: 0 }} />
      )
      expect(screen.getByText("None added yet")).toBeInTheDocument()
    })

    it("shows 100% when all parts sourced", () => {
      render(
        <BuildCard build={{ ...mockBuild, parts_total: 10, parts_sourced: 10 }} />
      )
      expect(screen.getByText("100%")).toBeInTheDocument()
    })
  })

  describe("image", () => {
    it("renders car placeholder when no image", () => {
      render(<BuildCard build={mockBuild} />)
      expect(screen.queryByRole("img")).not.toBeInTheDocument()
    })

    it("renders image when image_url is present", () => {
      render(
        <BuildCard
          build={{ ...mockBuild, image_url: "https://example.com/car.jpg" }}
        />
      )
      expect(screen.getByRole("img")).toHaveAttribute(
        "src",
        "https://example.com/car.jpg"
      )
    })

    it("falls back to the placeholder if the image fails to load", () => {
      render(
        <BuildCard
          build={{ ...mockBuild, image_url: "https://example.com/broken.jpg" }}
        />
      )

      fireEvent.error(screen.getByRole("img"))

      expect(screen.queryByRole("img")).not.toBeInTheDocument()
    })
  })

  describe("goals", () => {
    it("renders goals joined with comma", () => {
      render(<BuildCard build={mockBuild} />)
      expect(screen.getByText("daily, track")).toBeInTheDocument()
    })

    it("shows None set when goals is empty", () => {
      render(<BuildCard build={{ ...mockBuild, goals: [] }} />)
      expect(screen.getByText("None set")).toBeInTheDocument()
    })
  })
})