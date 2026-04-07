import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import NewBuildPage from "./page"

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockPush = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: vi.fn() }),
}))

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
}))

vi.mock("@/components/brand/logo", () => ({
  Logo: () => <div data-testid="logo">Wrench</div>,
}))

vi.mock("@/components/build/ImageUpload", () => ({
  ImageUpload: ({
    onChange,
  }: {
    files: File[]
    onChange: (files: File[]) => void
  }) => (
    <div data-testid="image-upload">
      <button
        type="button"
        onClick={() =>
          onChange([new File(["img"], "photo.jpg", { type: "image/jpeg" })])
        }
      >
        Upload photo
      </button>
    </div>
  ),
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

vi.mock("@/lib/api/builds", () => ({
  createBuild: vi.fn(),
  uploadBuildImage: vi.fn(),
}))

import { createBuild, uploadBuildImage } from "@/lib/api/builds"
const mockCreateBuild = vi.mocked(createBuild)
const mockUploadBuildImage = vi.mocked(uploadBuildImage)

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Fill step 1 and advance to step 2. */
async function goToStep2(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/build name/i), "E30 K24 swap")
  await user.type(screen.getByLabelText(/^car$/i), "1991 BMW E30 325i")
  await user.click(screen.getByRole("button", { name: /continue/i }))
}

/** Fill step 1 + select one goal and advance to step 3. */
async function goToStep3(user: ReturnType<typeof userEvent.setup>) {
  await goToStep2(user)
  await user.click(screen.getByRole("button", { name: /k24 engine swap/i }))
  await user.click(screen.getByRole("button", { name: /continue/i }))
}

/** Advance through steps 1–3 and arrive at step 4. */
async function goToStep4(user: ReturnType<typeof userEvent.setup>) {
  await goToStep3(user)
  await user.click(screen.getByRole("button", { name: /continue/i }))
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("NewBuildPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateBuild.mockResolvedValue({
      id: "build-001",
      user_id: "user-001",
      title: "E30 K24 swap",
      status: "planning",
      is_public: false,
      goals: ["K24 engine swap"],
      created_at: "2026-01-01T00:00:00+00:00",
      updated_at: "2026-01-01T00:00:00+00:00",
      embedding: null,
      vision_data: null,
    } as Parameters<typeof mockCreateBuild.mockResolvedValue>[0])
    mockUploadBuildImage.mockResolvedValue({ image_url: "https://example.com/photo.jpg" })
  })

  // ── Step 1 — Your car ───────────────────────────────────────────────────────

  describe("Step 1 — Your car", () => {
    it("renders the step 1 heading and form fields", () => {
      render(<NewBuildPage />)
      expect(screen.getByText("Your car")).toBeInTheDocument()
      expect(screen.getByLabelText(/build name/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/^car$/i)).toBeInTheDocument()
    })

    it("Continue is disabled initially", () => {
      render(<NewBuildPage />)
      expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled()
    })

    it("Continue remains disabled if only build name is filled", async () => {
      const user = userEvent.setup()
      render(<NewBuildPage />)
      await user.type(screen.getByLabelText(/build name/i), "E30 swap")
      expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled()
    })

    it("Continue remains disabled if only car is filled", async () => {
      const user = userEvent.setup()
      render(<NewBuildPage />)
      await user.type(screen.getByLabelText(/^car$/i), "1991 BMW E30")
      expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled()
    })

    it("enables Continue after both build name and car are filled", async () => {
      const user = userEvent.setup()
      render(<NewBuildPage />)
      await user.type(screen.getByLabelText(/build name/i), "E30 K24 swap")
      await user.type(screen.getByLabelText(/^car$/i), "1991 BMW E30 325i")
      expect(screen.getByRole("button", { name: /continue/i })).toBeEnabled()
    })

    it("shows build name in topbar once typed", async () => {
      const user = userEvent.setup()
      render(<NewBuildPage />)
      await user.type(screen.getByLabelText(/build name/i), "E30 K24 swap")
      expect(screen.getByText("E30 K24 swap")).toBeInTheDocument()
    })
  })

  // ── Step 2 — Your goals ─────────────────────────────────────────────────────

  describe("Step 2 — Your goals", () => {
    it("renders after completing step 1", async () => {
      const user = userEvent.setup()
      render(<NewBuildPage />)
      await goToStep2(user)
      expect(screen.getByText("Your goals")).toBeInTheDocument()
    })

    it("renders all 8 preset goal chips", async () => {
      const user = userEvent.setup()
      render(<NewBuildPage />)
      await goToStep2(user)
      expect(screen.getByRole("button", { name: /k24 engine swap/i })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /coilover suspension/i })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /brake upgrade/i })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /rim change/i })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /custom exhaust/i })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /roll cage/i })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /infotainment upgrade/i })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /paint job/i })).toBeInTheDocument()
    })

    it("Continue is disabled when no goals selected", async () => {
      const user = userEvent.setup()
      render(<NewBuildPage />)
      await goToStep2(user)
      expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled()
    })

    it("enables Continue after selecting a preset goal", async () => {
      const user = userEvent.setup()
      render(<NewBuildPage />)
      await goToStep2(user)
      await user.click(screen.getByRole("button", { name: /coilover suspension/i }))
      expect(screen.getByRole("button", { name: /continue/i })).toBeEnabled()
    })

    it("can add a goal via a preset chip", async () => {
      const user = userEvent.setup()
      render(<NewBuildPage />)
      await goToStep2(user)
      await user.click(screen.getByRole("button", { name: /brake upgrade/i }))
      expect(screen.getByRole("button", { name: /remove brake upgrade/i })).toBeInTheDocument()
    })

    it("can add a custom goal via the text input and Add button", async () => {
      const user = userEvent.setup()
      render(<NewBuildPage />)
      await goToStep2(user)
      await user.type(screen.getByPlaceholderText(/add a custom goal/i), "Air suspension")
      await user.click(screen.getByRole("button", { name: /^add$/i }))
      expect(screen.getByRole("button", { name: /remove air suspension/i })).toBeInTheDocument()
    })

    it("can add a custom goal via Enter key", async () => {
      const user = userEvent.setup()
      render(<NewBuildPage />)
      await goToStep2(user)
      await user.type(screen.getByPlaceholderText(/add a custom goal/i), "Air suspension{Enter}")
      expect(screen.getByRole("button", { name: /remove air suspension/i })).toBeInTheDocument()
    })

    it("clears the custom goal input after adding", async () => {
      const user = userEvent.setup()
      render(<NewBuildPage />)
      await goToStep2(user)
      await user.type(screen.getByPlaceholderText(/add a custom goal/i), "Air suspension")
      await user.click(screen.getByRole("button", { name: /^add$/i }))
      expect(screen.getByPlaceholderText(/add a custom goal/i)).toHaveValue("")
    })

    it("can remove a selected goal via its remove button", async () => {
      const user = userEvent.setup()
      render(<NewBuildPage />)
      await goToStep2(user)
      await user.click(screen.getByRole("button", { name: /k24 engine swap/i }))
      await user.click(screen.getByRole("button", { name: /remove k24 engine swap/i }))
      // Continue should be disabled again (no goals)
      expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled()
    })

    it("de-selects a preset chip when clicked again", async () => {
      const user = userEvent.setup()
      render(<NewBuildPage />)
      await goToStep2(user)
      await user.click(screen.getByRole("button", { name: /k24 engine swap/i }))
      await user.click(screen.getByRole("button", { name: /remove k24 engine swap/i }))
      expect(screen.queryByRole("button", { name: /remove k24 engine swap/i })).not.toBeInTheDocument()
    })
  })

  // ── Step 3 — Reference photo ────────────────────────────────────────────────

  describe("Step 3 — Reference photo", () => {
    it("renders the reference photo heading", async () => {
      const user = userEvent.setup()
      render(<NewBuildPage />)
      await goToStep3(user)
      expect(screen.getByText("Reference photo")).toBeInTheDocument()
    })

    it("renders the ImageUpload component", async () => {
      const user = userEvent.setup()
      render(<NewBuildPage />)
      await goToStep3(user)
      expect(screen.getByTestId("image-upload")).toBeInTheDocument()
    })

    it("renders a Skip for now option", async () => {
      const user = userEvent.setup()
      render(<NewBuildPage />)
      await goToStep3(user)
      expect(screen.getByText(/skip for now/i)).toBeInTheDocument()
    })

    it("advances to step 4 on Continue", async () => {
      const user = userEvent.setup()
      render(<NewBuildPage />)
      await goToStep3(user)
      await user.click(screen.getByRole("button", { name: /continue/i }))
      expect(screen.getByText("Review your build")).toBeInTheDocument()
    })

    it("advances to step 4 via Skip for now", async () => {
      const user = userEvent.setup()
      render(<NewBuildPage />)
      await goToStep3(user)
      await user.click(screen.getByText(/skip for now/i))
      expect(screen.getByText("Review your build")).toBeInTheDocument()
    })
  })

  // ── Step 4 — Review ─────────────────────────────────────────────────────────

  describe("Step 4 — Review", () => {
    it("renders the review heading", async () => {
      const user = userEvent.setup()
      render(<NewBuildPage />)
      await goToStep4(user)
      expect(screen.getByText("Review your build")).toBeInTheDocument()
    })

    it("shows the entered build name in the summary", async () => {
      const user = userEvent.setup()
      render(<NewBuildPage />)
      await goToStep4(user)
      // Build name appears in topbar and summary
      expect(screen.getAllByText("E30 K24 swap").length).toBeGreaterThanOrEqual(1)
    })

    it("shows the entered car in the summary", async () => {
      const user = userEvent.setup()
      render(<NewBuildPage />)
      await goToStep4(user)
      expect(screen.getByText("1991 BMW E30 325i")).toBeInTheDocument()
    })

    it("shows the selected goals in the summary", async () => {
      const user = userEvent.setup()
      render(<NewBuildPage />)
      await goToStep4(user)
      // "K24 engine swap" appears as a tag in the review
      expect(screen.getAllByText("K24 engine swap").length).toBeGreaterThanOrEqual(1)
    })

    it("shows modification_goal in the summary when provided", async () => {
      const user = userEvent.setup()
      render(<NewBuildPage />)
      await goToStep2(user)
      await user.click(screen.getByRole("button", { name: /k24 engine swap/i }))
      await user.type(
        screen.getByLabelText(/describe your goal in your own words/i),
        "K24 swap for daily driving on a $4k budget",
      )
      await user.click(screen.getByRole("button", { name: /continue/i }))
      await user.click(screen.getByRole("button", { name: /continue/i }))
      expect(screen.getByText("K24 swap for daily driving on a $4k budget")).toBeInTheDocument()
    })

    it("shows photo count when an image is uploaded", async () => {
      const user = userEvent.setup()
      render(<NewBuildPage />)
      await goToStep3(user)
      await user.click(screen.getByRole("button", { name: /upload photo/i }))
      await user.click(screen.getByRole("button", { name: /continue/i }))
      expect(screen.getByText("1 photo")).toBeInTheDocument()
    })

    it("shows 'None added' when no photo is uploaded", async () => {
      const user = userEvent.setup()
      render(<NewBuildPage />)
      await goToStep4(user)
      expect(screen.getByText("None added")).toBeInTheDocument()
    })

    it("shows the generation notice", async () => {
      const user = userEvent.setup()
      render(<NewBuildPage />)
      await goToStep4(user)
      expect(screen.getByText(/10.20 seconds/i)).toBeInTheDocument()
    })

    it("Create build button is enabled", async () => {
      const user = userEvent.setup()
      render(<NewBuildPage />)
      await goToStep4(user)
      expect(screen.getByRole("button", { name: /create build/i })).toBeEnabled()
    })

    it("calls createBuild with correct payload on submit", async () => {
      const user = userEvent.setup()
      render(<NewBuildPage />)
      await goToStep4(user)
      await user.click(screen.getByRole("button", { name: /create build/i }))
      expect(mockCreateBuild).toHaveBeenCalledWith(
        {
          title: "E30 K24 swap",
          car: "1991 BMW E30 325i",
          modification_goal: undefined,
          goals: ["K24 engine swap"],
        },
        "test-token",
      )
    })

    it("does not call uploadBuildImage when no image is selected", async () => {
      const user = userEvent.setup()
      render(<NewBuildPage />)
      await goToStep4(user)
      await user.click(screen.getByRole("button", { name: /create build/i }))
      expect(mockUploadBuildImage).not.toHaveBeenCalled()
    })

    it("calls uploadBuildImage when an image is selected", async () => {
      const user = userEvent.setup()
      render(<NewBuildPage />)
      await goToStep3(user)
      await user.click(screen.getByRole("button", { name: /upload photo/i }))
      await user.click(screen.getByRole("button", { name: /continue/i }))
      await user.click(screen.getByRole("button", { name: /create build/i }))
      expect(mockUploadBuildImage).toHaveBeenCalledWith(
        "build-001",
        expect.any(File),
        "test-token",
      )
    })
  })

  // ── Step 5 — Generating ─────────────────────────────────────────────────────

  describe("Step 5 — Generating", () => {
    afterEach(() => vi.useRealTimers())

    it("transitions to step 5 and shows progress steps after submit", async () => {
      const user = userEvent.setup()
      render(<NewBuildPage />)
      await goToStep4(user)
      await user.click(screen.getByRole("button", { name: /create build/i }))
      await waitFor(() => {
        expect(screen.getByText("Build created")).toBeInTheDocument()
      })
      expect(screen.getByText("Analysing K24 engine swap...")).toBeInTheDocument()
      expect(screen.getByText("Fetching vendor pricing")).toBeInTheDocument()
    })

    it("redirects to the build detail page once generation finishes", async () => {
      const user = userEvent.setup()
      render(<NewBuildPage />)
      await goToStep4(user)

      // Switch to fake timers before firing the click so we can control the interval
      vi.useFakeTimers()

      // fireEvent.click is synchronous — safe to use under fake timers
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /create build/i }))
        // Flush microtasks so handleCreateBuild's awaits (getSession, createBuild) complete
        await Promise.resolve()
        await Promise.resolve()
        await Promise.resolve()
        await Promise.resolve()
      })

      // With 1 goal: interval = 3000ms, genSteps.length = 3, completedGenSteps starts at 1.
      // Need 2 more ticks (2 × 3000ms) to reach genSteps.length and trigger redirect.
      act(() => { vi.advanceTimersByTime(7000) })

      expect(mockPush).toHaveBeenCalledWith("/builds/build-001")
    })
  })

  // ── Step tracker ────────────────────────────────────────────────────────────

  describe("Step tracker", () => {
    it("shows step 1 as active initially", () => {
      render(<NewBuildPage />)
      expect(
        screen.getByLabelText(/step 1.*current/i),
      ).toBeInTheDocument()
    })

    it("marks step 1 as complete after advancing to step 2", async () => {
      const user = userEvent.setup()
      render(<NewBuildPage />)
      await goToStep2(user)
      expect(screen.getByLabelText(/step 1.*complete/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/step 2.*current/i)).toBeInTheDocument()
    })
  })

  // ── Back navigation ─────────────────────────────────────────────────────────

  describe("Back navigation", () => {
    it("Back button on step 2 returns to step 1", async () => {
      const user = userEvent.setup()
      render(<NewBuildPage />)
      await goToStep2(user)
      await user.click(screen.getByRole("button", { name: /← back/i }))
      expect(screen.getByText("Your car")).toBeInTheDocument()
    })

    it("Back button on step 3 returns to step 2", async () => {
      const user = userEvent.setup()
      render(<NewBuildPage />)
      await goToStep3(user)
      await user.click(screen.getByRole("button", { name: /← back/i }))
      expect(screen.getByText("Your goals")).toBeInTheDocument()
    })

    it("Back button on step 4 returns to step 3", async () => {
      const user = userEvent.setup()
      render(<NewBuildPage />)
      await goToStep4(user)
      await user.click(screen.getByRole("button", { name: /← back/i }))
      expect(screen.getByText("Reference photo")).toBeInTheDocument()
    })
  })
})
