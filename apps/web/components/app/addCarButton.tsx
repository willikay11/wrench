'use client';

import { HugeiconsIcon } from "@hugeicons/react";
import { PlusSignIcon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { toastInfo } from "@/lib/toast";

/**
 * Both entry points to adding a car — the header action and the empty state's
 * call to action — are the same button with different labels.
 *
 * There is no add-car flow or API yet, so it says so rather than opening a
 * form that cannot save. When POST /v1/cars lands this is the only component
 * that changes.
 */
const AddCarButton = ({ label, compact = false }: { label: string; compact?: boolean }) => (
    <Button
        type="button"
        size={compact ? "sm" : "md"}
        onClick={() =>
            toastInfo({
                title: "Adding cars is not open yet",
                description: "Rex is still learning the garage. This lands with early access.",
            })
        }
        leftIcon={compact ? <HugeiconsIcon icon={PlusSignIcon} /> : undefined}
    >
        {label}
    </Button>
);

export { AddCarButton };
