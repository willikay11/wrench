'use client';

import { Button } from "@/components/ui/button";
import { CustomGrid } from "@/components/layout/customGrid";

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
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 py-24 h-screen items-center">
                <div style={dotsGridStyle} />
                <div className="flex flex-col space-y-4 md:space-y-6">
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
                <div className="flex items-center justify-end">
                </div>
            </div>
        </CustomGrid>
    );
}

export { ForEveryone };