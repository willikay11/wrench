/**
 * The sidebar's two bits of formatting, kept out of the components so they can
 * be tested against fixed inputs rather than through a render.
 */

/** "91,204 mi" — grouped, because six figures of mileage is unreadable raw. */
const formatMileage = (miles: number) => `${miles.toLocaleString("en-US")} mi`;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

/**
 * "2 wks ago" — the sidebar has room for a glance, not a date.
 *
 * Coarse by design: whether the last service was 14 or 16 days ago does not
 * change what the owner does next, and the exact date belongs on the car's
 * own page.
 */
const formatLastService = (isoDate: string, now: Date = new Date()) => {
    const then = new Date(isoDate);

    if (Number.isNaN(then.getTime())) return "Unknown";

    const elapsed = now.getTime() - then.getTime();

    // A service logged slightly in the future is a clock skew, not a booking.
    if (elapsed < MINUTE) return "just now";
    if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} min ago`;
    if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)} hr ago`;
    if (elapsed < WEEK) return `${Math.floor(elapsed / DAY)} d ago`;
    if (elapsed < MONTH) return `${Math.floor(elapsed / WEEK)} wks ago`;
    if (elapsed < YEAR) return `${Math.floor(elapsed / MONTH)} mo ago`;

    return `${Math.floor(elapsed / YEAR)} yr ago`;
};

/** "Aug 1" — the reset date under the Rex usage bar. */
const formatResetDate = (isoDate: string) => {
    const date = new Date(isoDate);

    if (Number.isNaN(date.getTime())) return "";

    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
};

export { formatLastService, formatMileage, formatResetDate };
