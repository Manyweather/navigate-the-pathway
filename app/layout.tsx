import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Navigate Pathways",
    template: "%s · Navigate Pathways",
  },
  description:
    "A concept experience that helps premedical students turn lived experience into an intentional path toward application.",
  openGraph: {
    title: "Navigate Pathways",
    description:
      "Turn experience into evidence, build support, and choose one useful next move.",
    images: [
      {
        url: "/navigate-pathways-social.png",
        width: 1200,
        height: 630,
        alt: "An interconnected path linking study, service, reflection, community, and compassionate purpose.",
      },
    ],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
