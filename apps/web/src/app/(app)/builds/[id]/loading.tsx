export default function BuildLoading() {
  return (
    <div className="grid h-screen animate-pulse grid-cols-[200px_1fr_256px]">
      {/* Left panel */}
      <div className="space-y-4 border-r border-border p-4">
        <div className="h-40 rounded-lg bg-secondary" />
        <div className="h-4 w-3/4 rounded bg-secondary" />
        <div className="h-4 w-1/2 rounded bg-secondary" />
        <div className="mt-6 h-3 w-1/3 rounded bg-secondary" />
        <div className="h-3 w-full rounded bg-secondary" />
        <div className="h-3 w-full rounded bg-secondary" />
      </div>

      {/* Centre panel */}
      <div className="space-y-4 p-6">
        <div className="h-6 w-48 rounded bg-secondary" />
        <div className="h-4 w-full rounded bg-secondary" />
        <div className="h-4 w-5/6 rounded bg-secondary" />
        <div className="mt-8 h-4 w-full rounded bg-secondary" />
        <div className="h-4 w-4/5 rounded bg-secondary" />
      </div>

      {/* Right panel */}
      <div className="space-y-3 border-l border-border p-4">
        <div className="h-5 w-24 rounded bg-secondary" />
        <div className="h-16 rounded bg-secondary" />
        <div className="h-4 w-full rounded bg-secondary" />
        <div className="h-4 w-3/4 rounded bg-secondary" />
      </div>
    </div>
  )
}
