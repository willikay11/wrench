import { cn } from '@/lib/utils'

/**
 * A car's outline by body style, for a car with no photo (FR-14).
 *
 * It stands in for the car without pretending to be it: an outline says "a
 * coupe", where a stock photo would say "this car". Decorative, so hidden from
 * assistive tech — whatever shows it names the car in text already.
 *
 * One profile per body style the catalogue allows, drawn on the same 240×100
 * box with the same wheel positions, so styles differ in shape and not in size.
 */

const BODY_PATHS: Record<string, string> = {
  // Long bonnet, roof sweeping down into a short tail.
  coupe: 'M14 70 L28 58 L70 52 L104 34 L150 32 L196 52 L226 58 L228 70',
  // Three boxes: bonnet, cabin, boot.
  sedan: 'M12 70 L22 56 L64 52 L94 34 L160 34 L186 50 L226 54 L228 70',
  // Cabin running almost to the back, which drops steeply.
  hatchback: 'M16 70 L26 56 L66 50 L96 32 L184 32 L204 52 L214 70',
  // Roof carried flat to the very end.
  wagon: 'M12 70 L22 56 L64 52 L94 32 L214 32 L224 52 L228 70',
  // No roof: a windscreen and the line of the doors.
  convertible: 'M14 70 L28 58 L84 54 L104 42 L112 54 L226 56 L228 70',
  // Tall and upright.
  suv: 'M12 72 L16 50 L58 46 L82 24 L196 24 L218 44 L228 50 L228 72',
  // A cab, then an open bed.
  pickup: 'M10 72 L14 50 L56 46 L78 26 L130 26 L136 50 L230 50 L230 72',
  // One tall box.
  van: 'M12 72 L14 36 L40 20 L220 20 L228 36 L228 72',
}

const BODY_STYLES = Object.keys(BODY_PATHS)

const CarSilhouette = ({
  bodyStyle,
  className,
}: {
  bodyStyle?: string | null
  className?: string
}) => {
  const known = bodyStyle != null && bodyStyle in BODY_PATHS
  const style = known ? bodyStyle : 'generic'

  return (
    <svg
      viewBox="0 0 240 100"
      aria-hidden="true"
      focusable="false"
      data-body-style={style}
      className={cn('text-text-faint', className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* An unknown or missing style draws the sedan's shape: the most
                neutral outline, rather than guessing at anything more specific. */}
      <path d={BODY_PATHS[known ? bodyStyle : 'sedan']} />
      <path d="M8 72 L232 72" opacity={0.35} />
      <circle cx={62} cy={72} r={13} />
      <circle cx={180} cy={72} r={13} />
    </svg>
  )
}

export { CarSilhouette, BODY_STYLES }
