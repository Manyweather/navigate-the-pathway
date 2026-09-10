import type { Metadata } from "next";
import { ProductionPilotApp } from "../../production/production-pilot-app";

export const metadata: Metadata = {
  title: "Navigate the Pathway",
  description: "The established premedical pathway experience inside Navigate.",
};

export default function PathwayApplicationPage() {
  return <ProductionPilotApp />;
}
