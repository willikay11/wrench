import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { Configuration01Icon } from "@hugeicons/core-free-icons";

import { GarageStatus } from "@/components/app/garageStatus";
import { RexUsage } from "@/components/app/rexUsage";
import { SidebarNav } from "@/components/app/sidebarNav";
import type { GarageSummary, RexUsage as RexUsageData } from "@/lib/garage/data";

/**
 * The app's left rail: identity at the top, navigation, then whatever is worth
 * knowing without opening anything — the active car and the Rex allowance.
 *
 * Hidden below `lg`. The garage screen is a working surface, and a 258px rail
 * on a phone leaves nothing for the work; small screens need their own
 * navigation pattern rather than this one squeezed.
 */
const AppSidebar = ({
    summary,
    usage,
}: {
    summary: GarageSummary | null;
    usage: RexUsageData | null;
}) => (
    <aside className="hidden w-[258px] shrink-0 flex-col border-r border-border-default bg-surface-raised lg:flex">
        <div className="flex h-[73px] items-center gap-3 border-b border-border-default px-6">
            <Link href="/" className="flex items-center gap-3">
                <HugeiconsIcon icon={Configuration01Icon} size={24} className="text-primary" />
                <span className="text-lg font-semibold text-text-primary">Wrench</span>
            </Link>
        </div>

        <SidebarNav />

        {/* Pushes the status blocks to the foot of the rail without pinning
            them, so a longer nav pushes back rather than overlapping. */}
        <div className="mt-auto space-y-4 p-4">
            <GarageStatus summary={summary} />
            <RexUsage usage={usage} />
        </div>
    </aside>
);

export { AppSidebar };
