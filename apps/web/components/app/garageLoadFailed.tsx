import { HugeiconsIcon } from '@hugeicons/react'
import { Alert02Icon } from '@hugeicons/core-free-icons'

import { Button } from '@/components/ui/button'

/**
 * What the garage shows when its cars could not be loaded.
 *
 * The state this exists to prevent is a failed request rendering as an empty
 * garage. "Your garage is empty" is a statement of fact about someone's
 * account; saying it because a request timed out tells them their cars are
 * gone, and invites them to add one they already own.
 */
const GarageLoadFailed = ({ onRetry }: { onRetry: () => void }) => (
  <div
    role="alert"
    className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center"
  >
    <HugeiconsIcon icon={Alert02Icon} size={48} className="text-text-muted" strokeWidth={1.2} />

    <h2 className="mt-6 text-2xl font-semibold text-text-primary">We could not load your garage</h2>
    {/* No mention of the cars being gone: nothing here knows that, and the
            failure is on our side of the wire. */}
    <p className="mt-3 max-w-sm text-sm leading-relaxed text-text-secondary">
      Your cars are safe — this was a problem reaching them. Try again in a moment.
    </p>

    <div className="mt-7">
      <Button type="button" onClick={onRetry}>
        Try again
      </Button>
    </div>
  </div>
)

export { GarageLoadFailed }
