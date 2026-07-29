'use client';

import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { ForEveryone } from "./forEveryone";
import { ForBuilders } from "./forBuilders";

/**
 * Snapping is applied to the viewport scroller (<html>) rather than to a nested
 * scroll container, so native paging keys, the trackpad and the scrollbar all
 * keep working. The class is added on mount and removed on unmount, which keeps
 * every other route on normal scrolling.
 */
const SNAP_CLASS = "hero-snap";

/**
 * Viewports where a panel genuinely fits on one screen. Below this the panels
 * stack their visual column and run to ~1100px, so clipping them to the
 * viewport would cut off the headline. Must match the `hero-slides` variant and
 * the `html.hero-snap` media query in globals.css.
 */
const SLIDES_QUERY = "(width >= 80rem) and (height >= 46rem)";

/**
 * One slide: exactly one viewport tall, clipped, on big enough screens. Smaller
 * ones keep the panel as an ordinary section that grows with its content.
 */
const panel = "relative flex snap-start snap-always items-center hero-slides:overflow-hidden";

/**
 * The navbar sits above the hero in the document flow rather than over it, so
 * the first panel takes the viewport minus the navbar and pulls its snap
 * position up by the same amount. That way the page loads already framed —
 * navbar plus a full panel — instead of snapping the navbar off screen.
 */
const firstPanel =
    "min-h-[calc(100dvh-var(--wr-nav-h))] scroll-mt-[var(--wr-nav-h)] hero-slides:h-[calc(100dvh-var(--wr-nav-h))]";

const secondPanel = "min-h-dvh hero-slides:h-dvh";

/**
 * The bit that fades/slides as a panel takes over the viewport. Tailwind v4's
 * translate utilities set the `translate` property rather than `transform`, so
 * that is what has to be transitioned.
 */
const panelInner =
    "w-full hero-slides:h-full motion-safe:transition-[opacity,translate] motion-safe:duration-[400ms] motion-safe:ease-out";

/**
 * ForEveryone and ForBuilders as two full-screen slides.
 *
 * `active` is the index of the panel currently crossing the middle of the
 * viewport, or null when the reader has scrolled past the hero entirely (and
 * before the observer has reported, so the panels render visible without JS).
 */
const HeroScrollSnap = () => {
    const panelsRef = useRef<(HTMLElement | null)[]>([]);
    const [active, setActive] = useState<number | null>(null);

    useEffect(() => {
        const root = document.documentElement;
        root.classList.add(SNAP_CLASS);

        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    const index = panelsRef.current.indexOf(entry.target as HTMLElement);
                    if (index === -1) continue;

                    setActive((current) => {
                        if (entry.isIntersecting) return index;
                        return current === index ? null : current;
                    });
                }
            },
            // Collapses the root to the viewport's centre line, so exactly one
            // panel is "active" while the hero is on screen.
            { rootMargin: "-50% 0px -50% 0px" },
        );

        const panels = panelsRef.current.filter((el): el is HTMLElement => el !== null);
        panels.forEach((el) => observer.observe(el));

        /*
         * Arrow keys move about 40px, and mandatory snapping pulls every one of
         * those back to the panel you started on — so on the hero alone, arrow
         * keys would never get you anywhere. Page Down, Space, Home and End all
         * move far enough to land on the next snap point by themselves. This
         * moves the arrow keys to the same footing and touches nothing else:
         * wheel, trackpad and touch scrolling stay entirely native.
         */
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
            if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;

            const target = event.target as HTMLElement | null;
            if (target?.isContentEditable) return;
            if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;

            const second = panelsRef.current[1];
            if (!second) return;

            // Only where the panels really are one-screen slides; everywhere
            // else nothing is snapping and arrow keys already work.
            if (!window.matchMedia(SLIDES_QUERY).matches) return;

            // The first panel's scroll-margin cancels the navbar above it, so its
            // snap position is the top of the document.
            const stops = [0, second.offsetTop, second.offsetTop + second.offsetHeight];
            const current = window.scrollY;
            if (current > stops[2]) return;

            const next =
                event.key === "ArrowDown"
                    ? stops.find((stop) => stop > current + 1)
                    : [...stops].reverse().find((stop) => stop < current - 1);
            if (next === undefined) return;

            event.preventDefault();
            window.scrollTo({
                top: next,
                behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
                    ? "auto"
                    : "smooth",
            });
        };

        window.addEventListener("keydown", onKeyDown);

        return () => {
            observer.disconnect();
            window.removeEventListener("keydown", onKeyDown);
            root.classList.remove(SNAP_CLASS);
        };
    }, []);

    /**
     * Outgoing panels lift and fade, incoming ones rise from below. Only where
     * the panels are true slides — anywhere else a panel can be half on screen
     * while the other is centred, and fading it would hide live content.
     */
    const motionFor = (index: number) => {
        if (active === null || active === index) return "opacity-100 translate-y-0";
        return active > index
            ? "hero-slides:opacity-0 hero-slides:-translate-y-5"
            : "hero-slides:opacity-0 hero-slides:translate-y-5";
    };

    return (
        <>
            <section
                ref={(el) => {
                    panelsRef.current[0] = el;
                }}
                className={cn(panel, firstPanel)}
            >
                <div className={cn(panelInner, motionFor(0))}>
                    <ForEveryone />
                </div>

                {/* Hints that a second panel sits below without spelling it out. */}
                <div
                    className={cn(
                        "pointer-events-none absolute inset-x-0 bottom-6 flex flex-col items-center gap-1 transition-opacity duration-300",
                        active === 1 ? "opacity-0" : "opacity-100",
                    )}
                >
                    <span className="font-mono text-[11px] text-[#444444]">For builders →</span>
                    <span aria-hidden="true" className="animate-hint-pulse motion-reduce:animate-none">
                        <HugeiconsIcon icon={ArrowDown01Icon} size={16} className="text-[#F59E0B]" />
                    </span>
                </div>
            </section>

            <section
                ref={(el) => {
                    panelsRef.current[1] = el;
                }}
                className={cn(panel, secondPanel, "bg-[#0A0A0A]")}
            >
                <div className={cn(panelInner, motionFor(1))}>
                    <ForBuilders />
                </div>
            </section>

            {/* Which of the two slides you are on. Hidden once the hero is behind you. */}
            <div
                aria-hidden="true"
                className={cn(
                    "pointer-events-none fixed right-4 top-1/2 z-40 hidden -translate-y-1/2 flex-col gap-2 transition-opacity duration-300 hero-slides:flex",
                    active === null ? "opacity-0" : "opacity-100",
                )}
            >
                {[0, 1].map((index) => (
                    <span
                        key={index}
                        className={cn(
                            "size-1.5 rounded-full transition-colors duration-300",
                            active === index ? "bg-[#F59E0B]" : "bg-[#333333]",
                        )}
                    />
                ))}
            </div>
        </>
    );
};

export { HeroScrollSnap };
