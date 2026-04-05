import * as React from "react"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { ImageUpload } from "./ImageUpload"

function TestWrapper() {
  const [files, setFiles] = React.useState<File[]>([])

  return <ImageUpload files={files} onChange={setFiles} />
}

describe("ImageUpload", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "URL",
      Object.assign(URL, {
        createObjectURL: vi.fn((file: File) => `blob:${file.name}`),
        revokeObjectURL: vi.fn(),
      })
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("renders the drag and drop prompt", () => {
    render(<TestWrapper />)

    expect(screen.getByText(/drop photos here or click to browse/i)).toBeInTheDocument()
    expect(screen.getByText(/jpg, png or webp/i)).toBeInTheDocument()
  })

  it("shows selected images in a grid immediately", async () => {
    render(<TestWrapper />)

    const input = screen.getByLabelText(/upload build images/i)
    const first = new File(["front"], "front.jpg", { type: "image/jpeg" })
    const second = new File(["rear"], "rear.png", { type: "image/png" })

    fireEvent.change(input, { target: { files: [first, second] } })

    expect(await screen.findByAltText(/preview of front\.jpg/i)).toBeInTheDocument()
    expect(await screen.findByAltText(/preview of rear\.png/i)).toBeInTheDocument()
  })

  it("allows deleting a selected image", async () => {
    const user = userEvent.setup()

    render(<TestWrapper />)

    const input = screen.getByLabelText(/upload build images/i)
    const first = new File(["front"], "front.jpg", { type: "image/jpeg" })
    const second = new File(["rear"], "rear.png", { type: "image/png" })

    fireEvent.change(input, { target: { files: [first, second] } })

    expect(await screen.findByAltText(/preview of front\.jpg/i)).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /remove front\.jpg/i }))

    expect(screen.queryByAltText(/preview of front\.jpg/i)).not.toBeInTheDocument()
    expect(screen.getByAltText(/preview of rear\.png/i)).toBeInTheDocument()
  })
})
