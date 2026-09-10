import { formatResetDate } from "@/lib/garage/format";
import type { RexUsage as RexUsageData } from "@/lib/garage/data";

/**
 * How much of the month's Rex allowance is spent.
 *
 * Absent until there is a counter to show — an empty meter reads as "you have
 * used none of something", which is a different and less useful claim than
 * "we are not tracking this yet".
 */
const RexUsage = ({ usage }: { usage: RexUsageData | null }) => {
    if (!usage) return null;

    const { used, limit, resetsAt } = usage;
    // Guards a divide-by-zero and a bar that overshoots its track if the API
    // ever reports usage above the limit.
    const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

    return (
        <section aria-labelledby="rex-usage-heading" className="px-1">
            <div className="flex items-baseline justify-between">
                <h2
                    id="rex-usage-heading"
                    className="text-[10px] font-medium uppercase tracking-wider text-text-muted"
                >
                    Rex usage
                </h2>
                <p className="font-mono text-xs text-text-secondary">
                    {used}/{limit}
                </p>
            </div>

            <div
                role="progressbar"
                aria-labelledby="rex-usage-heading"
                aria-valuenow={used}
                aria-valuemin={0}
                aria-valuemax={limit}
                aria-valuetext={`${used} of ${limit} used`}
                className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-surface-elevated"
            >
                <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
            </div>

            <p className="mt-2 text-[11px] text-text-muted">Resets {formatResetDate(resetsAt)}</p>
        </section>
    );
};

export { RexUsage };
