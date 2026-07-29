import { HugeiconsIcon } from "@hugeicons/react";
import { CopyrightIcon } from "@hugeicons/core-free-icons";

const Footer = () => {
    // snap-end keeps the bottom of the page a valid resting place while the
    // landing page's hero has mandatory scroll snapping switched on.
    return (
        <div className="flex flex-row items-center justify-center py-6 space-x-2 snap-end">
            <div className="inline-flex">
                <HugeiconsIcon icon={CopyrightIcon} size={16} className="text-zinc-700 mr-2" />
                <span className="text-zinc-700 text-xs">2026 Wrench</span>
            </div>
            <div className="w-1 h-1 bg-zinc-700 rounded-full" />
            <span className="text-zinc-700 text-xs">Privacy Policy</span>
            <div className="w-1 h-1 bg-zinc-700 rounded-full" />
            <span className="text-zinc-700 text-xs">Terms of Service</span>
            <div className="w-1 h-1 bg-zinc-700 rounded-full" />
            <span className="text-zinc-700 text-xs">Built for people who love cars</span>
        </div>
    )
}

export { Footer };