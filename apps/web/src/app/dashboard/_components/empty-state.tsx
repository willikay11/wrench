// apps/web/src/app/dashboard/_components/empty-state.tsx
import Link from "next/link"
import { Button } from "@/components/ui/button"

export function EmptyState() {
  return (
    <div className="col-span-2 flex flex-col items-center justify-center py-16 border border-dashed border-border rounded-lg gap-4">
      <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-muted-foreground"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-foreground">No builds yet</p>
        <p className="text-xs text-muted-foreground mt-1">
          Start by creating your first build
        </p>
      </div>
      <Link href="/builds/new">
        <Button size="sm" className="bg-brand hover:bg-brand/90 text-white">
          Create your first build
        </Button>
      </Link>
    </div>
  )
}