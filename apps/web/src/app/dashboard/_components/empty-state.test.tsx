import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"

import { EmptyState } from "./empty-state"

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

describe("EmptyState", () => {
  it("renders the empty state copy", () => {
    render(<EmptyState />)

    expect(screen.getByText("No builds yet")).toBeInTheDocument()
    expect(
      screen.getByText("Start by creating your first build")
    ).toBeInTheDocument()
  })

  it("renders a CTA linking to the new build page", () => {
    render(<EmptyState />)

    expect(
      screen.getByRole("link", { name: /create your first build/i })
    ).toHaveAttribute("href", "/builds/new")
  })
})
