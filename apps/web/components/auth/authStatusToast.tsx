'use client';

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { toastError, toastInfo } from "@/lib/toast";
import { AUTH_STATUS_PARAM, isAuthStatus, type AuthStatus } from "@/lib/auth/google";

/**
 * Reports the outcome of a Google round trip, then removes it from the URL.
 *
 * The status arrives as a query parameter because the callback is a redirect —
 * there is no component still mounted to hand it to. Stripping it afterwards
 * keeps a refresh or a shared link from replaying a toast about something that
 * happened once.
 */

type Message = { title: string; description: string; tone: "info" | "error" };

const MESSAGES: Record<AuthStatus, Message> = {
    pending: {
        title: "Signed in with Google",
        description:
            "Accounts open with early access. We have your Google sign-in and will let you know the moment yours is ready.",
        tone: "info",
    },
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

const AuthStatusToast = () => {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const status = searchParams.get(AUTH_STATUS_PARAM);
    // Effects run twice in development's strict mode, and the router.replace
    // below is not instant. Without this the user sees the toast twice.
    const reported = useRef<string | null>(null);

    useEffect(() => {
        if (!isAuthStatus(status) || reported.current === status) return;

        reported.current = status;

        const { title, description, tone } = MESSAGES[status];
        const show = tone === "error" ? toastError : toastInfo;
        show({ title, description });

        router.replace(pathname, { scroll: false });
    }, [status, pathname, router]);

    return null;
};

export { AuthStatusToast };
