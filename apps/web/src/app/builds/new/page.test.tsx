import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import NewBuildPage from "./page"

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}))

describe("NewBuildPage", () => {
  it("renders the step one form with the expected fields", () => {
    render(<NewBuildPage />)

    expect(screen.getByText(/tell us about your build/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/build title/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^car$/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/engine swap/i)).not.toBeInTheDocument()
    expect(screen.getByText(/daily driver/i)).toBeInTheDocument()
    expect(screen.getByText(/track use/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled()
  })

  it("enables continue after the required fields are completed", async () => {
    const user = userEvent.setup()

    render(<NewBuildPage />)

    await user.type(screen.getByLabelText(/build title/i), "E30 K24 swap")
    await user.type(screen.getByLabelText(/^car$/i), "1991 BMW E30 325i")
    await user.click(screen.getByRole("checkbox", { name: /daily driver/i }))

    expect(screen.getByRole("button", { name: /continue/i })).toBeEnabled()
  })

  it("advances to step two after a valid step one", async () => {
    const user = userEvent.setup()

    render(<NewBuildPage />)

    await user.type(screen.getByLabelText(/build title/i), "E30 K24 swap")
    await user.type(screen.getByLabelText(/^car$/i), "1991 BMW E30 325i")
    await user.click(screen.getByRole("checkbox", { name: /track use/i }))
    await user.click(screen.getByRole("button", { name: /continue/i }))

    expect(screen.getByText(/^upload a reference image$/i)).toBeInTheDocument()
    expect(
      screen.getByText(/wrench will use ai to identify your car/i)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/drop photos here or click to browse/i)
    ).toBeInTheDocument()
  })
})
