'use client';
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import Link from "next/link";

const JoinWaitlistButton = ({ className }: { className?: string }) => {
    return (
        <Link href="#waitlist">
            <Button variant="primary" className={cn("font-semibold", className)}>
                Join the Waitlist
            </Button>
        </Link>
    );
}

export { JoinWaitlistButton };