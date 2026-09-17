"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PilotApiClient } from "./api-client";
import {
  advisorRelationshipLabel,
  allowedAdvisorWorkspaces,
  attentionTotal,
  careerRoadmap,
  upcomingAdvisorVisits,
  type AdvisorAttentionReason,
  type AdvisorRelationship,
  type AdvisorWorkspaceKey,
} from "./oaca-advisor-model";
import {
  appointmentDurationOptions,
  defaultAdvisorAvailabilitySettings,
  normalizeAdvisorAvailability,
  type AdvisorAvailabilityBlock,
  type AdvisorAvailabilitySettings,
} from "./advisor-availability";

type Appointment = {
  id: string;
  studentId?: string;
  studentName?: string;
  serviceName: string;
  providerName: string | null;
  subject?: string | null;
  startsAt: string | null;
  endsAt?: string | null;
  modality: string;
  status: string;
  requestOrigin?: "student" | "advisor";
  studentRecap?: string;
};

type EncounterRecord = {
  appointmentId: string;
  workingNotes: string;
  studentRecap: string;
  structuredData: {
    categories: string[];
    interventions: string[];
    referrals: string[];
    followUp: string[];
  };
  revision: number;
  updatedAt: string;
  publishedAt: string | null;
};

type AdvisorStudent = {
  id: string;
  displayName: string;
  cohortLabel: string;
  phase: string;
  year: string;
  campus: string;
  assignedAdvisorName: string | null;
  relationship: AdvisorRelationship;
  lastVisitAt: string | null;
  nextVisitAt: string | null;
  openMilestones: number;
  openTasks: number;
  noShows: number;
};

type AdvisorTask = {
  id: string;
  studentId: string;
  studentName: string;
  title: string;
  assignedTo: "student" | "advisor" | "staff";
  dueAt: string | null;
  status: "open" | "completed";
  appointmentId?: string | null;
};

type AdvisorMessage = {
  id: string;
  studentId: string;
  studentName: string;
  senderName: string;
  body: string;
  createdAt: string;
  assignedToName: string | null;
  unread: boolean;
};

type AdvisorAddendum = {
  id: string;
  appointmentId: string;
  authorName: string;
  body: string;
  createdAt: string;
};
type RoadmapCompletion = {
  studentId: string;
  itemKey: string;
  completedAt: string;
  completedByName: string;
};
type AdvisorTemplate = {
  id: string;
  name: string;
  kind: "form" | "note" | "study_plan";
  version: number;
  authorName: string;
};
type SavedReport = {
  id: string;
  name: string;
  workspace: AdvisorWorkspaceKey;
  createdAt: string;
};
type AdvisorAttentionFlag = {
  id: string;
  studentId: string;
  label: string;
  createdAt: string;
};

type AdvisorBootstrap = {
  allowedWorkspaces: AdvisorWorkspaceKey[];
  activeWorkspace: AdvisorWorkspaceKey;
  currentAdvisorName: string;
  students: AdvisorStudent[];
  tasks: AdvisorTask[];
  messages: AdvisorMessage[];
  addenda: AdvisorAddendum[];
  attention: AdvisorAttentionReason[];
  roadmapCompletions: RoadmapCompletion[];
  templates: AdvisorTemplate[];
  savedReports: SavedReport[];
  minimumGroupSize: number;
  appointments?: Appointment[];
  encounterRecords?: EncounterRecord[];
  obligations?: AdvisorData["obligations"];
  attentionFlags?: AdvisorAttentionFlag[];
};

type AdvisorData = {
  services: Array<{
    id: string;
    key: string;
    name: string;
    modalities: string[];
    durationMinutes?: number;
  }>;
  providers: Array<{
    id: string;
    displayName: string;
    classification: string;
    serviceKeys?: string[];
  }>;
  appointments: Appointment[];
  encounterRecords: EncounterRecord[];
  assignedStudents: Array<{ id: string; displayName: string }>;
  currentProvider: {
    id: string;
    displayName: string;
    serviceKeys?: string[];
  } | null;
  obligations: Array<{
    id: string;
    studentId: string;
    studentName: string;
    title: string;
    serviceKey: string;
    dueAt: string | null;
    status: string;
  }>;
  events: unknown[];
  campaigns: unknown[];
  nudges: unknown[];
  canManageImports: boolean;
  canViewAnalytics: boolean;
  canManageOutreach: boolean;
  eventNotificationUnreadCount: number;
};

type AdvisorView =
  | "home"
  | "appointments"
  | "calendar"
  | "students"
  | "session"
  | "messages"
  | "tasks"
  | "milestones"
  | "plans"
  | "roadmap"
  | "reports"
  | "availability"
  | "templates";
type LegacyView =
  | "events"
  | "outreach"
  | "analytics"
  | "imports"
  | "settings"
  | "policies";

const emptyBootstrap: AdvisorBootstrap = {
  allowedWorkspaces: ["academic"],
  activeWorkspace: "academic",
  currentAdvisorName: "Advisor",
  students: [],
  tasks: [],
  messages: [],
  addenda: [],
  attention: [],
  roadmapCompletions: [],
  templates: [],
  savedReports: [],
  minimumGroupSize: 10,
};

function dateTime(value: string | null | undefined) {
  return value
    ? new Date(value).toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "Time pending";
}

function statusLabel(value: string) {
  if (value === "teams") return "Teams";
  if (value === "zoom") return "Zoom";
  return value.replaceAll("_", " ");
}

function localInputDate(offsetDays = 0) {
  const value = new Date();
  value.setDate(value.getDate() + offsetDays);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const advisorWeekdays = [
  [1, "Monday", "Mon"],
  [2, "Tuesday", "Tue"],
  [3, "Wednesday", "Wed"],
  [4, "Thursday", "Thu"],
  [5, "Friday", "Fri"],
] as const;

function availabilityDaysLabel(block: AdvisorAvailabilityBlock) {
  return advisorWeekdays
    .filter(([value]) => block.weekdays.includes(value))
    .map(([, , short]) => short)
    .join(" · ");
}

function appointmentDuration(appointment?: Appointment) {
  if (!appointment?.startsAt || !appointment.endsAt) return 30;
  const minutes = Math.round(
    (new Date(appointment.endsAt).getTime() -
      new Date(appointment.startsAt).getTime()) /
      60_000,
  );
  return minutes >= 15 && minutes <= 180 ? minutes : 30;
}

function fallbackBootstrap(
  data: AdvisorData,
  roles: string[],
  capabilities: string[],
  workspace: AdvisorWorkspaceKey,
): AdvisorBootstrap {
  const allowed = allowedAdvisorWorkspaces({
    roles,
    capabilities,
    providerServiceKeys: data.currentProvider?.serviceKeys,
  });
  const students = data.assignedStudents.map((student) => {
    const visits = data.appointments.filter(
      (appointment) => appointment.studentId === student.id,
    );
    return {
      id: student.id,
      displayName: student.displayName,
      cohortLabel: "RUCOM",
      phase: "Current phase",
      year: "Current year",
      campus: "Campus on file",
      assignedAdvisorName: data.currentProvider?.displayName || null,
      relationship: (workspace === "career"
        ? "career_service"
        : "assigned") as AdvisorRelationship,
      lastVisitAt:
        visits.find((visit) => visit.status === "completed")?.startsAt || null,
      nextVisitAt:
        visits.find((visit) => visit.status === "confirmed")?.startsAt || null,
      openMilestones: data.obligations.filter(
        (item) => item.studentId === student.id && item.status !== "completed",
      ).length,
      openTasks: 0,
      noShows: visits.filter((visit) => visit.status === "no_show").length,
    };
  });
  return {
    ...emptyBootstrap,
    allowedWorkspaces: allowed.length ? allowed : [workspace],
    activeWorkspace: workspace,
    currentAdvisorName: data.currentProvider?.displayName || "Compass advisor",
    students,
  };
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button className="workspace-back text-button" onClick={onBack}>
      ← Advisor home
    </button>
  );
}

function AdvisorIcon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    appointments: (
      <>
        <rect x="4" y="5" width="16" height="15" rx="3" />
        <path d="M8 3v4M16 3v4M7 10h10M8 14h3" />
      </>
    ),
    calendar: (
      <>
        <rect x="3.5" y="5" width="17" height="15" rx="3" />
        <path d="M8 3v4M16 3v4M7 11h3M14 11h3M7 15h3M14 15h3" />
      </>
    ),
    students: (
      <>
        <circle cx="9" cy="8" r="3" />
        <circle cx="17" cy="9" r="2.5" />
        <path d="M3.5 20c.5-4 2.5-6 5.5-6s5 2 5.5 6M14 15c3-.5 5 1.2 6 4" />
      </>
    ),
    session: (
      <>
        <path d="M6 3h9l3 3v15H6z" />
        <path d="M14 3v5h5M9 12h6M9 16h6" />
      </>
    ),
    messages: (
      <>
        <path d="M4 5h16v11H9l-5 4z" />
        <path d="M8 9h8M8 12h6" />
      </>
    ),
    tasks: (
      <>
        <path d="M9 5h11M9 12h11M9 19h11" />
        <path d="m3 5 2 2 3-4M3 12l2 2 3-4M3 19l2 2 3-4" />
      </>
    ),
    events: (
      <>
        <path d="M4 5h16v15H4zM8 3v4M16 3v4M4 10h16" />
        <path d="m9 16 2 2 4-5" />
      </>
    ),
    outreach: (
      <>
        <path d="m4 13 15-8-5 15-3-6z" />
        <path d="m11 14 8-9" />
      </>
    ),
    reports: (
      <>
        <path d="M5 20V9M11 20V4M17 20v-7M3 20h18" />
      </>
    ),
    availability: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v6l4 2" />
      </>
    ),
    milestones: (
      <>
        <path d="M5 21V4M5 5h12l-3 4 3 4H5" />
      </>
    ),
    plans: (
      <>
        <path d="M5 3h14v18H5zM9 7h6M9 11h6M9 15h4" />
      </>
    ),
    roadmap: (
      <>
        <path d="M5 4v16M5 6h8l3 3-3 3H5M5 15h6l3 3-3 3" />
      </>
    ),
    templates: (
      <>
        <path d="M6 3h9l3 3v15H6zM14 3v5h5M9 12h6M9 16h4" />
      </>
    ),
  };
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name] || paths.session}
    </svg>
  );
}

