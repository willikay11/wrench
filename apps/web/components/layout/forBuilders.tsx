'use client';

import { Button } from "@/components/ui/button";
import { CustomGrid } from "@/components/layout/customGrid";

const ForBuilders = () => {
    return (
        <div className="bg-[#OAOAOA]">
            <CustomGrid>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 py-24 h-screen items-center relative">
                    <div className="flex flex-col space-y-4 md:space-y-6">
                        <p className="uppercase text-sm text-primary">// for every car builder</p>
                        <h1 className="text-3xl md:text-5xl font-semibold text-white max-w-[640px]">
                            You should not need five browser tabs to fix your own car.
                        </h1>
                        <p className=" text-base md:text-lg text-zinc-500 max-w-[520px]">
                            The forum thread from 2019. The YouTube video that skips the part you need. Wrench gives you an AI crew chief who already knows your specific build.
                        </p>
                        <div className="flex flex-col gap-2">
                            <Button variant="primary" className="font-semibold w-fit">Join the Waitlist</Button>
                            <span className="text-xs text-zinc-500">Free to start. No credit card. No spam.</span>
                        </div>
                    </div>
                    <div className="flex items-center justify-end">
                    </div>
                </div>
            </CustomGrid>
        </div>
    );
}

export { ForBuilders };