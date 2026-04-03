import { describe, it, expect, vi, beforeEach } from "vitest"
import type { ReactNode } from "react"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import ForgotPasswordPage from "./page"

const mockResetPasswordForEmail = vi.fn()

vi.mock("next/link", () => ({
	default: ({ children, href }: { children: ReactNode; href: string }) => (
		<a href={href}>{children}</a>
	),
}))

vi.mock("@/lib/supabase/client", () => ({
	createClient: () => ({
		auth: {
			resetPasswordForEmail: mockResetPasswordForEmail,
		},
	}),
}))

vi.mock("sonner", () => ({
	toast: {
		success: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
	},
}))

async function fillForm(email = "will@wrench.app") {
	const user = userEvent.setup()
	await user.type(screen.getByPlaceholderText("you@example.com"), email)
	return user
}

describe("ForgotPasswordPage", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		render(<ForgotPasswordPage />)
	})

	describe("rendering", () => {
		it("renders the Wrench logo", () => {
			expect(screen.getByText("Wrench")).toBeInTheDocument()
		})

		it("renders the page title", () => {
			expect(screen.getByText("Forgot your password?")).toBeInTheDocument()
		})

		it("renders the email field", () => {
			expect(screen.getByPlaceholderText("you@example.com")).toBeInTheDocument()
			expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument()
		})

		it("renders the send reset link button", () => {
			expect(
				screen.getByRole("button", { name: /send reset link/i })
			).toBeInTheDocument()
		})

		it("renders back to sign in link", () => {
			const link = screen.getByRole("link", { name: /back to sign in/i })
			expect(link).toHaveAttribute("href", "/auth/login")
		})
	})

	describe("client-side validation", () => {
		it("shows error when email is empty on submit", async () => {
			const user = userEvent.setup()
			await user.click(screen.getByRole("button", { name: /send reset link/i }))

			await waitFor(() => {
				expect(
					screen.getByText("Please enter a valid email address")
				).toBeInTheDocument()
			})
		})

		it("does not submit when email format is invalid", async () => {
			const user = await fillForm("not-an-email")
			await user.click(screen.getByRole("button", { name: /send reset link/i }))

			await waitFor(() => {
				expect(mockResetPasswordForEmail).not.toHaveBeenCalled()
			})
		})

		it("does not call Supabase when validation fails", async () => {
			const user = userEvent.setup()
			await user.click(screen.getByRole("button", { name: /send reset link/i }))
			expect(mockResetPasswordForEmail).not.toHaveBeenCalled()
		})
	})

	describe("form submission", () => {
		it("calls resetPasswordForEmail with email and reset redirect", async () => {
			mockResetPasswordForEmail.mockResolvedValue({ error: null })

			const user = await fillForm()
			await user.click(screen.getByRole("button", { name: /send reset link/i }))

			await waitFor(() => {
				expect(mockResetPasswordForEmail).toHaveBeenCalledWith(
					"will@wrench.app",
					expect.objectContaining({
						redirectTo: expect.stringContaining("/auth/reset"),
					})
				)
			})
		})

		it("shows error toast when Supabase returns an error", async () => {
			const { toast } = await import("sonner")
			mockResetPasswordForEmail.mockResolvedValue({
				error: { message: "Too many requests" },
			})

			const user = await fillForm()
			await user.click(screen.getByRole("button", { name: /send reset link/i }))

			await waitFor(() => {
				expect(toast.error).toHaveBeenCalledWith("Too many requests")
			})
		})

		it("disables button and shows loading text while request is in flight", async () => {
			let resolveRequest: (value: unknown) => void
			mockResetPasswordForEmail.mockImplementation(
				() =>
					new Promise((resolve) => {
						resolveRequest = resolve
					})
			)

			const user = await fillForm()
			const btn = screen.getByRole("button", { name: /send reset link/i })
			await user.click(btn)

			await waitFor(() => {
				expect(btn).toBeDisabled()
				expect(screen.getByRole("button", { name: /sending link/i })).toBeInTheDocument()
			})

			resolveRequest!({ error: null })
		})

		it("shows confirmation state after success", async () => {
			mockResetPasswordForEmail.mockResolvedValue({ error: null })

			const user = await fillForm("founder@wrench.app")
			await user.click(screen.getByRole("button", { name: /send reset link/i }))

			await waitFor(() => {
				expect(screen.getByText("Check your email")).toBeInTheDocument()
				expect(screen.getByText("founder@wrench.app")).toBeInTheDocument()
			})

			const link = screen.getByRole("link", { name: /back to sign in/i })
			expect(link).toHaveAttribute("href", "/auth/login")
		})

		it("re-enables button after a failed request", async () => {
			mockResetPasswordForEmail.mockResolvedValue({
				error: { message: "Invalid email" },
			})

			const user = await fillForm()
			const btn = screen.getByRole("button", { name: /send reset link/i })
			await user.click(btn)

			await waitFor(() => {
				expect(btn).not.toBeDisabled()
			})
		})
	})
})
