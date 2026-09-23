import type { Metadata } from "next";
import { AuthCallback } from "../../../production/auth-callback";

export const metadata: Metadata = { title: { absolute: "Secure sign-in | Compass" } };

export default function CompassAuthCallbackPage() {
  return <AuthCallback />;
}

