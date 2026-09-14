import type { Metadata } from "next";
import { PrototypeShell } from "../prototype-shell";

export const metadata: Metadata = {
  title: "Navigate the Pathway — Demonstration",
  description: "Fictional demonstration of Navigate the Pathway student, advisor, Principal Investigator, and program-administration views.",
};

export default function Demonstration() {
  return <PrototypeShell />;
}
