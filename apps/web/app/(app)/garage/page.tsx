import type { Metadata } from "next";

import { AddCarButton } from "@/components/app/addCarButton";
import { EmptyGarage } from "@/components/app/emptyGarage";
import { PageHeader } from "@/components/app/pageHeader";
import { getCars } from "@/lib/garage/data";

export const metadata: Metadata = {
    title: "Your garage · Wrench",
    // Behind a sign-in, so there is nothing here for a crawler to reach.
    robots: { index: false, follow: false },
};

export default async function GaragePage() {
    const cars = await getCars();

    return (
        <>
            <PageHeader title="Your garage" action={<AddCarButton label="Add car" compact />} />

            {cars.length === 0 ? (
                <EmptyGarage />
            ) : (
                // The populated grid lands with GET /v1/cars; until the API can
                // return a car this branch is unreachable, and inventing a card
                // layout for a shape we have not agreed on would be guesswork.
                <div className="flex-1 p-6 sm:p-8" />
            )}
        </>
    );
}
