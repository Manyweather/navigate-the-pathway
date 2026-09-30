import type { Metadata } from "next";
import { CreatorDashboardApp } from "../../production/creator-dashboard-app";

export const metadata: Metadata = { title: { absolute: "Compass Creator" }, description: "Creator notifications, staff roster, and workspace access." };
export default function CreatorPage() { return <CreatorDashboardApp />; }
