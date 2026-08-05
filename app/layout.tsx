import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://navigate-pathways.roseman-coll-6465.chatgpt.site"),
  title: {
    default: "Navigate Pathways",
    template: "%s | Navigate Pathways",
  },
  description: "A phone-first visual pathway for premedical students to capture evidence, reflect, connect, and prepare.",
  openGraph: {
    title: "Navigate Pathways",
    description: "Explore a visual premed district and complete one useful next move.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Navigate pathway map with connected premed learning stations." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Navigate the Pipeline",
    description: "Explore a visual premed district and complete one useful next move.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
