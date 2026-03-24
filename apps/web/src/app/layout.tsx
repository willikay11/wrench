import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Wrench — AI-powered car build research",
  description: "Research, source, and plan your car build with AI.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
