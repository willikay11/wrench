import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AppSidebar } from "@/components/app/appSidebar";
import { RexLauncher } from "@/components/app/rexLauncher";
import { AuthStatusToast } from "@/components/auth/authStatusToast";
import { SessionProvider } from "@/components/auth/sessionProvider";
import { getGarageSummary, getRexUsage } from "@/lib/garage/data";
import { REFRESH_TOKEN_COOKIE } from "@/lib/auth/session";

/**
 * The signed-in shell.
 *
 * The gate is the refresh token cookie, not the access token: the access token
 * lives in memory and is gone after a reload, so guarding on it would bounce
 * people to /login every time they refreshed. This is navigation only — every
 * real authorisation decision belongs to the API, which never sees this cookie.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
    const cookieStore = await cookies();

    if (!cookieStore.get(REFRESH_TOKEN_COOKIE)) redirect("/login");

    const [summary, usage] = await Promise.all([getGarageSummary(), getRexUsage()]);

    return (
        <SessionProvider>
            <div className="flex h-dvh overflow-hidden bg-surface-base">
                <AppSidebar summary={summary} usage={usage} />

                <div className="flex min-w-0 flex-1 flex-col">{children}</div>

                {/* Carries the sign-in greeting across from the callback. */}
                <Suspense fallback={null}>
                    <AuthStatusToast />
                </Suspense>

                <RexLauncher />
            </div>
        </SessionProvider>
    );
}
