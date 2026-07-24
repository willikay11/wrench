import { ForEveryone } from "@/components/layout/forEveryone";
import { ForBuilders } from "@/components/layout/forBuilders";
import { Feature } from "@/components/layout/feature";
import { AI } from "@/components/layout/ai";
import { Waitlist } from "@/components/layout/waitlist";

export default function Home() {
  return (
    <>
        <ForEveryone />
        <ForBuilders />
        <Feature />
        <AI />
        <Waitlist />
    </>
  );
}
