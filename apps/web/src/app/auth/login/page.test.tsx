// apps/web/src/app/auth/login/page.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import LoginPage from "./page"

const mockPush = vi.fn()
const mockReplace = vi.fn()
const mockRefresh = vi.fn()
const mockSearchParamsGet = vi.fn()
const mockFetch = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    refresh: mockRefresh,
  }),
  useSearchParams: () => ({
    get: mockSearchParamsGet,
  }),
}))

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode
    href: string
  }) => <a href={href}>{children}</a>,
}))

vi.stubGlobal("fetch", mockFetch)
vi.stubGlobal("location", {
  ...window.location,
  href: "http://localhost:3000/auth/login",
})

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

async function fillForm(overrides: Record<string, string> = {}) {
  const user = userEvent.setup()
  const values = {
    email: "will@wrench.app",
    password: "Wrench123",
    ...overrides,
  }

  await user.type(screen.getByPlaceholderText("you@example.com"), values.email)
  await user.type(screen.getByLabelText(/^password$/i), values.password)

  return user
}

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSearchParamsGet.mockReturnValue(null)
    mockFetch.mockResolvedValue({
      ok: true,
      redirected: false,
      url: "http://localhost:3000/dashboard",
      json: vi.fn().mockResolvedValue({ success: true }),
    })
    window.location.href = "http://localhost:3000/auth/login"
    render(<LoginPage />)
  })

  describe("rendering", () => {
    it("renders the Wrench logo", () => {
      expect(screen.getByText("Wrench")).toBeInTheDocument()
    })

    it("renders the page title", () => {
      expect(screen.getByText("Welcome back")).toBeInTheDocument()
    })

    it("renders email and password fields", () => {
      expect(
        screen.getByPlaceholderText("you@example.com")
      ).toBeInTheDocument()
      expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument()
    })

    it("renders the sign in button", () => {
      expect(
        screen.getByRole("button", { name: /sign in/i })
      ).toBeInTheDocument()
    })

    it("renders a forgot password link", () => {
      expect(
        screen.getByRole("link", { name: /forgot password/i })
      ).toBeInTheDocument()
    })

    it("renders a link to the signup page", () => {
      const link = screen.getByRole("link", { name: /create one/i })
      expect(link).toHaveAttribute("href", "/auth/signup")
    })
  })

  describe("client-side validation", () => {
    it("shows error when email is empty on submit", async () => {
      const user = userEvent.setup()
      await user.click(screen.getByRole("button", { name: /sign in/i }))

      await waitFor(() => {
        expect(
          screen.getByText("Please enter a valid email address")
        ).toBeInTheDocument()
      })
    })

    it("shows error when password is empty on submit", async () => {
      const user = userEvent.setup()
      await user.type(
        screen.getByPlaceholderText("you@example.com"),
        "will@wrench.app"
      )
      await user.click(screen.getByRole("button", { name: /sign in/i }))

      await waitFor(() => {
        expect(
          screen.getByText("Please enter your password")
        ).toBeInTheDocument()
      })
    })

    it("does not call fetch when validation fails", async () => {
      const user = userEvent.setup()
      await user.click(screen.getByRole("button", { name: /sign in/i }))
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe("form submission", () => {
    it("calls the login API on valid submit", async () => {
      const user = await fillForm()
      await user.click(screen.getByRole("button", { name: /sign in/i }))

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled()
      })
    })

    it("sends email and password to the login API", async () => {
      const user = await fillForm()
      await user.click(screen.getByRole("button", { name: /sign in/i }))

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          "/api/auth/login",
          expect.objectContaining({
            method: "POST",
            credentials: "include",
            body: JSON.stringify({
              email: "will@wrench.app",
              password: "Wrench123",
              next: "/dashboard",
            }),
          })
        )
      })
    })

    it("redirects to /dashboard on success", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        redirected: true,
        url: "http://localhost:3000/dashboard",
        json: vi.fn().mockResolvedValue({ success: true }),
      })

      const user = await fillForm()
      await user.click(screen.getByRole("button", { name: /sign in/i }))

      await waitFor(() => {
        expect(window.location.href).toBe("http://localhost:3000/dashboard")
      })
    })

    it("shows error toast on wrong credentials", async () => {
      const { toast } = await import("sonner")
      mockFetch.mockResolvedValue({
        ok: false,
        json: vi.fn().mockResolvedValue({ error: "Invalid login credentials" }),
      })

      const user = await fillForm()
      await user.click(screen.getByRole("button", { name: /sign in/i }))

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("Invalid login credentials")
      })
    })

    it("shows error toast on email not confirmed", async () => {
      const { toast } = await import("sonner")
      mockFetch.mockResolvedValue({
        ok: false,
        json: vi.fn().mockResolvedValue({ error: "Email not confirmed" }),
      })

      const user = await fillForm()
      await user.click(screen.getByRole("button", { name: /sign in/i }))

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("Email not confirmed")
      })
    })

    it("disables the button while request is in flight", async () => {
      let resolveRequest: (value: unknown) => void
      mockFetch.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveRequest = resolve
          })
      )

      const user = await fillForm()
      const btn = screen.getByRole("button", { name: /sign in/i })
      await user.click(btn)

      await waitFor(() => {
        expect(btn).toBeDisabled()
      })

      resolveRequest!({
        ok: true,
        json: vi.fn().mockResolvedValue({ success: true }),
      })
    })

    it("re-enables the button after a failed request", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: vi.fn().mockResolvedValue({ error: "Invalid login credentials" }),
      })

      const user = await fillForm()
      const btn = screen.getByRole("button", { name: /sign in/i })
      await user.click(btn)

      await waitFor(() => {
        expect(btn).not.toBeDisabled()
      })
    })
  })
})