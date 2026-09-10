import { Suspense } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { Configuration01Icon } from "@hugeicons/core-free-icons";

import { AuthStatusToast } from "@/components/auth/authStatusToast";
import { GoogleSignInButton } from "@/components/auth/googleSignInButton";
import type { GoogleSignInIntent } from "@/lib/auth/google";

type AuthPanelProps = {
    intent: GoogleSignInIntent;
    heading: string;
    subheading: string;
    buttonLabel: string;
    /** The "already have an account?" style link across to the other screen. */
    switchPrompt: string;
    switchLabel: string;
    switchHref: string;
};

const AuthPanel = ({
    intent,
    heading,
    subheading,
    buttonLabel,
    switchPrompt,
    switchLabel,
    switchHref,
}: AuthPanelProps) => (
    <div className="flex flex-col justify-center px-6 py-16 sm:px-12 lg:px-16">
        {/* Reads the callback's ?auth= status. Suspended because useSearchParams
            would otherwise opt both pages out of static rendering. */}
        <Suspense fallback={null}>
            <AuthStatusToast />
        </Suspense>

        <div className="mx-auto w-full max-w-sm">
            {/* The rail carries the wordmark from `lg` up; below that this is
                the only branding on the screen. */}
            <Link href="/" className="mb-10 flex w-fit items-center gap-3 lg:hidden">
                <HugeiconsIcon icon={Configuration01Icon} size={24} className="text-primary" />
                <span className="text-lg font-semibold text-text-primary">Wrench</span>
            </Link>

            <p className="text-sm text-text-secondary lg:text-right">
                {switchPrompt}{" "}
                <Link href={switchHref} className="text-primary underline-offset-4 hover:underline">
                    {switchLabel} &rarr;
                </Link>
            </p>

            <h1 className="mt-4 text-3xl font-semibold text-text-primary">{heading}</h1>
            <p className="mt-2 text-sm text-text-secondary">{subheading}</p>

            <div className="mt-8">
                <GoogleSignInButton intent={intent} label={buttonLabel} />
            </div>

            <div className="mt-8 border-t border-border-default pt-6">
                {/* Terms and Privacy are named but not linked: neither route
                    exists yet, and the footer treats them the same way. Swap
                    these spans for <Link>s the moment those pages land. */}
                <p className="text-xs leading-relaxed text-text-muted">
                    By continuing you agree to our{" "}
                    <span className="text-primary">Terms of Service</span> and{" "}
                    <span className="text-primary">Privacy Policy</span>. Rex will only see the car
                    data you choose to share.
                </p>
            </div>
        </div>
    </div>
);

export { AuthPanel };
export type { AuthPanelProps };
