// apps/web/src/app/auth/callback/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import { GET } from "./route"

const mockExchangeCodeForSession = vi.fn()

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: {
      exchangeCodeForSession: mockExchangeCodeForSession,
    },
  }),
}))

function makeRequest(params: Record<string, string>) {
  const url = new URL("http://localhost:3000/auth/callback")
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new Request(url.toString())
}

describe("GET /auth/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("success", () => {
    it("exchanges code and redirects to /dashboard by default", async () => {
      mockExchangeCodeForSession.mockResolvedValue({ error: null })

      const res = await GET(makeRequest({ code: "valid-code" }))

      expect(mockExchangeCodeForSession).toHaveBeenCalledWith("valid-code")
      expect(res.status).toBe(307)
      expect(res.headers.get("location")).toBe(
        "http://localhost:3000/dashboard"
      )
    })

    it("redirects to the next param when provided", async () => {
      mockExchangeCodeForSession.mockResolvedValue({ error: null })

      const res = await GET(
        makeRequest({ code: "valid-code", next: "/builds" })
      )

      expect(res.headers.get("location")).toBe("http://localhost:3000/builds")
    })

    it("calls exchangeCodeForSession with the correct code", async () => {
      mockExchangeCodeForSession.mockResolvedValue({ error: null })

      await GET(makeRequest({ code: "abc-123" }))

      expect(mockExchangeCodeForSession).toHaveBeenCalledWith("abc-123")
    })
  })

  describe("missing code", () => {
    it("redirects to login with missing_code error when no code", async () => {
      const res = await GET(makeRequest({}))

      expect(mockExchangeCodeForSession).not.toHaveBeenCalled()
      expect(res.status).toBe(307)
      expect(res.headers.get("location")).toBe(
        "http://localhost:3000/auth/login?error=missing_code"
      )
    })
  })

  describe("Supabase errors", () => {
    it("redirects to login with encoded error message", async () => {
      mockExchangeCodeForSession.mockResolvedValue({
        error: { message: "Invalid code" },
      })

      const res = await GET(makeRequest({ code: "bad-code" }))

      expect(res.status).toBe(307)
      expect(res.headers.get("location")).toBe(
        "http://localhost:3000/auth/login?error=Invalid%20code"
      )
    })

    it("does not redirect to dashboard when exchange fails", async () => {
      mockExchangeCodeForSession.mockResolvedValue({
        error: { message: "Expired code" },
      })

      const res = await GET(makeRequest({ code: "expired" }))
      const location = res.headers.get("location") ?? ""

      expect(location).not.toContain("/dashboard")
    })
  })
})