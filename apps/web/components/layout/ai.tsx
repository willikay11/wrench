import { HugeiconsIcon } from "@hugeicons/react"

import { Button } from "../ui/button"
import { Rex } from "../ui/rex"
import { ArrowRight01FreeIcons, ArrowRight02Icon } from "@hugeicons/core-free-icons"

const AI = () => {
    return (
        <div className="grid grid-cols-12">
            <div className="col-start-2 col-span-10 md:col-start-3 md:col-span-8">
                <div className="flex flex-col space-y-4 md:space-y-12 items-center my-12 md:my-20">
                    <p className="uppercase text-sm text-primary">// MEET REX</p>

                    <div className="space-y-6 text-center">
                        <p className="text-2xl md:text-5xl text-white font-semibold">It already knows your car.</p>
                        <p className="mt-2 text-base md:text-lg text-zinc-500 text-center max-w-[640px]">
                            Rex is your AI crew chief. It knows your car's specific build, and it knows how to help you get the work done.
                        </p>
                    </div>

                    <div className="w-full space-y-3">
                        <div className="rounded-md border-[1px] border-zinc-700 w-full p-32 items-center">
                            <Rex />
                        </div>
                        <p className="text-xs text-zinc-500 text-center">Hover over Rex. Click to hear what he is thinking.</p>
                    </div>

                    <div className="space-y-8">
                        <p className="text-xl text-white"><span className="text-primary">Rex</span> knows when your last oil change was.</p>
                        <p className="text-xl text-white"><span className="text-primary">Rex</span> noticed your Stage 2 has stalled.</p>
                        <p className="text-xl text-white"><span className="text-primary">Rex</span> has opinions about your build order.</p>
                    </div>

                    <div className="border-t-[1px] border-primary px-16 items-center">
                        <Button variant="link" className="font-semibold w-fit mt-8">
                            See what Rex sees
                            <HugeiconsIcon icon={ArrowRight02Icon} size={16} className="ml-2" />
                        </Button>
                        <p className="text-xs text-zinc-700 font-semibold text-center">Early access. Limited availability.</p>
                    </div>
                </div>
            </div>
        </div>
    )
}

export { AI }