import type { Metadata } from "next";
import { cookies } from "next/headers";
import { AccessGate } from "../access-gate";
import { ACCESS_COOKIE_NAME, verifyAccessCookie } from "../access-session";
import { PrototypeShell } from "../prototype-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Navigate the Pathway — Demonstration",
  description: "Fictional demonstration of the Navigate the Pathway student and reviewer pathways.",
};

export default async function Demonstration() {
  const cookieStore = await cookies();
  const granted = await verifyAccessCookie(
    cookieStore.get(ACCESS_COOKIE_NAME)?.value,
    process.env.NAVIGATE_SESSION_SECRET,
  );
  return granted ? <PrototypeShell /> : <AccessGate />;
}
