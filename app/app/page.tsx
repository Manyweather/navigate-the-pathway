import type { Metadata } from "next";
import { NavigateHubApp } from "../production/navigate-hub-app";

export const metadata: Metadata = {
  title: { absolute: "Compass" },
  description: "The secure Compass gateway for student support, Pathway, and verified Impact access.",
};

export default function PilotApplicationPage() {
  return <NavigateHubApp />;
}
