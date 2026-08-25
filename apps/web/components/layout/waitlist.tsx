"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toastError } from "@/lib/toast";
import { joinWaitlist } from "@/app/actions/waitlist";
import { waitlistSchema, type WaitlistInput } from "@/lib/validation/waitlist";

const ERROR_ID = "waitlist-email-error";

const Waitlist = () => {
    const [joined, setJoined] = useState(false);

    const {
        register,
        handleSubmit,
        setError,
        setFocus,
        formState: { errors, isSubmitting },
    } = useForm<WaitlistInput>({
        resolver: zodResolver(waitlistSchema),
        // Validate on submit, then live once a field has been rejected —
        // complaining before the address is finished typing is hostile.
        mode: "onSubmit",
        reValidateMode: "onChange",
    });

    const onSubmit = async (values: WaitlistInput) => {
        const result = await joinWaitlist(values);

        if (result.status === "success") {
            setJoined(true);
            return;
        }

        if (result.status === "invalid") {
            // Something the user can fix, so it belongs on the field.
            setError("email", { type: "server", message: result.message });
            setFocus("email");
            return;
        }

        // Rate limits and server faults: nothing to correct on the field.
        toastError({ title: "Could not join the waitlist", description: result.message });
        setFocus("email");
    };

    const emailError = errors.email?.message;

    return (
        <div id="waitlist" className="flex flex-col items-center justify-center space-y-8 bg-[#0E0E0E] py-24">
            <p className="text-primary text-2xl font-semibold md:text-4xl md:max-w-md text-center">350+ builders already on the list.</p>
            <div className="flex flex-col space-y-2 items-center">
                <p className="text-zinc-600 text-xs md:text-sm italic">&quot;Finally something that knows my build isn&apos;t stock.&quot;</p>
                <p className="text-zinc-600 text-xs md:text-sm italic">&quot;Rex caught a service I&apos;d completely forgotten.&quot;</p>
            </div>

            {/* Submission goes through react-hook-form, so the form cannot
                work without JavaScript. Rather than leave an inert input that
                silently does nothing, hide it and say so. The <style> inside
                <noscript> only applies when scripting is off, so this costs
                nothing in the normal case. */}
            <noscript>
                <style>{`.js-only { display: none; }`}</style>
                <p className="text-zinc-400 text-sm w-72 text-center">
                    Joining the waitlist needs JavaScript enabled. Turn it on and
                    reload, or email{" "}
                    <a href="mailto:hello@wrench.it.com" className="text-primary underline">
                        hello@wrench.it.com
                    </a>{" "}
                    and we&apos;ll add you.
                </p>
            </noscript>

            <div>
                {joined ? (
                    <div role="status" className="flex flex-col items-center space-y-2 w-72 text-center">
                        <p className="text-primary text-base font-semibold">You&apos;re on the list.</p>
                        {/* The welcome email is queued and sent by a background
                            worker, so it will not have arrived yet. */}
                        <p className="text-xs text-zinc-500">
                            Look out for a welcome email shortly.
                        </p>
                    </div>
                ) : (
                    // noValidate hands validation to zod rather than the browser,
                    // so the message is ours and matches the server's.
                    <form onSubmit={handleSubmit(onSubmit)} noValidate className="js-only">
                        <div className="flex space-x-2 items-start">
                            <div className="w-72">
                                <Input
                                    type="email"
                                    aria-label="Email address"
                                    placeholder="your@email.com"
                                    aria-invalid={emailError ? true : undefined}
                                    aria-describedby={emailError ? ERROR_ID : undefined}
                                    disabled={isSubmitting}
                                    {...register("email")}
                                />
                            </div>
                            <Button
                                type="submit"
                                variant="primary"
                                className="font-semibold w-fit"
                                isLoading={isSubmitting}
                            >
                                Join the Waitlist
                            </Button>
                        </div>

                        {emailError ? (
                            <p id={ERROR_ID} role="alert" className="text-red-500 text-xs mt-2">
                                {emailError}
                            </p>
                        ) : (
                            <p className="text-xs text-zinc-500 w-full text-center mt-3">
                                Free to start. No credit card. No spam.
                            </p>
                        )}
                    </form>
                )}
            </div>
        </div>
    );
};

export { Waitlist };
