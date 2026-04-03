import { beforeEach, describe, expect, it, vi } from "vitest"
import { POST } from "./route"

const mockUpdateUser = vi.fn()

vi.mock("@/lib/supabase/server", () => ({
	createClient: () => ({
		auth: {
			updateUser: mockUpdateUser,
		},
	}),
}))

function makeRequest(body: object) {
	return new Request("http://localhost/api/auth/reset-password", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	})
}

const validBody = {
	password: "Wrench123",
}

describe("POST /api/auth/reset-password", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe("success", () => {
		it("returns 200 when password update succeeds", async () => {
			mockUpdateUser.mockResolvedValue({ error: null })

			const res = await POST(makeRequest(validBody))
			const data = await res.json()

			expect(res.status).toBe(200)
			expect(data.success).toBe(true)
		})

		it("calls Supabase with the new password", async () => {
			mockUpdateUser.mockResolvedValue({ error: null })

			await POST(makeRequest(validBody))

			expect(mockUpdateUser).toHaveBeenCalledWith({
				password: "Wrench123",
			})
		})
	})

	describe("invalid request body", () => {
		it("returns 400 when password is missing", async () => {
			const res = await POST(makeRequest({}))
			expect(res.status).toBe(400)
		})

		it("returns 400 when password is too short", async () => {
			const res = await POST(makeRequest({ password: "Short1" }))
			expect(res.status).toBe(400)
		})

		it("returns 400 when password has no uppercase letter", async () => {
			const res = await POST(makeRequest({ password: "wrench123" }))
			expect(res.status).toBe(400)
		})

		it("returns 400 when password has no number", async () => {
			const res = await POST(makeRequest({ password: "WrenchPass" }))
			expect(res.status).toBe(400)
		})

		it("returns 400 with error message for invalid data", async () => {
			const res = await POST(makeRequest({ password: "bad" }))
			const data = await res.json()

			expect(data.error).toBeDefined()
		})

		it("does not call Supabase when validation fails", async () => {
			await POST(makeRequest({ password: "bad" }))

			expect(mockUpdateUser).not.toHaveBeenCalled()
		})
	})

	describe("Supabase errors", () => {
		it("returns 400 when session is missing", async () => {
			mockUpdateUser.mockResolvedValue({
				error: { message: "Auth session missing!" },
			})

			const res = await POST(makeRequest(validBody))
			const data = await res.json()

			expect(res.status).toBe(400)
			expect(data.error).toBe("Auth session missing!")
		})

		it("returns 400 when password update fails", async () => {
			mockUpdateUser.mockResolvedValue({
				error: { message: "New password should be different from the old password." },
			})

			const res = await POST(makeRequest(validBody))
			const data = await res.json()

			expect(res.status).toBe(400)
			expect(data.error).toBe("New password should be different from the old password.")
		})

		it("passes Supabase error message through to the response", async () => {
			const errorMessage = "Reset token expired"
			mockUpdateUser.mockResolvedValue({
				error: { message: errorMessage },
			})

			const res = await POST(makeRequest(validBody))
			const data = await res.json()

			expect(data.error).toBe(errorMessage)
		})
	})
})
