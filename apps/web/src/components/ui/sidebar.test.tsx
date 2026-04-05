// apps/web/src/components/ui/Sidebar.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { Sidebar } from "./sidebar"

const mockPathname = vi.fn()

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
}))

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    onClick,
    className,
  }: {
    children: React.ReactNode
    href: string
    onClick?: () => void
    className?: string
  }) => (
    <a href={href} onClick={onClick} className={className}>
      {children}
    </a>
  ),
}))

vi.mock("@/components/brand/logo", () => ({
  Logo: () => <div data-testid="logo">Wrench</div>,
}))

describe("Sidebar", () => {
  beforeEach(() => {
    mockPathname.mockReturnValue("/dashboard")
  })

  describe("rendering", () => {
    it("renders all nav items", () => {
      render(<Sidebar />)
      expect(screen.getAllByText("My builds").length).toBeGreaterThan(0)
      expect(screen.getAllByText("Recent").length).toBeGreaterThan(0)
      expect(screen.getAllByText("Explore builds").length).toBeGreaterThan(0)
      expect(screen.getAllByText("Profile").length).toBeGreaterThan(0)
      expect(screen.getAllByText("Settings").length).toBeGreaterThan(0)
    })

    it("renders the logo", () => {
      render(<Sidebar />)
      expect(screen.getAllByTestId("logo").length).toBeGreaterThan(0)
    })

    it("renders section labels", () => {
      render(<Sidebar />)
      expect(screen.getAllByText("Workspace").length).toBeGreaterThan(0)
      expect(screen.getAllByText("Account").length).toBeGreaterThan(0)
    })
  })

  describe("active route highlighting", () => {
    it("highlights My builds when on /dashboard", () => {
      mockPathname.mockReturnValue("/dashboard")
      render(<Sidebar />)
      const links = screen.getAllByRole("link", { name: /my builds/i })
      const activeLink = links.find((l) =>
        l.className.includes("font-medium")
      )
      expect(activeLink).toBeDefined()
    })

    it("highlights Settings when on /settings", () => {
      mockPathname.mockReturnValue("/settings")
      render(<Sidebar />)
      const links = screen.getAllByRole("link", { name: /settings/i })
      const activeLink = links.find((l) =>
        l.className.includes("font-medium")
      )
      expect(activeLink).toBeDefined()
    })

    it("highlights Profile when on /profile/edit", () => {
      mockPathname.mockReturnValue("/profile/edit")
      render(<Sidebar />)
      const links = screen.getAllByRole("link", { name: /profile/i })
      const activeLink = links.find((l) =>
        l.className.includes("font-medium")
      )
      expect(activeLink).toBeDefined()
    })

    it("does not highlight My builds on /settings", () => {
      mockPathname.mockReturnValue("/settings")
      render(<Sidebar />)
      const links = screen.getAllByRole("link", { name: /my builds/i })
      const activeLink = links.find((l) =>
        l.className.includes("font-medium")
      )
      expect(activeLink).toBeUndefined()
    })
  })

  describe("mobile behaviour", () => {
    it("renders the mobile menu button", () => {
      render(<Sidebar />)
      expect(
        screen.getByRole("button", { name: /open menu/i })
      ).toBeInTheDocument()
    })

    it("opens the mobile menu when hamburger is clicked", () => {
      render(<Sidebar />)
      const btn = screen.getByRole("button", { name: /open menu/i })
      fireEvent.click(btn)
      expect(
        screen.getByRole("button", { name: /close menu/i })
      ).toBeInTheDocument()
    })

    it("closes the mobile menu when overlay is clicked", () => {
      render(<Sidebar />)
      fireEvent.click(screen.getByRole("button", { name: /open menu/i }))
      const overlay = document.querySelector(".bg-black\\/40")
      expect(overlay).not.toBeNull()
      fireEvent.click(overlay!)
      expect(
        screen.getByRole("button", { name: /open menu/i })
      ).toBeInTheDocument()
    })

    it("closes the mobile menu when a nav link is clicked", () => {
      render(<Sidebar />)
      fireEvent.click(screen.getByRole("button", { name: /open menu/i }))
      const links = screen.getAllByRole("link", { name: /my builds/i })
      fireEvent.click(links[0])
      expect(
        screen.getByRole("button", { name: /open menu/i })
      ).toBeInTheDocument()
    })
  })

  describe("nav links", () => {
    it("My builds links to /dashboard", () => {
      render(<Sidebar />)
      const links = screen.getAllByRole("link", { name: /my builds/i })
      expect(links[0]).toHaveAttribute("href", "/dashboard")
    })

    it("Profile links to /profile", () => {
      render(<Sidebar />)
      const links = screen.getAllByRole("link", { name: /profile/i })
      expect(links[0]).toHaveAttribute("href", "/profile")
    })

    it("Settings links to /settings", () => {
      render(<Sidebar />)
      const links = screen.getAllByRole("link", { name: /settings/i })
      expect(links[0]).toHaveAttribute("href", "/settings")
    })
  })
})