export function CompassAdvisorWorkspace({
  api,
  data,
  roles,
  capabilities,
  reload,
  onOpenLegacy,
}: {
  api: PilotApiClient;
  data: AdvisorData;
  roles: string[];
  capabilities: string[];
  reload: () => Promise<void>;
  onOpenLegacy: (view: LegacyView) => void;
}) {
  const initialAllowed = allowedAdvisorWorkspaces({
    roles,
    capabilities,
    providerServiceKeys: data.currentProvider?.serviceKeys,
  });
  const [workspace, setWorkspace] = useState<AdvisorWorkspaceKey>(
    initialAllowed.includes("career") && !initialAllowed.includes("academic")
      ? "career"
      : "academic",
  );
  const [view, setView] = useState<AdvisorView>("home");
  const [advisor, setAdvisor] = useState<AdvisorBootstrap>(() =>
    fallbackBootstrap(data, roles, capabilities, workspace),
  );
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [selectedAppointmentId, setSelectedAppointmentId] = useState("");
  const [calendarMode, setCalendarMode] = useState<"day" | "week" | "list">(
    "list",
  );
  const [notes, setNotes] = useState("");
  const [recap, setRecap] = useState("");
  const [category, setCategory] = useState(
    workspace === "academic" ? "academic_planning" : "career_exploration",
  );
  const [addendum, setAddendum] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskOwner, setTaskOwner] = useState<"student" | "advisor">("student");
  const [taskDue, setTaskDue] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [appointmentStudent, setAppointmentStudent] = useState("");
  const [appointmentStart, setAppointmentStart] = useState("");
  const [appointmentDurationMinutes, setAppointmentDurationMinutes] =
    useState("30");
  const [appointmentModality, setAppointmentModality] = useState("teams");
  const [appointmentTopic, setAppointmentTopic] = useState("");
  const [appointmentConfirmation, setAppointmentConfirmation] = useState<
    "confirmed" | "student_confirmation"
  >("confirmed");
  const [recurrence, setRecurrence] = useState<"none" | "weekly" | "monthly">(
    "none",
  );
  const [recurrenceCount, setRecurrenceCount] = useState("1");
  const [quickEncounterAt, setQuickEncounterAt] = useState("");
  const [quickEncounterStudent, setQuickEncounterStudent] = useState("");
  const [quickEncounterTopic, setQuickEncounterTopic] = useState("");
  const [editingAppointmentId, setEditingAppointmentId] = useState("");
  const [allowConflict, setAllowConflict] = useState(false);
  const [overrideLimit, setOverrideLimit] = useState(false);
  const [cancellingAppointmentId, setCancellingAppointmentId] = useState("");
  const [cancellationCategory, setCancellationCategory] =
    useState("student_request");
  const [cancellationNote, setCancellationNote] = useState("");
  const [flagLabel, setFlagLabel] = useState("");
  const [planTitle, setPlanTitle] = useState("");
  const [planBody, setPlanBody] = useState("");
  const [reportName, setReportName] = useState("");
  const [availabilitySettings, setAvailabilitySettings] =
    useState<AdvisorAvailabilitySettings>(() =>
      structuredClone(defaultAdvisorAvailabilitySettings),
    );
  const [availabilityMode, setAvailabilityMode] = useState<"recurring" | "date">(
    "recurring",
  );
  const [availabilityDate, setAvailabilityDate] = useState(() =>
    localInputDate(1),
  );
  const [availabilityDays, setAvailabilityDays] = useState<number[]>([1, 3, 5]);
  const [availabilityStart, setAvailabilityStart] = useState("09:00");
  const [availabilityEnd, setAvailabilityEnd] = useState("12:00");
  const [availabilityBuffer, setAvailabilityBuffer] = useState("10");
  const [availabilityDuration, setAvailabilityDuration] = useState("30");
  const [availabilityModalities, setAvailabilityModalities] = useState<string[]>([
    "in_person",
    "teams",
  ]);
  const [availabilityLocation, setAvailabilityLocation] = useState(
    "Student Affairs Suite",
  );

  const loadAdvisor = useCallback(
    async (nextWorkspace = workspace) => {
      try {
        const loaded = await api.request<AdvisorBootstrap>(
          `/api/oaca/advisor/bootstrap?workspace=${nextWorkspace}`,
        );
        setAdvisor(loaded);
      } catch {
        setAdvisor(fallbackBootstrap(data, roles, capabilities, nextWorkspace));
      }
    },
    [api, capabilities, data, roles, workspace],
  );

  const loadAvailability = useCallback(
    async (nextWorkspace = workspace) => {
      try {
        const loaded = await api.request<unknown>(
          `/api/oaca/advisor/availability?workspace=${nextWorkspace}`,
        );
        setAvailabilitySettings(normalizeAdvisorAvailability(loaded));
      } catch {
        setAvailabilitySettings(
          structuredClone(defaultAdvisorAvailabilitySettings),
        );
      }
    },
    [api, workspace],
  );

  useEffect(() => {
    const task = window.setTimeout(() => void loadAdvisor(), 0);
    return () => window.clearTimeout(task);
  }, [loadAdvisor]);

  useEffect(() => {
    const task = window.setTimeout(() => void loadAvailability(), 0);
    return () => window.clearTimeout(task);
  }, [loadAvailability]);

  const allAppointments = advisor.appointments || data.appointments;
  const allRecords = advisor.encounterRecords || data.encounterRecords;
  const allObligations = advisor.obligations || data.obligations;
  const workspaceAppointments = useMemo(
    () =>
      allAppointments.filter((appointment) =>
        appointment.serviceName
          .toLowerCase()
          .includes(workspace === "academic" ? "academic" : "career"),
      ),
    [allAppointments, workspace],
  );
  const sortedAppointments = useMemo(
    () =>
      [...workspaceAppointments].sort(
        (left, right) =>
          new Date(left.startsAt || 0).getTime() -
          new Date(right.startsAt || 0).getTime(),
      ),
    [workspaceAppointments],
  );
  const selectedStudent =
    advisor.students.find((student) => student.id === selectedStudentId) ||
    advisor.students[0];
  const selectedAppointment =
    allAppointments.find(
      (appointment) => appointment.id === selectedAppointmentId,
    ) ||
    workspaceAppointments.find(
      (appointment) => appointment.status === "completed",
    ) ||
    workspaceAppointments[0];
  const selectedRecord = allRecords.find(
    (record) => record.appointmentId === selectedAppointment?.id,
  );
  const selectedAddenda = advisor.addenda.filter(
    (item) => item.appointmentId === selectedAppointment?.id,
  );
  const filteredStudents = advisor.students.filter((student) =>
    `${student.displayName} ${student.cohortLabel} ${student.year}`
      .toLowerCase()
      .includes(studentSearch.toLowerCase()),
  );
  const pending = workspaceAppointments.filter(
    (appointment) =>
      appointment.status === "pending_approval" ||
      appointment.status === "counterproposed",
  );
  const approvalAndCancellationQueue = workspaceAppointments
    .filter((appointment) =>
      ["pending_approval", "counterproposed", "cancelled"].includes(
        appointment.status,
      ),
    )
    .sort((left, right) => {
      const leftPriority = left.status === "cancelled" ? 1 : 0;
      const rightPriority = right.status === "cancelled" ? 1 : 0;
      return (
        leftPriority - rightPriority ||
        new Date(left.startsAt || 0).getTime() -
          new Date(right.startsAt || 0).getTime()
      );
    });
  const todayKey = new Date().toDateString();
  const todayAppointments = sortedAppointments.filter(
    (appointment) =>
      appointment.startsAt &&
      new Date(appointment.startsAt).toDateString() === todayKey,
  );
  const openTasks = advisor.tasks.filter((task) => task.status === "open");
  const agendaAppointments = todayAppointments.length
    ? todayAppointments
    : upcomingAdvisorVisits(sortedAppointments, new Date());
  const unreadMessages = advisor.messages.filter((item) => item.unread);
  const elevated = roles.some(
    (role) => role === "administrator" || role === "creator",
  );

  useEffect(() => {
    // Selection changes intentionally hydrate this editable encounter draft.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNotes(selectedRecord?.workingNotes || "");
    setRecap(
      selectedRecord?.studentRecap || selectedAppointment?.studentRecap || "",
    );
    setCategory(
      selectedRecord?.structuredData.categories[0] ||
        (workspace === "academic" ? "academic_planning" : "career_exploration"),
    );
  }, [
    selectedAppointment?.id,
    selectedAppointment?.studentRecap,
    selectedRecord?.revision,
    selectedRecord?.studentRecap,
    selectedRecord?.structuredData.categories,
    selectedRecord?.workingNotes,
    workspace,
  ]);

  const refresh = async () => {
    await reload();
    await loadAdvisor();
  };
  const act = async (path: string, body: unknown, success: string) => {
    setBusy(true);
    setMessage("");
    const scopedBody =
      body && typeof body === "object" && !Array.isArray(body)
        ? { workspace, ...(body as Record<string, unknown>) }
        : body;
    try {
      await api.request(path, { method: "POST", body: scopedBody });
      setMessage(success);
      await refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Compass could not save that change.",
      );
    } finally {
      setBusy(false);
    }
  };

  const saveAvailability = async (
    next: AdvisorAvailabilitySettings,
    success: string,
  ) => {
    setBusy(true);
    setMessage("");
    try {
      await api.request("/api/oaca/advisor/availability", {
        method: "POST",
        body: { workspace, ...next },
      });
      setAvailabilitySettings(next);
      setMessage(success);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Compass could not save those availability blocks.",
      );
    } finally {
      setBusy(false);
    }
  };

  const addAvailabilityBlock = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!availabilityDays.length) {
      setMessage("Choose at least one day for this availability block.");
      return;
    }
    if (availabilityStart >= availabilityEnd) {
      setMessage("The end time must be later than the start time.");
      return;
    }
    if (!availabilityModalities.length) {
      setMessage("Choose at least one appointment format.");
      return;
    }
    const block: AdvisorAvailabilityBlock = {
      id: `availability-${crypto.randomUUID()}`,
      weekdays: availabilityDays,
      startsAt: availabilityStart,
      endsAt: availabilityEnd,
      bufferMinutes: Number(availabilityBuffer),
      durationMinutes: Number(availabilityDuration),
      modalities: availabilityModalities,
      location: availabilityLocation.trim(),
    };
    const next = {
      defaultDurationMinutes: Number(availabilityDuration),
      blocks: [...availabilitySettings.blocks, block],
    };
    await saveAvailability(next, "Availability block added.");
  };

  const addHomeAvailability = async (event: React.FormEvent) => {
    event.preventDefault();
    if (availabilityStart >= availabilityEnd) {
      setMessage("The end time must be later than the start time.");
      return;
    }
    if (!availabilityModalities.length) {
      setMessage("Choose at least one appointment format.");
      return;
    }
    if (availabilityMode === "date") {
      if (!availabilityDate) {
        setMessage("Choose a date for this availability block.");
        return;
      }
      const next = {
        ...availabilitySettings,
        defaultDurationMinutes: Number(availabilityDuration),
        exceptions: [
          ...availabilitySettings.exceptions,
          {
            id: `availability-date-${crypto.randomUUID()}`,
            date: availabilityDate,
            kind: "add" as const,
            startsAt: availabilityStart,
            endsAt: availabilityEnd,
            bufferMinutes: Number(availabilityBuffer),
            durationMinutes: Number(availabilityDuration),
            modalities: availabilityModalities,
            location: availabilityLocation.trim(),
          },
        ],
      };
      await saveAvailability(next, "One-day availability added.");
      return;
    }
    await addAvailabilityBlock(event);
  };

  const chooseWorkspace = (next: AdvisorWorkspaceKey) => {
    setWorkspace(next);
    setView("home");
    setMessage("");
    void loadAdvisor(next);
  };
  const openSession = (appointmentId?: string) => {
    if (appointmentId) setSelectedAppointmentId(appointmentId);
    setView("session");
  };
  const openStudent = (student: AdvisorStudent) => {
    setSelectedStudentId(student.id);
    setMessage(
      student.relationship === "outside_caseload"
        ? "Outside-caseload access was recorded automatically."
        : "",
    );
    void api
      .request("/api/oaca/advisor/student-timeline", {
        method: "POST",
        body: { workspace, studentId: student.id },
      })
      .catch(() => undefined);
  };

  const createAppointment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (editingAppointmentId) {
      await act(
        "/api/oaca/advisor/reschedule",
        {
          appointmentId: editingAppointmentId,
          startsAt: appointmentStart,
          durationMinutes: Number(appointmentDurationMinutes),
          allowConflict,
        },
        "Appointment moved immediately and the student was notified.",
      );
      setEditingAppointmentId("");
      setAllowConflict(false);
      return;
    }
    await act(
      "/api/oaca/advisor/appointments",
      {
        workspace,
        studentId: appointmentStudent,
        startsAt: appointmentStart,
        durationMinutes: Number(appointmentDurationMinutes),
        modality: appointmentModality,
        topic: appointmentTopic,
        confirmationMode: appointmentConfirmation,
        recurrence,
        recurrenceCount: Number(recurrenceCount),
        allowConflict,
        overrideLimit,
      },
      appointmentConfirmation === "confirmed"
        ? "Appointment confirmed and the student was notified."
        : "Appointment proposal sent for student confirmation.",
    );
    setAllowConflict(false);
    setOverrideLimit(false);
  };

  const beginReschedule = (appointment: Appointment) => {
    setEditingAppointmentId(appointment.id);
    setAppointmentStudent(appointment.studentId || "");
    setAppointmentTopic(appointment.subject || appointment.serviceName);
    setAppointmentModality(appointment.modality);
    setAppointmentStart(
      appointment.startsAt
        ? new Date(appointment.startsAt).toISOString().slice(0, 16)
        : "",
    );
    setAppointmentDurationMinutes(String(appointmentDuration(appointment)));
    setRecurrence("none");
    setMessage(
      "Choose the new time. Confirmed appointments move immediately when saved.",
    );
  };

  const saveRecord = (publishRecap: boolean) => {
    if (!selectedAppointment) return;
    void act(
      "/api/oaca/records",
      {
        appointmentId: selectedAppointment.id,
        workingNotes: notes,
        studentRecap: recap,
        structuredData: {
          categories: [category],
          interventions: selectedRecord?.structuredData.interventions || [],
          referrals: selectedRecord?.structuredData.referrals || [],
          followUp: selectedRecord?.structuredData.followUp || [],
        },
        publishRecap,
      },
      publishRecap
        ? "Student recap published."
        : "Protected note revision saved.",
    );
  };

  const tiles: Array<{
    key: string;
    title: string;
    description: string;
    action: () => void;
  }> = [
    {
      key: "appointments",
      title: "Appointments",
      description:
        "Requests, decisions, recurring visits, and quick encounters",
      action: () => setView("appointments"),
    },
    {
      key: "calendar",
      title: "Calendar",
      description: "Day, week, and accessible list views",
      action: () => setView("calendar"),
    },
    {
      key: "students",
      title: "Students",
      description: "Search RUCOM and open the shared advising timeline",
      action: () => setView("students"),
    },
    {
      key: "session",
      title: "Session records",
      description: "Prepare, meet, document, and publish recaps",
      action: () => setView("session"),
    },
    {
      key: "messages",
      title: "Messages",
      description: "One continuous conversation for each student",
      action: () => setView("messages"),
    },
    {
      key: "tasks",
      title: "Tasks",
      description: "Shared actions, due dates, and completion",
      action: () => setView("tasks"),
    },
    ...(workspace === "academic"
      ? [
          {
            key: "milestones",
            title: "Milestones",
            description: "Policy requirements and linked visit steps",
            action: () => setView("milestones" as AdvisorView),
          },
          {
            key: "plans",
            title: "Study plans",
            description: "Versioned learning guides and planning templates",
            action: () => setView("plans" as AdvisorView),
          },
        ]
      : [
          {
            key: "roadmap",
            title: "Career roadmap",
            description: "Year-by-year CiM, events, artifacts, and visits",
            action: () => setView("roadmap" as AdvisorView),
          },
        ]),
    {
      key: "events",
      title: "Events",
      description: "Create and manage programs you coordinate",
      action: () => onOpenLegacy("events"),
    },
    {
      key: "outreach",
      title: "Outreach",
      description: "Scoped nudges, email, SMS, forms, and insights",
      action: () => onOpenLegacy("outreach"),
    },
    {
      key: "reports",
      title: "Reports",
      description: "Caseload dashboards, saved reports, and exports",
      action: () => setView("reports"),
    },
    {
      key: "availability",
      title: "Availability",
      description: "Office hours, modalities, buffers, and exceptions",
      action: () => setView("availability"),
    },
    {
      key: "templates",
      title: "Staff template library",
      description: "Forms, note templates, and planning tools",
      action: () => setView("templates"),
    },
  ];

  if (view === "appointments")
    return (
      <section className="experience-panel advisor-detail-page">
        <BackButton onBack={() => setView("home")} />
        <div className="section-heading">
          <div>
            <p className="kicker">{workspace} advising</p>
            <h1>Appointments and requests</h1>
          </div>
          <span className="status-chip status-chip--pending">
            {pending.length} awaiting decision
          </span>
        </div>
        <p className="form-message" aria-live="polite">
          {message}
        </p>
        <div className="advisor-two-column">
          <section className="advisor-stack">
            <h2>Requests and visits</h2>
            {sortedAppointments.map((appointment) => (
              <article className="advisor-list-card" key={appointment.id}>
                <div>
                  <span
                    className={`status-chip status-chip--${appointment.status}`}
                  >
                    {statusLabel(appointment.status)}
                  </span>
                  <h3>{appointment.studentName || "Student"}</h3>
                  <p>{appointment.subject || appointment.serviceName}</p>
                  <small>
                    {dateTime(appointment.startsAt)} ·{" "}
                    {statusLabel(appointment.modality)}
                  </small>
                </div>
                <div className="advisor-card-actions">
                  {["pending_approval", "counterproposed"].includes(
                    appointment.status,
                  ) ? (
                    <>
                      <button
                        className="primary-button"
                        disabled={busy}
                        onClick={() =>
                          void act(
                            "/api/oaca/appointment-decisions",
                            {
                              appointmentId: appointment.id,
                              decision: "confirm",
                            },
                            "Appointment confirmed.",
                          )
                        }
                      >
                        Confirm
                      </button>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() =>
                          void act(
                            "/api/oaca/appointment-decisions",
                            {
                              appointmentId: appointment.id,
                              decision: "decline",
                            },
                            "Appointment declined.",
                          )
                        }
                      >
                        Decline
                      </button>
                    </>
                  ) : null}
                  <button
                    className="secondary-button"
                    onClick={() => openSession(appointment.id)}
                  >
                    Open session
                  </button>
                  {appointment.status === "confirmed" ? (
                    <>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() => beginReschedule(appointment)}
                      >
                        Reschedule
                      </button>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() =>
                          setCancellingAppointmentId(appointment.id)
                        }
                      >
                        Cancel
                      </button>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() =>
                          void act(
                            "/api/oaca/appointment-decisions",
                            {
                              appointmentId: appointment.id,
                              decision: "complete",
                            },
                            "Session marked completed. Notes remain optional.",
                          )
                        }
                      >
                        Mark completed
                      </button>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() =>
                          void act(
                            "/api/oaca/appointment-decisions",
                            {
                              appointmentId: appointment.id,
                              decision: "no_show",
                            },
                            "No-show recorded. Choose rebooking, a nudge, a task, or no further action.",
                          )
                        }
                      >
                        No-show
                      </button>
                    </>
                  ) : null}
                  {appointment.status === "no_show" ? (
                    <>
                      <button
                        className="secondary-button"
                        onClick={() => beginReschedule(appointment)}
                      >
                        Rebook
                      </button>
                      <button
                        className="text-button"
                        onClick={() => onOpenLegacy("outreach")}
                      >
                        Send nudge
                      </button>
                      <button
                        className="text-button"
                        onClick={() => openSession(appointment.id)}
                      >
                        Create task
                      </button>
                    </>
                  ) : null}
                </div>
                {cancellingAppointmentId === appointment.id ? (
                  <form
                    className="advisor-inline-cancel"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void act(
                        "/api/oaca/advisor/cancel",
                        {
                          appointmentId: appointment.id,
                          category: cancellationCategory,
                          note: cancellationNote,
                        },
                        "Appointment cancelled and the student was notified.",
                      );
                      setCancellingAppointmentId("");
                      setCancellationNote("");
                    }}
                  >
                    <label>
                      <span>Cancellation category</span>
                      <select
                        value={cancellationCategory}
                        onChange={(event) =>
                          setCancellationCategory(event.target.value)
                        }
                      >
                        <option value="student_request">Student request</option>
                        <option value="advisor_unavailable">
                          Advisor unavailable
                        </option>
                        <option value="scheduling_conflict">
                          Scheduling conflict
                        </option>
                        <option value="other">Other</option>
                      </select>
                    </label>
                    <label>
                      <span>Optional note</span>
                      <input
                        value={cancellationNote}
                        onChange={(event) =>
                          setCancellationNote(event.target.value)
                        }
                      />
                    </label>
                    <button className="secondary-button" disabled={busy}>
                      Confirm cancellation
                    </button>
                  </form>
                ) : null}
              </article>
            ))}
            {!sortedAppointments.length ? (
              <div className="empty-state">
                <h2>No {workspace} visits yet</h2>
                <p>
                  Create an appointment for a student or record a quick
                  encounter.
                </p>
              </div>
            ) : null}
          </section>
          <div className="advisor-form-stack">
            <form
              className="experience-form advisor-compact-form"
              onSubmit={createAppointment}
            >
              <h2>
                {editingAppointmentId
                  ? "Reschedule appointment"
                  : "Schedule for a student"}
              </h2>
              <label>
                <span>Student</span>
                <select
                  required
                  disabled={Boolean(editingAppointmentId)}
                  value={appointmentStudent}
                  onChange={(event) =>
                    setAppointmentStudent(event.target.value)
                  }
                >
                  <option value="">Choose a student</option>
                  {advisor.students.map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Reason for visit</span>
                <input
                  required
                  disabled={Boolean(editingAppointmentId)}
                  value={appointmentTopic}
                  onChange={(event) => setAppointmentTopic(event.target.value)}
                />
              </label>
              <div className="form-row">
                <label>
                  <span>Date and time</span>
                  <input
                    required
                    type="datetime-local"
                    value={appointmentStart}
                    onChange={(event) => setAppointmentStart(event.target.value)}
                  />
                </label>
                <label>
                  <span>Appointment length</span>
                  <select
                    value={appointmentDurationMinutes}
                    onChange={(event) =>
                      setAppointmentDurationMinutes(event.target.value)
                    }
                  >
                    {appointmentDurationOptions.map((minutes) => (
                      <option key={minutes} value={minutes}>
                        {minutes === 30
                          ? "30 minutes · default"
                          : minutes < 60
                            ? `${minutes} minutes`
                            : minutes === 60
                              ? "1 hour"
                              : `${minutes / 60} hours`}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="form-row">
                <label>
                  <span>Format</span>
                  <select
                    disabled={Boolean(editingAppointmentId)}
                    value={appointmentModality}
                    onChange={(event) =>
                      setAppointmentModality(event.target.value)
                    }
                  >
                    <option value="teams">Teams</option>
                    <option value="zoom">Zoom</option>
                    <option value="in_person">In person</option>
                    <option value="phone">Phone</option>
                  </select>
                </label>
                <label>
                  <span>Student response</span>
                  <select
                    disabled={Boolean(editingAppointmentId)}
                    value={appointmentConfirmation}
                    onChange={(event) =>
                      setAppointmentConfirmation(
                        event.target.value as typeof appointmentConfirmation,
                      )
                    }
                  >
                    <option value="confirmed">Confirm now</option>
                    <option value="student_confirmation">
                      Ask student to confirm
                    </option>
                  </select>
                </label>
              </div>
              <div className="form-row">
                <label>
                  <span>Repeat</span>
                  <select
                    value={recurrence}
                    onChange={(event) =>
                      setRecurrence(event.target.value as typeof recurrence)
                    }
                  >
                    <option value="none">Does not repeat</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </label>
                {recurrence !== "none" ? (
                  <label>
                    <span>Occurrences</span>
                    <input
                      type="number"
                      min="2"
                      max="24"
                      value={recurrenceCount}
                      onChange={(event) =>
                        setRecurrenceCount(event.target.value)
                      }
                    />
                  </label>
                ) : null}
              </div>
              <small>
                Compass warns before a conflict. An advisor may explicitly
                continue, and the decision is audited.
              </small>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={allowConflict}
                  onChange={(event) => setAllowConflict(event.target.checked)}
                />
                <span>
                  I reviewed the conflict warning and authorize double-booking.
                </span>
              </label>
              {workspace === "academic" ? (
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={overrideLimit}
                    onChange={(event) => setOverrideLimit(event.target.checked)}
                  />
                  <span>
                    Override the two-drop-ins-per-block scheduling limit.
                  </span>
                </label>
              ) : null}
              <button className="primary-button" disabled={busy}>
                {editingAppointmentId
                  ? "Move appointment"
                  : "Create appointment"}
              </button>
              {editingAppointmentId ? (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setEditingAppointmentId("");
                    setAllowConflict(false);
                  }}
                >
                  Keep current time
                </button>
              ) : null}
            </form>
            <form
              className="experience-form advisor-compact-form advisor-quick-encounter"
              onSubmit={(event) => {
                event.preventDefault();
                void act(
                  "/api/oaca/advisor/quick-encounters",
                  {
                    studentId: quickEncounterStudent,
                    occurredAt: quickEncounterAt || new Date().toISOString(),
                    topic: quickEncounterTopic,
                    modality: "in_person",
                  },
                  "Quick encounter added to the shared student timeline. Documentation remains optional.",
                );
                setQuickEncounterTopic("");
              }}
            >
              <h2>Quick encounter</h2>
              <p>
                Record a walk-in or historical conversation without requiring a
                note.
              </p>
              <label>
                <span>Student</span>
                <select
                  required
                  value={quickEncounterStudent}
                  onChange={(event) =>
                    setQuickEncounterStudent(event.target.value)
                  }
                >
                  <option value="">Choose a student</option>
                  {advisor.students.map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Date and time</span>
                <input
                  type="datetime-local"
                  value={quickEncounterAt}
                  onChange={(event) => setQuickEncounterAt(event.target.value)}
                />
              </label>
              <label>
                <span>Reason</span>
                <input
                  required
                  value={quickEncounterTopic}
                  onChange={(event) =>
                    setQuickEncounterTopic(event.target.value)
                  }
                />
              </label>
              <button className="secondary-button" disabled={busy}>
                Record encounter
              </button>
            </form>
          </div>
        </div>
      </section>
    );

  if (view === "calendar")
    return (
      <section className="experience-panel advisor-detail-page">
        <BackButton onBack={() => setView("home")} />
        <div className="section-heading">
          <div>
            <p className="kicker">Advisor calendar</p>
            <h1>Your {workspace} schedule</h1>
          </div>
          <div className="segmented-control advisor-calendar-modes">
            {(["day", "week", "list"] as const).map((item) => (
              <label key={item}>
                <input
                  type="radio"
                  name="calendar-mode"
                  checked={calendarMode === item}
                  onChange={() => setCalendarMode(item)}
                />
                <span>{item}</span>
              </label>
            ))}
          </div>
        </div>
        <div
          className={`advisor-calendar advisor-calendar--${calendarMode}`}
          aria-label={`${calendarMode} appointment view`}
        >
          {sortedAppointments.map((appointment) => (
            <button
              key={appointment.id}
              onClick={() => openSession(appointment.id)}
            >
              <time>
                {appointment.startsAt
                  ? new Date(appointment.startsAt).toLocaleTimeString(
                      undefined,
                      { hour: "numeric", minute: "2-digit" },
                    )
                  : "—"}
              </time>
              <span>
                <strong>{appointment.studentName}</strong>
                <small>
                  {appointment.subject || appointment.serviceName} ·{" "}
                  {statusLabel(appointment.modality)}
                </small>
              </span>
              <i className={`status-chip status-chip--${appointment.status}`}>
                {statusLabel(appointment.status)}
              </i>
            </button>
          ))}
          {!sortedAppointments.length ? (
            <div className="empty-state">
              <h2>Your calendar is clear</h2>
              <p>
                New requests and advisor-created appointments will appear here.
              </p>
            </div>
          ) : null}
        </div>
      </section>
    );

  if (view === "students")
    return (
      <section className="experience-panel advisor-detail-page">
        <BackButton onBack={() => setView("home")} />
        <div className="section-heading">
          <div>
            <p className="kicker">RUCOM student directory</p>
            <h1>Student support records</h1>
          </div>
          <label className="advisor-search">
            <span className="sr-only">Search students</span>
            <input
              type="search"
              placeholder="Search name, cohort, or year"
              value={studentSearch}
              onChange={(event) => setStudentSearch(event.target.value)}
            />
          </label>
        </div>
        <p className="form-message" aria-live="polite">
          {message}
        </p>
        <div className="advisor-student-browser">
          <nav aria-label="Students">
            {filteredStudents.map((student) => (
              <button
                key={student.id}
                className={selectedStudent?.id === student.id ? "active" : ""}
                onClick={() => openStudent(student)}
              >
                <span>
                  <strong>{student.displayName}</strong>
                  <small>
                    {student.cohortLabel} · {student.year}
                  </small>
                </span>
                {student.relationship === "outside_caseload" ? (
                  <i>Outside caseload</i>
                ) : null}
              </button>
            ))}
          </nav>
          {selectedStudent ? (
            <article className="advisor-student-snapshot">
              <div className="advisor-snapshot-heading">
                <div>
                  <p className="kicker">Student snapshot</p>
                  <h2>{selectedStudent.displayName}</h2>
                  <p>
                    {selectedStudent.cohortLabel} · {selectedStudent.phase} ·{" "}
                    {selectedStudent.campus}
                  </p>
                </div>
                <span
                  className={
                    selectedStudent.relationship === "outside_caseload"
                      ? "status-chip status-chip--pending"
                      : "status-chip status-chip--confirmed"
                  }
                >
                  {advisorRelationshipLabel(selectedStudent.relationship)}
                </span>
              </div>
              <div className="advisor-snapshot-metrics">
                <div>
                  <strong>{selectedStudent.openMilestones}</strong>
                  <span>open milestones</span>
                </div>
                <div>
                  <strong>{selectedStudent.openTasks}</strong>
                  <span>open tasks</span>
                </div>
                <div>
                  <strong>{selectedStudent.noShows}</strong>
                  <span>no-shows</span>
                </div>
              </div>
              <dl>
                <div>
                  <dt>Permanent advisor</dt>
                  <dd>
                    {selectedStudent.assignedAdvisorName ||
                      "Assignment pending"}
                  </dd>
                </div>
                <div>
                  <dt>Last visit</dt>
                  <dd>{dateTime(selectedStudent.lastVisitAt)}</dd>
                </div>
                <div>
                  <dt>Next visit</dt>
                  <dd>{dateTime(selectedStudent.nextVisitAt)}</dd>
                </div>
              </dl>
              <div className="workspace-actions">
                <button
                  className="primary-button"
                  onClick={() => {
                    setAppointmentStudent(selectedStudent.id);
                    setView("appointments");
                  }}
                >
                  Schedule visit
                </button>
                <button
                  className="secondary-button"
                  onClick={() => {
                    setSelectedAppointmentId(
                      allAppointments.find(
                        (item) => item.studentId === selectedStudent.id,
                      )?.id || "",
                    );
                    setView("session");
                  }}
                >
                  Open timeline
                </button>
              </div>
              <section className="advisor-private-flags">
                <h3>Your private attention flags</h3>
                {(advisor.attentionFlags || [])
                  .filter((flag) => flag.studentId === selectedStudent.id)
                  .map((flag) => (
                    <span
                      className="status-chip status-chip--pending"
                      key={flag.id}
                    >
                      {flag.label}
                    </span>
                  ))}
                <div className="form-row">
                  <label>
                    <span className="sr-only">New private attention flag</span>
                    <input
                      value={flagLabel}
                      placeholder="Private reminder for this student"
                      onChange={(event) => setFlagLabel(event.target.value)}
                    />
                  </label>
                  <button
                    className="secondary-button"
                    disabled={busy || !flagLabel.trim()}
                    onClick={() => {
                      void act(
                        "/api/oaca/advisor/attention-flags",
                        { studentId: selectedStudent.id, label: flagLabel },
                        "Private attention flag saved for your view only.",
                      );
                      setFlagLabel("");
                    }}
                  >
                    Add private flag
                  </button>
                </div>
              </section>
              <section className="advisor-timeline">
                <h3>Shared advising timeline</h3>
                {allAppointments
                  .filter((item) => item.studentId === selectedStudent.id)
                  .sort((left, right) =>
                    (right.startsAt ? Date.parse(right.startsAt) : 0) -
                    (left.startsAt ? Date.parse(left.startsAt) : 0),
                  )
                  .map((item) => (
                    <button key={item.id} onClick={() => openSession(item.id)}>
                      <span>{dateTime(item.startsAt)}</span>
                      <strong>{item.serviceName}</strong>
                      {item.subject ? <span>{item.subject}</span> : null}
                      <small>
                        {statusLabel(item.status)} · {item.providerName}
                      </small>
                    </button>
                  ))}
                {!allAppointments.some(
                  (item) => item.studentId === selectedStudent.id,
                ) ? (
                  <p>
                    No Compass visits are recorded. Imported history appears
                    here with its source label.
                  </p>
                ) : null}
              </section>
            </article>
          ) : null}
        </div>
      </section>
    );

  if (view === "session")
    return (
      <section className="experience-panel advisor-detail-page">
        <BackButton onBack={() => setView("home")} />
        <div className="section-heading">
          <div>
            <p className="kicker">Single session workspace</p>
            <h1>Prepare, meet, and follow through</h1>
          </div>
          <label className="advisor-session-picker">
            <span>Session</span>
            <select
              value={selectedAppointment?.id || ""}
              onChange={(event) => setSelectedAppointmentId(event.target.value)}
            >
              <option value="">Choose a session</option>
              {workspaceAppointments.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.studentName} · {dateTime(item.startsAt)} ·{" "}
                  {statusLabel(item.status)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="form-message" aria-live="polite">
          {message}
        </p>
        {selectedAppointment ? (
          <div className="advisor-session-layout">
            <aside className="advisor-session-context">
              <span
                className={`status-chip status-chip--${selectedAppointment.status}`}
              >
                {statusLabel(selectedAppointment.status)}
              </span>
              <h2>{selectedAppointment.studentName}</h2>
              <p>
                {selectedAppointment.subject || selectedAppointment.serviceName}
              </p>
              <dl>
                <div>
                  <dt>When</dt>
                  <dd>{dateTime(selectedAppointment.startsAt)}</dd>
                </div>
                <div>
                  <dt>Format</dt>
                  <dd>{statusLabel(selectedAppointment.modality)}</dd>
                </div>
                <div>
                  <dt>Advisor</dt>
                  <dd>
                    {selectedAppointment.providerName ||
                      advisor.currentAdvisorName}
                  </dd>
                </div>
              </dl>
              <h3>Recent context</h3>
              <p>
                Preparation note and student-shared files appear here when
                supplied. Imported sessions retain their source label and never
                fabricate notes.
              </p>
              <button
                className="secondary-button"
                onClick={() => {
                  setSelectedStudentId(selectedAppointment.studentId || "");
                  setView("students");
                }}
              >
                Open student snapshot
              </button>
            </aside>
            <div className="advisor-session-editor">
              <label>
                <span>Protected advisor working note</span>
                <textarea
                  rows={8}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
                <small>
                  Readable by active Academic and Career Advisors. Never shown
                  to the student.
                </small>
              </label>
              <label>
                <span>Structured category</span>
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                >
                  <option value="academic_planning">Academic planning</option>
                  <option value="learning_strategy">Learning strategy</option>
                  <option value="career_exploration">Career exploration</option>
                  <option value="residency_planning">Residency planning</option>
                  <option value="referral">Referral</option>
                </select>
              </label>
              <label>
                <span>Student-facing recap and action plan</span>
                <textarea
                  rows={6}
                  value={recap}
                  onChange={(event) => setRecap(event.target.value)}
                />
                <small>
                  Saving the staff note does not publish this recap.
                </small>
              </label>
              <div className="workspace-actions">
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => saveRecord(false)}
                >
                  Save note revision
                </button>
                <button
                  className="primary-button"
                  disabled={busy || !recap.trim()}
                  onClick={() => saveRecord(true)}
                >
                  Publish recap
                </button>
              </div>
              <section className="advisor-addenda">
                <h3>Attributed addenda</h3>
                {selectedAddenda.map((item) => (
                  <article key={item.id}>
                    <strong>{item.authorName}</strong>
                    <p>{item.body}</p>
                    <time>{dateTime(item.createdAt)}</time>
                  </article>
                ))}
                <label>
                  <span>Add an addendum</span>
                  <textarea
                    value={addendum}
                    onChange={(event) => setAddendum(event.target.value)}
                  />
                </label>
                <button
                  className="secondary-button"
                  disabled={busy || !addendum.trim()}
                  onClick={() => {
                    void act(
                      "/api/oaca/advisor/addenda",
                      { appointmentId: selectedAppointment.id, body: addendum },
                      "Addendum saved without changing the original note.",
                    );
                    setAddendum("");
                  }}
                >
                  Add attributed note
                </button>
              </section>
              <section className="advisor-inline-task">
                <h3>Action item</h3>
                <div className="form-row">
                  <label>
                    <span>Action</span>
                    <input
                      value={taskTitle}
                      onChange={(event) => setTaskTitle(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>Owner</span>
                    <select
                      value={taskOwner}
                      onChange={(event) =>
                        setTaskOwner(event.target.value as typeof taskOwner)
                      }
                    >
                      <option value="student">Student</option>
                      <option value="advisor">Advisor</option>
                    </select>
                  </label>
                  <label>
                    <span>Due</span>
                    <input
                      type="date"
                      value={taskDue}
                      onChange={(event) => setTaskDue(event.target.value)}
                    />
                  </label>
                </div>
                <button
                  className="secondary-button"
                  disabled={busy || !taskTitle.trim()}
                  onClick={() => {
                    void act(
                      "/api/oaca/advisor/tasks",
                      {
                        studentId: selectedAppointment.studentId,
                        appointmentId: selectedAppointment.id,
                        title: taskTitle,
                        assignedTo: taskOwner,
                        dueAt: taskDue || null,
                      },
                      "Action item added.",
                    );
                    setTaskTitle("");
                  }}
                >
                  Add action
                </button>
              </section>
              <label className="file-drop">
                <span>Attach a document to this encounter</span>
                <input
                  type="file"
                  accept=".pdf,.docx,.xlsx,.pptx,.jpg,.jpeg,.png"
                />
                <small>
                  Files enter private scanning before staff sharing or portfolio
                  publication.
                </small>
              </label>
            </div>
          </div>
        ) : (
          <div className="empty-state">
            <h2>Choose a session</h2>
            <p>
              Open an appointment or use Quick Encounter from the Appointments
              tile.
            </p>
          </div>
        )}
      </section>
    );

  if (view === "messages")
    return (
      <section className="experience-panel advisor-detail-page">
        <BackButton onBack={() => setView("home")} />
        <div className="section-heading">
          <div>
            <p className="kicker">Shared student conversations</p>
            <h1>Messages</h1>
          </div>
          <span className="status-chip status-chip--pending">
            {unreadMessages.length} unread
          </span>
        </div>
        <p className="form-message" aria-live="polite">
          {message}
        </p>
        <div className="advisor-two-column">
          <nav
            className="advisor-message-list"
            aria-label="Student conversations"
          >
            {advisor.students.map((student) => (
              <button
                key={student.id}
                className={selectedStudent?.id === student.id ? "active" : ""}
                onClick={() => setSelectedStudentId(student.id)}
              >
                <strong>{student.displayName}</strong>
                <small>
                  {advisor.messages.filter(
                    (item) => item.studentId === student.id && item.unread,
                  ).length || "No"}{" "}
                  unread
                </small>
              </button>
            ))}
          </nav>
          <section className="advisor-conversation">
            <div>
              <p className="kicker">Continuous advising conversation</p>
              <h2>{selectedStudent?.displayName || "Choose a student"}</h2>
              <small>
                New general messages route first to the permanent Academic
                Advisor and may be reassigned.
              </small>
            </div>
            {advisor.messages
              .filter((item) => item.studentId === selectedStudent?.id)
              .map((item) => (
                <article key={item.id}>
                  <span>{item.senderName}</span>
                  <p>{item.body}</p>
                  <time>{dateTime(item.createdAt)}</time>
                </article>
              ))}
            <label>
              <span>Reply in Compass</span>
              <textarea
                value={messageBody}
                onChange={(event) => setMessageBody(event.target.value)}
              />
            </label>
            <button
              className="primary-button"
              disabled={busy || !selectedStudent || !messageBody.trim()}
              onClick={() => {
                void act(
                  "/api/oaca/advisor/messages",
                  { studentId: selectedStudent?.id, body: messageBody },
                  "Message recorded in the shared conversation.",
                );
                setMessageBody("");
              }}
            >
              Send reply
            </button>
          </section>
        </div>
      </section>
    );

  if (view === "tasks")
    return (
      <section className="experience-panel advisor-detail-page">
        <BackButton onBack={() => setView("home")} />
        <div className="section-heading">
          <div>
            <p className="kicker">Shared action tracker</p>
            <h1>Tasks and follow-through</h1>
          </div>
          <span className="status-chip status-chip--pending">
            {openTasks.length} open
          </span>
        </div>
        <p className="form-message" aria-live="polite">
          {message}
        </p>
        <div className="advisor-stack">
          {advisor.tasks.map((task) => (
            <article className="advisor-list-card" key={task.id}>
              <div>
                <span
                  className={`status-chip status-chip--${task.status === "completed" ? "confirmed" : "pending"}`}
                >
                  {task.status}
                </span>
                <h3>{task.title}</h3>
                <p>
                  {task.studentName} · Assigned to {task.assignedTo}
                </p>
                <small>
                  {task.dueAt
                    ? `Due ${new Date(`${task.dueAt}T12:00:00`).toLocaleDateString()}`
                    : "No due date"}
                </small>
              </div>
              <button
                className="secondary-button"
                disabled={busy || task.status === "completed"}
                onClick={() =>
                  void act(
                    "/api/oaca/advisor/tasks/action",
                    { taskId: task.id, action: "complete" },
                    "Task completed.",
                  )
                }
              >
                {task.status === "completed" ? "Completed" : "Mark complete"}
              </button>
            </article>
          ))}
          {!advisor.tasks.length ? (
            <div className="empty-state">
              <h2>No action items</h2>
              <p>Create a student or advisor task from a session.</p>
            </div>
          ) : null}
        </div>
      </section>
    );

  if (view === "milestones")
    return (
      <section className="experience-panel advisor-detail-page">
        <BackButton onBack={() => setView("home")} />
        <div className="section-heading">
          <div>
            <p className="kicker">Academic advising requirements</p>
            <h1>Milestones and linked steps</h1>
          </div>
          <span className="status-chip">Advisor may link and complete</span>
        </div>
        <p className="policy-intro">
          Requirements are created manually by an authorized administrator. A
          single requirement can contain separate Director and Academic Advisor
          steps.
        </p>
        <p className="form-message" aria-live="polite">
          {message}
        </p>
        <div className="advisor-stack">
          {allObligations
            .filter((item) => item.serviceKey === "academic_advising")
            .map((item) => (
              <article className="advisor-list-card" key={item.id}>
                <div>
                  <span
                    className={`status-chip status-chip--${item.status === "completed" ? "confirmed" : "pending"}`}
                  >
                    {item.status}
                  </span>
                  <h3>{item.title}</h3>
                  <p>{item.studentName}</p>
                  <small>
                    {item.dueAt
                      ? `Due ${new Date(item.dueAt).toLocaleDateString()}`
                      : "Timing follows policy"}
                  </small>
                </div>
                <div className="advisor-card-actions">
                  <button
                    className="secondary-button"
                    disabled={busy || item.status === "completed"}
                    onClick={() =>
                      void act(
                        "/api/oaca/advisor/milestone-steps",
                        {
                          obligationId: item.id,
                          action: "complete_advisor_step",
                        },
                        "Advisor step completed.",
                      )
                    }
                  >
                    Complete my step
                  </button>
                </div>
              </article>
            ))}
          {!allObligations.some(
            (item) => item.serviceKey === "academic_advising",
          ) ? (
            <div className="empty-state">
              <h2>No requirements in this view</h2>
              <p>Administrator-assigned requirements will appear here.</p>
            </div>
          ) : null}
        </div>
      </section>
    );

  if (view === "plans")
    return (
      <section className="experience-panel advisor-detail-page">
        <BackButton onBack={() => setView("home")} />
        <div className="section-heading">
          <div>
            <p className="kicker">Academic planning</p>
            <h1>Study plans and learning guides</h1>
          </div>
          <button
            className="secondary-button"
            onClick={() => setView("templates")}
          >
            Open template library
          </button>
        </div>
        <p className="form-message" aria-live="polite">
          {message}
        </p>
        <form
          className="experience-form advisor-plan-editor"
          onSubmit={(event) => {
            event.preventDefault();
            void act(
              "/api/oaca/advisor/plans",
              {
                studentId: selectedStudent?.id,
                title: planTitle,
                content: planBody,
              },
              "New plan version saved.",
            );
          }}
        >
          <label>
            <span>Student</span>
            <select
              required
              value={selectedStudentId}
              onChange={(event) => setSelectedStudentId(event.target.value)}
            >
              <option value="">Choose a student</option>
              {advisor.students.map((student) => (
                <option value={student.id} key={student.id}>
                  {student.displayName}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Plan title</span>
            <input
              required
              value={planTitle}
              onChange={(event) => setPlanTitle(event.target.value)}
              placeholder="Weekly learning plan"
            />
          </label>
          <label>
            <span>Plan</span>
            <textarea
              required
              rows={12}
              value={planBody}
              onChange={(event) => setPlanBody(event.target.value)}
              placeholder="Goals, study blocks, learning strategies, check-in date, and student commitments"
            />
          </label>
          <small>
            Each save creates a version. Assigned student copies remain separate
            from the staff template library.
          </small>
          <button className="primary-button" disabled={busy}>
            Save plan version
          </button>
        </form>
      </section>
    );

  if (view === "roadmap")
    return (
      <section className="experience-panel advisor-detail-page">
        <BackButton onBack={() => setView("home")} />
        <div className="section-heading">
          <div>
            <p className="kicker">Career advising</p>
            <h1>Four-year Career roadmap</h1>
          </div>
          <label className="advisor-session-picker">
            <span>Student</span>
            <select
              value={selectedStudentId}
              onChange={(event) => setSelectedStudentId(event.target.value)}
            >
              <option value="">Choose a student</option>
              {advisor.students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.displayName}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="form-message" aria-live="polite">
          {message}
        </p>
        <div className="career-roadmap-grid">
          {([1, 2, 3, 4] as const).map((year) => (
            <section key={year}>
              <header>
                <span>Year</span>
                <strong>{year}</strong>
              </header>
              {careerRoadmap
                .filter((item) => item.year === year)
                .map((item) => {
                  const completed = advisor.roadmapCompletions.some(
                    (entry) =>
                      entry.studentId === selectedStudent?.id &&
                      entry.itemKey === item.key,
                  );
                  const controlId = `roadmap-${selectedStudent?.id || "student"}-${item.key}`;
                  return (
                    <div
                      key={item.key}
                      className={completed ? "complete" : ""}
                    >
                      <input
                        id={controlId}
                        type="checkbox"
                        checked={completed}
                        disabled={busy || !selectedStudent}
                        onChange={() =>
                          void act(
                            "/api/oaca/advisor/career-roadmap",
                            {
                              studentId: selectedStudent?.id,
                              itemKey: item.key,
                              completed: !completed,
                            },
                            completed
                              ? "Roadmap item reopened."
                              : "Roadmap item completed.",
                          )
                        }
                      />
                      <label htmlFor={controlId}>
                        <strong>{item.title}</strong>
                        <small>{item.kind.replaceAll("_", " ")}</small>
                      </label>
                    </div>
                  );
                })}
            </section>
          ))}
        </div>
      </section>
    );

  if (view === "reports")
    return (
      <section className="experience-panel advisor-detail-page">
        <BackButton onBack={() => setView("home")} />
        <div className="section-heading">
          <div>
            <p className="kicker">Permission-scoped reporting</p>
            <h1>
              {workspace === "academic"
                ? "Academic caseload"
                : "Career service"}{" "}
              insights
            </h1>
          </div>
          <span className="status-chip">
            Cells under {advisor.minimumGroupSize} suppressed
          </span>
        </div>
        <p className="form-message" aria-live="polite">
          {message}
        </p>
        <div className="advisor-report-metrics">
          <article>
            <strong>{workspaceAppointments.length}</strong>
            <span>appointments in scope</span>
          </article>
          <article>
            <strong>
              {
                workspaceAppointments.filter(
                  (item) => item.status === "completed",
                ).length
              }
            </strong>
            <span>completed visits</span>
          </article>
          <article>
            <strong>
              {
                workspaceAppointments.filter(
                  (item) => item.status === "no_show",
                ).length
              }
            </strong>
            <span>no-shows</span>
          </article>
          <article>
            <strong>{openTasks.length}</strong>
            <span>open actions</span>
          </article>
        </div>
        <div className="advisor-two-column">
          <form
            className="experience-form advisor-compact-form"
            onSubmit={(event) => {
              event.preventDefault();
              void act(
                "/api/oaca/advisor/reports",
                {
                  workspace,
                  name: reportName,
                  filters: { cohort: "all", status: "all" },
                },
                "Saved report created.",
              );
              setReportName("");
            }}
          >
            <h2>Build a scoped report</h2>
            <label>
              <span>Report name</span>
              <input
                required
                value={reportName}
                onChange={(event) => setReportName(event.target.value)}
              />
            </label>
            <div className="form-row">
              <label>
                <span>Cohort</span>
                <select>
                  <option>All permitted cohorts</option>
                </select>
              </label>
              <label>
                <span>Visit status</span>
                <select>
                  <option>All statuses</option>
                  <option>Completed</option>
                  <option>No-show</option>
                </select>
              </label>
            </div>
            <label className="check-row">
              <input type="checkbox" defaultChecked />
              <span>Include appointment demand and completion</span>
            </label>
            <label className="check-row">
              <input type="checkbox" defaultChecked />
              <span>Include reason and modality trends</span>
            </label>
            <div className="workspace-actions">
              <button className="secondary-button" disabled={busy}>
                Save report
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={busy}
                onClick={() =>
                  void act(
                    "/api/oaca/advisor/reports/export",
                    { workspace, format: "xlsx" },
                    "Secure XLSX export prepared and audited.",
                  )
                }
              >
                Prepare XLSX
              </button>
            </div>
          </form>
          <section className="advisor-saved-reports">
            <h2>Saved reports</h2>
            {advisor.savedReports.map((report) => (
              <article key={report.id}>
                <strong>{report.name}</strong>
                <span>
                  {report.workspace} ·{" "}
                  {new Date(report.createdAt).toLocaleDateString()}
                </span>
              </article>
            ))}
            {!advisor.savedReports.length ? <p>No saved reports yet.</p> : null}
          </section>
        </div>
        {elevated ? (
          <div className="workspace-actions advisor-admin-shortcuts">
            <button
              className="secondary-button"
              onClick={() => onOpenLegacy("analytics")}
            >
              Open service analytics
            </button>
            <button
              className="secondary-button"
              onClick={() => onOpenLegacy("imports")}
            >
              Secure data imports
            </button>
          </div>
        ) : null}
      </section>
    );

  if (view === "availability")
    return (
      <section className="experience-panel advisor-detail-page">
        <BackButton onBack={() => setView("home")} />
        <div className="section-heading">
          <div>
            <p className="kicker">Scheduling controls</p>
            <h1>Availability and appointment settings</h1>
          </div>
          <span className="status-chip">Compass-managed availability</span>
        </div>
        <p className="form-message" aria-live="polite">
          {message}
        </p>
        <div className="advisor-availability-layout">
          <section className="advisor-availability-list" aria-label="Saved availability blocks">
            <div className="advisor-availability-summary">
              <div><span>Default appointment</span><strong>{availabilitySettings.defaultDurationMinutes} minutes</strong></div>
              <div><span>Active blocks</span><strong>{availabilitySettings.blocks.length}</strong></div>
            </div>
            <h2>Current time blocks</h2>
            {availabilitySettings.blocks.map((block) => (
              <article className="advisor-availability-block" key={block.id}>
                <div className="advisor-availability-block__time">
                  <span>{availabilityDaysLabel(block)}</span>
                  <strong>{block.startsAt}–{block.endsAt}</strong>
                </div>
                <div className="advisor-availability-block__details">
                  <span>{block.durationMinutes}-minute appointments</span>
                  <span>{block.bufferMinutes ? `${block.bufferMinutes}-minute buffer` : "No buffer"}</span>
                  <span>{block.modalities.map((item) => statusLabel(item === "in_person" ? "in person" : item)).join(" · ")}</span>
                  {block.location ? <span>{block.location}</span> : null}
                </div>
                <button
                  type="button"
                  className="text-button"
                  disabled={busy}
                  onClick={() =>
                    void saveAvailability(
                      {
                        ...availabilitySettings,
                        blocks: availabilitySettings.blocks.filter((item) => item.id !== block.id),
                      },
                      "Availability block removed.",
                    )
                  }
                >
                  Remove
                </button>
              </article>
            ))}
            {availabilitySettings.exceptions.map((item) => (
              <article className="advisor-availability-block" key={item.id}>
                <div className="advisor-availability-block__time">
                  <span>{item.kind === "add" ? "One day" : "Unavailable"}</span>
                  <strong>{new Date(`${item.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} · {item.startsAt}–{item.endsAt}</strong>
                </div>
                <div className="advisor-availability-block__details">
                  <span>{item.durationMinutes}-minute appointments</span>
                  <span>{item.modalities.map((format) => statusLabel(format)).join(" · ")}</span>
                  {item.location ? <span>{item.location}</span> : null}
                </div>
                <button type="button" className="text-button" disabled={busy} onClick={() => void saveAvailability({ ...availabilitySettings, exceptions: availabilitySettings.exceptions.filter((exception) => exception.id !== item.id) }, "One-day availability removed.")}>Remove</button>
              </article>
            ))}
            {!availabilitySettings.blocks.length ? (
              <div className="empty-state">
                <h3>No availability blocks</h3>
                <p>Add a block to offer appointment times to students.</p>
              </div>
            ) : null}
          </section>
          <form className="experience-form advisor-availability" onSubmit={addAvailabilityBlock}>
            <h2>Add an availability block</h2>
            <fieldset>
              <legend>Recurring days</legend>
              <div className="channel-options">
                {advisorWeekdays.map(([value, label, short]) => (
                  <label key={value} title={label}>
                    <input
                      type="checkbox"
                      checked={availabilityDays.includes(value)}
                      onChange={() =>
                        setAvailabilityDays((current) =>
                          current.includes(value)
                            ? current.filter((day) => day !== value)
                            : [...current, value].sort(),
                        )
                      }
                    />
                    <span>{short}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="form-row">
              <label>
                <span>Start</span>
                <input required type="time" value={availabilityStart} onChange={(event) => setAvailabilityStart(event.target.value)} />
              </label>
              <label>
                <span>End</span>
                <input required type="time" value={availabilityEnd} onChange={(event) => setAvailabilityEnd(event.target.value)} />
              </label>
            </div>
            <div className="form-row">
              <label>
                <span>Appointment length</span>
                <select value={availabilityDuration} onChange={(event) => setAvailabilityDuration(event.target.value)}>
                  {appointmentDurationOptions.map((minutes) => <option key={minutes} value={minutes}>{minutes === 30 ? "30 minutes · default" : `${minutes} minutes`}</option>)}
                </select>
              </label>
              <label>
                <span>Buffer</span>
                <select value={availabilityBuffer} onChange={(event) => setAvailabilityBuffer(event.target.value)}>
                  <option value="0">No buffer</option>
                  <option value="5">5 minutes</option>
                  <option value="10">10 minutes</option>
                  <option value="15">15 minutes</option>
                  <option value="30">30 minutes</option>
                </select>
              </label>
            </div>
            <fieldset>
              <legend>Formats offered</legend>
              <div className="channel-options">
                {[["in_person", "In person"], ["teams", "Teams"], ["zoom", "Zoom"], ["phone", "Phone"]].map(([value, label]) => (
                  <label key={value}>
                    <input
                      type="checkbox"
                      checked={availabilityModalities.includes(value)}
                      onChange={() =>
                        setAvailabilityModalities((current) =>
                          current.includes(value)
                            ? current.filter((item) => item !== value)
                            : [...current, value],
                        )
                      }
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label>
              <span>In-person location</span>
              <input value={availabilityLocation} onChange={(event) => setAvailabilityLocation(event.target.value)} placeholder="Office or room" />
            </label>
            <small>
              Students see only the blocks that match their service, format, and assigned advisor. These times are managed in Compass without Outlook linkage.
            </small>
            <button className="primary-button" disabled={busy}>Add time block</button>
          </form>
        </div>
      </section>
    );

  if (view === "templates")
    return (
      <section className="experience-panel advisor-detail-page">
        <BackButton onBack={() => setView("home")} />
        <div className="section-heading">
          <div>
            <p className="kicker">Staff and administrator library</p>
            <h1>Reusable advising templates</h1>
          </div>
          <span className="status-chip">Versioned and attributed</span>
        </div>
        <div className="advisor-two-column advisor-template-library">
          <section className="advisor-stack staff-section-panel">
            <div className="staff-section-heading">
              <div>
                <p className="kicker">Template library</p>
                <h2>Available templates</h2>
              </div>
              <span>{advisor.templates.length} available</span>
            </div>
            {advisor.templates.map((template) => (
              <article className="advisor-list-card" key={template.id}>
                <div>
                  <span className="status-chip">
                    {template.kind.replaceAll("_", " ")}
                  </span>
                  <h3>{template.name}</h3>
                  <small>
                    Version {template.version} · {template.authorName}
                  </small>
                </div>
                <button className="secondary-button">Use template</button>
              </article>
            ))}
          </section>
          <form
            className="experience-form advisor-compact-form staff-section-panel staff-form-panel"
            onSubmit={(event) => {
              event.preventDefault();
              void act(
                "/api/oaca/advisor/templates",
                { name: planTitle, kind: "study_plan", content: planBody },
                "Template published to the staff library.",
              );
            }}
          >
            <div className="staff-section-heading">
              <div>
                <p className="kicker">New library item</p>
                <h2>Create a template</h2>
              </div>
            </div>
            <label>
              <span>Name</span>
              <input
                required
                value={planTitle}
                onChange={(event) => setPlanTitle(event.target.value)}
              />
            </label>
            <label>
              <span>Template content</span>
              <textarea
                required
                value={planBody}
                onChange={(event) => setPlanBody(event.target.value)}
              />
            </label>
            <button className="primary-button" disabled={busy}>
              Publish new version
            </button>
          </form>
        </div>
      </section>
    );

  return (
    <section className="experience-panel advisor-workspace-home">
      <div className="advisor-workspace-hero">
        <div>
          <p className="kicker">Compass {workspace} advisor workspace</p>
          <h1>Today’s advising work</h1>
          <p>
            Move from request to meeting to follow-through without losing the
            student’s story.
          </p>
        </div>
        <div className="advisor-workspace-selector">
          <label>
            <span>Advisor workspace</span>
            <select
              value={workspace}
              onChange={(event) =>
                chooseWorkspace(event.target.value as AdvisorWorkspaceKey)
              }
            >
              {advisor.allowedWorkspaces.map((item) => (
                <option key={item} value={item}>
                  {item === "academic" ? "Academic Advisor" : "Career Advisor"}
                </option>
              ))}
            </select>
          </label>
          <small>{advisor.currentAdvisorName}</small>
        </div>
      </div>
      <section className="provider-home-availability" data-tutorial-id="advisor-home-availability">
        <div className="provider-home-availability__heading">
          <div>
            <p className="kicker">Appointment availability</p>
            <h2>Set the times students can book</h2>
            <p>Add one day when your schedule changes, or build a weekly pattern.</p>
          </div>
          <button className="text-button" type="button" onClick={() => setView("availability")}>Manage all blocks</button>
        </div>
        <div className="provider-home-availability__layout">
          <div className="provider-home-availability__schedule" aria-label="Current availability">
            <div className="provider-home-availability__summary">
              <span><strong>{availabilitySettings.blocks.length + availabilitySettings.exceptions.filter((item) => item.kind === "add").length}</strong> active blocks</span>
              <span><strong>{availabilitySettings.defaultDurationMinutes} min</strong> default</span>
            </div>
            {availabilitySettings.exceptions.filter((item) => item.kind === "add").slice(0, 2).map((item) => (
              <article key={item.id}>
                <time>{new Date(`${item.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</time>
                <strong>{item.startsAt}–{item.endsAt}</strong>
                <small>One day · {item.durationMinutes}-minute visits</small>
              </article>
            ))}
            {availabilitySettings.blocks.slice(0, 3).map((block) => (
              <article key={block.id}>
                <time>{availabilityDaysLabel(block)}</time>
                <strong>{block.startsAt}–{block.endsAt}</strong>
                <small>Repeats weekly · {block.durationMinutes}-minute visits</small>
              </article>
            ))}
          </div>
          <form className="provider-home-availability__form" onSubmit={addHomeAvailability}>
            <div className="provider-availability-mode" role="group" aria-label="Availability frequency">
              <button type="button" className={availabilityMode === "date" ? "active" : ""} aria-pressed={availabilityMode === "date"} onClick={() => setAvailabilityMode("date")}>One day</button>
              <button type="button" className={availabilityMode === "recurring" ? "active" : ""} aria-pressed={availabilityMode === "recurring"} onClick={() => setAvailabilityMode("recurring")}>Repeats weekly</button>
            </div>
            {availabilityMode === "date" ? (
              <label><span>Date</span><input required min={localInputDate()} type="date" value={availabilityDate} onChange={(event) => setAvailabilityDate(event.target.value)} /></label>
            ) : (
              <fieldset>
                <legend>Days</legend>
                <div className="provider-day-options">
                  {advisorWeekdays.map(([value, label, short]) => (
                    <label key={value} title={label}><input type="checkbox" checked={availabilityDays.includes(value)} onChange={() => setAvailabilityDays((current) => current.includes(value) ? current.filter((day) => day !== value) : [...current, value].sort())} /><span>{short}</span></label>
                  ))}
                </div>
              </fieldset>
            )}
            <div className="form-row">
              <label><span>Start</span><input required type="time" value={availabilityStart} onChange={(event) => setAvailabilityStart(event.target.value)} /></label>
              <label><span>End</span><input required type="time" value={availabilityEnd} onChange={(event) => setAvailabilityEnd(event.target.value)} /></label>
            </div>
            <div className="form-row">
              <label><span>Visit length</span><select value={availabilityDuration} onChange={(event) => setAvailabilityDuration(event.target.value)}>{appointmentDurationOptions.map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}</select></label>
              <label><span>Format</span><select value={availabilityModalities[0] || "in_person"} onChange={(event) => setAvailabilityModalities([event.target.value])}><option value="in_person">In person</option><option value="teams">Teams</option><option value="zoom">Zoom</option><option value="phone">Phone</option></select></label>
            </div>
            <button className="primary-button" disabled={busy}>{availabilityMode === "date" ? "Add this day" : "Add weekly block"}</button>
          </form>
        </div>
        {message ? <p className="form-message" aria-live="polite">{message}</p> : null}
      </section>
      <section className="advisor-home-review-queue" data-tutorial-id="advisor-home-review-queue">
        <div className="section-heading">
          <div><p className="kicker">Students awaiting action</p><h2>Approvals and cancellations</h2></div>
          <button className="text-button" type="button" onClick={() => setView("appointments")}>View all appointments</button>
        </div>
        <div className="advisor-home-review-queue__list">
          {approvalAndCancellationQueue.slice(0, 4).map((appointment) => (
            <button key={appointment.id} type="button" onClick={() => { setSelectedAppointmentId(appointment.id); setView("appointments"); }}>
              <span><strong>{appointment.studentName || "Student"}</strong><small>{appointment.subject || appointment.serviceName}</small></span>
              <time>{dateTime(appointment.startsAt)}</time>
              <i className={`status-chip status-chip--${appointment.status}`}>{appointment.status === "cancelled" ? "Cancelled" : "Needs approval"}</i>
            </button>
          ))}
          {!approvalAndCancellationQueue.length ? <p>No appointment approvals or recent cancellations need review.</p> : null}
        </div>
      </section>
      <section className="advisor-home-options" aria-labelledby="advisor-options-title" data-tutorial-id="advisor-home-options">
        <div><p className="kicker">Advisor tools</p><h2 id="advisor-options-title">What would you like to do?</h2></div>
        <label><span>Advisor options</span><select value="" onChange={(event) => tiles.find((tile) => tile.key === event.target.value)?.action()}><option value="" disabled>Choose an option</option>{tiles.map((tile) => <option key={tile.key} value={tile.key}>{tile.title}</option>)}</select></label>
      </section>
      <div className="provider-home-work-grid">
        <section className="provider-home-task-list" data-tutorial-id="advisor-home-tasks">
          <div className="section-heading">
            <div><p className="kicker">Tasks</p><h2>Follow-through</h2></div>
            <button className="text-button" onClick={() => setView("tasks")}>All tasks</button>
          </div>
          {openTasks.slice(0, 3).map((task) => (
            <button key={task.id} onClick={() => setView("tasks")}>
              <span><strong>{task.title}</strong><small>{task.studentName}</small></span>
              <time>{task.dueAt ? new Date(task.dueAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "No due date"}</time>
            </button>
          ))}
          {!openTasks.length ? <p>Nothing is waiting for follow-through.</p> : null}
        </section>
        <section className="advisor-today-list" data-tutorial-id="advisor-home-agenda">
          <div className="section-heading">
            <div>
              <p className="kicker">Agenda</p>
              <h2>Next up</h2>
            </div>
            <button className="text-button" onClick={() => setView("calendar")}>
              Full calendar
            </button>
          </div>
          {agendaAppointments.map((appointment) => (
            <button
              key={appointment.id}
              onClick={() => openSession(appointment.id)}
            >
              <time>{dateTime(appointment.startsAt)}</time>
              <span>
                <strong>{appointment.studentName}</strong>
                <small>{appointment.subject || appointment.serviceName}</small>
              </span>
              <i className={`status-chip status-chip--${appointment.status}`}>
                {statusLabel(appointment.status)}
              </i>
            </button>
          ))}
          {!agendaAppointments.length ? (
            <p>No upcoming appointments are currently in your {workspace} scope.</p>
          ) : null}
        </section>
      </div>
      <div className="advisor-today-metrics">
        <article><strong>{todayAppointments.length}</strong><span>today</span></article>
        <article><strong>{pending.length}</strong><span>requests to review</span></article>
        <article><strong>{unreadMessages.length}</strong><span>unread messages</span></article>
        <article><strong>{openTasks.length}</strong><span>open actions</span></article>
      </div>
      <aside className="advisor-attention-panel advisor-attention-panel--row">
          <div>
            <p className="kicker">Needs attention</p>
            <h2>{attentionTotal(advisor.attention)} explainable items</h2>
          </div>
          {advisor.attention.map((reason) => (
            <button
              key={reason.key}
              onClick={() =>
                setView(
                  reason.key === "unread_message"
                    ? "messages"
                    : reason.key === "task_due"
                      ? "tasks"
                      : reason.key === "milestone_due"
                        ? "milestones"
                        : "appointments",
                )
              }
            >
              <strong>{reason.count}</strong>
              <span>{reason.label}</span>
            </button>
          ))}
          {!advisor.attention.length ? (
            <p>
              No shared attention conditions. Personal flags remain visible only
              to the advisor who created them.
            </p>
          ) : null}
      </aside>
      <div className="advisor-tile-grid">
        {tiles.map((tile) => (
          <button key={tile.key} onClick={tile.action} data-tutorial-id={`advisor-tile-${tile.key}`}>
            <span className="advisor-tile-icon">
              <AdvisorIcon name={tile.key} />
            </span>
            <strong>{tile.title}</strong>
            <small>{tile.description}</small>
          </button>
        ))}
      </div>
      {elevated ? (
        <section className="advisor-director-strip">
          <div>
            <p className="kicker">Director and administrator controls</p>
            <h2>Cross-service operations</h2>
            <p>
              Manual requirements, handoff approvals, service configuration,
              secure imports, and aggregate reporting.
            </p>
          </div>
          <div className="workspace-actions">
            <button
              className="secondary-button"
              onClick={() => onOpenLegacy("imports")}
            >
              Data imports
            </button>
            <button
              className="secondary-button"
              onClick={() => onOpenLegacy("settings")}
            >
              Service configuration
            </button>
            <button
              className="secondary-button"
              onClick={() => onOpenLegacy("policies")}
            >
              Policy library
            </button>
          </div>
        </section>
      ) : null}
    </section>
  );
}
