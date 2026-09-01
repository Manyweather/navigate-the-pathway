import { redirect } from "next/navigation";

export default function LegacyPilotRedirect() {
  redirect("/app");
}

