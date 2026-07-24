'use client';

import { Button } from "@/components/ui/button";
import { CustomGrid } from "@/components/layout/customGrid";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight02Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

/** Chrome shared by the mock browser windows in the "old way" collage. */
const windowBase = "absolute overflow-hidden rounded-lg border border-[#2A2A2A] bg-[#1C1C1C] text-[12px] leading-[1.5] text-[#CCCCCC]";

const BrowserWindow = ({ url, className, children }: {
    url: string;
    className?: string;
    children: React.ReactNode;
}) => (
    <div className={cn(windowBase, className)}>
        <div className="flex h-9 items-center gap-[9px] border-b border-[#2A2A2A] bg-[#141414] px-2.5 py-2">
            <span className="size-2.5 rounded-full bg-[#555]" />
            <span className="size-2.5 rounded-full bg-[#555]" />
            <span className="size-2.5 rounded-full bg-[#555]" />
            <span className="ml-1.5 truncate text-[9px] text-[#777]">{url}</span>
        </div>
        {children}
    </div>
);

const ForBuilders = () => {
    return (
        <div className="bg-[#0A0A0A] relative overflow-x-hidden">
            <CustomGrid>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-12 md:gap-10 py-24 min-h-screen items-center relative">
                    <div className="flex flex-col col-span-5 space-y-4 md:space-y-6">
                        <p className="font-mono uppercase text-sm text-primary">// for every car builder</p>
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
                    <div className="flex flex-col items-center col-span-7 w-full [zoom:0.8] sm:[zoom:1] xl:flex-row xl:[zoom:0.9] 2xl:[zoom:1]">
                        <div className="flex flex-col flex-1 items-center relative">
                            <div className="relative w-[316px] shrink-0 text-center">
                                <div className="absolute top-[190px] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[320px] h-[320px] sm:w-[440px] sm:h-[440px] xl:w-[600px] xl:h-[600px] z-0 blur-[6px] [background-image:radial-gradient(circle_at_center,rgba(239,68,68,0.06)_0%,transparent_65%)]" />

                                <div className="relative z-[1]">
                                    <div className="font-mono text-[#EF4444] text-[13px] tracking-[.06em] uppercase mb-4">The old way</div>

                                    <div className="relative h-[380px]">
                                        {/* handwritten note */}
                                        <div className="absolute top-[44px] left-0 z-6 w-[108px] -rotate-4 bg-[#E8D96A] px-3 py-3 text-[12px] leading-[1.45] text-[#3A2E00] shadow-[0_6px_10px_rgba(0,0,0,0.4)]">
                                            torque specs??<br />coilover top mount - 35nm? CHECK THIS<br />ask on discord
                                        </div>

                                        {/* torn scrap */}
                                        <div className="absolute top-[196px] left-0 z-5 w-[88px] -rotate-8 rounded-[2px] bg-[#F6DEDE] px-2.5 py-2.5 font-mono text-[10px] leading-[1.4] text-[#7A1F1F] shadow-[0_4px_8px_rgba(0,0,0,0.4)]">
                                            MISFIRE STILL NOT FIXED<br />3rd part ordered, still guessing
                                        </div>

                                        <BrowserWindow
                                            url="forums.z1motorsports.com/threads/vq35..."
                                            className="top-0 left-[62px] z-1 w-[252px] -rotate-6 shadow-[0_6px_12px_rgba(0,0,0,0.4)]"
                                        >
                                            <div className="px-3 py-3">
                                                <div className="mb-2 font-semibold text-[#E0E0E0]">VQ35DE misfire under boost — HELP</div>
                                                <div className="text-[11px] leading-[1.7] text-[#999]">turbospool_z: check ur MAF sensor<br />350zfanatic: no its plugs 100%<br />boostednissan: could be injectors tbh</div>
                                                <div className="mt-2 text-[#666]">47 replies</div>
                                            </div>
                                        </BrowserWindow>

                                        <BrowserWindow
                                            url="speedshopnairobi.co.ke/order-8847"
                                            className="top-[104px] left-[74px] z-2 w-[240px] rotate-3 shadow-[0_6px_12px_rgba(0,0,0,0.45)]"
                                        >
                                            <div className="px-3 py-3">
                                                <div className="mb-2 font-semibold text-[#E0E0E0]">Speed Shop Nairobi — Order</div>
                                                <div className="font-mono text-[#999]">JWT intake......KSh 45,000<br />BC Coilovers...KSh 105,000<br />Shipping.........KSh 5,000</div>
                                                <div className="mt-1.5 font-mono font-semibold text-[#E0E0E0]">TOTAL..........KSh 155,000</div>
                                            </div>
                                        </BrowserWindow>

                                        <BrowserWindow
                                            url="dynotunenairobi.co.ke/contact"
                                            className="top-[212px] left-[96px] z-3 w-[218px] rotate-6 shadow-[0_8px_14px_rgba(0,0,0,0.55)]"
                                        >
                                            <div className="px-[14px] py-3">
                                                <div className="font-semibold text-[#E0E0E0]">DYNO TUNE NAIROBI</div>
                                                <div className="mt-1.5 text-[#999]">Ask for Njoroge — boost issues</div>
                                                <div className="mt-2.5 inline-block rounded bg-[#2A2A2A] px-2.5 py-1.5 text-[10px] text-[#777]">Book a slot</div>
                                            </div>
                                        </BrowserWindow>
                                    </div>

                                    <div className="text-[#EF4444] text-sm mt-4">Your build knowledge. Scattered everywhere.</div>
                                </div>
                            </div>
                        </div>
                        <div className="flex h-20 w-full shrink-0 items-center justify-center relative xl:h-auto xl:w-12">
                            <HugeiconsIcon icon={ArrowRight02Icon} size={32} className="rotate-90 xl:rotate-0" />
                        </div>
                        <div className="flex flex-col flex-1 items-center relative">
                            <div className="relative w-[300px] shrink-0 text-center">
                                <div className="absolute top-16 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] sm:w-[420px] sm:h-[420px] xl:w-[560px] xl:h-[560px] z-0 blur-[6px] [background-image:radial-gradient(circle_at_center,rgba(34,197,94,0.08)_0%,transparent_65%)]" />

                                <div className="relative z-[1]">
                                    <div className="font-mono text-[#22C55E] text-[13px] tracking-[.06em] uppercase mb-4">With Wrench</div>

                                    <div className="bg-[#141414] border border-[#1E1E1E] rounded-2xl p-4 text-left">
                                        <div className="font-mono text-[#888888] text-[12px] mb-3">2003 Nissan 350Z · VQ35DE · Stage 2</div>

                                        <div className="flex flex-col gap-2 text-[13px]">
                                            <div className="flex items-center gap-2 text-[#DDDDDD]"><span className="text-[#22C55E]">●</span>JWT intake · installed · confirmed</div>
                                            <div className="flex items-center gap-2 text-[#DDDDDD]"><span className="text-[#22C55E]">●</span>BC Coilovers · installed · confirmed</div>
                                            <div className="flex items-center gap-2 text-[#DDDDDD]"><span className="text-[#F59E0B]">●</span>Boost tune · Stage 2 · logged</div>
                                        </div>

                                        <div className="border-t border-[#262626] my-3" />

                                        <div className="border-l-2 border-[#E8693C] pl-2.5">
                                            <div className="flex items-center gap-2 mb-1.5">
                                                <div className="w-7 h-7 rounded-full bg-[#111] border border-[#E8693C] flex items-center justify-center flex-shrink-0">
                                                    <svg width="15" height="11" viewBox="0 0 28 20">
                                                        <rect x="4" y="7" width="7" height="5" rx="1.5" fill="#E8693C" />
                                                        <rect x="17" y="7" width="7" height="5" rx="1.5" fill="#E8693C" />
                                                        <line x1="9" y1="17" x2="19" y2="17" stroke="#E8693C" strokeWidth="1.4" strokeLinecap="round" />
                                                    </svg>
                                                </div>
                                                <span className="text-[#F5F5F5] text-[12px] font-medium">Rex</span>
                                            </div>
                                            <p className="text-[#CCCCCC] text-[12px] leading-[1.5] m-0">With your JWT intake and Stage 2 tune, misfires above 12psi are almost always MAF calibration. But you're at 87K and haven't logged new plugs since the tune — VQ35s are sensitive here. Start with plugs before spending more on parts.</p>
                                        </div>

                                        <span className="inline-block mt-3 border border-[#2A2A2A] text-[#AAAAAA] text-[11px] px-3 py-1.5 rounded-full">Log plugs →</span>
                                        <div className="text-[#22C55E] text-[12px] mt-2">⚡ Answered in 4 seconds</div>
                                    </div>

                                    <div className="text-[#22C55E] text-sm mt-4">Your build knowledge. One place. Instantly.</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </CustomGrid>
        </div>
    );
}

export { ForBuilders };