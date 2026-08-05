import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://navigate-pathways.roseman-coll-6465.chatgpt.site"),
  title: {
    default: "Navigate Pathways",
    template: "%s · Navigate Pathways",
  },
  description:
    "A phone-first concept experience where premedical students explore practical stations for courses, experiences, reflection, support, and application preparation.",
  openGraph: {
    title: "Navigate Pathways",
    description:
      "Explore your premed district, save experience, build support, and choose one useful next action.",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Navigate the Pipeline pathway map with connected premed learning stations.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Navigate the Pipeline",
    description: "Explore a personalized premed district and choose one useful next action.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
