'use client';

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { GoogleMark } from "@/components/auth/googleMark";
import { startGoogleSignIn, type GoogleSignInIntent } from "@/lib/auth/google";

const GoogleSignInButton = ({ intent, label }: { intent: GoogleSignInIntent; label: string }) => {
    const [isPending, setIsPending] = useState(false);

    const onClick = () => {
        // Stays true for the life of the page: the next thing that happens is
        // a full navigation to Google, and re-enabling would only invite a
        // second click that starts a second handshake.
        setIsPending(true);
        startGoogleSignIn(intent);
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
