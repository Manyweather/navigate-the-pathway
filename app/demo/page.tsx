import type { Metadata } from "next";
import { PrototypeShell } from "../prototype-shell";

export const metadata: Metadata = {
  title: "Navigate the Pathway — Demonstration",
  description: "Fictional demonstration of the Navigate the Pathway student and reviewer pathways.",
};

export default function Demonstration() {
  return <PrototypeShell />;
}
