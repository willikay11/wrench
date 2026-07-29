'use client';

import { CustomGrid } from "@/components/layout/customGrid";
import Link from "next/link";
import { JoinWaitlistButton } from "./joinWailtListButton";

const Navbar = () => {
    return (
        <CustomGrid>
            <nav className="h-13 md:h-16 flex items-center justify-between gap-4 bg-zinc-950 scroll:border-b scroll:border border-zinc-900 top-0 z-50 sticky">
                <div className="flex items-center justify-center text-primary">Wrench</div>
                <div className="hidden md:flex items-center justify-center gap-4">
                    <Link href="#features" className="text-sm text-text-secondary hover:text-text-primary transition-colors">
                        What it does
                    </Link>
                    <Link href="#rex" className="text-sm text-text-secondary hover:text-text-primary transition-colors">
                        Meet Rex
                    </Link>
                    <Link href="#try" className="text-sm text-text-secondary hover:text-text-primary transition-colors">
                        Try it
                    </Link>
                </div>
                <div className="flex items-center justify-center gap-4">
                    <JoinWaitlistButton />
                </div>
            </nav>
        </CustomGrid>
    );
}

export {Navbar};