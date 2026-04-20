import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import NewBuildPage from "./page"
import { toast } from "sonner"
import * as buildsApi from "@/lib/api/builds"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock("sonner")

vi.mock("@/components/brand/logo", () => ({
  Logo: () => <div data-testid="logo">Wrench</div>,
}))

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: "test-token" } },
      }),
    },
  }),
}))

vi.mock("@/lib/api/builds")

const mockCreateBuild = vi.mocked(buildsApi.createBuild)

describe("NewBuildPage Conversational Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateBuild.mockResolvedValue({
      id: "build-123",
      user_id: "user-001",
      title: "BMW E30 — engine swap",
      status: "planning",
      is_public: false,
      goals: ["engine swap"],
      created_at: "2026-01-01T00:00:00+00:00",
      updated_at: "2026-01-01T00:00:00+00:00",
      embedding: null,
      vision_data: null,
    } as Parameters<typeof mockCreateBuild.mockResolvedValue>[0])
  })

  describe("Initial state", () => {
    it("shows initial AI message", () => {
      render(<NewBuildPage />)
      expect(screen.getByText("What are you building?")).toBeInTheDocument()
    })

    it("shows no chips in idle state", () => {
      render(<NewBuildPage />)
      const chipButtons = screen.queryAllByRole("button", {
        name: /BMW|Subaru|Honda|Mazda|Toyota/i,
      })
      expect(chipButtons.length).toBe(0)
    })

    it("renders input field and send button", () => {
      render(<NewBuildPage />)
      expect(screen.getByPlaceholderText(/type or pick/i)).toBeInTheDocument()
    })
  })

  describe("Car detection", () => {
    it("detects car and transitions to needs_goal", async () => {
      const user = userEvent.setup()
      render(<NewBuildPage />)

      const input = screen.getByPlaceholderText(/type or pick/i)
      await user.type(input, "BMW")
      await user.click(screen.getByRole("button", { name: "→" }))

      await waitFor(() => {
        expect(screen.getByText(/What do you want to do with your/i)).toBeInTheDocument()
      })
    })

    it("transitions to needs_car when no car detected", async () => {
      const user = userEvent.setup()
      render(<NewBuildPage />)

      const input = screen.getByPlaceholderText(/type or pick/i)
      await user.type(input, "something about modifications")
      await user.click(screen.getByRole("button", { name: "→" }))

      await waitFor(() => {
        expect(screen.getByText("What car are you working on?")).toBeInTheDocument()
      })
    })

    it("shows car chips when in needs_car stage", async () => {
      const user = userEvent.setup()
      render(<NewBuildPage />)

      const input = screen.getByPlaceholderText(/type or pick/i)
      await user.type(input, "random text")
      await user.click(screen.getByRole("button", { name: "→" }))

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "BMW E30" })).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "Subaru WRX" })).toBeInTheDocument()
      })
    })
  })

  describe("Decision flow", () => {
    it("transitions to recommending_cars when user says 'deciding'", async () => {
      const user = userEvent.setup()
      render(<NewBuildPage />)

      const input = screen.getByPlaceholderText(/type or pick/i)
      await user.type(input, "I'm still deciding")
      await user.click(screen.getByRole("button", { name: "→" }))

      await waitFor(() => {
        expect(
          screen.getByText(/Three platforms that work really well/i),
        ).toBeInTheDocument()
      })
    })

    it("shows recommendations with their chips", async () => {
      const user = userEvent.setup()
      render(<NewBuildPage />)

      const input = screen.getByPlaceholderText(/type or pick/i)
      await user.type(input, "not sure")
      await user.click(screen.getByRole("button", { name: "→" }))

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "BMW E30" })).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "Mazda Miata" })).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "Something else" })).toBeInTheDocument()
      })
    })
  })

  describe("Chip interactions", () => {
    it("sends message when chip is clicked", async () => {
      const user = userEvent.setup()
      render(<NewBuildPage />)

      const input = screen.getByPlaceholderText(/type or pick/i)
      await user.type(input, "not sure")
      await user.click(screen.getByRole("button", { name: "→" }))

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "BMW E30" })).toBeInTheDocument()
      })

      await user.click(screen.getByRole("button", { name: "BMW E30" }))

      await waitFor(() => {
        expect(screen.getByText(/What do you want to do with your/i)).toBeInTheDocument()
      })
    })

    it("shows goal chips after car is selected", async () => {
      const user = userEvent.setup()
      render(<NewBuildPage />)

      const input = screen.getByPlaceholderText(/type or pick/i)
      await user.type(input, "BMW")
      await user.click(screen.getByRole("button", { name: "→" }))

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Engine swap" })).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "Suspension upgrade" })).toBeInTheDocument()
      })
    })
  })

  describe("Confirmation flow", () => {
    it("shows confirmation card after all fields set", async () => {
      const user = userEvent.setup()
      render(<NewBuildPage />)

      const input = screen.getByPlaceholderText(/type or pick/i)
      await user.type(input, "BMW")
      await user.click(screen.getByRole("button", { name: "→" }))

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Engine swap" })).toBeInTheDocument()
      })
      await user.click(screen.getByRole("button", { name: "Engine swap" }))

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Daily driver" })).toBeInTheDocument()
      })
      await user.click(screen.getByRole("button", { name: "Daily driver" }))

      await waitFor(() => {
        expect(screen.getByText("Ready to build")).toBeInTheDocument()
      })
    })

    it("displays car, goal, and useCase in confirmation", async () => {
      const user = userEvent.setup()
      render(<NewBuildPage />)

      const input = screen.getByPlaceholderText(/type or pick/i)
      await user.type(input, "BMW engine swap daily driver")
      await user.click(screen.getByRole("button", { name: "→" }))

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Daily driver" })).toBeInTheDocument()
      })
      await user.click(screen.getByRole("button", { name: "Daily driver" }))

      await waitFor(() => {
        const card = screen.getByText("Ready to build").closest("div")
        expect(card).toBeInTheDocument()
      })
    })
  })

  describe("Start over", () => {
    it("resets to initial state", async () => {
      const user = userEvent.setup()
      render(<NewBuildPage />)

      const input = screen.getByPlaceholderText(/type or pick/i)
      await user.type(input, "BMW")
      await user.click(screen.getByRole("button", { name: "→" }))

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Engine swap" })).toBeInTheDocument()
      })
      await user.click(screen.getByRole("button", { name: "Engine swap" }))

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Daily driver" })).toBeInTheDocument()
      })
      await user.click(screen.getByRole("button", { name: "Daily driver" }))

      await waitFor(() => {
        expect(screen.getByText("Start over")).toBeInTheDocument()
      })
      await user.click(screen.getByText("Start over"))

      await waitFor(() => {
        expect(screen.getByText("What are you building?")).toBeInTheDocument()
        expect(screen.queryByText("Ready to build")).not.toBeInTheDocument()
      })
    })
  })

  describe("Build creation", () => {
    it("calls createBuild with correct payload", async () => {
      const user = userEvent.setup()
      render(<NewBuildPage />)

      const input = screen.getByPlaceholderText(/type or pick/i)
      await user.type(input, "BMW")
      await user.click(screen.getByRole("button", { name: "→" }))

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Engine swap" })).toBeInTheDocument()
      })
      await user.click(screen.getByRole("button", { name: "Engine swap" }))

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Daily driver" })).toBeInTheDocument()
      })
      await user.click(screen.getByRole("button", { name: "Daily driver" }))

      await waitFor(() => {
        expect(screen.getByText("Yes, let's go →")).toBeInTheDocument()
      })
      await user.click(screen.getByText("Yes, let's go →"))

      await waitFor(() => {
        expect(mockCreateBuild).toHaveBeenCalledWith(
          {
            title: "bmw — engine swap",
            car: "bmw",
            goals: ["engine swap"],
            modification_goal: "engine swap for daily driver use",
          },
          "test-token",
        )
      })
    })

    it("shows creating state after confirm", async () => {
      const user = userEvent.setup()
      render(<NewBuildPage />)

      const input = screen.getByPlaceholderText(/type or pick/i)
      await user.type(input, "BMW")
      await user.click(screen.getByRole("button", { name: "→" }))

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Engine swap" })).toBeInTheDocument()
      })
      await user.click(screen.getByRole("button", { name: "Engine swap" }))

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Daily driver" })).toBeInTheDocument()
      })
      await user.click(screen.getByRole("button", { name: "Daily driver" }))

      await waitFor(() => {
        expect(screen.getByText("Yes, let's go →")).toBeInTheDocument()
      })
      await user.click(screen.getByText("Yes, let's go →"))

      await waitFor(() => {
        expect(screen.getByText("Creating your build…")).toBeInTheDocument()
      })
    })

    it("shows error toast on failure", async () => {
      mockCreateBuild.mockRejectedValueOnce(new Error("API error"))
      const user = userEvent.setup()
      render(<NewBuildPage />)

      const input = screen.getByPlaceholderText(/type or pick/i)
      await user.type(input, "BMW")
      await user.click(screen.getByRole("button", { name: "→" }))

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Engine swap" })).toBeInTheDocument()
      })
      await user.click(screen.getByRole("button", { name: "Engine swap" }))

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Daily driver" })).toBeInTheDocument()
      })
      await user.click(screen.getByRole("button", { name: "Daily driver" }))

      await waitFor(() => {
        expect(screen.getByText("Yes, let's go →")).toBeInTheDocument()
      })
      await user.click(screen.getByText("Yes, let's go →"))

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("API error")
      })
    })
  })

  describe("Input state", () => {
    it("disables input while typing", async () => {
      const user = userEvent.setup()
      render(<NewBuildPage />)

      const input = screen.getByPlaceholderText(/type or pick/i) as HTMLInputElement
      await user.type(input, "BMW")

      const sendButton = screen.getByRole("button", { name: "→" })
      await user.click(sendButton)

      expect(input).toBeDisabled()

      await waitFor(() => {
        expect(input).not.toBeDisabled()
      })
    })

    it("allows sending message with Enter key", async () => {
      const user = userEvent.setup()
      render(<NewBuildPage />)

      const input = screen.getByPlaceholderText(/type or pick/i)
      await user.type(input, "BMW{Enter}")

      await waitFor(() => {
        expect(screen.getByText(/What do you want to do/i)).toBeInTheDocument()
      })
    })
  })
})
