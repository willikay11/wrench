'use client';

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { toastError, toastInfo, toastSuccess } from "@/lib/toast";
import { useSession } from "@/components/auth/sessionProvider";
import { AUTH_STATUS_PARAM, isAuthStatus, type AuthStatus } from "@/lib/auth/google";

/**
 * Reports the outcome of a Google round trip, then removes it from the URL.
 *
 * The status arrives as a query parameter because the callback is a redirect —
 * there is no component still mounted to hand it to. Stripping it afterwards
 * keeps a refresh or a shared link from replaying a toast about something that
 * happened once.
 */

type Message = { title: string; description: string; tone: "success" | "info" | "error" };

/** Sign-in greetings name the user, so they are built once the session lands. */
const greeting = (status: "welcome" | "signed-in", displayName?: string): Message =>
    status === "welcome"
        ? {
              title: displayName ? `Welcome to Wrench, ${displayName}` : "Welcome to Wrench",
              description: "Your account is ready. Rex is waiting.",
              tone: "success",
          }
        : {
              title: displayName ? `Welcome back, ${displayName}` : "Welcome back",
              description: "You are signed in.",
              tone: "success",
          };

const SETTLED: Record<"cancelled" | "error", Message> = {
    cancelled: {
        title: "Sign-in cancelled",
        description: "No problem — pick it back up whenever you are ready.",
        tone: "info",
    },
    error: {
        title: "We could not finish signing you in",
        description: "Something went wrong on our side. Please try again.",
        tone: "error",
    },
};

const TOASTS = { success: toastSuccess, info: toastInfo, error: toastError } as const;

const AuthStatusToast = () => {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const { session, isLoading } = useSession();
    const status = searchParams.get(AUTH_STATUS_PARAM);
    // Effects run twice in development's strict mode, and the router.replace
    // below is not instant. Without this the user sees the toast twice.
    const reported = useRef<string | null>(null);

    useEffect(() => {
        if (!isAuthStatus(status) || reported.current === status) return;

        const isSignIn = status === "welcome" || status === "signed-in";
        // Wait for the handoff rather than greeting the user by no name.
        if (isSignIn && isLoading) return;

        reported.current = status;

        const { title, description, tone }: Message = isSignIn
            ? greeting(status, session?.user.displayName)
            : SETTLED[status as Exclude<AuthStatus, "welcome" | "signed-in">];

        TOASTS[tone]({ title, description });

        router.replace(pathname, { scroll: false });
    }, [status, isLoading, session, pathname, router]);

    return null;
};

export { AuthStatusToast };
