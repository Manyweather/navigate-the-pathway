import type { Metadata } from "next";
import { OacaWorksheet } from "../../../production/oaca-worksheet";

export const metadata: Metadata = { title: "Compass Visit Worksheet", description: "Accessible advising and tutoring visit worksheet." };
export default function CompassWorksheetPage() { return <OacaWorksheet />; }
