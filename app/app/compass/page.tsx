import type { Metadata } from "next";
import { OacaCompassApp } from "../../production/oaca-compass-app";

export const metadata: Metadata = { title: { absolute: "Compass" }, description: "Advising, tutoring, events, notifications, and student support." };
export default function CompassPage() { return <OacaCompassApp />; }
