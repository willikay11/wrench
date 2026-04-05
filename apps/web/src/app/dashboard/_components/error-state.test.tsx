import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"

import { ErrorState } from "./error-state"

describe("ErrorState", () => {
  it("renders the error prefix and message", () => {
    render(<ErrorState message="Failed to connect to API" />)

    expect(
      screen.getByText("Failed to load builds: Failed to connect to API")
    ).toBeInTheDocument()
  })

  it("renders any provided error message", () => {
    render(<ErrorState message="Timeout while loading" />)

    expect(screen.getByText(/Timeout while loading/i)).toBeInTheDocument()
  })
})
