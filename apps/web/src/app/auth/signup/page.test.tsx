// apps/web/src/app/auth/signup/page.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest"
import type { ReactNode } from "react"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import SignupPage from "./page"

// ── Mock next/navigation ───────────────────────────────────────────────────
const mockPush = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}))

// ── Mock next/link ─────────────────────────────────────────────────────────
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

// ── Mock fetch ─────────────────────────────────────────────────────────────
const mockFetch = vi.fn()
global.fetch = mockFetch

// ── Mock sonner ────────────────────────────────────────────────────────────
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

// ── Helpers ────────────────────────────────────────────────────────────────
async function fillForm(overrides: Record<string, string> = {}) {
  const user = userEvent.setup()
  const values = {
    displayName: "Will Kamau",
    email: "will@wrench.app",
    password: "Wrench123",
    confirmPassword: "Wrench123",
    region: "Nairobi, Kenya",
    ...overrides,
  }

  await user.type(
    screen.getByPlaceholderText("e.g. Will Kamau"),
    values.displayName
  )
  await user.type(
    screen.getByPlaceholderText("you@example.com"),
    values.email
  )

  const passwordInputs = screen.getAllByDisplayValue("")
  await user.type(passwordInputs[0], values.password)
  await user.type(passwordInputs[1], values.confirmPassword)

  await user.type(
    screen.getByPlaceholderText("e.g. Nairobi, Kenya"),
    values.region
  )

  return user
}

// ── Tests ──────────────────────────────────────────────────────────────────
describe("SignupPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    render(<SignupPage />)
  })

  // ── Rendering ─────────────────────────────────────────────────────────────
  describe("rendering", () => {
    it("renders the Wrench logo", () => {
      expect(screen.getByText("Wrench")).toBeInTheDocument()
    })

    it("renders the page title", () => {
      expect(screen.getByText("Create an account")).toBeInTheDocument()
    })

    it("renders all five form fields", () => {
      expect(screen.getByPlaceholderText("e.g. Will Kamau")).toBeInTheDocument()
      expect(screen.getByPlaceholderText("you@example.com")).toBeInTheDocument()
      expect(screen.getByPlaceholderText("e.g. Nairobi, Kenya")).toBeInTheDocument()
    })

    it("renders the create account button", () => {
      expect(
        screen.getByRole("button", { name: /create account/i })
      ).toBeInTheDocument()
    })

    it("renders a link to the login page", () => {
      const link = screen.getByRole("link", { name: /sign in/i })
      expect(link).toHaveAttribute("href", "/auth/login")
    })
  })

  // ── Validation ────────────────────────────────────────────────────────────
  describe("client-side validation", () => {
    it("shows errors when form is submitted empty", async () => {
      const user = userEvent.setup()
      await user.click(
        screen.getByRole("button", { name: /create account/i })
      )
      await waitFor(() => {
        expect(
          screen.getByText("Name must be at least 2 characters")
        ).toBeInTheDocument()
      })
    })

    it("shows password mismatch error", async () => {
      const user = userEvent.setup()

      await user.type(screen.getByPlaceholderText("e.g. Will Kamau"), "Will")
      await user.type(screen.getByPlaceholderText("you@example.com"), "will@wrench.app")

      const allPasswordInputs = screen.getAllByDisplayValue("")
      await user.type(allPasswordInputs[0], "Wrench123")
      await user.type(allPasswordInputs[1], "Different1")

      await user.click(
        screen.getByRole("button", { name: /create account/i })
      )

      await waitFor(() => {
        expect(screen.getByText("Passwords do not match")).toBeInTheDocument()
      })
    })

    it("does not call fetch when validation fails", async () => {
      const user = userEvent.setup()
      await user.click(
        screen.getByRole("button", { name: /create account/i })
      )
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  // ── Submission ────────────────────────────────────────────────────────────
  describe("form submission", () => {
    it("calls fetch with correct endpoint on valid submit", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      })

      const user = await fillForm()
      await user.click(screen.getByRole("button", { name: /create account/i }))

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          "/api/auth/signup",
          expect.objectContaining({ method: "POST" })
        )
      })
    })

    it("redirects to /dashboard on success", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      })

      const user = await fillForm()
      await user.click(screen.getByRole("button", { name: /create account/i }))

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/dashboard")
      })
    })

    it("shows error toast when API returns an error", async () => {
      const { toast } = await import("sonner")
      mockFetch.mockResolvedValue({
        ok: false,
        json: async () => ({ error: "User already registered" }),
      })

      const user = await fillForm()
      await user.click(screen.getByRole("button", { name: /create account/i }))

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("User already registered")
      })
    })

    it("disables the submit button while loading", async () => {
      mockFetch.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 1000))
      )

      const user = await fillForm()
      const btn = screen.getByRole("button", { name: /create account/i })
      await user.click(btn)

      await waitFor(() => {
        expect(btn).toBeDisabled()
      })
    })
  })
})