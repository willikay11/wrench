/**
 * What the garage shows while its cars are on the way.
 *
 * It exists to stop the empty state standing in for "still loading". Someone
 * with a full garage who sees "Your garage is empty" for even a moment is being
 * told something false, and the obvious response — pressing "Add your first
 * car" — is the wrong one.
 *
 * The shapes match the card grid rather than being generic bars, so the layout
 * does not jump when the real cars replace them.
 */
const GarageSkeleton = () => (
  <div className="flex-1 p-6 sm:p-8" aria-busy="true" aria-live="polite">
    <span className="sr-only">Loading your garage…</span>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {/* Three is a plausible garage, and enough to read as a grid. */}
      {[0, 1, 2].map((card) => (
        <div
          key={card}
          // aria-hidden: the sr-only line above is the whole message.
          // Announcing three empty cards adds nothing to it.
          aria-hidden="true"
          className="animate-pulse rounded-lg border border-border-default bg-surface-card p-5"
        >
          <div className="h-3 w-16 rounded bg-surface-elevated" />
          <div className="mt-3 h-5 w-40 rounded bg-surface-elevated" />
          <div className="mt-2 h-3 w-28 rounded bg-surface-elevated" />

          <div className="mt-5 h-6 w-24 rounded-full bg-surface-elevated" />
        </div>
      ))}
    </div>
  </div>
)

export { GarageSkeleton }
