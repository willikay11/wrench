import { HugeiconsIcon } from "@hugeicons/react";
import { Car03Icon } from "@hugeicons/core-free-icons";

import { AddCarButton } from "@/components/app/addCarButton";

/**
 * What a new account sees. The heading states the fact and the body says what
 * adding a car buys you, because "your garage is empty" on its own is a
 * complaint rather than an invitation.
 */
const EmptyGarage = () => (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <HugeiconsIcon icon={Car03Icon} size={56} className="text-text-muted" strokeWidth={1.2} />

        <h2 className="mt-6 text-2xl font-semibold text-text-primary">Your garage is empty</h2>
        <p className="mt-3 max-w-xs text-sm leading-relaxed text-text-secondary">
            Add your first car and Rex will start learning everything about it.
        </p>

        <div className="mt-7">
            <AddCarButton label="Add your first car" />
        </div>
    </div>
);

export { EmptyGarage };
