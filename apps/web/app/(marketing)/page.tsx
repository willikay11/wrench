import { HeroScrollSnap } from "@/components/layout/heroScrollSnap";
import { Feature } from "@/components/layout/feature";
import { AI } from "@/components/layout/ai";
import { Waitlist } from "@/components/layout/waitlist";
import { Chat } from "@/components/layout/chat";

export default function Home() {
  return (
    <>
        <HeroScrollSnap />
        {/* Everything past the hero is one snap area. Because it is far taller
            than the viewport, every scroll offset inside it is a valid snap
            position, so these sections scroll normally while the hero panels
            above still snap. */}
        <div className="snap-start">
            <Feature />
            <AI />
            <Chat />
            <Waitlist />
        </div>
    </>
  );
}
