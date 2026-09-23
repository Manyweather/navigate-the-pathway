import type { Metadata } from "next";
import { CreatorRecovery } from "../../production/creator-recovery";

export const metadata: Metadata = { title: { absolute: "Creator recovery | Compass" }, robots: { index: false, follow: false } };

export default function CreatorRecoveryPage() {
  return <CreatorRecovery />;
}

