// apps/web/src/app/api/auth/login/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import { POST } from "./route"

const mockSignInWithPassword = vi.fn()
const mockCookiesGetAll = vi.fn(() => [])
const mockCookiesSet = vi.fn()
let capturedSetAll:
  | ((cookiesToSet: Array<{ name: string; value: string; options?: { path?: string } }>) => void)
  | null = null

vi.mock("next/headers", () => ({
  cookies: () => ({
    getAll: mockCookiesGetAll,
    set: mockCookiesSet,
  }),
}))

vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, options: {
    cookies: {
      getAll: () => unknown[]
      setAll: (cookiesToSet: Array<{ name: string; value: string; options?: { path?: string } }>) => void
    }
  }) => {
    capturedSetAll = options.cookies.setAll

    return {
      auth: {
        signInWithPassword: mockSignInWithPassword,
      },
    }
  },
}))

function makeRequest(body: object) {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

const validBody = {
  email: "will@wrench.app",
  password: "Wrench123",
}

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedSetAll = null
    mockCookiesGetAll.mockReturnValue([])
  })

  describe("success", () => {
    it("redirects to /dashboard when credentials are correct", async () => {
      mockSignInWithPassword.mockResolvedValue({ error: null })

      const res = await POST(makeRequest(validBody))

      expect(res.status).toBe(303)
      expect(res.headers.get("location")).toBe("http://localhost/dashboard")
    })

    it("calls Supabase with correct email and password", async () => {
      mockSignInWithPassword.mockResolvedValue({ error: null })

      await POST(makeRequest(validBody))

      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: "will@wrench.app",
        password: "Wrench123",
      })
    })

    it("persists auth cookies on successful login", async () => {
      mockSignInWithPassword.mockImplementation(async () => {
        capturedSetAll?.([
          { name: "sb-access-token", value: "access-token", options: { path: "/" } },
          { name: "sb-refresh-token", value: "refresh-token", options: { path: "/" } },
        ])

        return { error: null }
      })

      const res = await POST(makeRequest(validBody))
      const setCookieHeader = res.headers.get("set-cookie") ?? ""

      expect(res.status).toBe(303)
      expect(res.headers.get("location")).toBe("http://localhost/dashboard")
      expect(mockCookiesSet).toHaveBeenCalledTimes(2)
      expect(setCookieHeader).toContain("sb-access-token=access-token")
      expect(setCookieHeader).toContain("sb-refresh-token=refresh-token")
    })
  })

  describe("invalid request body", () => {
    it("returns 400 when email is missing", async () => {
      const noEmail: Partial<typeof validBody> = { ...validBody }
      delete noEmail.email
      const res = await POST(makeRequest(noEmail))
      expect(res.status).toBe(400)
    })

    it("returns 400 when email is invalid format", async () => {
      const res = await POST(makeRequest({ ...validBody, email: "notanemail" }))
      expect(res.status).toBe(400)
    })

    it("returns 400 when password is missing", async () => {
      const noPassword: Partial<typeof validBody> = { ...validBody }
      delete noPassword.password
      const res = await POST(makeRequest(noPassword))
      expect(res.status).toBe(400)
    })

    it("returns 400 with error message for invalid data", async () => {
      const res = await POST(makeRequest({ email: "bad" }))
      const data = await res.json()
      expect(data.error).toBeDefined()
    })

    it("does not call Supabase when validation fails", async () => {
      await POST(makeRequest({ email: "bad", password: "" }))
      expect(mockSignInWithPassword).not.toHaveBeenCalled()
    })
  })

  describe("Supabase errors", () => {
    it("returns 400 when credentials are wrong", async () => {
      mockSignInWithPassword.mockResolvedValue({
        error: { message: "Invalid login credentials" },
      })

      const res = await POST(makeRequest(validBody))
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.error).toBe("Invalid login credentials")
    })

    it("returns 400 when email is not confirmed", async () => {
      mockSignInWithPassword.mockResolvedValue({
        error: { message: "Email not confirmed" },
      })

      const res = await POST(makeRequest(validBody))
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.error).toBe("Email not confirmed")
    })

    it("passes Supabase error message through to the response", async () => {
      const errorMessage = "Too many requests"
      mockSignInWithPassword.mockResolvedValue({
        error: { message: errorMessage },
      })

      const res = await POST(makeRequest(validBody))
      const data = await res.json()

      expect(data.error).toBe(errorMessage)
    })
  })
})