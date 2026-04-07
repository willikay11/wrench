import Link from "next/link"
import { getBuild } from "@/lib/api/builds.server"
import { BuildWorkspace } from "./_components/BuildWorkspace"

export default async function BuildPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  try {
    const build = await getBuild(id)
    return <BuildWorkspace build={build} />
  } catch {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Build not found or an error occurred.</p>
        <Link href="/dashboard" className="text-sm underline">
          ← Back to dashboard
        </Link>
      </div>
    )
  }
}
