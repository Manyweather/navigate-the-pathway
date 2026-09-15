import type { Metadata } from "next";
import { FacilitiesDashboardApp } from "../../production/facilities-dashboard-app";

export const metadata: Metadata = {
  title: "Facilities Dashboard",
  description: "Work orders, space reservations, supplies, warehouse activity, floor plans, and proactive facilities reporting.",
};

export default function FacilitiesPage() {
  return <FacilitiesDashboardApp />;
}
