import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://navigate-pathways.roseman-coll-6465.chatgpt.site"),
  applicationName: "Compass",
  title: {
    default: "Compass",
    template: "%s | Compass",
  },
  description: "The secure Compass home for advising, tutoring, events, Navigate the Pathway, and verified Impact access.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/assets/brand/compass-emblem-v2.png",
    shortcut: "/assets/brand/compass-emblem-v2.png",
    apple: "/assets/brand/compass-emblem-v2.png",
  },
  openGraph: {
    title: "Compass",
    description: "One secure starting point for student support and authorized workspaces.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Compass student support platform." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Compass",
    description: "One secure starting point for student support and authorized workspaces.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
