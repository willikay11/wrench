import type { Metadata } from "next";

import { AuthPanel } from "@/components/auth/authPanel";

export const metadata: Metadata = {
    title: "Create your account · Wrench",
    description: "One tap with Google. No passwords to remember. Free to start.",
    // Accounts are not open yet, so the page should not be indexed or turn up
    // as a search result ahead of the waitlist. Drop this when auth ships.
    robots: { index: false, follow: false },
};

export default function SignupPage() {
    return (
        <AuthPanel
            intent="signup"
            heading="Create your account"
            subheading="One tap. No passwords to remember. Free to start."
            buttonLabel="Continue with Google"
            switchPrompt="Already have an account?"
            switchLabel="Log in"
            switchHref="/login"
        />
    );
}
