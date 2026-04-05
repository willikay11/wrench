import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"

import { StatsBar } from "./stats-bar"
import type { Build } from "@/lib/api/builds"

function makeBuild(overrides: Partial<Build> = {}): Build {
  return {
    id: "build-001",
    user_id: "user-001",
    title: "E30 K24 swap",
    donor_car: "1991 BMW E30 325i",
    engine_swap: "Honda K24A2",
    goals: ["daily"],
    image_url: null,
    status: "planning",
    is_public: false,
    created_at: "2026-01-01T00:00:00+00:00",
    updated_at: "2026-01-01T00:00:00+00:00",
    embedding: null,
    vision_data: null,
    parts_total: 0,
    parts_sourced: 0,
    ...overrides,
  }
}

describe("StatsBar", () => {
  it("renders all four stat cards", () => {
    render(<StatsBar builds={[makeBuild()]} />)

    expect(screen.getByText("Total builds")).toBeInTheDocument()
    expect(screen.getByText("Parts sourced")).toBeInTheDocument()
    expect(screen.getByText("Est. spend")).toBeInTheDocument()
    expect(screen.getByText("Advisor messages")).toBeInTheDocument()
  })

  it("shows the total build count and active count", () => {
    render(
      <StatsBar
        builds={[
          makeBuild({ status: "in_progress" }),
          makeBuild({ id: "build-002", status: "planning" }),
          makeBuild({ id: "build-003", status: "complete" }),
        ]}
      />
    )

    expect(screen.getByText("3")).toBeInTheDocument()
    expect(screen.getByText("1 active")).toBeInTheDocument()
  })

  it("shows zero counts when there are no builds", () => {
    render(<StatsBar builds={[]} />)

    expect(screen.getByText("0")).toBeInTheDocument()
    expect(screen.getByText("0 active")).toBeInTheDocument()
  })

  it("renders the static summary values", () => {
    render(<StatsBar builds={[makeBuild()]} />)

    expect(screen.getByText("24")).toBeInTheDocument()
    expect(screen.getByText("of 61 total")).toBeInTheDocument()
    expect(screen.getByText("$4,200")).toBeInTheDocument()
    expect(screen.getByText("18")).toBeInTheDocument()
    expect(screen.getByText("this week")).toBeInTheDocument()
  })
})
