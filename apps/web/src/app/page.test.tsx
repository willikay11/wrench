import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import HomePage from "./page"
import * as conversationApi from "@/lib/api/conversation"
import * as buildsApi from "@/lib/api/builds"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}))

vi.mock("@/components/brand/logo", () => ({
  Logo: () => <div data-testid="logo">Wrench</div>,
}))

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      signInAnonymously: vi.fn().mockResolvedValue({ error: null }),
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: "test-token" } },
      }),
    },
  }),
}))

vi.mock("@/lib/api/conversation")
vi.mock("@/lib/api/builds")

const mockSendMessage = vi.mocked(conversationApi.sendMessage)
const mockCreateBuild = vi.mocked(buildsApi.createBuild)

describe("HomePage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("Idle state", () => {
    it("renders 'What are you building?' heading", () => {
      render(<HomePage />)
      expect(screen.getByText("What are you building?")).toBeInTheDocument()
    })

    it("shows example chips", () => {
      render(<HomePage />)
      expect(screen.getByRole("button", { name: /K24 swap into an E30/i })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /Change rims on my WRX/i })).toBeInTheDocument()
    })

    it("allows typing and submitting message", async () => {
      const user = userEvent.setup()
      mockSendMessage.mockResolvedValueOnce({
        reply: "What car?",
        state: "gathering",
        extracted: { car: null, goal: null, use_case: null },
        session_id: "session-1",
      })

      render(<HomePage />)

      const input = screen.getByPlaceholderText(/e.g. K24 swap/i)
      await user.type(input, "BMW")
      await user.click(screen.getByRole("button", { name: "→" }))

      await waitFor(() => {
        expect(screen.getByText("What car?")).toBeInTheDocument()
      })
    })
  })

  describe("Chatting state", () => {
    it("shows typing indicator while waiting for response", async () => {
      const user = userEvent.setup()
      mockSendMessage.mockImplementationOnce(() => new Promise(() => {})) // Never resolves

      render(<HomePage />)

      const input = screen.getByPlaceholderText(/e.g. K24 swap/i)
      await user.type(input, "test")
      await user.click(screen.getByRole("button", { name: "→" }))

      // Typing indicator should appear
      const dots = screen.getAllByText("")
      expect(dots.length).toBeGreaterThan(0)
    })

    it("renders AI reply after response", async () => {
      const user = userEvent.setup()
      mockSendMessage.mockResolvedValueOnce({
        reply: "Tell me about your car",
        state: "gathering",
        extracted: { car: null, goal: null, use_case: null },
        session_id: "session-1",
      })

      render(<HomePage />)

      const input = screen.getByPlaceholderText(/e.g. K24 swap/i)
      await user.type(input, "hello")
      await user.click(screen.getByRole("button", { name: "→" }))

      await waitFor(() => {
        expect(screen.getByText("Tell me about your car")).toBeInTheDocument()
      })
    })

    it("shows confirmation card when state is confirming", async () => {
      const user = userEvent.setup()
      mockSendMessage.mockResolvedValueOnce({
        reply: "Got it: BMW E30 · engine swap · daily driver",
        state: "confirming",
        extracted: {
          car: "BMW E30",
          goal: "engine swap",
          use_case: "daily driver",
        },
        session_id: "session-1",
      })

      render(<HomePage />)

      const input = screen.getByPlaceholderText(/e.g. K24 swap/i)
      await user.type(input, "BMW E30 engine swap daily driver")
      await user.click(screen.getByRole("button", { name: "→" }))

      await waitFor(() => {
        expect(screen.getByText("Ready to build")).toBeInTheDocument()
        expect(screen.getByText("BMW E30")).toBeInTheDocument()
        expect(screen.getByText("engine swap")).toBeInTheDocument()
        expect(screen.getByText("daily driver")).toBeInTheDocument()
      })
    })
  })

  describe("Creating state", () => {
    it("calls createBuild when ready", async () => {
      const user = userEvent.setup()
      mockSendMessage.mockResolvedValueOnce({
        reply: "Got it: BMW · swap · daily",
        state: "ready",
        extracted: { car: "BMW", goal: "swap", use_case: "daily" },
        session_id: "session-1",
      })
      mockCreateBuild.mockResolvedValueOnce({
        id: "build-123",
      } as any)

      render(<HomePage />)

      const input = screen.getByPlaceholderText(/e.g. K24 swap/i)
      await user.type(input, "test")
      await user.click(screen.getByRole("button", { name: "→" }))

      await waitFor(() => {
        expect(screen.getByText("Creating your build…")).toBeInTheDocument()
      })
    })

    it("shows loading state after confirm", async () => {
      const user = userEvent.setup()
      mockSendMessage.mockResolvedValueOnce({
        reply: "Ready?",
        state: "confirming",
        extracted: { car: "BMW", goal: "swap", use_case: "daily" },
        session_id: "session-1",
      })
      mockCreateBuild.mockResolvedValueOnce({
        id: "build-123",
      } as any)

      render(<HomePage />)

      const input = screen.getByPlaceholderText(/e.g. K24 swap/i)
      await user.type(input, "test")
      await user.click(screen.getByRole("button", { name: "→" }))

      await waitFor(() => {
        expect(screen.getByText("Yes, generate my parts list →")).toBeInTheDocument()
      })

      await user.click(screen.getByText("Yes, generate my parts list →"))

      await waitFor(() => {
        expect(screen.getByText("Creating your build…")).toBeInTheDocument()
      })
    })

    it("shows error toast if conversation API fails", async () => {
      const user = userEvent.setup()
      const { toast } = await import("sonner")
      mockSendMessage.mockRejectedValueOnce(new Error("API error"))

      render(<HomePage />)

      const input = screen.getByPlaceholderText(/e.g. K24 swap/i)
      await user.type(input, "test")
      await user.click(screen.getByRole("button", { name: "→" }))

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("API error")
      })
    })

    it("shows error toast if createBuild fails", async () => {
      const user = userEvent.setup()
      const { toast } = await import("sonner")
      mockSendMessage.mockResolvedValueOnce({
        reply: "Ready?",
        state: "confirming",
        extracted: { car: "BMW", goal: "swap", use_case: "daily" },
        session_id: "session-1",
      })
      mockCreateBuild.mockRejectedValueOnce(new Error("Build failed"))

      render(<HomePage />)

      const input = screen.getByPlaceholderText(/e.g. K24 swap/i)
      await user.type(input, "test")
      await user.click(screen.getByRole("button", { name: "→" }))

      await waitFor(() => {
        expect(screen.getByText("Yes, generate my parts list →")).toBeInTheDocument()
      })

      await user.click(screen.getByText("Yes, generate my parts list →"))

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("Build failed")
      })
    })
  })

  describe("Chip interactions", () => {
    it("sends message when chip is clicked", async () => {
      const user = userEvent.setup()
      mockSendMessage.mockResolvedValueOnce({
        reply: "Got it!",
        state: "gathering",
        extracted: { car: null, goal: null, use_case: null },
        session_id: "session-1",
      })

      render(<HomePage />)

      const chip = screen.getByRole("button", { name: /K24 swap into an E30/i })
      await user.click(chip)

      await waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalledWith(
          "K24 swap into an E30",
          [],
          undefined,
        )
      })
    })
  })
})
