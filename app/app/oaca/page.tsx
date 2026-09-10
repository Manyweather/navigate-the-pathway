import type { Metadata } from "next";
import { OacaCompassApp } from "../../production/oaca-compass-app";

export const metadata: Metadata = { title: "OACA Compass", description: "Academic advising, career advising, and peer-tutoring operations for Roseman students." };
export default function OacaPage() { return <OacaCompassApp />; }
