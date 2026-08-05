import type { Metadata } from "next";
import { JourneyExperience } from "./journey-experience";

export const metadata: Metadata = {
  title: "Your path is already in motion",
  description:
    "Map what you already carry, turn experience into evidence, and choose a next move that fits your life.",
};

export default function Home() {
  return <JourneyExperience />;
}
