"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { assetUrl } from "../asset-url";
import { RosieGuide } from "../components/rosie-guide";
import { WorkspaceTopTools, WorkspaceHub } from "./workspace-ui";
import { WorkspaceNavigation, WorkspaceBack, usePathwayView, useSessionDraft, useResetPathway } from "./workspace-navigation";
import { PilotApiClient } from "./api-client";
import { advisorInstrumentCatalog, type PilotRole } from "./catalog";
import { ProductionPathwayMap } from "./production-pathway-map";
import { CohortBoard, StudentAdvising, StudentHome, StudentPortfolio, StudentVault, type StudentDestination } from "./production-student-tools";
import { CreatorControls } from "./creator-controls";
import { SurveyAnalyticsCenter } from "./survey-analytics-center";
import { getSupabaseBrowserClient, loadProductionConfiguration } from "./supabase-client";
import type {
  AdminDashboard,
  AdvisorDashboard,
  AuthorizationContext,
  PilotDashboard,
  StudentDashboard,
  SurveyAssignmentDetail,
  SurveyAssignmentStatus,
  SurveyAssignmentSummary,
  UserAccessLog,
  AdvisingPacketDetail,
  EvaluationSummary,
  UserAccessPerson,
} from "./types";

import { assignedModes, modeContext, modeLabels, principalMode, surveysForAudience, type DashboardMode } from "./dashboard-mode";
import { RolePrivileges } from "./role-privileges";
import { CreatorPreviewBanner, rememberWorkspace, useCreatorPreviewTimeTracking, WorkspaceSwitcher } from "./compass-platform-shell";
import { InstallCompass } from "./install-compass";
import type { ExperienceMembership } from "./platform-model";
import { activateSyntheticPreview, clearSyntheticPreview, getSyntheticPreviewPersona, isSyntheticPreviewActive, setSyntheticPreviewPersona, SYNTHETIC_PERSONAS, syntheticContextForPersona, syntheticMembershipsForPersona, syntheticPreviewApi, type SyntheticPersonaKey } from "./synthetic-preview";

type AuthState = "loading" | "signed_out" | "signed_in";
type AdvisorView = "home" | "students" | "survey";
type AdminView = "home" | "people" | "sessions" | "surveys" | "configuration";

const statusLabels: Record<SurveyAssignmentStatus, string> = {
  not_available: "Not available",
  not_started: "Start",
  in_progress: "Continue",
  submitted: "Submitted",
  closed: "Closed",
};

export function AppHeader({ context, memberships = context.experienceMemberships || [], role, onRole, onSignOut, onReview, api }: { context: AuthorizationContext; memberships?: ExperienceMembership[]; role: DashboardMode; onRole: (role: DashboardMode) => void; onSignOut: () => void; onReview:()=>void; api:PilotApiClient }) {
  const modes = assignedModes(context);
  const [,setView] = usePathwayView("workspace","home");
  return <header className="production-header"><button className="production-brand" onClick={()=>setView("home")}><img src={assetUrl("/assets/navigate-pathway-mark.svg")} alt="" /><span>Navigate The Pathway</span></button><WorkspaceSwitcher api={api} memberships={memberships} current="pathway" previewMode={false} /><WorkspaceTopTools context={modeContext(context,role)} api={api} /><div className="production-account"><span>{context.displayName}</span><button className="principal-badge" onClick={onReview}><span>{modeLabels[role]}</span><small>My privileges</small></button>{modes.length > 1 ? <label><span className="sr-only">Dashboard mode</span><select value={role} onChange={(event) => onRole(event.target.value as DashboardMode)}>{modes.map(item=><option key={item} value={item}>{modeLabels[item]}</option>)}</select></label> : null}<button className="text-button" onClick={onSignOut}>Sign out</button></div></header>;
}

export function ConfigurationRequired() {
  return <main className="production-auth"><section className="production-auth-card"><RosieGuide pose="idle" eyebrow="Compass" title="Secure setup is not connected yet." body="The application shell is ready. Supabase and the Compass service must be configured before invitations can be sent." priority /><div className="production-checklist"><p><strong>Public demonstration:</strong> remains separate and fictional.</p><p><strong>Compass records:</strong> will be stored only in Supabase.</p><p><strong>Survey wording:</strong> stays protected until permissions and PI approval are documented.</p></div><a className="preview-entry" href="/app?preview=creator"><span><strong>Explore the Compass demo</strong><small>Open every workspace with fictional records. Live Roseman sign-in is available from the Compass entry page.</small></span><span aria-hidden="true">→</span></a><InstallCompass /></section></main>;
}

export function SignIn({ supabase }: { supabase: SupabaseClient }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const signIn = async () => {
    setBusy(true); setMessage("");
    try {
      const { error } = await Promise.race([
        supabase.auth.signInWithSSO({
          domain: "roseman.edu",
          options: { redirectTo: `${window.location.origin}/app/auth/callback` },
        }),
        new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("timeout")), 15000)),
      ]);
      if (error) setMessage("Roseman sign-in could not be started. Try again or contact the Compass Creator.");
    } catch {
      setMessage("Roseman sign-in is taking too long. Check your connection and try again.");
    } finally { setBusy(false); }
  };
  return <main className="production-auth"><section className="production-auth-card compass-signin"><div className="compass-signin__identity"><div className="compass-signin__emblem" aria-hidden="true"><img src={assetUrl("/assets/brand/compass-emblem-v2.png")} alt="" /></div><div className="compass-signin__hero-copy"><p className="compass-signin__eyebrow">Roseman University student support</p><h1>Compass</h1><p className="compass-signin__services">Advising <span>·</span> Tutoring <span>·</span> Events</p><p className="compass-signin__introduction">Sign in once to reach your assigned support and workspaces.</p></div></div><div className="sso-coming-soon" role="note"><strong>Roseman Microsoft SSO</strong><span>Live sign-in available</span><small>Your Roseman identity and the approved Compass roster are separate access checks.</small></div><div className="production-form"><button type="button" className="primary-button" onClick={() => void signIn()} disabled={busy}>{busy ? "Opening Microsoft…" : "Sign in with Roseman Microsoft"}</button><p className="form-message" aria-live="polite">{message}</p></div><div className="pathway-invite-note"><strong>Joining from another university?</strong><p>External pre-med students enter through an approved Pathway invitation. An email domain never creates access automatically.</p></div><a className="preview-entry" href="/app?preview=creator"><span><strong>Explore the Compass demo</strong><small>Use fictional, role-scoped records while live Roseman sign-in remains available above.</small></span><span aria-hidden="true">→</span></a><p className="privacy-note">Signing in does not grant a workspace, calendar access, or a staff role. Those permissions are approved separately.</p><InstallCompass /><a className="text-button" href="/app/creator-recovery">Creator recovery</a></section></main>;
}

