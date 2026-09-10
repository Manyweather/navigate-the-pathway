import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Navigate · OACA Compass",
    short_name: "Compass",
    description: "Roseman academic advising, tutoring, events, attendance, and notifications.",
    start_url: "/app/oaca",
    display: "standalone",
    background_color: "#f8fbff",
    theme_color: "#791034",
    icons: [{ src: "/assets/navigate-pathway-mark.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
