"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PlatformAccess } from "./platform-access";
import {
  oacaAdvisingMilestones,
  oacaPolicyDocuments,
  oacaServiceLines,
  oacaTutoringPolicy,
  validateUpload,
  type ExperienceMembership,
  type OacaAppointmentState,
} from "./platform-model";
import type { PilotApiClient } from "./api-client";
import type { AuthorizationContext } from "./types";
import { OacaAnalyticsPanel, OacaImportCenter, type OacaAggregateAnalytics, type OacaImportBatch } from "./oaca-import-center";
import {
  OacaEventsAndOutreach,
  OacaStudentEvents,
  type OacaAudienceOptions,
  type OacaCampaignSummary,
  type OacaCommunicationSummary,
  type OacaEventSummary,
  type OacaFormSummary,
  type OacaNudgeSummary,
} from "./oaca-engagement-center";

type Service = { id: string; key: string; name: string; providerRule: string; policyStatus: string; modalities: string[]; durationMinutes?: number; settings?: Record<string, unknown> };
type Provider = { id: string; displayName: string; classification: string; subjects: string[]; modalities: string[]; serviceKeys?: string[] };
type AssignedStudent = { id: string; displayName: string };
type Appointment = { id: string; studentId?: string; studentName?: string; serviceName: string; providerName: string | null; subject?: string | null; format?: string; startsAt: string | null; endsAt?: string | null; modality: string; status: OacaAppointmentState; sandbox: boolean; requestOrigin?: "student" | "advisor"; obligationId?: string | null; studentRecap?: string };
type PolicyDocument = { id: string; key: string; title: string; versionLabel: string; effectiveDate: string | null; lastUpdatedOn: string | null; audience: string; requiresAcknowledgment: boolean; status: string };
type PolicyRule = { id: string; key: string; serviceKey: string; audience: string; phase: string | null; year: number | null; triggerType: string; requiredProvider: string | null; dueRule: string | null; summary: string; config: Record<string, unknown> };
type Obligation = { id: string; studentId: string; studentName: string; ruleKey: string; title: string; serviceKey: string; requiredProvider: string | null; triggeredAt: string; dueAt: string | null; status: "open" | "scheduled" | "completed"; completedAppointmentId?: string | null };
type Acknowledgment = { id: string; policyDocumentId: string; kind: string; acknowledgedAt: string };
type TutorCompliance = { application_approved_at?: string | null; faculty_recommendation_at?: string | null; interview_completed_at?: string | null; workday_onboarding_at?: string | null; training_completed_at?: string | null; handbook_acknowledgment_id?: string | null; eligible_at?: string | null; suspended_at?: string | null; suspension_reason?: string | null };
type Bootstrap = {
  services: Service[]; providers: Provider[]; appointments: Appointment[]; assignedAdvisor: Provider | null; assignedStudents: AssignedStudent[]; currentProvider: Provider | null;
  policyDocuments: PolicyDocument[]; policyRules: PolicyRule[]; acknowledgments: Acknowledgment[]; obligations: Obligation[];
  restrictions: Array<{ id: string; serviceLineId: string; reason: string; startsAt: string; endsAt: string | null }>;
  tutorCompliance: TutorCompliance | null; liveScheduling: boolean; calendarConnected: boolean;
  canManageImports: boolean; canViewAnalytics: boolean; importBatches: OacaImportBatch[]; analytics: OacaAggregateAnalytics | null;
  canManageOutreach: boolean; canViewOutreachInsights: boolean; events: OacaEventSummary[]; campaigns: OacaCampaignSummary[];
  nudges: OacaNudgeSummary[]; communications: OacaCommunicationSummary[]; forms: OacaFormSummary[]; audienceOptions: OacaAudienceOptions;
  eventNotificationUnreadCount: number;
};
type OacaView = "home" | "schedule" | "appointments" | "requirements" | "policies" | "portfolio" | "records" | "analytics" | "imports" | "settings" | "schedule_student" | "tutor" | "events" | "notifications" | "checkin" | "outreach";

type CreatorActivity = { totalMs: number; locations: Record<string, number>; firstSeenAt: string; lastSeenAt: string };
const creatorActivityKey = "navigate.creator.compass-time.v1";
const oacaRoleLabels: Record<string, string> = { creator: "Creator", administrator: "Administrator", staff: "Staff", faculty: "Faculty", student: "Student" };
const oacaViewLabels: Record<OacaView, string> = { home: "Home", schedule: "Request appointment", appointments: "My visits", requirements: "Requirements", policies: "Policies", portfolio: "Portfolio", records: "Visit records", analytics: "Analytics", imports: "Data imports", settings: "Service configuration", schedule_student: "Schedule for student", tutor: "Tutor desk", events: "Events", notifications: "Notifications", checkin: "Check-in", outreach: "Events and outreach" };

function readCreatorActivity(): CreatorActivity {
  const empty = { totalMs: 0, locations: {}, firstSeenAt: new Date().toISOString(), lastSeenAt: new Date().toISOString() };
  if (typeof window === "undefined") return empty;
  try { return { ...empty, ...JSON.parse(window.localStorage.getItem(creatorActivityKey) || "{}") } as CreatorActivity; }
  catch { return empty; }
}

