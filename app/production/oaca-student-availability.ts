export type OacaAvailabilitySlot = {
  id: string;
  providerId: string;
  providerName: string;
  providerRole: string;
  serviceKey: string;
  startsAt: string;
  endsAt: string;
  modalities: string[];
  location: string | null;
  source: "compass";
};

export type OacaAvailabilityDay = {
  key: string;
  label: string;
  shortLabel: string;
  slots: OacaAvailabilitySlot[];
};

export function studentVisibleAvailabilityProviderIds(options: {
  serviceKey: string;
  assignedAcademicAdvisorId?: string | null;
  careerAdvisorId?: string | null;
  peerTutorIds: string[];
}) {
  if (options.serviceKey === "academic_advising") {
    return options.assignedAcademicAdvisorId
      ? [options.assignedAcademicAdvisorId]
      : [];
  }
  if (options.serviceKey === "career_advising") {
    return options.careerAdvisorId ? [options.careerAdvisorId] : [];
  }
  return options.peerTutorIds;
}

export function availabilityDayKey(value: string) {
  const date = new Date(value);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function availabilityTimeBand(value: string) {
  const hour = new Date(value).getHours();
  if (hour < 12) return "Morning";
  if (hour < 14) return "Midday";
  return "Afternoon";
}

export function filterStudentAvailability(
  slots: OacaAvailabilitySlot[],
  options: {
    serviceKey: string;
    providerIds: string[];
    modality: string;
  },
) {
  return slots
    .filter(
      (slot) =>
        slot.serviceKey === options.serviceKey &&
        options.providerIds.includes(slot.providerId) &&
        slot.modalities.includes(options.modality) &&
        new Date(slot.startsAt).getTime() > Date.now(),
    )
    .sort(
      (left, right) =>
        new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime(),
    );
}

export function groupAvailabilityByDay(
  slots: OacaAvailabilitySlot[],
): OacaAvailabilityDay[] {
  const groups = new Map<string, OacaAvailabilitySlot[]>();
  for (const slot of slots) {
    const key = availabilityDayKey(slot.startsAt);
    groups.set(key, [...(groups.get(key) || []), slot]);
  }
  return [...groups.entries()].map(([key, daySlots]) => {
    const date = new Date(daySlots[0].startsAt);
    return {
      key,
      label: date.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      }),
      shortLabel: date.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
      slots: daySlots,
    };
  });
}
