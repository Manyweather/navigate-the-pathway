import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Compass",
    short_name: "Compass",
    description: "Roseman academic advising, tutoring, events, attendance, and notifications.",
    id: "/app",
    start_url: "/app?signin=1",
    scope: "/",
    display: "standalone",
    background_color: "#f8fbff",
    theme_color: "#791034",
    icons: [{ src: "/assets/brand/compass-emblem-v2.png", sizes: "1200x1200", type: "image/png" }],
  };
}
