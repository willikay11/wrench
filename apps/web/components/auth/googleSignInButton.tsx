'use client';

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { GoogleMark } from "@/components/auth/googleMark";
import { toastInfo } from "@/lib/toast";
import { startGoogleSignIn, type GoogleSignInIntent } from "@/lib/auth/google";

const GoogleSignInButton = ({ intent, label }: { intent: GoogleSignInIntent; label: string }) => {
    const [isPending, setIsPending] = useState(false);

    const onClick = async () => {
        setIsPending(true);
        const result = await startGoogleSignIn(intent);

        if (result.status === "redirecting") {
            // The browser is leaving; re-enabling would only flash the button.
            return;
        }

        setIsPending(false);
        toastInfo({
            title: "Google sign-in is not open yet",
            description: "Accounts open with early access. Join the waitlist and we will let you know.",
        });
    };

    return (
        <Button
            type="button"
            variant="ghost"
            size="lg"
            onClick={onClick}
            isLoading={isPending}
            className="h-13 w-full justify-center rounded-lg border-border-hover bg-surface-card text-sm font-medium text-text-primary hover:bg-surface-card-hover hover:text-text-primary"
            leftIcon={<GoogleMark className="size-5" />}
        >
            {label}
        </Button>
    );
};

export { GoogleSignInButton };