export function PasswordRecovery({ supabase, onComplete }: { supabase: SupabaseClient; onComplete: () => void }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [canRequestAnotherLink, setCanRequestAnotherLink] = useState(false);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email || ""));
  }, [supabase]);

  const recoveryErrorMessage = (error: { code?: string; message: string }) => {
    const detail = `${error.code || ""} ${error.message}`.toLowerCase();
    if (detail.includes("same_password") || (detail.includes("same") && detail.includes("password"))) {
      return "Choose a password that is different from your current password.";
    }
    if (detail.includes("weak_password") || detail.includes("weak password") || detail.includes("at least")) {
      return "That password does not meet the security requirements. Try a longer passphrase you have not used before.";
    }
    if (["expired", "session", "token", "jwt", "reauthentication"].some((term) => detail.includes(term))) {
      return "Compass did not receive a verified recovery session. The email may still be new; one-time links can also be opened by email security scanning or superseded by a newer request.";
    }
    return `Supabase could not accept that password: ${error.message}`;
  };

  const updatePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 12) { setMessage("Use at least 12 characters for your new password."); return; }
    if (password !== confirmation) { setMessage("The passwords do not match."); return; }
    setBusy(true); setMessage(""); setCanRequestAnotherLink(false);
    const verified = await supabase.auth.getUser();
    if (verified.error || !verified.data.user) {
      setBusy(false);
      setMessage("Compass could not verify this recovery session. Request one new email and use only its latest reset link.");
      setCanRequestAnotherLink(true);
      return;
    }
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setMessage(recoveryErrorMessage(error));
        setCanRequestAnotherLink(true);
        return;
      }
      onComplete();
    } catch {
      setMessage("Compass could not reach the password service. Check your connection and try again without requesting another email.");
    } finally { setBusy(false); }
  };

  const requestAnotherLink = async () => {
    setBusy(true); setMessage("");
    if (!email.trim()) {
      setBusy(false);
      setMessage("Enter the email address for your Compass account.");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/app/auth/callback` });
    setBusy(false);
    setMessage(error ? `A new link could not be sent: ${error.message}` : `A fresh password-reset link was sent to ${email.trim()}. Use only the newest email.`);
  };

  return <main className="production-auth"><section className="production-auth-card production-auth-card--recovery">
    <RosieGuide pose="idle" compact eyebrow="Secure password reset" title="Choose your new password." body="Supabase verified this recovery session. Set a new password below, then Compass will open your account." priority />
    <form className="production-form" onSubmit={updatePassword}>
      <label><span>New password</span><input type="password" autoComplete="new-password" minLength={12} required value={password} onChange={(event) => setPassword(event.target.value)} /><small>Use at least 12 characters.</small></label>
      <label><span>Confirm new password</span><input type="password" autoComplete="new-password" minLength={12} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
      <button className="primary-button" disabled={busy}>{busy ? "Updating…" : "Set new password"}</button>
      {canRequestAnotherLink ? <><label><span>Account email</span><input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label><button type="button" className="secondary-button" disabled={busy} onClick={() => void requestAnotherLink()}>{busy ? "Sending…" : "Send me a fresh reset link"}</button></> : null}
      <p className="form-message" aria-live="polite">{message}</p>
    </form><InstallCompass compact />
  </section></main>;
}

export function PasswordRecoveryProblem({ supabase, detail }: { supabase: SupabaseClient; detail: string }) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const requestLink = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setMessage("");
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/app/auth/callback` });
    setBusy(false);
    setMessage(error ? `A new reset email could not be sent: ${error.message}` : "A new reset email was requested. Use only the newest message; earlier links stop working.");
  };
  return <main className="production-auth"><section className="production-auth-card production-auth-card--recovery">
    <RosieGuide pose="idle" compact eyebrow="Password reset" title="That link did not create a secure session." body={detail} priority />
    <form className="production-form" onSubmit={requestLink}>
      <label><span>Account email</span><input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <button className="primary-button" disabled={busy}>{busy ? "Requesting…" : "Request one new reset email"}</button>
      <p className="form-message" aria-live="polite">{message}</p>
    </form>
    <a className="preview-entry" href="/app?preview=creator"><span><strong>Open the Creator Preview</strong><small>Continue exploring Compass with fictional records while account access is repaired.</small></span><span aria-hidden="true">→</span></a>
    <InstallCompass compact /><a className="text-button" href="/app">Return to sign in</a>
  </section></main>;
}

export function MfaGate({ supabase, onVerified }: { supabase: SupabaseClient; onVerified: () => void }) {
  void onVerified;
  useEffect(() => {
    let active = true;
    void (async () => {
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
      if (active) window.location.replace("/app?signin=1");
    })();
    return () => { active = false; };
  }, [supabase]);
  return <main className="production-auth"><section className="production-auth-card"><RosieGuide pose="tracks" eyebrow="Roseman SSO" title="Returning you to Roseman sign-in." body="This staff session has not completed the approved Roseman SSO check. Compass is signing you out so you can continue through the Roseman sign-in button." priority /><InstallCompass compact /><p className="form-message" aria-live="polite">If the redirect does not start, <a className="text-button" href="/app?signin=1">return to Roseman SSO</a>.</p></section></main>;
}

function SurveyCards({ assignments, onOpen }: { assignments: SurveyAssignmentSummary[]; onOpen: (assignment: SurveyAssignmentSummary) => void }) {
  return <div className="survey-card-grid">{assignments.map((assignment) => <article className="survey-card" key={assignment.id}><div><span>{assignment.waveLabel}</span>{assignment.required ? <strong>Required</strong> : null}</div><h3>{assignment.instrumentName}</h3>{assignment.submittedAt ? <p className="submission-time">Submitted <time dateTime={assignment.submittedAt}>{new Date(assignment.submittedAt).toLocaleString()}</time></p> : assignment.status === "submitted" ? <p className="submission-time">Submission date unavailable</p> : null}<p>{assignment.itemCount} rating items{assignment.openResponseCount ? ` and ${assignment.openResponseCount} open responses` : ""}</p><button className={assignment.status === "not_started" || assignment.status === "in_progress" ? "primary-button" : "secondary-button"} disabled={["not_available", "closed", "submitted"].includes(assignment.status)} onClick={() => onOpen(assignment)}>{statusLabels[assignment.status]}</button></article>)}</div>;
}

