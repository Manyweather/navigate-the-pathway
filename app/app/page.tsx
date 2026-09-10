import type { Metadata } from "next";
import { NavigateHubApp } from "../production/navigate-hub-app";

export const metadata: Metadata = {
  title: "Navigate",
  description: "One secure account hub for Navigate the Pathway, OACA Compass, and GENESIS Impact Studio.",
};

export default function PilotApplicationPage() {
  return <NavigateHubApp />;
}
