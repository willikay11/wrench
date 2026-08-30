import type { Metadata } from "next";

import { AuthPanel } from "@/components/auth/authPanel";

export const metadata: Metadata = {
    title: "Log in · Wrench",
    description: "Log in to Wrench with Google.",
    robots: { index: false, follow: false },
};

export default function LoginPage() {
    return (
        <AuthPanel
            intent="login"
            heading="Welcome back"
            subheading="Log in the same way you signed up."
            buttonLabel="Continue with Google"
            switchPrompt="New to Wrench?"
            switchLabel="Create an account"
            switchHref="/signup"
        />
    );
}