function SurveyWorkspace({ assignment, api, onClose, onSubmitted }: { assignment: SurveyAssignmentSummary; api: PilotApiClient; onClose: () => void; onSubmitted: () => void }) {
  const [detail, setDetail] = useState<SurveyAssignmentDetail | null>(null);
  const [answers, setAnswers] = useSessionDraft<Record<string, string>>("survey-answers:"+assignment.id, {});
  const [consented, setConsented] = useState(false);
  const [message, setMessage] = useState("Loading...");
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.request<SurveyAssignmentDetail>(`/api/surveys/assignments/${assignment.id}`).then((value) => { setDetail(value); setAnswers(current => Object.keys(current).length ? current : value.draft || {}); setMessage(""); }).catch((error) => setMessage(error.message)); }, [api, assignment.id]);
  const save = async () => { if (!detail) return; setBusy(true); try { await api.request(`/api/surveys/response-sets/${detail.id}/draft`, { method: "PUT", body: { consentVersionId: detail.consentVersionId, answers } }); setMessage("Draft saved securely."); } catch (error) { setMessage(error instanceof Error ? error.message : "Draft could not be saved."); } finally { setBusy(false); } };
  const submit = async () => { if (!detail || !consented) return; setBusy(true); try { await api.request(`/api/surveys/response-sets/${detail.id}/draft`, { method: "PUT", body: { consentVersionId: detail.consentVersionId, answers } }); await api.request(`/api/surveys/response-sets/${detail.id}/submit`, { method: "POST", body: {} }); onSubmitted(); } catch (error) { setMessage(error instanceof Error ? error.message : "Submission could not be completed."); setBusy(false); } };
  const answered = detail?.items.filter((item) => String(answers[item.id] || "").trim()).length || 0;
  const requiredComplete = detail?.items.every((item) => !item.required || String(answers[item.id] || "").trim()) || false;
  return <div className="survey-overlay" role="dialog" aria-modal="true" aria-label={assignment.instrumentName}><section className="survey-workspace"><header><div><p className="kicker">{assignment.waveLabel}</p><h2>{assignment.instrumentName}</h2>{detail?.items.length ? <p>{answered} of {detail.items.length} answered</p> : null}</div><button className="text-button" onClick={onClose}>← Back</button></header>{message ? <p className="form-message" aria-live="polite">{message}</p> : null}{detail ? <>{detail.items.length === 0 ? <div className="release-block"><h3>Content release pending</h3><p>This instrument cannot open until approved wording, permissions, consent, and any scoring key have been loaded into the protected backend.</p></div> : <>{detail.instructions ? <div className="survey-instructions"><h3>Instructions</h3><p>{detail.instructions}</p></div> : null}<div className="consent-card"><h3>{detail.consentTitle}</h3><p>{detail.consentBody}</p><label className="check-row"><input type="checkbox" checked={consented} onChange={(event) => setConsented(event.target.checked)} />I have reviewed this survey information.</label></div><ol className="survey-items">{detail.items.map((item) => <li key={item.id}><fieldset><legend>{item.position}. {item.prompt}</legend>{item.responseType === "text" ? <textarea value={answers[item.id] || ""} onChange={(event) => setAnswers((current) => ({ ...current, [item.id]: event.target.value }))} /> : item.options.map((option) => <label key={option.id}><input type="radio" name={item.id} value={option.value} checked={answers[item.id] === option.value} onChange={(event) => setAnswers((current) => ({ ...current, [item.id]: event.target.value }))} />{option.label}</label>)}</fieldset></li>)}</ol><footer><button className="secondary-button" onClick={save} disabled={busy}>Save draft</button><button className="primary-button" onClick={submit} disabled={busy || !consented || !requiredComplete}>Submit survey</button></footer></>}</> : null}</section></div>;
}

function StudentDashboardView({ dashboard, api, supabase, userId, reload }: { dashboard: StudentDashboard; api: PilotApiClient; supabase: SupabaseClient; userId: string; reload: () => void }) {
  const [view, setView] = usePathwayView<StudentDestination>("student-screen", "home");
  const [survey, setSurvey] = usePathwayView<SurveyAssignmentSummary | null>("student-survey", null);
  const [refreshToken, setRefreshToken] = useState(0);
  const saved = () => setRefreshToken((current) => current + 1);
  return <><nav className="production-tabs production-tabs--scroll" aria-label="Student dashboard">{([['home', 'Home'], ['sessions', 'Sessions'], ['map', 'Pathway Map'], ['vault', 'Vault'], ['portfolio', 'Portfolio'], ['cohort', 'Cohort'], ['advising', 'Advising']] as Array<[StudentDestination, string]>).map(([id, label]) => <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id)}>{label}</button>)}</nav>
    {view === "home" ? <StudentHome dashboard={dashboard} api={api} onNavigate={setView} /> : null}
    {view === "sessions" ? <div className="production-grid"><section className="production-card production-card--wide"><p className="kicker">Next session</p>{dashboard.nextSession ? <><h2>{dashboard.nextSession.title}</h2><p>{new Date(dashboard.nextSession.startsAt).toLocaleString()} · {dashboard.nextSession.format.replace("_", " ")}</p><button className="primary-button" disabled={!dashboard.nextSession.checkInAvailable}>{dashboard.nextSession.checkInAvailable ? "Check in" : "Check-in opens near the session"}</button></> : <><h2>No upcoming session is scheduled.</h2><p>Your program administrator will publish dates here.</p></>}</section><section className="production-card production-card--wide"><div className="section-heading"><div><p className="kicker">Your surveys</p><h2>Choose a named survey to begin.</h2></div><p>Save a draft and return later. Students see completion only, not scores.</p></div><SurveyCards assignments={surveysForAudience(dashboard.surveyAssignments,"student")} onOpen={setSurvey} /></section><section className="production-card"><h2>Attendance history</h2>{dashboard.attendanceHistory.length ? dashboard.attendanceHistory.map((session) => <p key={session.id}><strong>{session.title}</strong><br />{session.attendanceStatus.replace("_", " ")}</p>) : <p>No attendance records yet.</p>}</section></div> : null}
    {view === "map" ? <ProductionPathwayMap api={api} onOpenCohort={() => setView("cohort")} onArtifactSaved={saved} /> : null}
    {view === "vault" ? <StudentVault api={api} refreshToken={refreshToken} /> : null}
    {view === "portfolio" ? <StudentPortfolio dashboard={dashboard} api={api} supabase={supabase} userId={userId} onReload={reload} refreshToken={refreshToken} /> : null}
    {view === "cohort" ? <CohortBoard api={api} /> : null}
    {view === "advising" ? <StudentAdvising api={api} /> : null}
    {survey ? <SurveyWorkspace assignment={survey} api={api} onClose={() => setSurvey(null)} onSubmitted={() => { setSurvey(null); reload(); }} /> : null}</>;
}

