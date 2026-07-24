'use client';

import { Button } from "@/components/ui/button";
import { CustomGrid } from "@/components/layout/customGrid";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight02Icon, ArrowUpRight02FreeIcons } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

/** Shared look for the scattered paper scraps in the "old way" collage. */
const scrapBase = "absolute rounded-[2px] shadow-[0_6px_10px_rgba(0,0,0,0.4)]";

/** Thermal-print ink that has run — still there, no longer legible. */
const smudged = "inline-block opacity-55 blur-[1.4px] [transform:scaleX(1.08)_skewX(-5deg)]";

/** Ink that has bleached out in the sun. */
const faded = "inline-block opacity-25 blur-[0.4px]";

const dotsGridStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: -1,
  pointerEvents: 'none',
  backgroundImage: 'radial-gradient(circle at 1px 1px, #1c1c1c 1px, transparent 0)',
  backgroundSize: '28px 28px',
  maskImage: 'radial-gradient(ellipse 70% 60% at 50% 20%, #000 40%, transparent 100%)',
  WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 50% 20%, #000 40%, transparent 100%)',
};

const ForEveryone = () => {
    return (
        <CustomGrid>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-12 md:gap-10 py-24 h-screen items-center">
                <div style={dotsGridStyle} />
                <div className="flex flex-col col-span-5 space-y-4 md:space-y-6">
                    <p className="uppercase text-sm text-primary">// for every car owner</p>
                    <h1 className="text-3xl md:text-5xl font-semibold text-white max-w-[640px]">
                        Your car's history lives in too many places.
                    </h1>
                    <p className=" text-base md:text-lg text-zinc-500 max-w-[520px]">
                        The service receipt in the glovebox. The mileage scribbled in your phone notes. The reminder you set and ignored. Wrench puts your car's full history in one place.
                    </p>
                    <div className="flex flex-col gap-2">
                        <Button variant="primary" className="font-semibold w-fit">Join the Waitlist</Button>
                        <span className="text-xs text-zinc-700">Free to start. No credit card. No spam.</span>
                    </div>
                </div>
                <div className="flex items-center col-span-7 w-full">
                    <div className="flex flex-row w-full">
                        <div className="flex flex-col flex-1 relative">
                            <div className="absolute w-[600px] h-[600px] top-[200px] left-1/2 -translate-x-1/2 -translate-y-1/2 blur-[6px] [background-image:radial-gradient(circle_at_center,rgba(239,68,68,0.06)_0%,transparent_65%)]" />
                            <p className="uppercase text-red-500 text-center mb-6 text-sm">The old way</p>
                            <div className="relative mt-4 h-[350px]">
                                <div className={cn(scrapBase, "top-[12px] left-[48px] z-3 w-[260px] -rotate-8 bg-[#EDE6D8] px-3.5 py-4 font-mono text-[14px] leading-[1.5] text-[#2A2A2A]")}>
                                    AUTOXPRESS NAIROBI<br />Engine Oil 5W30..KSh 3,500<br />Labour...........KSh 1,500<br /><b>TOTAL............KSh 5,000</b><br />14/03/25
                                </div>

                                <div className={cn(scrapBase, "top-0 left-0 z-1 w-[132px] -rotate-15 bg-[#F6DEDE] p-3 font-mono text-[12px] leading-[1.4] text-[#7A1F1F] shadow-[0_4px_8px_rgba(0,0,0,0.4)]")}>
                                    PENALTY NOTICE<br />NTSA expired<br />— KSh 10,000
                                </div>

                                <div className={cn(scrapBase, "top-[48px] left-[148px] z-4 w-[160px] rotate-6 rounded-none bg-[#E8D96A] px-4 py-4 text-[15px] leading-[1.4] text-[#3A2E00]")}>
                                    check brakes??<br />~130k kms maybe
                                </div>

                                <div className={cn(scrapBase, "top-[152px] left-0 z-2 w-[260px] -rotate-3 bg-[#F2F2F0] px-3.5 py-4 font-mono text-[14px] leading-[1.5] text-[#333]")}>
                                    KINGSWAY TYRES<br />Tyres x2........KSh 18,000<br />Fitting..........KSh 2,000<br />
                                    <span className={smudged}>02/11/24</span>
                                </div>

                                <div className={cn(scrapBase, "top-[98px] left-[112px] z-5 w-[196px] rotate-7 bg-[#F0EBDD] px-3.5 py-3.5 font-mono text-[13px] leading-[1.5] text-[#2A2A2A]")}>
                                    NTSA INSPECTION<br />CERTIFICATE<br />Expiry: <span className={faded}>09/01/25</span>
                                    <div className="absolute top-[30px] right-[22px] size-11 rounded-full border-2 border-[rgba(140,90,40,0.4)]" />
                                </div>

                                <div className={cn(scrapBase, "top-[240px] left-[88px] z-6 w-[128px] -rotate-12 rounded-none bg-[#F5F5F5] px-3 py-2.5 text-[14px] leading-[1.4] text-[#333] shadow-[0_4px_8px_rgba(0,0,0,0.4)]")}>
                                    ask mwangi about the noise
                                </div>
                            </div>
                            <div className="text-[#EF4444] text-sm mt-4">Your car's history. Somewhere in here.</div>
                        </div>
                        <div className="flex w-12 shrink-0 items-center justify-center relative">
                            <HugeiconsIcon icon={ArrowRight02Icon} size={32} />
                        </div>
                        <div className="flex flex-col flex-1 items-center relative">
                            <div className="relative flex-shrink-0 w-[300px] text-center">
                            <div className="absolute top-16 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[560px] h-[560px] blur-[6px] [background-image:radial-gradient(circle_at_center,rgba(34,197,94,0.08)_0%,transparent_65%)]"></div>

                            <div className="relative z-[1]">
                                <div className="text-[#22C55E] text-[13px] tracking-[.06em] uppercase mb-4">With Wrench</div>

                                <div className="bg-[#141414] border border-[#1E1E1E] rounded-2xl p-4 text-left">
                                <div className="text-[#888888] text-[14px] mb-3">2019 BMW X3 · 132,400 km</div>

                                <div className="flex flex-col gap-2 text-[13px]">
                                    <div className="flex items-center gap-2 text-[#DDDDDD]"><span className="text-[#22C55E]">●</span>Oil change · 14 Mar 25 · KSh 5,000</div>
                                    <div className="flex items-center gap-2 text-[#DDDDDD]"><span className="text-[#22C55E]">●</span>Tyres (x2) · 02 Nov 24 · KSh 20,000</div>
                                    <div className="flex items-center gap-2 text-[#DDDDDD]"><span className="text-[#F59E0B]">●</span>Insurance · Expires in 3 weeks</div>
                                </div>

                                <div className="border-t border-[#262626] my-3"></div>

                                <div className="border-l-2 border-[#E8693C] pl-2.5">
                                    <div className="flex items-center gap-2 mb-1.5">
                                    <div className="w-7 h-7 rounded-full bg-[#111] border border-[#E8693C] flex items-center justify-center flex-shrink-0">
                                        <svg width="15" height="11" viewBox="0 0 28 20">
                                        <rect x="4" y="7" width="7" height="5" rx="1.5" fill="#E8693C"/>
                                        <rect x="17" y="7" width="7" height="5" rx="1.5" fill="#E8693C"/>
                                        <line x1="9" y1="17" x2="19" y2="17" stroke="#E8693C" strokeWidth="1.4" strokeLinecap="round"/>
                                        </svg>
                                    </div>
                                    <span className="text-[#F5F5F5] text-[12px] font-medium">Rex</span>
                                    </div>
                                    <p className="text-[#CCCCCC] text-[12px] leading-[1.5] m-0">Your insurance is expires in 3 weeks. Also, that note about brakes at 130K? You're at 132,400 now. Worth checking both at the same visit.</p>
                                </div>

                                <span className="inline-block mt-3 border border-[#2A2A2A] text-[#AAAAAA] text-[11px] px-3 py-1.5 rounded-full">Book Garage →</span>
                                </div>

                                <div className="text-[#22C55E] text-sm mt-4">Your car's history. Right here.</div>
                            </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </CustomGrid>
    );
}

export { ForEveryone };