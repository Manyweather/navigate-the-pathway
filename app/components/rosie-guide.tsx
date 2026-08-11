import { assetUrl } from "../asset-url";

export type RosiePose = "idle" | "gesture" | "nodding" | "pointing" | "tracks";

const poseDetails: Record<RosiePose, { src: string; alt: string; width: number; height: number }> = {
  idle: {
    src: "/assets/rosie/idle.webp",
    alt: "Rosie the Roadrunner standing calmly",
    width: 1080,
    height: 1350,
  },
  gesture: {
    src: "/assets/rosie/gesture.webp",
    alt: "Rosie the Roadrunner welcoming the student",
    width: 1080,
    height: 1350,
  },
  nodding: {
    src: "/assets/rosie/nodding.webp",
    alt: "Rosie the Roadrunner nodding in encouragement",
    width: 1080,
    height: 1350,
  },
  pointing: {
    src: "/assets/rosie/pointing.webp",
    alt: "Rosie the Roadrunner pointing toward the next action",
    width: 1080,
    height: 1350,
  },
  tracks: {
    src: "/assets/rosie/tracks.jpg",
    alt: "Rosie the Roadrunner following a line of tracks",
    width: 1080,
    height: 1080,
  },
};

export function RosieGuide({
  pose = "idle",
  eyebrow = "Rosie says",
  title,
  body,
  compact = false,
  priority = false,
}: {
  pose?: RosiePose;
  eyebrow?: string;
  title: string;
  body?: string;
  compact?: boolean;
  priority?: boolean;
}) {
  const details = poseDetails[pose];
  return (
    <aside className={`rosie-guide rosie-guide--${pose} ${compact ? "rosie-guide--compact" : ""}`}>
      <img
        src={assetUrl(details.src)}
        alt={details.alt}
        width={details.width}
        height={details.height}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
      />
      <div>
        <p className="kicker">{eyebrow}</p>
        <strong>{title}</strong>
        {body ? <span>{body}</span> : null}
      </div>
    </aside>
  );
}
