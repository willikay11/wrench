/**
 * Everything the garage screen needs, and the one place it will come from.
 *
 * The API has no cars, no service history and no Rex usage counters yet, so
 * each of these answers "nothing to show" and the UI renders its empty state.
 * When GET /v1/garage lands this file is the only thing that changes: the
 * components below it are already driven entirely by these shapes.
 *
 * Deliberately not stubbed with sample data. A placeholder car in the sidebar
 * beside a main panel reading "Your garage is empty" is not a smaller lie for
 * being a pretty one.
 */

type Car = {
    id: string;
    year: number;
    make: string;
    model: string;
    mileage: number;
    /** ISO 8601. Null when the car has no recorded service yet. */
    lastServicedAt: string | null;
};

/** The one car summarised in the sidebar — the most recently active. */
type GarageSummary = {
    car: Car;
};

type RexUsage = {
    used: number;
    limit: number;
    /** ISO 8601 date the counter resets. */
    resetsAt: string;
};

const getCars = async (): Promise<Car[]> => [];

const getGarageSummary = async (): Promise<GarageSummary | null> => null;

const getRexUsage = async (): Promise<RexUsage | null> => null;

export { getCars, getGarageSummary, getRexUsage };
export type { Car, GarageSummary, RexUsage };
