import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { MultiplicationSignCircleIcon } from "@hugeicons/core-free-icons"
type Opts = { title: string; description?: string; duration?: number }

function toastSuccess({ title, description, duration }: Opts) {
  return toast.custom((t) => (
    <div role="success-toast" className="flex w-full items-center border-l-4 border-l-success gap-3 rounded-lg bg-card p-4">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{title}</p>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      <button
        onClick={() => toast.dismiss(t)}
        aria-label="Dismiss"
        className="text-muted-foreground hover:text-foreground"
      >
        <HugeiconsIcon icon={MultiplicationSignCircleIcon} strokeWidth={2} className="size-4" />
      </button>
    </div>
  ), { duration: duration })
}

function toastError({ title, description, duration }: Opts) {
  return toast.custom((t) => (
    <div role="error-toast" className="flex w-full items-center gap-3 rounded-lg border-l-4 border-l-destructive bg-card p-4">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{title}</p>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      <button
        onClick={() => toast.dismiss(t)}
        aria-label="Dismiss"
        className="text-muted-foreground hover:text-foreground"
      >
        <HugeiconsIcon icon={MultiplicationSignCircleIcon} strokeWidth={2} className="size-4" />
      </button>
    </div>
  ), { duration: duration })
}

function toastInfo({ title, description, duration }: Opts) {
  return toast.custom((t) => (
    <div role="info-toast" className="flex w-full items-center gap-3 rounded-lg border-l-4 border-l-info bg-card p-4">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{title}</p>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      <button
        onClick={() => toast.dismiss(t)}
        aria-label="Dismiss"
        className="text-muted-foreground hover:text-foreground"
      >
        <HugeiconsIcon icon={MultiplicationSignCircleIcon} strokeWidth={2} className="size-4" />
      </button>
    </div>
  ), { duration: duration })
}


function toastWarning({ title, description, duration }: Opts) {
  return toast.custom((t) => (
    <div role="warning-toast" className="flex w-full items-center gap-3 rounded-lg border-l-4 border-l-warning bg-card p-4">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{title}</p>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      <button
        onClick={() => toast.dismiss(t)}
        aria-label="Dismiss"
        className="text-muted-foreground hover:text-foreground"
      >
        <HugeiconsIcon icon={MultiplicationSignCircleIcon} strokeWidth={2} className="size-4" />
      </button>
    </div>
  ), { duration: duration })
}

export { toastSuccess, toastError, toastInfo, toastWarning }
