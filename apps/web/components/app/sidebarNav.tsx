'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
    DollarCircleIcon,
    Home01Icon,
    Layout01Icon,
    Settings01Icon,
    ToolsIcon,
} from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";

/**
 * Only Garage has a route. The other four are rendered as disabled items
 * rather than links to nothing — the same call the auth panel already makes
 * for Terms and Privacy. A nav that 404s teaches people not to trust the nav.
 */
const NAV_ITEMS: { label: string; icon: IconSvgElement; href?: string }[] = [
    { label: "Garage", icon: Home01Icon, href: "/garage" },
    { label: "Build", icon: Layout01Icon },
    { label: "Budget", icon: DollarCircleIcon },
    { label: "Tools", icon: ToolsIcon },
    { label: "Settings", icon: Settings01Icon },
];

const itemClasses = "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors";

const SidebarNav = () => {
    const pathname = usePathname();

    return (
        <nav aria-label="Main" className="px-3 py-4">
            <ul className="space-y-1">
                {NAV_ITEMS.map(({ label, icon, href }) => {
                    const isActive = href !== undefined && pathname.startsWith(href);

                    if (href === undefined) {
                        return (
                            <li key={label}>
                                <span
                                    aria-disabled="true"
                                    title="Coming soon"
                                    className={cn(itemClasses, "cursor-not-allowed text-text-muted")}
                                >
                                    <HugeiconsIcon icon={icon} size={18} />
                                    {label}
                                </span>
                            </li>
                        );
                    }

                    return (
                        <li key={label}>
                            <Link
                                href={href}
                                aria-current={isActive ? "page" : undefined}
                                className={cn(
                                    itemClasses,
                                    isActive
                                        ? "bg-surface-card text-text-primary"
                                        : "text-text-secondary hover:bg-surface-card/60 hover:text-text-primary",
                                )}
                            >
                                {/* The amber marker on the active item. Drawn
                                    here rather than as a border so the row's
                                    height and padding stay identical either
                                    way and nothing shifts on navigation. */}
                                {isActive && (
                                    <span
                                        aria-hidden
                                        className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r bg-primary"
                                    />
                                )}
                                <HugeiconsIcon
                                    icon={icon}
                                    size={18}
                                    className={isActive ? "text-primary" : undefined}
                                />
                                {label}
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
};

export { SidebarNav, NAV_ITEMS };
