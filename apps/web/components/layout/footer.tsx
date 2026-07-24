import { HugeiconsIcon } from "@hugeicons/react";
import { CopyrightIcon } from "@hugeicons/core-free-icons";

const Footer = () => {
    return (
        <div className="flex flex-row items-center justify-center py-8 space-x-2">
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