function AdvisorDashboardView({ dashboard, api, reload }: { dashboard: AdvisorDashboard; api: PilotApiClient; reload: () => void }) {
  const [view, setView] = usePathwayView<AdvisorView>("advisor-screen", "home");
  const [selectedId, setSelectedId] = useState(dashboard.assignedStudents[0]?.id || "");
  const [survey, setSurvey] = usePathwayView<SurveyAssignmentSummary | null>("advisor-survey", null);
  const [packet, setPacket] = useState<AdvisingPacketDetail | null>(null);
  const [comment, setComment] = useSessionDraft("advisor-comment:"+selectedId, "");
  const [message, setMessage] = useState("");
  const selected = dashboard.assignedStudents.find((student) => student.id === selectedId);
  const loadPacket = useCallback(async (studentId: string) => { if (!studentId) { setPacket(null); return; } try { setPacket(await api.request<AdvisingPacketDetail | null>(`/api/advisor/students/${studentId}/packet`)); setMessage(""); } catch (error) { setPacket(null); setMessage(error instanceof Error ? error.message : "The shared packet could not be loaded."); } }, [api]);
  useEffect(() => {
    if (view !== "students" || !selectedId) return;
    const task = window.setTimeout(() => void loadPacket(selectedId), 0);
    return () => window.clearTimeout(task);
  }, [loadPacket, selectedId, view]);
  const saveComment = async () => { if (!selectedId || !comment.trim()) return; try { setPacket(await api.request<AdvisingPacketDetail>(`/api/advisor/students/${selectedId}/packet`, { method: "POST", body: { comment } })); setComment(""); setMessage("Comment shared with the student."); } catch (error) { setMessage(error instanceof Error ? error.message : "The comment could not be saved."); } };
  return <><nav className="production-tabs" aria-label="Advisor dashboard"><button className={view === "home" ? "active" : ""} onClick={() => setView("home")}>Home</button><button className={view === "students" ? "active" : ""} onClick={() => setView("students")}>Students</button><button className={view === "survey" ? "active" : ""} onClick={() => setView("survey")}>My Survey</button></nav>
    {view === "home" ? <div className="production-grid"><section className="production-card production-card--wide"><RosieGuide pose="idle" compact eyebrow="Advisor home" title="Support students with the context they choose to share." body="Attendance and survey completion are visible automatically. Portfolio artifacts appear only after a student activates an advising share." /><div className="home-action-grid"><button onClick={() => setView("students")}><span>👥</span><strong>Assigned students</strong><small>{dashboard.assignedStudents.length} student{dashboard.assignedStudents.length === 1 ? "" : "s"}</small></button><button onClick={() => setView("survey")}><span>▤</span><strong>My ACCS survey</strong><small>{dashboard.mySurveys[0] ? statusLabels[dashboard.mySurveys[0].status] : "Not assigned"}</small></button></div></section></div> : null}
    {view === "students" ? <div className="production-grid"><section className="production-card production-card--wide"><div className="section-heading"><div><p className="kicker">Assigned students</p><h2>Student support overview</h2></div><label><span>Student</span><select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>{dashboard.assignedStudents.map((student) => <option key={student.id} value={student.id}>{student.displayName} · {student.cohortName}</option>)}</select></label></div>{selected ? <div className="advisor-summary"><article><span>Attendance</span><strong>{selected.attendance.present}/{selected.attendance.expected}</strong></article><article><span>Shared packets</span><strong>{selected.sharedPacketCount}</strong></article>{selected.surveyCompletion.map((item) => <article key={item.instrumentName}><span>{item.instrumentName}</span><strong>{statusLabels[item.status]}</strong>{item.submittedAt?<small>Submitted {new Date(item.submittedAt).toLocaleString()}</small>:null}</article>)}</div> : <p>No students are assigned.</p>}<p className="privacy-note">Completion is visible. Answers, scores, private reflections, contacts, drafts, and unshared Portfolio items are not.</p></section><section className="production-card production-card--wide"><p className="kicker">Student-selected advising packet</p><h2>{packet ? packet.title : "No active share"}</h2>{packet ? <><p>{packet.items.length} item{packet.items.length === 1 ? "" : "s"} shared by {selected?.displayName}.</p><div className="vault-grid">{packet.items.map((item) => <article key={item.id}><span>{item.station}</span><h3>{item.title}</h3><p>{item.content.response}</p></article>)}</div><label><span>Comment or next action</span><textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Write a focused, supportive next action." /></label><button className="primary-button" onClick={saveComment} disabled={!comment.trim()}>Share comment with student</button></> : <p>The student has not shared Portfolio items with you.</p>}<p className="form-message">{message}</p></section></div> : null}
    {view === "survey" ? <section className="production-card production-card--wide"><p className="kicker">My Surveys</p><h2>{advisorInstrumentCatalog[0].name}</h2><SurveyCards assignments={surveysForAudience(dashboard.mySurveys,"advisor")} onOpen={setSurvey} /></section> : null}
    {survey ? <SurveyWorkspace assignment={survey} api={api} onClose={() => setSurvey(null)} onSubmitted={() => { setSurvey(null); reload(); }} /> : null}</>;
}

function formatDuration(minutes: number) {
  if (minutes < 1) return "Under 1 min";
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours ? `${hours} hr${hours === 1 ? "" : "s"}${remainder ? ` ${remainder} min` : ""}` : `${minutes} min`;
}

function AdminUserAccessLog({ api }: { api: PilotApiClient }) {
  const [log, setLog] = useState<UserAccessLog | null>(null);
  const [selectedStudent, setSelectedStudent] = useState("all");
  const [resendingIdentity, setResendingIdentity] = useState<string | null>(null);
  const [message, setMessage] = useState("Loading student access history...");
  const load = useCallback(async () => {
    setMessage("Loading student access history...");
    try {
      const value = await api.request<UserAccessLog>("/api/admin/user-access-log");
      setLog(value);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Access history could not be loaded.");
    }
  }, [api]);
  useEffect(() => {
    // The request resolves asynchronously and synchronizes the secured activity log.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const students = log?.students || [];
  const sessions = (log?.sessions || []).filter((session) => selectedStudent === "all" || session.userId === selectedStudent);
  const visibleStudents = selectedStudent === "all" ? students : students.filter((student) => student.userId === selectedStudent);
  const activeCount = sessions.filter((session) => session.status === "active").length;
  const totalMinutes = visibleStudents.reduce((sum, student) => sum + student.totalMinutes, 0);

  const resend = async (student: UserAccessPerson, email = student.email) => {
    const identityKey = `${student.userId}:${email}`;
    setResendingIdentity(identityKey);
    setMessage(`Resending the invitation to ${email}...`);
    try {
      await api.request("/api/admin/invitations/resend", { method: "POST", body: { userId: student.userId, email } });
      await load();
      setMessage(`A new invitation was sent to ${email}. Delivery can still depend on the recipient's email system.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The invitation could not be resent.");
    } finally {
      setResendingIdentity(null);
    }
  };

  return <section className="production-card production-card--wide access-log">
    <div className="section-heading"><div><p className="kicker">Student access log</p><h2>Account activity by student</h2><p>Session time is an approximation based on sign-in, activity, and sign-out events.</p></div><div className="access-log-controls"><label><span>Student</span><select value={selectedStudent} onChange={(event) => setSelectedStudent(event.target.value)}><option value="all">All students</option>{students.map((student) => <option key={student.userId} value={student.userId}>{student.displayName}</option>)}</select></label><button className="secondary-button" onClick={() => void load()}>Refresh log</button></div></div>
    <div className="admin-counts"><article><strong>{visibleStudents.length}</strong><span>Students</span></article><article><strong>{sessions.length}</strong><span>Tracked sessions</span></article><article><strong>{activeCount}</strong><span>Active now</span></article><article><strong>{formatDuration(totalMinutes)}</strong><span>Approximate time</span></article></div>
    {message ? <p className="form-message" aria-live="polite">{message}</p> : null}
    {log ? <><div className="access-log-table-wrap"><table className="access-log-table"><caption className="sr-only">Student account directory, invitation status, and access totals</caption><thead><tr><th>Student</th><th>Sign-in emails</th><th>Last sign-in</th><th>Sessions</th><th>Time logged in</th><th>Account</th><th>Invitations</th></tr></thead><tbody>{visibleStudents.map((student) => { const identities = student.signInEmails?.length ? student.signInEmails : [{ email: student.email, isPrimary: true, confirmedAt: student.emailConfirmedAt }]; return <tr key={student.userId}><td>{student.displayName}</td><td><strong>{student.email || "Not available"}</strong><small>Primary</small>{student.secondaryEmails?.map((email) => <small key={email}>{email} · Secondary</small>)}</td><td>{student.lastAuthSignInAt ? new Date(student.lastAuthSignInAt).toLocaleString() : "Never"}</td><td>{student.sessionCount}</td><td>{formatDuration(student.totalMinutes)}</td><td><span className="role-chip">{student.accountStatus}</span></td><td><div className="identity-invitations">{identities.map((identity) => { const key = `${student.userId}:${identity.email}`; return <div className="invitation-action" key={identity.email}><span className={`invitation-status${identity.confirmedAt ? " invitation-status--confirmed" : ""}`}>{identity.isPrimary ? "Primary" : "Secondary"}: {identity.confirmedAt ? "Confirmed" : "Awaiting confirmation"}</span>{identity.confirmedAt ? <small>{new Date(identity.confirmedAt).toLocaleString()}</small> : <button className="secondary-button table-action-button" disabled={resendingIdentity === key || !identity.email} onClick={() => void resend(student, identity.email)} aria-label={`Resend invitation to ${identity.email}`}>{resendingIdentity === key ? "Sending..." : "Resend"}</button>}</div>; })}</div></td></tr>; })}</tbody></table></div><h3>Recent sessions</h3>{sessions.length ? <div className="access-log-table-wrap"><table className="access-log-table"><caption className="sr-only">Recent student sessions</caption><thead><tr><th>Student</th><th>Signed in</th><th>Last activity</th><th>Duration</th><th>Status</th></tr></thead><tbody>{sessions.map((session) => <tr key={session.sessionId}><td><strong>{session.displayName}</strong><br /><small>{session.email}</small></td><td>{new Date(session.signedInAt).toLocaleString()}</td><td>{new Date(session.lastActiveAt).toLocaleString()}</td><td>{formatDuration(session.durationMinutes)}</td><td><span className={`access-status access-status--${session.status}`}>{session.status === "active" ? "Active now" : "Ended"}</span></td></tr>)}</tbody></table></div> : <p className="privacy-note">No application sessions have been recorded for this selection yet. Authentication sign-in dates remain visible above.</p>}</> : null}
    <p className="privacy-note">Sign-in history is separate from page analytics. Creator and PI can see page visits and IP addresses retained for 30 days. Staff access requires MFA.</p>
  </section>;
}

function AdminEvaluationResults({ api, audience }: { api: PilotApiClient; audience: "student" | "advisor" }) {
  const [summary, setSummary] = useState<EvaluationSummary | null>(null);
  const [message, setMessage] = useState("Loading quantified survey results...");
  const load = useCallback(async () => { try { setSummary(await api.request<EvaluationSummary>("/api/evaluation/summary")); setMessage(""); } catch (error) { setMessage(error instanceof Error ? error.message : "Quantified results could not be loaded."); } }, [api]);
  useEffect(() => {
    const task = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(task);
  }, [load]);
  const totalSubmissions = summary?.submissions.filter((submission) => submission.audience === audience).length || 0;
  const scoredInstruments = summary?.instruments.filter((instrument) => instrument.audience === audience && instrument.scoreMean !== null) || [];
  const overallMean = scoredInstruments.length ? Number((scoredInstruments.reduce((sum, instrument) => sum + (instrument.scoreMean || 0), 0) / scoredInstruments.length).toFixed(2)) : null;
  const instruments = summary?.instruments.filter((instrument) => instrument.audience === audience) || [];
  const submissions = summary?.submissions.filter((submission) => submission.audience === audience) || [];
  return <section className="production-card production-card--wide evaluation-results"><div className="section-heading"><div><p className="kicker">{audience} evaluation</p><h2>{audience === "student" ? "Student" : "Advisor"} quantified survey results</h2><p>These results support Compass evaluation only. They do not affect recommendations, advising, or admissions preparation.</p></div><button className="secondary-button" onClick={() => void load()}>Refresh results</button></div>{message ? <p className="form-message">{message}</p> : null}{summary ? <><div className="evaluation-summary"><article><strong>{totalSubmissions}</strong><span>Submitted surveys</span></article><article><strong>{instruments.length}</strong><span>Instruments represented</span></article><article><strong>{overallMean ?? "N/A"}</strong><span>Mean across scored instruments</span></article></div><div className="evaluation-chart" role="img" aria-label={`Mean ${audience} survey score by instrument on a five point scale`}>{instruments.map((instrument) => <article key={`${audience}:${instrument.instrumentSlug}`}><div><strong>{instrument.instrumentName}</strong><span>{instrument.submitted} submitted</span></div><div className="evaluation-score-row"><div className="evaluation-meter" aria-label={`${instrument.instrumentName} mean ${instrument.scoreMean ?? "not available"} out of 5`}><i style={{ width: `${((instrument.scoreMean || 0) / 5) * 100}%` }} /></div><b>{instrument.scoreMean ?? "N/A"}</b></div><p>Range {instrument.scoreMin ?? "N/A"} to {instrument.scoreMax ?? "N/A"}{instrument.smallSample ? " · small sample" : ""}</p></article>)}</div>{submissions.length ? <div className="access-log-table-wrap"><table className="access-log-table"><caption className="sr-only">Identifiable quantified survey results</caption><thead><tr><th>Participant</th><th>Instrument</th><th>Wave</th><th>Submitted</th><th>Calculated results</th></tr></thead><tbody>{submissions.map((submission) => <tr key={`${submission.userId}-${submission.instrumentSlug}-${submission.submittedAt}`}><td><strong>{submission.displayName}</strong><br /><small>{submission.email}</small></td><td>{submission.instrumentName}</td><td>{submission.waveLabel}</td><td><time dateTime={submission.submittedAt}>{new Date(submission.submittedAt).toLocaleString()}</time></td><td>{Object.entries(submission.scores).map(([key, value]) => <span className="score-chip" key={key}>{key}: {value}</span>)}</td></tr>)}</tbody></table></div> : <p>No submitted {audience} surveys are available yet.</p>}</> : null}</section>;
}

function AdminSurveyCompletionChart({ completion, audience }: { completion: AdminDashboard["surveyCompletion"]; audience?: "student" | "advisor" }) {
  const rows = audience ? completion.filter((item) => item.audience === audience) : completion;
  return <section className="production-card production-card--wide completion-chart"><div className="section-heading"><div><p className="kicker">Live participation</p><h2>{audience ? `${audience === "student" ? "Student" : "Advisor"} survey completion` : "Survey completion graph"}</h2><p>Assigned and submitted counts update as participants complete integrated surveys.</p></div></div><div className="completion-chart__rows">{rows.map((item) => { const percent = item.assigned ? Math.round((item.submitted / item.assigned) * 100) : 0; return <article key={`${item.audience}:${item.instrumentName}`}><div><strong>{item.instrumentName}</strong><span>{item.submitted} of {item.assigned} submitted</span></div><div className="completion-chart__track" aria-label={`${item.instrumentName} ${percent} percent complete`}><i style={{ width: `${percent}%` }} /></div><b>{percent}%</b></article>; })}{!rows.length ? <p>Survey assignments will appear here when a participant opens their dashboard.</p> : null}</div></section>;
}

function AdminDashboardView({ dashboard, api, context, reload }: { dashboard: AdminDashboard; api: PilotApiClient; context: AuthorizationContext; reload: () => void }) {
  const [view, setView] = usePathwayView<AdminView>("admin-screen", "home");
  const [email, setEmail] = useState("");
  const [secondaryEmail, setSecondaryEmail] = useState("");
  const [role, setRole] = useState<PilotRole>("student");
  const [message, setMessage] = useState("");
  const invite = async (event: React.FormEvent) => { event.preventDefault(); try { await api.request("/api/admin/invitations", { method: "POST", body: { primaryEmail: email, secondaryEmail: secondaryEmail || null, roles: [role] } }); setEmail(""); setSecondaryEmail(""); setMessage(secondaryEmail ? "Invitations sent to both sign-in emails and linked to one account." : "Invitation sent and recorded."); reload(); } catch (error) { setMessage(error instanceof Error ? error.message : "Invitation could not be sent."); } };
  const canViewResults = context.capabilities.some((item) => ["evaluation.identifiable_results", "evaluation.governance"].includes(item));


  return <>
    {view === "home" ? <div className="production-grid"><section className="production-card production-card--wide"><RosieGuide pose="idle" compact eyebrow="Administrator home" title="Run the pilot from one clear starting point." body="Manage people and Sessions, then monitor student and advisor survey programs separately." /><div className="admin-counts"><article><strong>{dashboard.counts.invitedUsers}</strong><span>Invited</span></article><article><strong>{dashboard.counts.activeUsers}</strong><span>Active</span></article><article><strong>{dashboard.counts.cohorts}</strong><span>Cohorts</span></article><article><strong>{dashboard.counts.sessions}</strong><span>Sessions</span></article></div><div className="home-action-grid"><button onClick={() => setView("people")}><span>👥</span><strong>People</strong><small>Invitations and account access</small></button><button onClick={() => setView("sessions")}><span>▦</span><strong>Sessions</strong><small>Schedule and attendance</small></button><button onClick={() => setView("surveys")}><span>▤</span><strong>Survey analytics</strong><small>Separated programs and grant reporting</small></button><button onClick={() => setView("configuration")}><span>⚙</span><strong>Configuration</strong><small>Cohorts, curriculum, and waves</small></button></div></section><AdminSurveyCompletionChart completion={dashboard.surveyCompletion} audience="student" /><AdminSurveyCompletionChart completion={dashboard.surveyCompletion} audience="advisor" />{canViewResults ? <><AdminEvaluationResults api={api} audience="student" /><AdminEvaluationResults api={api} audience="advisor" /></> : null}</div> : null}
    {view === "people" ? <div className="production-grid"><AdminUserAccessLog api={api} /><section className="production-card"><h2>Invite an account</h2><p>Both emails open the same Navigate profile. Use a personal address as a fallback when an institutional filter may block delivery.</p><form className="production-form" onSubmit={invite}><label><span>Primary sign-in email</span><input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label><label><span>Secondary sign-in email <small>Optional</small></span><input type="email" value={secondaryEmail} onChange={(event) => setSecondaryEmail(event.target.value)} /></label><label><span>Initial role</span><select value={role} onChange={(event) => setRole(event.target.value as PilotRole)}><option value="student">Student</option><option value="advisor">Advisor</option><option value="administrator">Administrator</option></select></label><button className="primary-button">Send invitation</button><p className="privacy-note">Invitation subject: “Activate Your Navigate the Pathway Account”</p><p className="form-message" aria-live="polite">{message}</p></form></section></div> : null}
    {view === "sessions" ? <div className="production-grid"><section className="production-card production-card--wide"><p className="kicker">Sessions and Attendance</p><h2>Program session operations</h2><div className="admin-counts"><article><strong>{dashboard.counts.sessions}</strong><span>Sessions</span></article><article><strong>{dashboard.attendanceCorrections}</strong><span>Attendance corrections</span></article></div><p>Attendance corrections remain in the audit history. Session scheduling, check-in windows, and cohort availability are managed from this workspace.</p></section></div> : null}
    {view === "surveys" ? <SurveyAnalyticsCenter api={api} context={context} completion={dashboard.surveyCompletion} /> : null}
    {view === "configuration" ? <div className="production-grid"><section className="production-card"><h2>Curriculum review</h2><p>{dashboard.pendingCurriculumReviews} curriculum references await review.</p></section><section className="production-card"><h2>Survey waves</h2><p>Baseline, midyear, and final waves are scheduled by audience, instrument version, open date, close date, and required status.</p></section><section className="production-card"><h2>Program and cohorts</h2><p>Organization, program, cohort, advisor assignment, and role boundaries are enforced on the server.</p></section></div> : null}
</>;
}

function Dashboard({ session, supabase }: { session: Session; supabase: SupabaseClient }) {
  const baseApi = useMemo(() => new PilotApiClient(supabase), [supabase]);
  const [context, setContext] = useState<AuthorizationContext | null>(null);
  const [role, setRole] = useState<DashboardMode | null>(null);
  const api = useMemo(()=>new PilotApiClient(supabase,role || undefined),[supabase,role]);
  const resetNavigation = useResetPathway();
  const [acknowledgedRole,setAcknowledgedRole] = useState<DashboardMode|null>(null);
  const [adminView] = usePathwayView<AdminView>("admin-screen","home");
  const requestSequence=useRef(0);
  const [dashboard, setDashboard] = useState<PilotDashboard | null>(null);
  const [message, setMessage] = useState("Loading your dashboard...");
  const [contextError, setContextError] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [mfaVerified, setMfaVerified] = useState(false);
  const loadContext = useCallback(async () => {
    setRecovering(true);
    setContextError(false);
    setMessage("Loading your dashboard...");
    try {
      let value: AuthorizationContext;
      try {
        value = await baseApi.request<AuthorizationContext>("/api/me");
      } catch (initialError) {
        const refreshed = await supabase.auth.refreshSession();
        if (refreshed.error || !refreshed.data.session) throw initialError;
        value = await baseApi.request<AuthorizationContext>("/api/me");
      }
      const platform = await baseApi.request<{ memberships: ExperienceMembership[] }>("/api/platform/experiences");
      if (!platform.memberships.some((item) => item.experienceKey === "pathway" && item.status === "active" && item.featureEnabled)) throw new Error("Pathway membership required");
      setContext({ ...value, experienceMemberships: platform.memberships });
      setRole((current) => current && assignedModes(value).includes(current) ? current : assignedModes(value)[0] || null);
      setMessage("");
    } catch {
      setContextError(true);
      setMessage("Your invitation is confirmed, but this browser needs to reconnect to the secure Compass workspace.");
    } finally {
      setRecovering(false);
    }
  }, [baseApi, supabase]);
  useEffect(() => {
    // The request resolves asynchronously and synchronizes remote authorization state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadContext();
  }, [loadContext, session.access_token]);
  const loadDashboard = useCallback(async () => { if (!role) return; const sequence=++requestSequence.current; setMessage("Loading your dashboard..."); try { const value = await api.request<PilotDashboard>(`/api/dashboard?role=${principalMode(role) ? "administrator" : role}`); if(sequence!==requestSequence.current)return; setDashboard(value); setMessage(""); } catch (error) { if(sequence!==requestSequence.current)return; setMessage(error instanceof Error ? error.message : "The dashboard could not be loaded."); } }, [api, role]);
  useEffect(() => {
    if (context && role && (role === "student" || context.authMethod === "sso/saml" || context.aal === "aal2" || mfaVerified)) {
      // The request resolves asynchronously and synchronizes the selected dashboard.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadDashboard();
    }
  }, [context, loadDashboard, mfaVerified, role]);
  useEffect(() => {
    if (!context || !role) return;
    const heartbeat = () => { void api.request("/api/activity/heartbeat", { method: "POST", body: { role } }).catch(() => undefined); };
    heartbeat();
    const interval = window.setInterval(heartbeat, 300_000);
    return () => window.clearInterval(interval);
  }, [api, context, role]);
  const signOut = useCallback(async () => {
    if (role) await api.request("/api/activity/signout", { method: "POST", body: { role } }).catch(() => undefined);
    await supabase.auth.signOut();
  }, [api, role, supabase]);
  if (!context || !role) return <main className="production-auth"><section className="production-auth-card"><RosieGuide pose={contextError ? "idle" : "tracks"} eyebrow="Secure pilot" title={contextError ? "Let’s reconnect your dashboard." : "Preparing your dashboard..."} body={message} />{contextError ? <div className="production-recovery" aria-live="polite"><button className="primary-button" onClick={() => void loadContext()} disabled={recovering}>{recovering ? "Reconnecting..." : "Retry secure connection"}</button><button className="text-button" onClick={() => void supabase.auth.signOut()} disabled={recovering}>Sign out</button><p>Your account and Compass roles are already active. Retrying refreshes only this browser session.</p></div> : null}</section></main>;
  if (role !== "student" && context.authMethod !== "sso/saml" && context.aal !== "aal2" && !mfaVerified) return <MfaGate supabase={supabase} onVerified={() => { setMfaVerified(true); void loadContext(); }} />;
  const effectiveContext = modeContext(context,role);
  return <div className="production-shell"><AppHeader context={context} role={role} api={api} onReview={()=>setAcknowledgedRole(null)} onRole={(next) => { requestSequence.current++; resetNavigation(); setRole(next); setDashboard(null); }} onSignOut={() => void signOut()} /><main className="production-main"><WorkspaceBack /><div className="production-welcome"><p className="kicker">{modeLabels[role]} dashboard</p><h1>{role === "student" ? "Your pathway home." : role === "advisor" ? "Your advising home." : principalMode(role) ? "Govern your program." : "Your program home."}</h1></div>{message ? <p className="form-message" aria-live="polite">{message}</p> : null}<WorkspaceHub key={role} api={api} context={effectiveContext} activeRole={role}>{dashboard && role === "student" ? <StudentDashboardView dashboard={dashboard as StudentDashboard} api={api} supabase={supabase} userId={context.userId} reload={loadDashboard} /> : dashboard && role === "advisor" ? <AdvisorDashboardView dashboard={dashboard as AdvisorDashboard} api={api} reload={loadDashboard} /> : principalMode(role) && adminView === "home" ? <CreatorControls api={api} context={effectiveContext} /> : dashboard && (role === "administrator" || principalMode(role)) ? <AdminDashboardView dashboard={dashboard as AdminDashboard} api={api} context={effectiveContext} reload={loadDashboard} /> : null}</WorkspaceHub></main>{acknowledgedRole !== role ? <RolePrivileges mode={role} context={effectiveContext} onDone={()=>setAcknowledgedRole(role)} /> : null}</div>;
}

function PathwaySyntheticPreview() {
  const [persona, setPersonaState] = useState<SyntheticPersonaKey>(() => getSyntheticPreviewPersona());
  const context = syntheticContextForPersona(persona);
  const memberships = syntheticMembershipsForPersona(persona);
  const pathway = memberships.find((item) => item.experienceKey === "pathway");
  useCreatorPreviewTimeTracking(true, persona, "pathway", "home");
  useEffect(() => {
    const update = (event: Event) => setPersonaState((event as CustomEvent<SyntheticPersonaKey>).detail || getSyntheticPreviewPersona());
    window.addEventListener("navigate:preview-persona", update);
    return () => window.removeEventListener("navigate:preview-persona", update);
  }, []);
  useEffect(() => {
    if (!pathway) {
      const target = SYNTHETIC_PERSONAS.find((item) => item.key === persona)?.defaultPath || "/app/compass";
      window.location.replace(target);
      return;
    }
    rememberWorkspace(syntheticPreviewApi, "pathway", true);
  }, [pathway, persona]);
  const exit = () => { clearSyntheticPreview(); window.location.assign("/app"); };
  if (!pathway) return null;
  const student = persona === "pathway_student";
  return <div className="production-shell"><CreatorPreviewBanner persona={persona} onPersona={setSyntheticPreviewPersona} onExit={exit} tutorialWorkspace="pathway" /><header className="production-header"><div className="production-brand"><img src={assetUrl("/assets/navigate-pathway-mark.svg")} alt="" /><span>Navigate The Pathway</span></div><WorkspaceSwitcher api={syntheticPreviewApi} memberships={memberships} current="pathway" previewMode /><div className="production-account"><span>{context.displayName}</span><button className="text-button" onClick={exit}>Exit preview</button></div></header><main className="production-main"><div className="production-welcome"><p className="kicker">{student ? "Pre-med student · Pathway only" : "Platform Creator"}</p><h1>{student ? "Your pathway home." : "Pathway governance preview."}</h1><p>{student ? "Only your sessions, portfolio, cohort spaces, and advising activity appear in this role." : "Creator access spans the platform while every workspace keeps its own records and authorization checks."}</p></div><div className="production-grid">{student ? <><section className="production-card" data-tutorial-id="pathway-session"><h2>Next session</h2><p><strong>Application Story Lab</strong></p><p>September 18 · 5:30 PM · Online</p><button className="primary-button">Open session</button></section><section className="production-card" data-tutorial-id="pathway-portfolio"><h2>Your portfolio</h2><p>Three private artifacts and one advisor-shared reflection.</p><button className="secondary-button">Open my portfolio</button></section></> : <><section className="production-card"><h2>Creator controls</h2><p>Review configuration and synthetic reporting without granting the simulated user additional workspace roles.</p></section><section className="production-card"><h2>Permission boundary</h2><p>Use the Creator Preview selector above to enter a student role. Staff data is removed before that dashboard receives a response.</p></section></>}</div></main></div>;
}

export function ProductionPilotApp() {
  const [previewMode] = useState(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("preview") === "pathway") {
      activateSyntheticPreview("pathway_student", "pathway");
      return true;
    }
    return isSyntheticPreviewActive();
  });
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [configurationError, setConfigurationError] = useState(false);
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => {
    if (previewMode) return;
    loadProductionConfiguration().then(() => {
      const configuredClient = getSupabaseBrowserClient();
      if (!configuredClient) throw new Error("Secure setup is not connected yet.");
      setSupabase(configuredClient);
    }).catch(() => setConfigurationError(true));
  }, [previewMode]);
  useEffect(() => {
    if (!supabase || previewMode) return;
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthState(data.session ? "signed_in" : "signed_out"); });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => { setSession(nextSession); setAuthState(nextSession ? "signed_in" : "signed_out"); });
    return () => data.subscription.unsubscribe();
  }, [previewMode, supabase]);
  if (previewMode) return <PathwaySyntheticPreview />;
  if (configurationError) return <ConfigurationRequired />;
  if (!supabase) return <main className="production-auth"><section className="production-auth-card"><RosieGuide pose="tracks" eyebrow="Navigate The Pathway" title="Connecting your secure pathway..." /></section></main>;
  if (authState === "loading") return <main className="production-auth"><section className="production-auth-card"><RosieGuide pose="tracks" eyebrow="Navigate The Pathway" title="Opening your secure pathway..." /></section></main>;
  if (authState === "signed_out" || !session) return <SignIn supabase={supabase} />;
  return <WorkspaceNavigation key={session.user.id}><Dashboard session={session} supabase={supabase} /></WorkspaceNavigation>;
}


