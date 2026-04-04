// apps/web/src/app/api/auth/signup/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import { POST } from "./route"

// ── Mock Supabase server client ────────────────────────────────────────────
// We mock the entire module so no real Supabase calls are made
const mockSignUp = vi.fn()

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: {
      signUp: mockSignUp,
    },
  }),
}))

// ── Helper to build a Request ──────────────────────────────────────────────
function makeRequest(body: object) {
  return new Request("http://localhost/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

const validBody = {
  email: "will@wrench.app",
  password: "Wrench123",
  displayName: "Will Kamau",
  region: "Nairobi, Kenya",
}

// ── Tests ──────────────────────────────────────────────────────────────────
describe("POST /api/auth/signup", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Success ──────────────────────────────────────────────────────────────
  describe("success", () => {
    it("returns 201 when Supabase signup succeeds", async () => {
      mockSignUp.mockResolvedValue({ error: null })

      const res = await POST(makeRequest(validBody))
      const data = await res.json()

      expect(res.status).toBe(201)
      expect(data.success).toBe(true)
    })

    it("calls Supabase with correct email and password", async () => {
      mockSignUp.mockResolvedValue({ error: null })

      await POST(makeRequest(validBody))

      expect(mockSignUp).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "will@wrench.app",
          password: "Wrench123",
        })
      )
    })

    it("passes displayName and region as user metadata", async () => {
      mockSignUp.mockResolvedValue({ error: null })

      await POST(makeRequest(validBody))

      expect(mockSignUp).toHaveBeenCalledWith(
        expect.objectContaining({
          options: {
            data: {
              display_name: "Will Kamau",
              region: "Nairobi, Kenya",
            },
          },
        })
      )
    })
  })

  // ── Validation failures ───────────────────────────────────────────────────
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

    it("returns 400 when password is under 8 characters", async () => {
      const res = await POST(makeRequest({ ...validBody, password: "Ab1" }))
      expect(res.status).toBe(400)
    })

    it("returns 400 when displayName is missing", async () => {
      const noName: Partial<typeof validBody> = { ...validBody }
      delete noName.displayName
      const res = await POST(makeRequest(noName))
      expect(res.status).toBe(400)
    })

    it("returns 400 when displayName is too short", async () => {
      const res = await POST(makeRequest({ ...validBody, displayName: "W" }))
      expect(res.status).toBe(400)
    })

    it("returns 400 when region is missing", async () => {
      const noRegion: Partial<typeof validBody> = { ...validBody }
      delete noRegion.region
      const res = await POST(makeRequest(noRegion))
      expect(res.status).toBe(400)
    })

    it("returns 400 with error message for invalid data", async () => {
      const res = await POST(makeRequest({ ...validBody, email: "bad" }))
      const data = await res.json()
      expect(data.error).toBeDefined()
    })

    it("does not call Supabase when validation fails", async () => {
      await POST(makeRequest({ ...validBody, email: "bad" }))
      expect(mockSignUp).not.toHaveBeenCalled()
    })
  })

  // ── Supabase errors ───────────────────────────────────────────────────────
  describe("Supabase errors", () => {
    it("returns 400 when user already exists", async () => {
      mockSignUp.mockResolvedValue({
        error: { message: "User already registered" },
      })

      const res = await POST(makeRequest(validBody))
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.error).toBe("User already registered")
    })

    it("returns 400 with the Supabase error message", async () => {
      mockSignUp.mockResolvedValue({
        error: { message: "Email rate limit exceeded" },
      })

      const res = await POST(makeRequest(validBody))
      const data = await res.json()

      expect(data.error).toBe("Email rate limit exceeded")
    })
  })
})