'use client';

import { HugeiconsIcon } from "@hugeicons/react";
import { SendHorizontal } from "@hugeicons/core-free-icons";
import { Button } from "../ui/button";
import { Card, CardContent, CardFooter, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Rex } from "../ui/rex";
import { useState, useEffect } from "react";

const qa = [
    {
        question: "When's my next service due?",
        answer: "Your next service is due at 90,000 km or in 2 months, whichever comes first. Your last service was on March 15th, 2026, at 84,000 km. What needs to be done is an oil change, air filter replacement, cabin filter replacement and spark plug change, along with a general inspection of the brakes and suspension components."
    },
    {
        question: "What should I upgrade next given my current mods?",
        answer: "With BC Racing coilovers and a JWT intake already in, your next highest-value upgrade is a header and exhaust to unlock the intake's gains, followed by a tune to correct fueling. Suspension and intake alone are underutilized without matching exhaust flow."
    }
]
const Chat = () => {
    const [question, setQuestion] = useState<string>("");
    const [streamedAnswer, setStreamedAnswer] = useState<string>("");
    const [isStreaming, setIsStreaming] = useState<boolean>(false);
    const [showJoinWaitlist, setShowJoinWaitlist] = useState<boolean>(false);

    useEffect(() => {
        if (!question) return;

        const answer = qa.find(item => item.question === question)?.answer ?? "";
        const words = answer.split(" ");
        let index = 0;
        let interval: ReturnType<typeof setInterval>;

        setStreamedAnswer("");
        setIsStreaming(true);

        // Simulate the backend "thinking" before the first token arrives.
        const startTimeout = setTimeout(() => {
            interval = setInterval(() => {
                index++;
                setStreamedAnswer(words.slice(0, index).join(" "));
                if (index >= words.length) {
                    clearInterval(interval);
                    setIsStreaming(false);
                    setShowJoinWaitlist(true);
                }
            }, 45);
        }, 700);

        return () => {
            clearTimeout(startTimeout);
            clearInterval(interval);
        };
    }, [question]);

    return (
        <div className="grid grid-cols-12">
            <div className="col-start-2 col-span-10 md:col-start-3 md:col-span-8">
                <div className="flex flex-col space-y-4 md:space-y-12 items-center my-12 md:my-20">
                    <p className="font-mono uppercase text-sm text-primary">// TRY IT NOW</p>

                    <div className="space-y-6 text-center">
                        <p className="text-2xl md:text-5xl text-white font-semibold">Ask Rex anything about a project car.</p>
                        <p className="mt-2 text-base md:text-lg text-zinc-500 text-center w-full">
                            No account needed, see what car-aware AI actually feels like.
                        </p>
                    </div>


                    <Card className="w-full max-w-4xl bg-[#0d0d0d] space-y-0">
                        <CardTitle className="px-6 py-4 border-b-[1px] border-zinc-700 space-y-1">
                            <p className="text-neutral-600 text-sm">Demo Car</p>
                            <p className="text-white text-xs md:text-sm">2003 Nissan 350Z · 87,000 km · Daily driven. Track days on weekends.</p>
                        </CardTitle>
                        <CardContent className="bg-[#111111] p-4 space-y-4 min-h-[200px] max-h-[400px] overflow-y-auto">
                            {!question ? (
                                <div className="flex flex-col justify-between min-h-[200px] max-h-[400px]">
                                    <p className="text-neutral-600 text-center mt-4">Ask a question to start the conversation</p>
                                    <div className="inline-flex gap-2">
                                        {qa.map((item, index) => (
                                            <Button key={index} variant="outline" className="rounded-full text-xs px-4 py-2 !bg-[#0A0A0A]" onClick={() => setQuestion(item.question)}>{item.question}</Button>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col space-y-4">
                                    <div className="flex justify-end">
                                        <p className="w-fit rounded-md rounded-br-[3px] border-[1px] border-zinc-700 px-4 py-2 bg-[#1B1B1B] text-white">
                                           {question}
                                        </p>
                                    </div>
                                    <div className="flex justify-start">
                                        <Rex size={20} showPopUp={false} />
                                        <p className="ml-2 max-w-[480px] rounded-md rounded-tl-[3px] border-[1px] border-zinc-700 px-4 py-2 bg-[#0A0A0A] text-white">
                                            {streamedAnswer ? (
                                                <>
                                                    {streamedAnswer}
                                                    {isStreaming ? (
                                                        <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 bg-zinc-400 animate-pulse" />
                                                    ) : null}
                                                </>
                                            ) : (
                                                <span className="inline-flex gap-1" aria-label="Rex is typing">
                                                    <span className="h-1.5 w-1.5 rounded-full bg-zinc-500 animate-bounce [animation-delay:-0.3s]" />
                                                    <span className="h-1.5 w-1.5 rounded-full bg-zinc-500 animate-bounce [animation-delay:-0.15s]" />
                                                    <span className="h-1.5 w-1.5 rounded-full bg-zinc-500 animate-bounce" />
                                                </span>
                                            )}
                                        </p>
                                    </div>

                                    {showJoinWaitlist && (
                                        <div className="rounded-md border border-zinc-700 p-4 mt-4 bg-[#0A0A0A]">
                                            <p className="text-xs text-zinc-500 text-center">You've seen what Rex can do with your car's context. Join the waitlist to add your own car and get answers that know your actual build.</p>
                                            <Button variant="primary" className="mt-4 w-full">
                                                Join the waitlist
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            )}

                        </CardContent>
                        <CardFooter className="w-full bg-[#111111] p-4 border-t-[1px] border-zinc-700 gap-4 items-center">
                            <Input className="w-full !bg-[#0A0A0A]" disabled={true} />
                            <Button variant="primary" disabled={true}>
                                <HugeiconsIcon icon={SendHorizontal} size={16} />
                            </Button>
                        </CardFooter>
                    </Card>
                </div>
            </div>
        </div> 
    );
}

export { Chat }