function formatTrackedTime(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1000);
  if (seconds < 60) return `${seconds} sec`;
  const hours = Math.floor(seconds / 3600); const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours} hr ${minutes} min` : `${minutes} min`;
}

function useCreatorTimeTracking(enabled: boolean, location: string) {
  useEffect(() => {
    if (!enabled) return;
    let lastTick = Date.now();
    const record = () => {
      const now = Date.now();
      const elapsed = document.visibilityState === "visible" ? Math.min(now - lastTick, 15_000) : 0;
      lastTick = now;
      if (elapsed < 500) return;
      const current = readCreatorActivity();
      const next = { ...current, totalMs: current.totalMs + elapsed, locations: { ...current.locations, [location]: (current.locations[location] || 0) + elapsed }, lastSeenAt: new Date(now).toISOString() };
      window.localStorage.setItem(creatorActivityKey, JSON.stringify(next));
      window.dispatchEvent(new Event("navigate-creator-time"));
    };
    const interval = window.setInterval(record, 5_000);
    const visibility = () => { record(); lastTick = Date.now(); };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", record);
    return () => { record(); window.clearInterval(interval); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("pagehide", record); };
  }, [enabled, location]);
}

function CreatorTimePanel() {
  const [activity, setActivity] = useState<CreatorActivity>(() => readCreatorActivity());
  useEffect(() => {
    const refresh = () => setActivity(readCreatorActivity());
    const interval = window.setInterval(refresh, 5_000);
    window.addEventListener("navigate-creator-time", refresh);
    window.addEventListener("storage", refresh);
    return () => { window.clearInterval(interval); window.removeEventListener("navigate-creator-time", refresh); window.removeEventListener("storage", refresh); };
  }, []);
  const locations = Object.entries(activity.locations).sort((left, right) => right[1] - left[1]).slice(0, 6);
  const maximum = locations[0]?.[1] || 1;
  return <section className="creator-time-panel" aria-labelledby="creator-time-title">
    <div><p className="kicker">Creator pilot activity</p><h2 id="creator-time-title">Your time in Compass</h2><p>Counts active, visible time in this browser and separates it by the role and area you were exploring.</p></div>
    <div className="creator-time-total"><strong>{formatTrackedTime(activity.totalMs)}</strong><span>Total exploration time</span></div>
    <div className="creator-time-breakdown">{locations.map(([label, milliseconds]) => <div key={label}><span><strong>{label}</strong><small>{formatTrackedTime(milliseconds)}</small></span><i style={{ "--creator-time-width": `${Math.max(6, Math.round(milliseconds / maximum * 100))}%` } as React.CSSProperties} /></div>)}{!locations.length ? <p>Your activity breakdown will appear after a few seconds of exploration.</p> : null}</div>
    <small>Stored only on this device for the synthetic Creator pilot.</small>
  </section>;
}

const fallbackServices: Service[] = oacaServiceLines.map((service) => ({ id: "", key: service.key, name: service.name, providerRule: service.providerRule, policyStatus: "sandbox_approved", modalities: ["in_person", "phone", "teams"], durationMinutes: service.key === "peer_tutoring" ? 60 : 30 }));
const emptyBootstrap: Bootstrap = { services: [], providers: [], appointments: [], assignedAdvisor: null, assignedStudents: [], currentProvider: null, policyDocuments: [], policyRules: [], acknowledgments: [], obligations: [], restrictions: [], tutorCompliance: null, liveScheduling: false, calendarConnected: false, canManageImports: false, canViewAnalytics: false, importBatches: [], analytics: null, canManageOutreach: false, canViewOutreachInsights: false, events: [], campaigns: [], nudges: [], communications: [], forms: [], audienceOptions: { cohorts: [], phases: [], years: [], campuses: [] }, eventNotificationUnreadCount: 0 };

function CompassBrandMark() {
  return <svg viewBox="0 0 96 96" aria-hidden="true" focusable="false"><circle cx="48" cy="48" r="30" /><path d="M58 37 52 52 37 59l7-16 14-6Z" /><circle cx="48" cy="48" r="4" /><path className="compass-brand__detail" d="M48 12v8M48 76v8M12 48h8M76 48h8" /></svg>;
}

function ExperienceHeader({ context, onSignOut }: { context: AuthorizationContext; onSignOut: () => Promise<void> }) {
  return <header className="platform-header platform-header--oaca"><a className="rucom-brand" href="/app" aria-label="Navigate account hub"><img src="/assets/brand/rucom-logo-white.svg" alt="Roseman University College of Medicine" /></a><a className="compass-brand" href="/app/oaca" aria-label="Compass home"><span className="compass-brand__mark"><CompassBrandMark /></span><strong>Compass</strong></a><div className="platform-account"><span>{context.displayName}</span><button className="text-button" onClick={() => void onSignOut()}>Sign out</button></div></header>;
}

function CompassHeroIcon({ kind }: { kind: "appointment" | "notifications" | "events" | "checkin" | "visits" }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (kind === "appointment") return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="M12 5v14M5 12h14" /><circle cx="12" cy="12" r="9" /></svg>;
  if (kind === "notifications") return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="M6.7 10a5.3 5.3 0 0 1 10.6 0c0 5 2.2 5.2 2.2 6.6H4.5C4.5 15.2 6.7 15 6.7 10Z" /><path d="M9.8 19a2.5 2.5 0 0 0 4.4 0" /></svg>;
  if (kind === "events") return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><rect x="3.5" y="5.5" width="17" height="15" rx="2" /><path d="M8 3.5v4M16 3.5v4M3.5 10h17M8 14h3M14 14h2M8 17.5h3" /></svg>;
  if (kind === "checkin") return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v6h-6v-2M16 18h2" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></svg>;
}

function PolicyLibrary({ data, onBack }: { data: Bootstrap; onBack: () => void }) {
  const documents = data.policyDocuments.length ? data.policyDocuments : oacaPolicyDocuments.map((document) => ({ ...document, id: document.key, status: "approved_source" }));
  return <section className="experience-panel"><button className="workspace-back text-button" onClick={onBack}>← OACA home</button><p className="kicker">Policy library</p><h1>What Compass uses to guide support</h1><p className="policy-intro">Policies create reminders and scheduling rules. They never prevent students from requesting additional academic or career support.</p><div className="policy-document-grid">{documents.map((document) => {
    const acknowledged = data.acknowledgments.some((item) => item.policyDocumentId === document.id);
    return <article className="policy-document" key={document.key}><span className="status-chip status-chip--confirmed">Policy mapped</span><h2>{document.title}</h2><dl><div><dt>Version</dt><dd>{document.versionLabel}</dd></div>{document.effectiveDate ? <div><dt>Effective</dt><dd>{new Date(`${document.effectiveDate}T12:00:00`).toLocaleDateString()}</dd></div> : null}<div><dt>Audience</dt><dd>{document.audience.replaceAll("_", " ")}</dd></div></dl>{document.requiresAcknowledgment ? <p className={acknowledged ? "policy-check policy-check--complete" : "policy-check"}>{acknowledged ? "Acknowledged for this version" : "Acknowledgment required for the applicable role"}</p> : null}</article>;
  })}</div><div className="policy-rule-card"><h2>Peer tutoring limits</h2><div className="policy-stat-grid"><div><strong>{oacaTutoringPolicy.studentWeeklyMinutes / 60} hours</strong><span>per student each week</span></div><div><strong>{oacaTutoringPolicy.examBlockMinutes / 60} hours</strong><span>per course between exams</span></div><div><strong>{oacaTutoringPolicy.bookingHorizonDays} days</strong><span>maximum advance booking</span></div><div><strong>{oacaTutoringPolicy.cancellationNoticeHours} hours</strong><span>cancellation notice</span></div></div><p>After two no-shows, scheduling is temporarily restricted until the Tutoring Manager reviews the account. Workday remains the official payroll time record for tutors.</p></div></section>;
}

function RequirementsPanel({ data, setView, chooseRequirement }: { data: Bootstrap; setView: (view: OacaView) => void; chooseRequirement: (obligation: Obligation) => void }) {
  return <section className="experience-panel"><button className="workspace-back text-button" onClick={() => setView("home")}>← OACA home</button><div className="section-heading"><div><p className="kicker">My advising roadmap</p><h1>Required milestones, without barriers.</h1></div><button className="primary-button" onClick={() => setView("schedule")}>Request any appointment</button></div><p className="policy-intro">A milestone identifies a required check-in; it does not limit when or why you can meet with OACA.</p><div className="requirement-list">{data.obligations.map((obligation) => <article key={obligation.id} className={`requirement-item requirement-item--${obligation.status}`}><div><span className={`status-chip status-chip--${obligation.status === "completed" ? "confirmed" : "pending"}`}>{obligation.status}</span><h2>{obligation.title}</h2><p>{obligation.dueAt ? `Due ${new Date(obligation.dueAt).toLocaleDateString()}` : "Timing follows the applicable advising policy"}</p></div>{obligation.status !== "completed" ? <button className="secondary-button" onClick={() => chooseRequirement(obligation)}>Schedule or add a visit</button> : null}</article>)}{!data.obligations.length ? <div className="empty-state"><h2>No open requirements assigned</h2><p>Your policy-triggered check-ins will appear here. You can still request advising at any time.</p></div> : null}</div><div className="policy-roadmap"><h2>RUCOM advising milestones</h2>{(["foundations", "clerkship", "advanced"] as const).map((phase) => <details key={phase}><summary>{phase === "foundations" ? "Foundational Phase" : phase === "clerkship" ? "Clerkship Phase" : "Advanced Phase"}</summary><ul>{oacaAdvisingMilestones.filter((item) => item.phase === phase).map((item) => <li key={item.key}><strong>{item.title}</strong><span>{item.summary} {item.timing}.</span></li>)}</ul></details>)}</div></section>;
}

function TutorDesk({ api, context, data, reload, setView }: { api: PilotApiClient; context: AuthorizationContext; data: Bootstrap; reload: () => Promise<void>; setView: (view: OacaView) => void }) {
  const [typedName, setTypedName] = useState(context.displayName);
  const [appointmentId, setAppointmentId] = useState("");
  const [topics, setTopics] = useState("");
  const [summary, setSummary] = useState("");
  const [recommendations, setRecommendations] = useState("");
  const [attendanceCount, setAttendanceCount] = useState("1");
  const [workdayMinutes, setWorkdayMinutes] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const handbook = data.policyDocuments.find((item) => item.key === "peer_tutor_handbook_2026_2027");
  const acknowledged = Boolean(handbook && data.acknowledgments.some((item) => item.policyDocumentId === handbook.id && item.kind === "peer_tutor"));
  const tutorAppointments = data.appointments.filter((item) => item.serviceName.toLowerCase().includes("tutor") && ["confirmed", "completed"].includes(item.status));
  const compliance = data.tutorCompliance;
  const acknowledge = async () => {
    setBusy(true); setMessage("");
    try { await api.request("/api/oaca/policy-acknowledgments", { method: "POST", body: { policyKey: "peer_tutor_handbook_2026_2027", kind: "peer_tutor", typedName, userAgent: navigator.userAgent } }); setMessage("Handbook acknowledgment recorded for the current version."); await reload(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "The acknowledgment could not be recorded."); }
    finally { setBusy(false); }
  };
  const submitLog = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage("");
    try { await api.request("/api/oaca/tutor-session-logs", { method: "POST", body: { appointmentId, attendanceCount, topics, summary, recommendations, workdayMinutes, sessionType: "individual" } }); setMessage("Session log submitted. Confirm that the matching time is also correct in Workday."); setTopics(""); setSummary(""); setRecommendations(""); }
    catch (error) { setMessage(error instanceof Error ? error.message : "The session log could not be submitted."); }
    finally { setBusy(false); }
  };
  const checks = [
    ["Application approved", compliance?.application_approved_at], ["Faculty recommendation", compliance?.faculty_recommendation_at],
    ["Interview complete", compliance?.interview_completed_at], ["Workday onboarding", compliance?.workday_onboarding_at],
    ["Required training", compliance?.training_completed_at], ["Handbook acknowledged", acknowledged ? "complete" : null],
  ] as const;
  return <section className="experience-panel"><button className="workspace-back text-button" onClick={() => setView("home")}>← OACA home</button><p className="kicker">Peer tutor desk</p><h1>Prepare, tutor, document.</h1><div className="experience-grid experience-grid--compact"><article className="production-card"><h2>Eligibility checklist</h2><ul className="compliance-list">{checks.map(([label, value]) => <li key={label} className={value ? "complete" : "pending"}><span aria-hidden="true">{value ? "✓" : "○"}</span>{label}</li>)}</ul><p>{compliance?.eligible_at && !compliance.suspended_at ? "You are currently eligible to tutor." : "The Tutoring Manager must complete every onboarding item before live tutoring."}</p>{!acknowledged ? <div className="acknowledgment-box"><label><span>Type your full name</span><input value={typedName} onChange={(event) => setTypedName(event.target.value)} /></label><button className="secondary-button" disabled={busy || typedName.trim().length < 2} onClick={() => void acknowledge()}>Acknowledge handbook</button><small>This records an electronic acknowledgment, not an employment signature replacement unless OACA authorizes that use.</small></div> : null}</article><article className="production-card"><h2>Time limits</h2><p>Plan for 4–6 tutoring hours weekly. Do not exceed 8 tutoring hours in a week without prior written approval.</p><p>Review-session preparation is limited to 30 minutes per tutoring hour and 3 hours weekly unless approved in advance.</p></article></div><form className="experience-form tutor-log-form" onSubmit={submitLog}><h2>Submit a session log</h2><label><span>Session</span><select required value={appointmentId} onChange={(event) => setAppointmentId(event.target.value)}><option value="">Choose a tutoring appointment</option>{tutorAppointments.map((item) => <option key={item.id} value={item.id}>{item.studentName} · {item.subject || "Peer tutoring"} · {item.startsAt ? new Date(item.startsAt).toLocaleString() : "time pending"}</option>)}</select></label><div className="form-row"><label><span>Attendance</span><input type="number" min="0" max="8" required value={attendanceCount} onChange={(event) => setAttendanceCount(event.target.value)} /></label><label><span>Minutes recorded in Workday</span><input type="number" min="0" max="960" value={workdayMinutes} onChange={(event) => setWorkdayMinutes(event.target.value)} /></label></div><label><span>Topics and concepts</span><textarea required value={topics} onChange={(event) => setTopics(event.target.value)} /></label><label><span>Brief session summary</span><textarea required value={summary} onChange={(event) => setSummary(event.target.value)} /></label><label><span>Goals and recommendations</span><textarea value={recommendations} onChange={(event) => setRecommendations(event.target.value)} /></label><button className="primary-button" disabled={busy || !appointmentId}>{busy ? "Submitting…" : "Submit session log"}</button><p className="form-message" aria-live="polite">{message}</p></form></section>;
}

function OacaStudent({ api, supabase, context, data, view, setView, reload }: { api: PilotApiClient; supabase: SupabaseClient; context: AuthorizationContext; data: Bootstrap; view: OacaView; setView: (view: OacaView) => void; reload: () => Promise<void> }) {
  const [serviceKey, setServiceKey] = useState("academic_advising");
  const [topic, setTopic] = useState("");
  const [providerId, setProviderId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [modality, setModality] = useState("teams");
  const [format, setFormat] = useState("individual");
  const [examBlockKey, setExamBlockKey] = useState("");
  const [obligationId, setObligationId] = useState("");
  const [reasonForVisit, setReasonForVisit] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [academicVisitType, setAcademicVisitType] = useState<"assigned" | "drop_in">("assigned");
  const [academicBlockKey, setAcademicBlockKey] = useState("");
  const [typedName, setTypedName] = useState(context.displayName);
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [preparationNote, setPreparationNote] = useState("");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [dismissedRebooks, setDismissedRebooks] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [loadedAt] = useState(() => Date.now());
  const services = data.services.length ? data.services : fallbackServices;
  const selectedService = services.find((service) => service.key === serviceKey) || fallbackServices[0];
  const academicDropInProviders = data.providers.filter((provider) => provider.serviceKeys?.includes("academic_advising") && provider.id !== data.assignedAdvisor?.id && (provider.modalities.includes(modality) || !provider.modalities.length));
  const peerTutors = data.providers.filter((provider) => provider.classification === "peer_tutor" && (provider.modalities.includes(modality) || !provider.modalities.length));
  const studentAgreement = data.policyDocuments.find((item) => item.key === "peer_tutoring_student_agreement_2026_2027");
  const tutoringAcknowledged = Boolean(studentAgreement && data.acknowledgments.some((item) => item.policyDocumentId === studentAgreement.id && item.kind === "student_tutoring"));
  const openObligations = data.obligations.filter((item) => item.serviceKey === serviceKey && item.status !== "completed");
  const obligationReasonLabel = (item: Obligation) => serviceKey === "academic_advising" && /foundations?/i.test(item.title) ? "General advising" : item.title;
  const standardReasons = serviceKey === "academic_advising"
    ? [["academic_planning", "Academic planning"], ["learning_strategy", "Learning or study strategy"], ["required_follow_up", "Required follow-up"], ["drop_in_question", "Quick drop-in question"]]
    : serviceKey === "career_advising"
      ? [["career_planning", "Career planning"], ["specialty_exploration", "Specialty exploration"], ["residency_preparation", "Residency preparation"]]
      : [["course_content", "Course content"], ["study_strategy", "Study strategy"], ["exam_preparation", "Exam preparation"]];
  const chooseRequirement = (obligation: Obligation) => { setServiceKey(obligation.serviceKey); setObligationId(obligation.id); setReasonForVisit(`requirement:${obligation.id}`); setTopic(""); setView("schedule"); };
  const scheduleFromNudge = (nextServiceKey: string) => { setServiceKey(nextServiceKey); setObligationId(""); setReasonForVisit("recommended"); setTopic(""); setView("schedule"); };

  const schedule = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedService.id) { setMessage("The policy is mapped, but this service has not yet been created for your OACA organization."); return; }
    if (!reasonForVisit || (reasonForVisit === "other" && !customReason.trim())) { setMessage("Choose or type a reason for your visit."); return; }
    if (serviceKey === "academic_advising" && academicVisitType === "drop_in" && (!providerId || !academicBlockKey.trim())) { setMessage("Choose a drop-in advisor and enter the current academic block."); return; }
    if (serviceKey === "peer_tutoring" && !tutoringAcknowledged && (!agreementAccepted || typedName.trim().length < 2)) { setMessage("Review and acknowledge the student tutoring agreement before submitting."); return; }
    const reason = reasonForVisit === "other"
      ? customReason.trim()
      : reasonForVisit === "recommended"
        ? "Advisor recommendation"
        : reasonForVisit.startsWith("requirement:")
          ? (() => { const obligation = data.obligations.find((item) => item.id === reasonForVisit.slice(12)); return obligation ? obligationReasonLabel(obligation) : "General advising"; })()
          : standardReasons.find(([key]) => key === reasonForVisit)?.[1] || reasonForVisit.replaceAll("_", " ");
    const policyContext = serviceKey === "peer_tutoring"
      ? { examBlockKey, reasonForVisit: reason }
      : serviceKey === "academic_advising"
        ? { reasonForVisit: reason, academicDropIn: academicVisitType === "drop_in", academicBlockKey: academicVisitType === "drop_in" ? academicBlockKey.trim() : null, academicDropInProviderId: academicVisitType === "drop_in" ? providerId : null }
        : { reasonForVisit: reason };
    const requestedProviderId = serviceKey === "peer_tutoring" || (serviceKey === "academic_advising" && academicVisitType === "drop_in") ? providerId || null : null;
    setBusy(true); setMessage(""); setSubmitted(false);
    try {
      if (serviceKey === "peer_tutoring" && !tutoringAcknowledged) await api.request("/api/oaca/policy-acknowledgments", { method: "POST", body: { policyKey: "peer_tutoring_student_agreement_2026_2027", kind: "student_tutoring", typedName, userAgent: navigator.userAgent } });
      await api.request("/api/oaca/appointments", { method: "POST", body: { serviceLineId: selectedService.id, topic, providerId: requestedProviderId, startsAt, modality, format, preparationNote, obligationId: obligationId || null, policyContext } });
      setMessage("You will receive a notification when your appointment is confirmed."); setSubmitted(true);
      setPreparationNote(""); setObligationId(""); await reload();
    } catch (error) { setSubmitted(false); setMessage(error instanceof Error ? error.message : "The request could not be submitted."); }
    finally { setBusy(false); }
  };
  const cancel = async (id: string) => { setBusy(true); setMessage(""); try { await api.request("/api/oaca/appointments/cancel", { method: "POST", body: { appointmentId: id } }); setMessage("Appointment cancelled."); await reload(); } catch (error) { setMessage(error instanceof Error ? error.message : "The appointment could not be cancelled."); } finally { setBusy(false); } };
  const rebook = (appointment: Appointment) => {
    const nextService = appointment.serviceName.toLowerCase().includes("tutor") ? "peer_tutoring" : appointment.serviceName.toLowerCase().includes("career") ? "career_advising" : "academic_advising";
    setServiceKey(nextService); setReasonForVisit("other"); setCustomReason("Rebook a cancelled appointment"); setTopic(appointment.subject || "Follow-up visit"); setStartsAt(""); setProviderId(""); setMessage(""); setView("schedule");
  };
  const upload = async (file?: File) => {
    if (!file) return; const invalid = validateUpload(file); if (invalid) { setMessage(invalid); return; }
    setBusy(true); setMessage("Scanning and storing your private document…");
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-"); const path = `${context.userId}/oaca/${crypto.randomUUID()}-${safeName}`;
    const uploaded = await supabase.storage.from("platform-files").upload(path, file, { contentType: file.type, upsert: false });
    if (uploaded.error) { setBusy(false); setMessage("The private upload could not be completed."); return; }
    try { await api.request("/api/platform/files", { method: "POST", body: { experienceKey: "oaca", storagePath: path, originalName: file.name, mimeType: file.type, sizeBytes: file.size, purpose: "private_portfolio" } }); setMessage("Document received. It stays private until its security scan is clean."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "The document record could not be created."); }
    finally { setBusy(false); }
  };

  if (view === "requirements") return <RequirementsPanel data={data} setView={setView} chooseRequirement={chooseRequirement} />;
  if (view === "policies") return <PolicyLibrary data={data} onBack={() => setView("home")} />;
  if (view === "tutor") return <TutorDesk api={api} context={context} data={data} reload={reload} setView={setView} />;
  if (view === "events" || view === "notifications" || view === "checkin") return <OacaStudentEvents focus={view} api={api} events={data.events} communications={data.communications} nudges={data.nudges} forms={data.forms} onSchedule={scheduleFromNudge} onBack={() => setView("home")} reload={reload} />;
  if (view === "schedule") {
    return <section className="experience-panel">
      <button className="workspace-back text-button" onClick={() => setView("home")}>← Compass home</button>
      <div className="section-heading">
        <div><p className="kicker">Scheduling</p><h1>Request an Appointment</h1></div>
        <span className={"status-chip status-chip--" + (data.liveScheduling ? "confirmed" : "pending")}>{data.liveScheduling ? "Live scheduling" : "Policy mapped · sandbox validation"}</span>
      </div>
      <p className="policy-intro">Required milestones are reminders, not limits. You can request academic advising, career advising, or peer tutoring whenever you need it.</p>
      <ol className="booking-progress booking-progress--lifecycle" aria-label="Appointment process">
        <li className="active"><span>1</span><strong>Request</strong><small>Choose what works for you</small></li>
        <li><span>2</span><strong>Confirm</strong><small>Your advisor confirms the time</small></li>
        <li><span>3</span><strong>Meet</strong><small>Connect in person, by phone, or Teams</small></li>
      </ol>
      <form className="experience-form" onSubmit={schedule}>
        <fieldset>
          <legend>1. Choose a service</legend>
          <div className="choice-grid">{services.map((service) => <label key={service.key} className={serviceKey === service.key ? "choice-card selected" : "choice-card"}>
            <input type="radio" name="service" value={service.key} checked={serviceKey === service.key} onChange={() => { setServiceKey(service.key); setProviderId(""); setObligationId(""); setReasonForVisit(""); setCustomReason(""); setAcademicVisitType("assigned"); setSubmitted(false); setMessage(""); }} />
            <strong>{service.name}</strong><span>{oacaServiceLines.find((item) => item.key === service.key)?.description}</span>
          </label>)}</div>
        </fieldset>
        <label>
          <span>Reason for visit</span>
          <select required value={reasonForVisit} onChange={(event) => {
            const value = event.target.value;
            setReasonForVisit(value);
            setSubmitted(false);
            setObligationId(value.startsWith("requirement:") ? value.slice(12) : "");
          }}>
            <option value="">Choose a reason</option>
            {openObligations.map((item) => <option key={item.id} value={"requirement:" + item.id}>{obligationReasonLabel(item)}</option>)}
            {standardReasons.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            <option value="recommended">Advisor recommendation</option>
            <option value="other">Other — type my own</option>
          </select>
        </label>
        {reasonForVisit === "other" ? <label><span>Type your reason for visit</span><input required value={customReason} onChange={(event) => setCustomReason(event.target.value)} placeholder="Briefly name the purpose of this visit" /></label> : null}
        <label>
          <span>{serviceKey === "peer_tutoring" ? "Course or subject" : "Discussion topics"}</span>
          <input required value={topic} onChange={(event) => setTopic(event.target.value)} placeholder={serviceKey === "peer_tutoring" ? "Course, subject, or concepts to review" : "What would you like to cover?"} />
          <small>Your reason identifies the purpose of the visit. Discussion topics tell your advisor or tutor what you hope to cover so they can prepare.</small>
        </label>
        {serviceKey === "academic_advising" ? <>
          <fieldset>
            <legend>Academic advising format</legend>
            <div className="segmented-control">
              <label><input type="radio" name="academic-visit-type" checked={academicVisitType === "assigned"} onChange={() => { setAcademicVisitType("assigned"); setProviderId(""); setAcademicBlockKey(""); }} /><span>Meet with my assigned advisor</span></label>
              <label><input type="radio" name="academic-visit-type" checked={academicVisitType === "drop_in"} onChange={() => { setAcademicVisitType("drop_in"); setProviderId(""); }} /><span>Academic drop-in</span></label>
            </div>
          </fieldset>
          {academicVisitType === "assigned"
            ? <div className="assigned-provider"><strong>Your academic advisor</strong><span>{data.assignedAdvisor?.displayName || "Advisor assignment pending"}</span></div>
            : <div className="drop-in-fields">
                <p>Students may use another academic advisor for up to two drop-in visits per academic block.</p>
                <label><span>Current academic block</span><input required value={academicBlockKey} onChange={(event) => setAcademicBlockKey(event.target.value)} placeholder="Example: Block 3" /></label>
                <label><span>Drop-in advisor</span><select required value={providerId} onChange={(event) => setProviderId(event.target.value)}><option value="">Choose an academic advisor</option>{academicDropInProviders.map((provider) => <option key={provider.id} value={provider.id}>{provider.displayName}</option>)}</select></label>
              </div>}
        </> : null}
        {serviceKey === "career_advising" ? <div className="assigned-provider"><strong>Career advisor</strong><span>Compass routes this request automatically.</span></div> : null}
        {serviceKey === "peer_tutoring" ? <>
          <label><span>Exam block or upcoming exam</span><input required value={examBlockKey} onChange={(event) => setExamBlockKey(event.target.value)} placeholder="Used only to apply the between-exams limit" /></label>
          <label><span>Tutor</span><select required value={providerId} onChange={(event) => setProviderId(event.target.value)}><option value="">Choose a tutor</option>{peerTutors.map((provider) => <option key={provider.id} value={provider.id}>{provider.displayName}</option>)}</select></label>
          <label><span>Tutoring format</span><select value={format} onChange={(event) => setFormat(event.target.value)}><option value="individual">Individual</option><option value="small_group">Small group</option><option value="drop_in">Drop-in</option></select></label>
          <aside className="policy-rule-card policy-rule-card--compact"><strong>Before you book</strong><p>Maximum 2 hours per week, 1 hour per individual session, and 4 hours per course between exams. Book no more than 7 days ahead and cancel at least 24 hours before the session.</p>{!tutoringAcknowledged ? <div className="acknowledgment-box"><label><span>Type your full name</span><input value={typedName} onChange={(event) => setTypedName(event.target.value)} /></label><label className="check-row"><input type="checkbox" checked={agreementAccepted} onChange={(event) => setAgreementAccepted(event.target.checked)} /><span>I have reviewed and agree to the current Peer Tutoring Services Student Acknowledgement &amp; Agreement.</span></label><small>This versioned acknowledgment requires institutional approval before it can replace a signed form.</small></div> : <span className="policy-check policy-check--complete">Current agreement acknowledged</span>}</aside>
        </> : null}
        <label><span>Date and time</span><input type="datetime-local" required value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /><small>Only policy-compliant platform availability and Outlook free/busy slots are accepted by the server.</small></label>
        <fieldset><legend>Modality</legend><div className="segmented-control">{selectedService.modalities.map((item) => <label key={item}><input type="radio" name="modality" value={item} checked={modality === item} onChange={() => setModality(item)} /><span>{item === "teams" ? "Teams" : item === "in_person" ? "In person" : "Phone"}</span></label>)}</div></fieldset>
        <label><span>Optional preparation note</span><textarea value={preparationNote} onChange={(event) => setPreparationNote(event.target.value)} placeholder="Share anything that will help you get more from the appointment." /></label>
        <button className="primary-button" disabled={busy}>{busy ? "Submitting…" : data.liveScheduling ? "Submit request" : "Submit sandbox request"}</button>
        <p className={submitted ? "form-message appointment-success" : "form-message"} aria-live="polite">{message}</p>
      </form>
    </section>;
  }
  if (view === "appointments") return <section className="experience-panel">
    <button className="workspace-back text-button" onClick={() => setView("home")}>← Compass home</button>
    <p className="kicker">My visits</p><h1>Appointments and action plans</h1>
    <p className="form-message" aria-live="polite">{message}</p>
    <div className="record-list appointment-list">{data.appointments.map((appointment) => <article key={appointment.id}>
      <div><span className={"status-chip status-chip--" + appointment.status}>{appointment.status.replaceAll("_", " ")}</span><h2>{appointment.serviceName}</h2><p>{appointment.providerName || "Provider assignment pending"} · {appointment.requestOrigin === "advisor" ? "Scheduled by advisor" : "Requested by you"}</p></div>
      <dl><div><dt>When</dt><dd>{appointment.startsAt ? new Date(appointment.startsAt).toLocaleString() : "Not selected"}</dd></div><div><dt>Modality</dt><dd>{appointment.modality.replaceAll("_", " ")}</dd></div></dl>
      {["pending_approval", "counterproposed", "confirmed"].includes(appointment.status) ? <button className="text-button" disabled={busy} onClick={() => void cancel(appointment.id)}>Cancel appointment</button> : null}
      {appointment.status === "cancelled" && !dismissedRebooks.has(appointment.id) ? <div className="rebook-prompt"><div><strong>Would you like to choose another time?</strong><p>You can rebook now or come back to it later.</p></div><div className="workspace-actions"><button className="primary-button" onClick={() => rebook(appointment)}>Rebook</button><button className="text-button" onClick={() => setDismissedRebooks((current) => new Set(current).add(appointment.id))}>Later</button></div></div> : null}
      {appointment.studentRecap ? <div className="student-recap"><strong>Your action plan</strong><p>{appointment.studentRecap}</p></div> : null}
    </article>)}{!data.appointments.length ? <div className="empty-state"><h2>No appointment history yet</h2><p>Your visits and staff-published action plans will appear here.</p></div> : null}</div>
  </section>;
  if (view === "portfolio") return <section className="experience-panel"><button className="workspace-back text-button" onClick={() => setView("home")}>← OACA home</button><p className="kicker">Student-owned portfolio</p><h1>Keep useful documents with you.</h1><div className="experience-grid experience-grid--compact"><article className="production-card"><h2>Add a private document</h2><p>PDF, DOCX, XLSX, PPTX, JPEG, or PNG · 25 MB maximum. Sharing is a separate action.</p><label className="file-drop"><span>{busy ? "Working…" : "Choose a document"}</span><input type="file" accept=".pdf,.docx,.xlsx,.pptx,.jpg,.jpeg,.png" disabled={busy} onChange={(event) => void upload(event.target.files?.[0])} /></label><p className="form-message" aria-live="polite">{message}</p></article><article className="production-card"><h2>Visit worksheet</h2><p>Use the accessible web worksheet or print the PDF. Its session code contains no student identity.</p><div className="workspace-actions"><a className="secondary-button" href="/app/oaca/worksheet">Open HTML worksheet</a><a className="text-button" href="/resources/oaca-compass-visit-worksheet.pdf" download>Download print PDF</a></div></article></div></section>;
  const isTutor = data.currentProvider?.classification === "peer_tutor";
  const firstName = context.displayName.split(/\s+/)[0] || "there";
  const nextAppointment = data.appointments.filter((item) => item.startsAt && ["pending_approval", "counterproposed", "confirmed"].includes(item.status)).sort((left, right) => new Date(left.startsAt || 0).getTime() - new Date(right.startsAt || 0).getTime())[0];
  const nextEvent = data.events.filter((item) => new Date(item.startsAt).getTime() >= loadedAt).sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime())[0];
  return <section className="experience-panel">
    <div className="experience-hero experience-hero--oaca compass-student-hero">
      <div className="compass-hero-copy">
        <p className="kicker">Your Compass</p>
        <h1>Welcome back, {firstName}.</h1>
        <p>What would make today easier? Book support, check what’s coming up, or pick up where you left off.</p>
      </div>
      <div className="compass-hero-actions" aria-label="Compass quick actions">
        <button onClick={() => setView("schedule")} aria-label="Request an appointment"><CompassHeroIcon kind="appointment" /><strong>Make an appointment</strong></button>
        <button onClick={() => setView("notifications")} aria-label="Open notifications"><CompassHeroIcon kind="notifications" /><strong>Notifications</strong>{data.eventNotificationUnreadCount ? <small>{data.eventNotificationUnreadCount} unread</small> : null}</button>
        <button onClick={() => setView("events")} aria-label="Open events"><CompassHeroIcon kind="events" /><strong>Events</strong></button>
        <button onClick={() => setView("checkin")} aria-label="Show student check-in code"><CompassHeroIcon kind="checkin" /><strong>Check in</strong></button>
        <button onClick={() => setView("appointments")} aria-label="Open my visits"><CompassHeroIcon kind="visits" /><strong>My visits</strong></button>
      </div>
      <div className="hero-status">
        <span aria-hidden="true">⌁</span>
        <strong>{data.nudges.length ? data.nudges.length + " appointment reminder" + (data.nudges.length === 1 ? "" : "s") : nextAppointment ? "Your next visit is on the calendar" : "You’re all caught up"}</strong>
        <p>{data.nudges.length ? "Open notifications when you’re ready to choose a time." : nextAppointment ? "Open My visits for the details and status." : "Compass is ready whenever you need support."}</p>
      </div>
    </div>
    <section className="compass-at-a-glance" aria-label="Coming up">
      <article><span>Next visit</span><strong>{nextAppointment?.serviceName || "No appointment scheduled"}</strong><small>{nextAppointment?.startsAt ? new Date(nextAppointment.startsAt).toLocaleString() : "Request support whenever you need it."}</small>{nextAppointment ? <button className="text-button" onClick={() => setView("appointments")}>View visit</button> : <button className="text-button" onClick={() => setView("schedule")}>Choose a time</button>}</article>
      <article><span>Coming up</span><strong>{nextEvent?.title || "No upcoming events"}</strong><small>{nextEvent ? `${new Date(nextEvent.startsAt).toLocaleString()}${nextEvent.location ? ` · ${nextEvent.location}` : ""}` : "New OACA events will appear here."}</small>{nextEvent ? <button className="text-button" onClick={() => setView("events")}>View events</button> : null}</article>
    </section>
    <div className="home-action-grid home-action-grid--experience compass-secondary-actions">
      <button onClick={() => setView("requirements")}><span>◇</span><strong>My requirements</strong><small>Milestones and additional support</small></button>
      <button onClick={() => setView("portfolio")}><span>▤</span><strong>My portfolio</strong><small>Private files and explicit sharing</small></button>
      <button onClick={() => setView("policies")}><span>§</span><strong>Policies</strong><small>Current advising and tutoring rules</small></button>
      {isTutor ? <button onClick={() => setView("tutor")}><span>✎</span><strong>Tutor desk</strong><small>Eligibility and session logs</small></button> : null}
    </div>
    {data.restrictions.length ? <aside className="configuration-banner configuration-banner--alert"><strong>Peer tutoring scheduling is temporarily restricted.</strong><p>{data.restrictions[0].reason}. Contact the Tutoring Manager for review.</p></aside> : null}
  </section>;
}

function OacaStaff({ api, supabase, context, data, mode, reload, view, setView }: { api: PilotApiClient; supabase: SupabaseClient; context: AuthorizationContext; data: Bootstrap; mode: string; reload: () => Promise<void>; view: OacaView; setView: (view: OacaView) => void }) {
  const [notes, setNotes] = useState(""); const [recap, setRecap] = useState(""); const [category, setCategory] = useState("academic_planning"); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false); const [appointmentId, setAppointmentId] = useState(data.appointments[0]?.id || ""); const [replacement, setReplacement] = useState("");
  const [studentId, setStudentId] = useState(""); const [serviceId, setServiceId] = useState(""); const [startsAt, setStartsAt] = useState(""); const [modality, setModality] = useState("teams"); const [topic, setTopic] = useState(""); const [obligationId, setObligationId] = useState("");
  const selected = data.appointments.find((item) => item.id === appointmentId) || data.appointments[0];
  const advisingServices = data.services.filter((item) => ["academic_advising", "career_advising"].includes(item.key));
  const studentObligations = data.obligations.filter((item) => item.studentId === studentId && item.status !== "completed");
  const decide = async (decision: string) => { if (!selected) return; setBusy(true); try { await api.request("/api/oaca/appointment-decisions", { method: "POST", body: { appointmentId: selected.id, decision, startsAt: replacement || null } }); setMessage(`Appointment ${decision === "confirm" ? "confirmed" : decision === "counterpropose" ? "counterproposal sent" : decision.replaceAll("_", " ")}.`); await reload(); } catch (error) { setMessage(error instanceof Error ? error.message : "The appointment could not be updated."); } finally { setBusy(false); } };
  const save = async (publishRecap: boolean) => { if (!selected) { setMessage("Choose a confirmed appointment first."); return; } setBusy(true); try { await api.request("/api/oaca/records", { method: "POST", body: { appointmentId: selected.id, workingNotes: notes, studentRecap: recap, structuredData: { categories: [category], interventions: [], referrals: [], followUp: [] }, publishRecap } }); setMessage(publishRecap ? "Audited revision saved and the student action plan was published." : "Audited staff draft saved. The recap remains unpublished."); } catch (error) { setMessage(error instanceof Error ? error.message : "The encounter record could not be saved."); } finally { setBusy(false); } };
  const scheduleForStudent = async (event: React.FormEvent) => { event.preventDefault(); setBusy(true); setMessage(""); try { await api.request("/api/oaca/appointments/on-behalf", { method: "POST", body: { studentId, serviceLineId: serviceId, startsAt, modality, topic, obligationId: obligationId || null, preparationNote: "Created by advisor on behalf of student" } }); setMessage("Appointment created for the student and recorded as advisor-initiated."); setStartsAt(""); setTopic(""); setObligationId(""); await reload(); } catch (error) { setMessage(error instanceof Error ? error.message : "The appointment could not be created."); } finally { setBusy(false); } };
  if (view === "policies") return <PolicyLibrary data={data} onBack={() => setView("home")} />;
  if (view === "schedule_student") return <section className="experience-panel"><button className="workspace-back text-button" onClick={() => setView("home")}>← Staff home</button><p className="kicker">Advisor-created appointment</p><h1>Schedule with a student.</h1><p className="policy-intro">Academic advising is limited to assigned students unless an explicit scheduling capability has been granted. Every appointment is labeled advisor-initiated and audited.</p><form className="experience-form" onSubmit={scheduleForStudent}><label><span>Student</span><select required value={studentId} onChange={(event) => { setStudentId(event.target.value); setObligationId(""); }}><option value="">Choose an authorized student</option>{data.assignedStudents.map((student) => <option key={student.id} value={student.id}>{student.displayName}</option>)}</select></label><label><span>Service</span><select required value={serviceId} onChange={(event) => setServiceId(event.target.value)}><option value="">Choose academic or career advising</option>{advisingServices.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label>{studentObligations.length ? <label><span>Link a required milestone (optional)</span><select value={obligationId} onChange={(event) => setObligationId(event.target.value)}><option value="">Additional appointment</option>{studentObligations.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label> : null}<label><span>Purpose</span><input required value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="Reason for the appointment" /></label><label><span>Date and time</span><input type="datetime-local" required value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></label><fieldset><legend>Modality</legend><div className="segmented-control">{["in_person", "phone", "teams"].map((item) => <label key={item}><input type="radio" name="advisor-modality" value={item} checked={modality === item} onChange={() => setModality(item)} /><span>{item === "in_person" ? "In person" : item === "teams" ? "Teams" : "Phone"}</span></label>)}</div></fieldset><button className="primary-button" disabled={busy || !data.assignedStudents.length}>{busy ? "Creating…" : "Create appointment"}</button>{!data.assignedStudents.length ? <p>No students are currently available within your assignment or scheduling capability.</p> : null}<p className="form-message" aria-live="polite">{message}</p></form></section>;
  if (view === "records") return <section className="experience-panel"><button className="workspace-back text-button" onClick={() => setView("home")}>← Staff home</button><p className="kicker">Encounter record</p><h1>Separate working notes from the student recap.</h1><div className="record-editor"><label><span>Appointment</span><select value={selected?.id || ""} onChange={(event) => setAppointmentId(event.target.value)}><option value="">Choose an appointment</option>{data.appointments.map((item) => <option key={item.id} value={item.id}>{item.studentName} · {item.serviceName} · {item.startsAt ? new Date(item.startsAt).toLocaleString() : item.status}</option>)}</select></label>{selected && ["pending_approval", "counterproposed"].includes(selected.status) ? <div className="review-card"><h2>Provider decision</h2><div className="workspace-actions"><button className="primary-button" disabled={busy} onClick={() => void decide("confirm")}>Confirm request</button><button className="text-button" disabled={busy} onClick={() => void decide("decline")}>Decline</button></div><label><span>Or propose another time</span><input type="datetime-local" value={replacement} onChange={(event) => setReplacement(event.target.value)} /></label><button className="secondary-button" disabled={busy || !replacement} onClick={() => void decide("counterpropose")}>Send counterproposal</button></div> : null}<label><span>Protected staff working notes</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} /><small>Never shown to the student. Access is limited to assigned service staff.</small></label><label><span>Structured category</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="academic_planning">Academic planning</option><option value="career_exploration">Career exploration</option><option value="learning_strategy">Learning strategy</option><option value="referral">Referral</option></select></label><label><span>Student-facing recap and action plan</span><textarea value={recap} onChange={(event) => setRecap(event.target.value)} /><small>Published separately after staff review.</small></label><div className="workspace-actions"><button className="secondary-button" disabled={busy || !selected} onClick={() => void save(false)}>Save protected draft</button><button className="primary-button" disabled={busy || !selected || !recap.trim()} onClick={() => void save(true)}>Publish recap to student</button></div><p className="form-message" aria-live="polite">{message}</p></div></section>;
  if (view === "analytics") return <OacaAnalyticsPanel analytics={data.analytics} onBack={() => setView("home")} />;
  if (view === "imports") return <OacaImportCenter api={api} supabase={supabase} context={context} batches={data.importBatches} reload={reload} onBack={() => setView("home")} />;
  if (view === "outreach") return <OacaEventsAndOutreach api={api} supabase={supabase} context={context} canManageOutreach={data.canManageOutreach} canManageImports={data.canManageImports} events={data.events} campaigns={data.campaigns} nudges={data.nudges} students={data.assignedStudents} providers={data.providers} services={data.services} audienceOptions={data.audienceOptions} reload={reload} onBack={() => setView("home")} />;
  if (view === "settings") return <section className="experience-panel"><button className="workspace-back text-button" onClick={() => setView("home")}>← Staff home</button><p className="kicker">Service configuration</p><h1>Policies received; operations still gated.</h1><div className="record-list">{(data.services.length ? data.services : fallbackServices).map((service) => <article key={service.key}><span className={`status-chip status-chip--${service.policyStatus === "live_approved" ? "confirmed" : "pending"}`}>{service.policyStatus.replaceAll("_", " ")}</span><h2>{service.name}</h2><p>{service.key === "peer_tutoring" ? "The 60-minute maximum, seven-day booking horizon, weekly and exam-block limits, 24-hour cancellation rule, capacity ranges, and no-show review are mapped." : "Required milestones and provider routing are mapped."}</p><small>Live activation still requires office hours, Outlook free/busy, remaining service values, and administrator approval.</small></article>)}</div><button className="secondary-button" onClick={() => setView("policies")}>Review mapped policies</button></section>;
  return <section className="experience-panel"><div className="experience-hero experience-hero--oaca"><div><p className="kicker">OACA staff workspace</p><h1>Today’s advising work.</h1><p>See only assigned students, service workload, and the records your capability bundle permits.</p></div><div className="hero-status"><strong>{data.appointments.length}</strong><p>appointments in your authorized scope</p></div></div>{mode === "creator" ? <CreatorTimePanel /> : null}<div className="home-action-grid home-action-grid--experience"><button onClick={() => setView("outreach")}><span>◉</span><strong>{data.canManageOutreach ? "Events and outreach" : "Appointment nudges"}</strong><small>{data.canManageOutreach ? "Events, rich email, forms, and insights" : "Remind assigned students to schedule"}</small></button>{!["administrator","creator"].includes(mode) ? <><button onClick={() => setView("schedule_student")}><span>＋</span><strong>Schedule for a student</strong><small>Assigned or explicitly authorized students</small></button><button onClick={() => setView("records")}><span>✎</span><strong>Visit records</strong><small>Working notes, structure, and recap</small></button></> : null}{data.canViewAnalytics ? <button onClick={() => setView("analytics")}><span>▥</span><strong>Service analytics</strong><small>Aggregate workload and cohort trends</small></button> : null}{data.canManageImports ? <button onClick={() => setView("imports")}><span>⇧</span><strong>Secure data imports</strong><small>Penji history and student metadata</small></button> : null}<button onClick={() => setView("settings")}><span>⚙</span><strong>Service configuration</strong><small>Policy mapping and live gates</small></button><button onClick={() => setView("policies")}><span>§</span><strong>Policy library</strong><small>Source versions and operational rules</small></button></div></section>;
}

function OacaWorkspace({ api, supabase, context, membership, signOut }: { api: PilotApiClient; supabase: SupabaseClient; context: AuthorizationContext; membership: ExperienceMembership; signOut: () => Promise<void> }) {
  const [data, setData] = useState<Bootstrap>(emptyBootstrap);
  const [message, setMessage] = useState("Loading Compass…");
  const [view, setView] = useState<OacaView>("home");
  const [mode, setMode] = useState<string>(membership.roles.includes("creator") ? "creator" : membership.roles.includes("student") ? "student" : membership.roles[0] || "staff");
  const load = useCallback(async () => { try { setData(await api.request<Bootstrap>("/api/oaca/bootstrap")); setMessage(""); } catch (error) { setMessage(error instanceof Error ? error.message : "Compass could not be loaded."); } }, [api]);
  useEffect(() => { const task = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(task); }, [load]);
  useCreatorTimeTracking(membership.roles.includes("creator"), `Compass · ${oacaRoleLabels[mode] || mode} · ${oacaViewLabels[view]}`);
  const staff = mode !== "student";
  const studentData: Bootstrap = staff ? data : {
    ...data,
    appointments: data.appointments.filter((appointment) => appointment.studentId === context.userId),
    assignedStudents: [],
    currentProvider: null,
    canManageImports: false,
    canViewAnalytics: false,
    importBatches: [],
    analytics: null,
    canManageOutreach: false,
    canViewOutreachInsights: false,
    campaigns: [],
    nudges: data.nudges.filter((nudge) => nudge.studentId === context.userId),
  };
  return <div className="navigate-platform navigate-platform--oaca">
    <ExperienceHeader context={context} onSignOut={signOut} />
    <main className="platform-main">
      <nav className="experience-nav compass-role-nav" aria-label="Compass dashboard role">
        {membership.roles.length > 1 ? <label><span>Viewing dashboard as</span><select value={mode} onChange={(event) => { setMode(event.target.value); setView("home"); }}>{membership.roles.map((role) => <option key={role} value={role}>{oacaRoleLabels[role] || role.replaceAll("_", " ")}</option>)}</select></label> : <span className="status-chip">{oacaRoleLabels[mode] || mode.replaceAll("_", " ")} dashboard</span>}
      </nav>
      {message ? <p className="form-message" aria-live="polite">{message}</p> : null}
      {staff ? <OacaStaff api={api} supabase={supabase} context={context} data={data} mode={mode} reload={load} view={view} setView={setView} /> : <OacaStudent api={api} supabase={supabase} context={context} data={studentData} view={view} setView={setView} reload={load} />}
    </main>
  </div>;
}

export function OacaCompassApp() {
  return <PlatformAccess experience="oaca">{({ api, supabase, context, memberships, signOut }) => {
    const membership = memberships.find((item) => item.experienceKey === "oaca")!;
    return <OacaWorkspace api={api} supabase={supabase} context={context} membership={membership} signOut={signOut} />;
  }}</PlatformAccess>;
}
