'use client';

import { Button } from "@/components/ui/button";
import { Card, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const Hero = () => {
    return (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 px-4 py-24">
            <div className="flex flex-col space-y-4 md:space-y-6">
                <h1 className="text-3xl md:text-5xl font-medium text-white max-w-[640px]">
                    Your AI mechanic that knows your car inside and out.
                </h1>
                <p className="mt-4 text-base md:text-lg text-zinc-500 max-w-[520px]">
                    Track every mod, plan every stage, and get AI advice that knows your specific car, not just generic answers.
                </p>
                <div className="flex gap-2">
                    <Button variant="primary">Get Started</Button>
                    <Button variant="ghost" className="ml-4">See how it works</Button>
                </div>
            </div>
            <div className="flex items-center justify-end">
                <Card className="w-full md:max-w-lg bg-neutral-900">
                    <CardTitle>
                        <div className="inline-flex border-b-[1px] border-zinc-800 pl-2 pb-2 mb-2 w-full">
                            <div className="h-3 w-3 rounded-full bg-zinc-800 mr-1.5" />
                            <div className="h-3 w-3 rounded-full bg-zinc-800 mr-1.5" />
                            <div className="h-3 w-3 rounded-full bg-zinc-800" />
                        </div>
                    </CardTitle>
                    <CardContent className="p-4 flex flex-col space-y-6">
                        <div className="flex justify-end items-center">
                            <div className="w-fit bg-zinc-900 flex border-[1px] rounded-tr-md rounded-l-md border-zinc-800 p-3">
                                <p className="text-white">Why is my 350Z misfiring at boost?</p>
                            </div>
                        </div>
                        <div className="flex justify-start items-center">
                            <div className="inline-flex gap-4 max-w-[90%]">
                                <div className="h-8 w-8 bg-primary rounded-sm" />
                                <div className="flex flex-col w-fit bg-zinc-900 flex border-[1px] rounded-r-md rounded-bl-md border-zinc-800 p-3">
                                    <p className="text-white">With your <span className="text-yellow-500 font-medium">stock injectors</span> and Stage 2 tune, you're likely hitting duty cycle limits above ~12psi — a lean misfire, not ignition.</p>
                                    <div className="inline-flex mt-2">
                                        <Badge variant="outline" size="sm" className="rounded-sm py-1">Stage 2 Tune · Jan 2024</Badge>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

export { Hero };