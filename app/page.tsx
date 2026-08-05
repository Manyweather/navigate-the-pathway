import type { Metadata } from "next";
import { JourneyExperience } from "./journey-experience";

export const metadata: Metadata = {
  title: "Your personalized premed pathway",
  description:
    "Set up your premed pathway, explore practical learning stations, and choose one useful next action.",
};

export default function Home() {
  return <JourneyExperience />;
}
