// apps/web/src/app/(app)/layout.tsx
import { Sidebar } from "@/components/ui/sidebar"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex-1 min-w-0">
        {children}
      </div>
    </div>
  )
}