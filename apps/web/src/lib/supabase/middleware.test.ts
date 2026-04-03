// apps/web/src/lib/supabase/middleware.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"
import { updateSession } from "./middleware"

// ── Mock Supabase SSR ──────────────────────────────────────────────────────
const mockGetUser = vi.fn()

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getUser: mockGetUser,
    },
  }),
}))

// ── Mock env vars ──────────────────────────────────────────────────────────
vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321")
vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key")

// ── Helper ─────────────────────────────────────────────────────────────────
function makeRequest(path: string) {
  return new NextRequest(`http://localhost:3000${path}`)
}

const authenticatedUser = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "will@wrench.app",
}

// ── Tests ──────────────────────────────────────────────────────────────────
describe("updateSession", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Unauthenticated — protected routes ────────────────────────────────────
  describe("unauthenticated user on protected routes", () => {
    beforeEach(() => {
      mockGetUser.mockResolvedValue({ data: { user: null } })
    })

    it("redirects /dashboard to /auth/login", async () => {
      const res = await updateSession(makeRequest("/dashboard"))
      expect(res.status).toBe(307)
      expect(res.headers.get("location")).toBe(
        "http://localhost:3000/auth/login"
      )
    })

    it("redirects /builds to /auth/login", async () => {
      const res = await updateSession(makeRequest("/builds"))
      expect(res.status).toBe(307)
      expect(res.headers.get("location")).toBe(
        "http://localhost:3000/auth/login"
      )
    })

    it("redirects nested /builds/abc-123 to /auth/login", async () => {
      const res = await updateSession(makeRequest("/builds/abc-123"))
      expect(res.status).toBe(307)
      expect(res.headers.get("location")).toBe(
        "http://localhost:3000/auth/login"
      )
    })

    it("redirects /profile to /auth/login", async () => {
      const res = await updateSession(makeRequest("/profile"))
      expect(res.status).toBe(307)
      expect(res.headers.get("location")).toBe(
        "http://localhost:3000/auth/login"
      )
    })

    it("redirects /settings to /auth/login", async () => {
      const res = await updateSession(makeRequest("/settings"))
      expect(res.status).toBe(307)
      expect(res.headers.get("location")).toBe(
        "http://localhost:3000/auth/login"
      )
    })
  })

  // ── Unauthenticated — public routes ───────────────────────────────────────
  describe("unauthenticated user on public routes", () => {
    beforeEach(() => {
      mockGetUser.mockResolvedValue({ data: { user: null } })
    })

    it("allows access to /auth/login", async () => {
      const res = await updateSession(makeRequest("/auth/login"))
      expect(res.status).not.toBe(307)
    })

    it("allows access to /auth/signup", async () => {
      const res = await updateSession(makeRequest("/auth/signup"))
      expect(res.status).not.toBe(307)
    })

    it("allows access to /auth/callback", async () => {
      const res = await updateSession(makeRequest("/auth/callback"))
      expect(res.status).not.toBe(307)
    })

    it("allows access to /", async () => {
      const res = await updateSession(makeRequest("/"))
      expect(res.status).not.toBe(307)
    })
  })

  // ── Authenticated user ────────────────────────────────────────────────────
  describe("authenticated user", () => {
    beforeEach(() => {
      mockGetUser.mockResolvedValue({ data: { user: authenticatedUser } })
    })

    it("allows access to /dashboard", async () => {
      const res = await updateSession(makeRequest("/dashboard"))
      expect(res.status).not.toBe(307)
    })

    it("allows access to /builds", async () => {
      const res = await updateSession(makeRequest("/builds"))
      expect(res.status).not.toBe(307)
    })

    it("allows access to /builds/abc-123", async () => {
      const res = await updateSession(makeRequest("/builds/abc-123"))
      expect(res.status).not.toBe(307)
    })

    it("allows access to /profile", async () => {
      const res = await updateSession(makeRequest("/profile"))
      expect(res.status).not.toBe(307)
    })

    it("allows access to /settings", async () => {
      const res = await updateSession(makeRequest("/settings"))
      expect(res.status).not.toBe(307)
    })
  })

  // ── Expired session ───────────────────────────────────────────────────────
  describe("expired session", () => {
    it("redirects to /auth/login when JWT is expired", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: { message: "JWT expired" },
      })

      const res = await updateSession(makeRequest("/dashboard"))
      expect(res.status).toBe(307)
      expect(res.headers.get("location")).toBe(
        "http://localhost:3000/auth/login"
      )
    })

    it("redirects to /auth/login when token is invalid", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: { message: "Invalid JWT" },
      })

      const res = await updateSession(makeRequest("/builds"))
      expect(res.status).toBe(307)
      expect(res.headers.get("location")).toBe(
        "http://localhost:3000/auth/login"
      )
    })

    it("allows through when session is valid but close to expiry", async () => {
      // User object present means Supabase refreshed the session successfully
      mockGetUser.mockResolvedValue({
        data: { user: authenticatedUser },
        error: null,
      })

      const res = await updateSession(makeRequest("/dashboard"))
      expect(res.status).not.toBe(307)
    })
  })

  // ── Redirect integrity ────────────────────────────────────────────────────
  describe("redirect integrity", () => {
    beforeEach(() => {
      mockGetUser.mockResolvedValue({ data: { user: null } })
    })

    it("always redirects to the same origin", async () => {
      const res = await updateSession(makeRequest("/dashboard"))
      const location = res.headers.get("location") ?? ""
      expect(location.startsWith("http://localhost:3000")).toBe(true)
    })

    it("never redirects to an external URL", async () => {
      const res = await updateSession(makeRequest("/dashboard"))
      const location = res.headers.get("location") ?? ""
      expect(location).not.toContain("https://")
      expect(location.startsWith("http://localhost:3000")).toBe(true)
    })

    it("redirect destination is exactly /auth/login with no trailing slash", async () => {
      const res = await updateSession(makeRequest("/dashboard"))
      expect(res.headers.get("location")).toBe(
        "http://localhost:3000/auth/login"
      )
    })
  })
})