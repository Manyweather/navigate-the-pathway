import type { Metadata } from "next";
import { PrototypeShell } from "../../prototype-shell";

export const metadata: Metadata = {
  title: "Navigate the Pathway — Role Demonstration",
  description: "Choose a fictional Navigate the Pathway student, advisor, Principal Investigator, or program-administration view.",
};

export default function PathwayRoleDemonstration() {
  return <PrototypeShell initialSurface="entry" />;
}
