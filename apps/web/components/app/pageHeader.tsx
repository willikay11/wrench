import type { ReactNode } from "react";

/**
 * The bar across the top of every app screen. Its height matches the sidebar's
 * logo block so the two dividers meet as one line across the window.
 */
const PageHeader = ({ title, action }: { title: string; action?: ReactNode }) => (
    <header className="flex h-[73px] shrink-0 items-center justify-between gap-4 border-b border-border-default px-6 sm:px-8">
        <h1 className="text-base font-medium text-text-primary">{title}</h1>
        {action}
    </header>
);

export { PageHeader };
