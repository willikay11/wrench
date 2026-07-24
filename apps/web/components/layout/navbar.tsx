'use client';

import { Button } from "@/components/ui/button";
import { CustomGrid } from "@/components/layout/customGrid";
import Link from "next/link";

const Navbar = () => {
    return (
        <CustomGrid>
            <nav className="h-13 md:h-16 flex items-center justify-between gap-4 bg-zinc-950 scroll:border-b scroll:border border-zinc-900 top-0 z-50 sticky">
                <div className="flex items-center justify-center text-primary">Wrench</div>
                <div className="hidden md:flex items-center justify-center gap-4">
                    <Link href="#features" className="text-sm text-text-secondary hover:text-text-primary transition-colors">
                        Features
                    </Link>
                    <Link href="#assistant" className="text-sm text-text-secondary hover:text-text-primary transition-colors">
                        AI Assistant
                    </Link>
                    <Link href="#contact" className="text-sm text-text-secondary hover:text-text-primary transition-colors">
                        App
                    </Link>
                </div>
                <div className="flex items-center justify-center gap-4">
                    <Button variant="primary" className="font-semibold">
                        Join the Waitlist
                    </Button>
                </div>
            </nav>
        </CustomGrid>
    );
}

export {Navbar};