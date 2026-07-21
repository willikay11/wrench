'use client';

import { GarageIcon, WrenchIcon, Layout03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react"

const Feature = () => {
    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 py-4">
            <div className="col-span-1 border-[1px] rounded-md border-zinc-800 p-6 bg-neutral-900">
                <div className="flex flex-col space-y-4">
                    <HugeiconsIcon icon={GarageIcon} className="w-8 h-8 text-primary" />

                    <h3 className="text-lg font-semibold mb-1">Garage Management</h3>
                    <p className="text-zinc-500 text-sm">
                        Every mod, every service record, every photo. Your car's full history in one place.
                    </p>
                </div>
            </div>
            <div className="col-span-1 border-[1px] rounded-md border-zinc-800 p-6 bg-neutral-900">
                <div className="flex flex-col space-y-4">
                    <HugeiconsIcon icon={WrenchIcon} className="w-8 h-8 text-primary" />

                    <h3 className="text-lg font-semibold mb-1">AI assistant</h3>
                    <p className="text-zinc-500 text-sm">
                        Ask anything. Get answers that know your exact build, not generic advice.
                    </p>
                </div>
            </div>
            <div className="col-span-1 border-[1px] rounded-md border-zinc-800 p-6 bg-neutral-900">
                <div className="flex flex-col space-y-4">
                    <HugeiconsIcon icon={Layout03Icon} className="w-8 h-8 text-primary" />

                    <h3 className="text-lg font-semibold mb-1">Build planner</h3>
                    <p className="text-zinc-500 text-sm">
                        Plan stages, track costs, hit your budget. Know exactly where your build is at.
                    </p>
                </div>
            </div>

        </div>
    );
}

export { Feature };