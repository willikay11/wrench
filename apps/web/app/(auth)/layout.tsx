import { AuthRail } from "@/components/auth/authRail";

/**
 * The split shell shared by /signup and /login. No navbar or footer: these are
 * end-of-funnel screens, and the marketing chrome only offers ways to leave.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
    return (
        <main className="grid min-h-dvh grid-cols-1 bg-surface-raised lg:grid-cols-2">
            <AuthRail />
            {children}
        </main>
    );
}
