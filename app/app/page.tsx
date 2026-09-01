import type { Metadata } from "next";
import { ProductionPilotApp } from "../production/production-pilot-app";

export const metadata: Metadata = {
  title: "Production Pilot",
  description: "Invite-only Navigate the Pathway pilot for students, advisors, and program administrators.",
};

export default function PilotApplicationPage() {
  return <ProductionPilotApp />;
}

