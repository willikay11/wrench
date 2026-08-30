'use client';

import { Rex } from "@/components/ui/rex";
import { toastInfo } from "@/lib/toast";

/**
 * Rex, parked in the corner of every app screen.
 *
 * `showPopUp` is off: the hover bubble in the marketing site advertises what
 * Rex can do to someone who has not signed up. Inside the app it would sit
 * over the page content claiming to know about a car the garage does not have.
 */
const RexLauncher = () => (
    <div className="fixed bottom-6 right-6 z-40">
        <button
            type="button"
            aria-label="Ask Rex"
            onClick={() =>
                toastInfo({
                    title: "Rex is not listening yet",
                    description: "Add a car first — Rex has nothing to go on until then.",
                })
            }
            className="rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
        >
            <Rex size={56} showPopUp={false} />
        </button>
    </div>
);

export { RexLauncher };
