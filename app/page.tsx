import type { Metadata } from "next";
import { cookies } from "next/headers";
import { AccessGate } from "./access-gate";
import { ACCESS_COOKIE_NAME, verifyAccessCookie } from "./access-session";
import { PrototypeShell } from "./prototype-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Navigate the Pathway",
  description: "Explore a visual premed district, capture useful evidence, and prepare focused next actions.",
};

export default async function Home() {
  const cookieStore = await cookies();
  const granted = await verifyAccessCookie(
    cookieStore.get(ACCESS_COOKIE_NAME)?.value,
    process.env.NAVIGATE_SESSION_SECRET,
  );
  return granted ? <PrototypeShell /> : <AccessGate />;
}
