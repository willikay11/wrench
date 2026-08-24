import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const Waitlist = () => {
    return (
        <div id="waitlist" className="flex flex-col items-center justify-center space-y-8 bg-[#0E0E0E] py-24">
            <p className="text-primary text-2xl font-semibold md:text-4xl md:max-w-md text-center">1,240 builders already on the list.</p>
            <div className="flex flex-col space-y-2 items-center">
                <p className="text-zinc-600 text-xs md:text-sm italic">&quot;Finally something that knows my build isn&apos;t stock.&quot;</p>
                <p className="text-zinc-600 text-xs md:text-sm italic">&quot;Rex caught a service I&apos;d completely forgotten.&quot;</p>
            </div>

            <div>
                <div className="flex space-x-2">
                    <Input type="email" placeholder="your@email.com" className="w-72" />
                    <Button variant="primary" className="font-semibold w-fit">Join the Waitlist</Button>
                </div>
                <p className="text-xs text-zinc-500 w-full text-center mt-3">Free to start. No credit card. No spam.</p>
            </div>
        </div>
    )
}

export { Waitlist };