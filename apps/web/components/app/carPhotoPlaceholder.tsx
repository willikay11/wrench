import Image from 'next/image'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * What a car with no photo shows (ADR-010, amended): the Wrench mark on a dark
 * textured panel, and nothing that looks like a car.
 *
 * Deliberately not a car. Any picture of one — a stock photo, a drawn outline —
 * sitting beside someone's own car reads as that car. The mark says only that
 * Wrench has no photo of this car yet, which is true, and leaves room for the
 * owner to add one.
 *
 * The texture is two CSS gradients: a warm glow in the brand colour and a fine
 * diagonal grain, so the panel reads as intentional rather than as a gap.
 */
const CarPhotoPlaceholder = ({
  children,
  className,
}: {
  children?: ReactNode
  className?: string
}) => (
  <div
    data-photo-placeholder=""
    className={cn(
      'relative flex h-full w-full flex-col items-center justify-center gap-3 overflow-hidden bg-surface-base',
      className
    )}
    style={{
      backgroundImage: [
        'radial-gradient(circle at 25% 15%, rgba(232, 105, 60, 0.12), transparent 60%)',
        'repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.03) 0 2px, transparent 2px 9px)',
      ].join(', '),
    }}
  >
    {/* Decorative: the card around it already names the car. */}
    <div className="relative h-7 w-28 opacity-50">
      <Image src="/logo.svg" alt="" fill unoptimized className="object-contain" />
    </div>
    <p className="text-xs tracking-wide text-text-muted">No photo yet</p>
    {children}
  </div>
)

export { CarPhotoPlaceholder }
