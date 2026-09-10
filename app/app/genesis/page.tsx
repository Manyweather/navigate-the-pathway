import type { Metadata } from "next";
import { GenesisImpactApp } from "../../production/genesis-impact-app";

export const metadata: Metadata = { title: "GENESIS Impact Studio", description: "A coached workspace for sustainable, socially responsible community initiatives in Nevada." };
export default function GenesisPage() { return <GenesisImpactApp />; }
