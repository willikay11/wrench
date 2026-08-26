import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { Configuration01Icon, Tick02Icon } from "@hugeicons/core-free-icons";

import { Rex } from "@/components/ui/rex";

const promises = [
    "AI that knows your exact mods, not generic advice",
    "Track every service, every mod, every penny",
    "Plan builds stage by stage with Rex's help",
];

/**
 * The marketing half of the auth split. Decorative in the sense that the panel
 * on the right stands on its own, so this is dropped entirely below `lg` rather
 * than stacked above the form — a signed-out visitor on a phone wants the
 * button, not the pitch a second time.
 */
const AuthRail = () => (
    <div className="relative hidden flex-col justify-center border-r border-border-default bg-surface-base px-12 py-16 lg:flex xl:px-20">
        <div className="max-w-sm space-y-8">
            <Link href="/" className="flex w-fit items-center gap-3">
                <HugeiconsIcon icon={Configuration01Icon} size={28} className="text-primary" />
                <span className="text-xl font-semibold text-text-primary">Wrench</span>
            </Link>

            <p className="text-xl text-text-secondary">Your car. Your build. Your AI.</p>

            <div className="border-t border-border-default pt-8">
                <ul className="space-y-4">
                    {promises.map((promise) => (
                        <li key={promise} className="flex items-start gap-3">
                            <HugeiconsIcon
                                icon={Tick02Icon}
                                size={16}
                                className="mt-0.5 shrink-0 text-primary"
                                aria-hidden="true"
                            />
                            <span className="text-sm text-text-secondary">{promise}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>

        <div className="absolute inset-x-12 bottom-12 flex items-center gap-4 xl:inset-x-20">
            <Rex size={56} showPopUp={false} />
            <p className="text-sm text-text-muted">&quot;Let&apos;s get your garage set up.&quot;</p>
        </div>
    </div>
);

export { AuthRail };
