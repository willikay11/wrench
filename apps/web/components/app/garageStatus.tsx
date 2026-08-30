import { HugeiconsIcon } from "@hugeicons/react";
import { Car03Icon } from "@hugeicons/core-free-icons";

import { formatLastService, formatMileage } from "@/lib/garage/format";
import type { GarageSummary } from "@/lib/garage/data";

/**
 * The at-a-glance car in the sidebar footer.
 *
 * Renders nothing at all when the garage is empty, rather than an empty shell:
 * a card reading "—" beside a main panel that already says the garage is empty
 * is the same sentence twice, in the quieter of the two places.
 */
const GarageStatus = ({ summary }: { summary: GarageSummary | null }) => {
    if (!summary) return null;

    const { car } = summary;

    return (
        <section
            aria-labelledby="garage-status-heading"
            className="rounded-lg border border-border-default bg-surface-card"
        >
            <div className="p-3">
                <h2
                    id="garage-status-heading"
                    className="text-[10px] font-medium uppercase tracking-wider text-text-muted"
                >
                    Garage status
                </h2>

                <div className="mt-3 flex items-center gap-2.5">
                    <HugeiconsIcon icon={Car03Icon} size={20} className="text-text-muted" />
                    <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-text-primary">
                            &apos;{String(car.year).slice(-2)} {car.make} {car.model}
                        </p>
                        <p className="font-mono text-xs text-text-secondary">
                            {formatMileage(car.mileage)}
                        </p>
                    </div>
                </div>
            </div>

            {car.lastServicedAt && (
                <p className="border-t border-border-default px-3 py-2.5 text-xs text-text-secondary">
                    Last service{" "}
                    <span className="text-text-primary">
                        {formatLastService(car.lastServicedAt)}
                    </span>
                </p>
            )}
        </section>
    );
};

export { GarageStatus };
