import type { Metadata } from "next";
import { OacaWorksheet } from "../../../production/oaca-worksheet";

export const metadata: Metadata = { title: "OACA Visit Worksheet", description: "Accessible advising and tutoring visit worksheet." };
export default function OacaWorksheetPage() { return <OacaWorksheet />; }
