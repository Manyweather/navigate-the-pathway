import type { Metadata } from "next";
import { GenesisImpactApp } from "../../../production/genesis-impact-app";

export const metadata: Metadata = { title: "Impact Workspace", description: "Verified student-group initiatives, review, handoff, and community events." };
export default function ImpactPage() { return <GenesisImpactApp />; }
