'use client';

const Feature = () => {
    return (
        <div className="grid grid-cols-12">
            <div className="col-start-2 col-span-10 md:col-start-4 md:col-span-6">
                <div className="flex flex-col space-y-4 md:space-y-6 items-center my-12 md:my-20">
                    <p className="font-mono uppercase text-sm text-primary">// what wrench does</p>

                    <div className="border-b-[1px] border-zinc-700 w-full pb-6">
                        <p className="text-lg md:text-xl text-white max-w-[640px]">
                        Every modification, logged.
                        </p>
                        <p className="mt-3 text-base md:text-lg text-zinc-500">
                            The parts, the cost, the date, the photo. Your car's full history, not your memory of it.
                        </p>
                    </div>

                    <div className="border-b-[1px] border-zinc-700 w-full pb-6">
                        <p className="text-lg md:text-xl text-white max-w-[640px]">
                            Every build stage, tracked.
                        </p>
                        <p className="mt-3 text-base md:text-lg text-zinc-500">
                            Plan the work. Track the costs. Know exactly what is done and what is next.
                        </p>
                    </div>

                    <div className="w-full">
                        <p className="text-lg md:text-xl text-white max-w-[640px]">
                            Every service record, in one place.
                        </p>
                        <p className="mt-3 text-base md:text-lg text-zinc-500">
                            Oil changes, brake flushes, tyre rotations. Never wonder when something was last done.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

export { Feature };