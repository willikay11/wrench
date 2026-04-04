// apps/web/src/app/dashboard/loading.tsx
export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card h-14" />
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="h-7 w-24 bg-secondary rounded mb-6" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-secondary rounded-md h-20 animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-secondary rounded-lg h-48 animate-pulse" />
          ))}
        </div>
      </main>
    </div>
  )
}