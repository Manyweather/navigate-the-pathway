import type { OacaAvailabilitySlot } from "./oaca-student-availability";

export const appointmentDurationOptions = [15, 20, 30, 45, 60, 90, 120] as const;

export type AdvisorAvailabilityBlock = {
  id: string;
  weekdays: number[];
  startsAt: string;
  endsAt: string;
  bufferMinutes: number;
  durationMinutes: number;
  modalities: string[];
  location: string;
};

export type AdvisorAvailabilityException = {
  id: string;
  date: string;
  kind: "add" | "remove";
  startsAt: string;
  endsAt: string;
  bufferMinutes: number;
  durationMinutes: number;
  modalities: string[];
  location: string;
};

export type AdvisorAvailabilitySettings = {
  defaultDurationMinutes: number;
  blocks: AdvisorAvailabilityBlock[];
  exceptions: AdvisorAvailabilityException[];
};

export const defaultAdvisorAvailabilitySettings: AdvisorAvailabilitySettings = {
  defaultDurationMinutes: 30,
  exceptions: [],
  blocks: [
    {
      id: "weekday-mornings",
      weekdays: [1, 3, 5],
      startsAt: "09:00",
      endsAt: "12:00",
      bufferMinutes: 10,
      durationMinutes: 30,
      modalities: ["in_person", "teams", "zoom"],
      location: "Student Affairs Suite",
    },
    {
      id: "tuesday-thursday-afternoons",
      weekdays: [2, 4],
      startsAt: "13:00",
      endsAt: "16:30",
      bufferMinutes: 10,
      durationMinutes: 30,
      modalities: ["in_person", "phone", "teams", "zoom"],
      location: "Student Affairs Suite",
    },
  ],
};

const validTime = (value: unknown): value is string =>
  typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

const validDuration = (value: unknown) => {
  const minutes = Number(value);
  return Number.isInteger(minutes) && minutes >= 15 && minutes <= 180
    ? minutes
    : 30;
};

export function normalizeAdvisorAvailability(
  value: unknown,
): AdvisorAvailabilitySettings {
  if (!value || typeof value !== "object")
    return structuredClone(defaultAdvisorAvailabilitySettings);
  const raw = value as Record<string, unknown>;
  const rawBlocks = Array.isArray(raw.blocks)
    ? raw.blocks
    : validTime(raw.startsAt) && validTime(raw.endsAt)
      ? [raw]
      : [];
  const blocks = rawBlocks.flatMap((candidate, index) => {
    if (!candidate || typeof candidate !== "object") return [];
    const item = candidate as Record<string, unknown>;
    const startsAt = validTime(item.startsAt) ? item.startsAt : "09:00";
    const endsAt = validTime(item.endsAt) ? item.endsAt : "12:00";
    const weekdays = Array.isArray(item.weekdays)
      ? [...new Set(item.weekdays.map(Number).filter((day) => day >= 0 && day <= 6))]
      : [];
    const modalities = Array.isArray(item.modalities)
      ? item.modalities.map(String).filter(Boolean)
      : [];
    if (!weekdays.length || !modalities.length || startsAt >= endsAt) return [];
    return [
      {
        id: typeof item.id === "string" && item.id ? item.id : `availability-${index + 1}`,
        weekdays,
        startsAt,
        endsAt,
        bufferMinutes: Math.min(60, Math.max(0, Number(item.bufferMinutes) || 0)),
        durationMinutes: validDuration(item.durationMinutes ?? raw.defaultDurationMinutes),
        modalities,
        location: typeof item.location === "string" ? item.location : "",
      },
    ];
  });
  const exceptions = (Array.isArray(raw.exceptions) ? raw.exceptions : []).flatMap(
    (candidate, index) => {
      if (!candidate || typeof candidate !== "object") return [];
      const item = candidate as Record<string, unknown>;
      const date = typeof item.date === "string" ? item.date : "";
      const startsAt = validTime(item.startsAt) ? item.startsAt : "09:00";
      const endsAt = validTime(item.endsAt) ? item.endsAt : "12:00";
      const modalities = Array.isArray(item.modalities)
        ? item.modalities.map(String).filter(Boolean)
        : [];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || startsAt >= endsAt) return [];
      return [
        {
          id:
            typeof item.id === "string" && item.id
              ? item.id
              : `availability-exception-${index + 1}`,
          date,
          kind: item.kind === "remove" ? "remove" : "add",
          startsAt,
          endsAt,
          bufferMinutes: Math.min(
            60,
            Math.max(0, Number(item.bufferMinutes) || 0),
          ),
          durationMinutes: validDuration(
            item.durationMinutes ?? raw.defaultDurationMinutes,
          ),
          modalities,
          location: typeof item.location === "string" ? item.location : "",
        },
      ];
    },
  );
  return {
    defaultDurationMinutes: validDuration(raw.defaultDurationMinutes),
    blocks,
    exceptions,
  };
}

function localDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function setLocalTime(date: Date, time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

export function expandAdvisorAvailability(
  settingsValue: unknown,
  provider: {
    id: string;
    name: string;
    role: string;
    serviceKey: string;
  },
  options: { days?: number; maximumSlots?: number; now?: Date } = {},
): OacaAvailabilitySlot[] {
  const settings = normalizeAdvisorAvailability(settingsValue);
  const now = options.now ? new Date(options.now) : new Date();
  const days = options.days ?? 16;
  const maximumSlots = options.maximumSlots ?? 24;
  const slots: OacaAvailabilitySlot[] = [];
  for (let offset = 0; offset <= days && slots.length < maximumSlots; offset += 1) {
    const day = new Date(now);
    day.setDate(day.getDate() + offset);
    const dateKey = localDateKey(day);
    const removed = settings.exceptions.filter(
      (item) => item.date === dateKey && item.kind === "remove",
    );
    const recurring = settings.blocks.filter(
      (item) =>
        item.weekdays.includes(day.getDay()) &&
        !removed.some(
          (exception) =>
            exception.startsAt < item.endsAt && exception.endsAt > item.startsAt,
        ),
    );
    const additions = settings.exceptions
      .filter(
        (item) =>
          item.date === dateKey &&
          item.kind === "add" &&
          item.modalities.length > 0,
      )
      .map((item) => ({ ...item, weekdays: [day.getDay()] }));
    for (const block of [...recurring, ...additions]) {
      let start = setLocalTime(day, block.startsAt);
      const windowEnd = setLocalTime(day, block.endsAt);
      while (slots.length < maximumSlots) {
        const end = new Date(start.getTime() + block.durationMinutes * 60_000);
        if (end > windowEnd) break;
        if (start > now) {
          slots.push({
            id: `${provider.id}-${block.id}-${start.toISOString()}`,
            providerId: provider.id,
            providerName: provider.name,
            providerRole: provider.role,
            serviceKey: provider.serviceKey,
            startsAt: start.toISOString(),
            endsAt: end.toISOString(),
            modalities: block.modalities,
            location: block.location || null,
            source: "compass",
          });
        }
        start = new Date(end.getTime() + block.bufferMinutes * 60_000);
      }
    }
  }
  const unique = new Map(slots.map((slot) => [`${slot.startsAt}-${slot.endsAt}`, slot]));
  return [...unique.values()].sort(
    (left, right) =>
      new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime(),
  );
}
