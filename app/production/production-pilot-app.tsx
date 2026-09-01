"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AuthMFAEnrollResponse, Session, SupabaseClient } from "@supabase/supabase-js";
import { assetUrl } from "../asset-url";
import { RosieGuide } from "../components/rosie-guide";
import { PilotApiClient } from "./api-client";
import { advisorInstrumentCatalog, type PilotRole } from "./catalog";
import { ProductionPathwayMap } from "./production-pathway-map";
import { CohortBoard, StudentAdvising, StudentHome, StudentPortfolio, StudentVault, type StudentDestination } from "./production-student-tools";
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
} from "./types";

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

function AppHeader({ context, role, onRole, onSignOut }: { context: AuthorizationContext; role: PilotRole; onRole: (role: PilotRole) => void; onSignOut: () => void }) {
  return <header className="production-header"><a className="production-brand" href="/app"><img src={assetUrl("/assets/navigate-pathway-mark.svg")} alt="" /><span>Navigate The Pathway</span></a><div className="production-account"><span>{context.displayName}</span>{context.roles.length > 1 ? <label><span className="sr-only">Dashboard</span><select value={role} onChange={(event) => onRole(event.target.value as PilotRole)}>{context.roles.map((item) => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}</select></label> : <span className="role-chip">{role}</span>}<button className="text-button" onClick={onSignOut}>Sign out</button></div></header>;
}

function ConfigurationRequired() {
  return <main className="production-auth"><section className="production-auth-card"><RosieGuide pose="idle" eyebrow="Production pilot" title="Secure setup is not connected yet." body="The application shell is ready. Supabase and the pilot API must be configured before invitations can be sent." priority /><div className="production-checklist"><p><strong>Public demonstration:</strong> remains separate and fictional.</p><p><strong>Production records:</strong> will be stored only in Supabase.</p><p><strong>Survey wording:</strong> stays protected until permissions and PI approval are documented.</p></div></section></main>;
}

function SignIn({ supabase }: { supabase: SupabaseClient }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const signIn = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false); setMessage(error ? "We could not sign you in. Check your invitation email or password." : "Signed in.");
  };
  const reset = async () => {
    if (!email.trim()) { setMessage("Enter your invited email address first."); return; }
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/app` });
    setBusy(false); setMessage(error ? "The reset message could not be sent." : "Check your email for a secure password link.");
  };
  return <main className="production-auth"><section className="production-auth-card"><div className="production-auth-identity"><img src={assetUrl("/assets/navigate-pathway-mark.svg")} alt="Navigate The Pathway" /><div><p className="kicker">Invite-only pilot</p><h1>Welcome back.</h1></div></div><RosieGuide pose="idle" compact eyebrow="Rosie" title="Use the email address from your invitation." body="Advisor and administrator accounts will also verify a second factor." /><form className="production-form" onSubmit={signIn}><label><span>Email</span><input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label><label><span>Password</span><input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label><button className="primary-button" disabled={busy}>{busy ? "Checking..." : "Sign in"}</button><button type="button" className="text-button" onClick={reset} disabled={busy}>Set or reset password</button><p className="form-message" aria-live="polite">{message}</p></form><p className="privacy-note">This is an educational pilot, not an admissions portal. Access is limited to invited participants.</p></section></main>;
}

function MfaGate({ supabase, onVerified }: { supabase: SupabaseClient; onVerified: () => void }) {
  const [enrollment, setEnrollment] = useState<AuthMFAEnrollResponse["data"] | null>(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const begin = async () => {
    setBusy(true); setMessage("");
    const factors = await supabase.auth.mfa.listFactors();
    const verified = factors.data?.totp.find((factor) => factor.status === "verified");
    if (verified) { setEnrollment({ id: verified.id, type: "totp", totp: { qr_code: "", secret: "", uri: "" }, friendly_name: verified.friendly_name }); setBusy(false); return; }
    const result = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Navigate the Pathway" });
    setBusy(false);
    if (result.error) setMessage("A second factor could not be prepared. Contact the pilot administrator."); else setEnrollment(result.data);
  };
  const verify = async () => {
    if (!enrollment || code.length < 6) return;
    setBusy(true); setMessage("");
    const challenge = await supabase.auth.mfa.challenge({ factorId: enrollment.id });
    if (challenge.error) { setBusy(false); setMessage("The verification request could not be started."); return; }
    const result = await supabase.auth.mfa.verify({ factorId: enrollment.id, challengeId: challenge.data.id, code });
    setBusy(false);
    if (result.error) setMessage("That code was not accepted. Try the current code from your authenticator."); else onVerified();
  };
  return <main className="production-auth"><section className="production-auth-card"><RosieGuide pose="idle" eyebrow="Staff security" title="Verify your second factor." body="Advisor and administrator dashboards require an authenticator code before student information is available." priority />{!enrollment ? <button className="primary-button" onClick={begin} disabled={busy}>{busy ? "Preparing..." : "Set up or verify MFA"}</button> : <div className="production-form">{enrollment.totp.qr_code ? <div className="mfa-qr" dangerouslySetInnerHTML={{ __html: enrollment.totp.qr_code }} /> : null}<label><span>Six-digit code</span><input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} /></label><button className="primary-button" onClick={verify} disabled={busy || code.length !== 6}>Verify</button></div>}<p className="form-message" aria-live="polite">{message}</p></section></main>;
}

function SurveyCards({ assignments, onOpen }: { assignments: SurveyAssignmentSummary[]; onOpen: (assignment: SurveyAssignmentSummary) => void }) {
  return <div className="survey-card-grid">{assignments.map((assignment) => <article className="survey-card" key={assignment.id}><div><span>{assignment.waveLabel}</span>{assignment.required ? <strong>Required</strong> : null}</div><h3>{assignment.instrumentName}</h3><p>{assignment.itemCount} rating items{assignment.openResponseCount ? ` and ${assignment.openResponseCount} open responses` : ""}</p><button className={assignment.status === "not_started" || assignment.status === "in_progress" ? "primary-button" : "secondary-button"} disabled={["not_available", "closed", "submitted"].includes(assignment.status)} onClick={() => onOpen(assignment)}>{statusLabels[assignment.status]}</button></article>)}</div>;
}

function SurveyWorkspace({ assignment, api, onClose, onSubmitted }: { assignment: SurveyAssignmentSummary; api: PilotApiClient; onClose: () => void; onSubmitted: () => void }) {
  const [detail, setDetail] = useState<SurveyAssignmentDetail | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [consented, setConsented] = useState(false);
  const [message, setMessage] = useState("Loading...");
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.request<SurveyAssignmentDetail>(`/api/surveys/assignments/${assignment.id}`).then((value) => { setDetail(value); setAnswers(value.draft || {}); setMessage(""); }).catch((error) => setMessage(error.message)); }, [api, assignment.id]);
  const save = async () => { if (!detail) return; setBusy(true); try { await api.request(`/api/surveys/response-sets/${detail.id}/draft`, { method: "PUT", body: { consentVersionId: detail.consentVersionId, answers } }); setMessage("Draft saved securely."); } catch (error) { setMessage(error instanceof Error ? error.message : "Draft could not be saved."); } finally { setBusy(false); } };
  const submit = async () => { if (!detail || !consented) return; setBusy(true); try { await api.request(`/api/surveys/response-sets/${detail.id}/draft`, { method: "PUT", body: { consentVersionId: detail.consentVersionId, answers } }); await api.request(`/api/surveys/response-sets/${detail.id}/submit`, { method: "POST", body: {} }); onSubmitted(); } catch (error) { setMessage(error instanceof Error ? error.message : "Submission could not be completed."); setBusy(false); } };
  const answered = detail?.items.filter((item) => String(answers[item.id] || "").trim()).length || 0;
  const requiredComplete = detail?.items.every((item) => !item.required || String(answers[item.id] || "").trim()) || false;
  return <div className="survey-overlay" role="dialog" aria-modal="true" aria-label={assignment.instrumentName}><section className="survey-workspace"><header><div><p className="kicker">{assignment.waveLabel}</p><h2>{assignment.instrumentName}</h2>{detail?.items.length ? <p>{answered} of {detail.items.length} answered</p> : null}</div><button className="text-button" onClick={onClose}>Close</button></header>{message ? <p className="form-message" aria-live="polite">{message}</p> : null}{detail ? <>{detail.items.length === 0 ? <div className="release-block"><h3>Content release pending</h3><p>This instrument cannot open until approved wording, permissions, consent, and any scoring key have been loaded into the protected backend.</p></div> : <>{detail.instructions ? <div className="survey-instructions"><h3>Instructions</h3><p>{detail.instructions}</p></div> : null}<div className="consent-card"><h3>{detail.consentTitle}</h3><p>{detail.consentBody}</p><label className="check-row"><input type="checkbox" checked={consented} onChange={(event) => setConsented(event.target.checked)} />I have reviewed this survey information.</label></div><ol className="survey-items">{detail.items.map((item) => <li key={item.id}><fieldset><legend>{item.position}. {item.prompt}</legend>{item.responseType === "text" ? <textarea value={answers[item.id] || ""} onChange={(event) => setAnswers((current) => ({ ...current, [item.id]: event.target.value }))} /> : item.options.map((option) => <label key={option.id}><input type="radio" name={item.id} value={option.value} checked={answers[item.id] === option.value} onChange={(event) => setAnswers((current) => ({ ...current, [item.id]: event.target.value }))} />{option.label}</label>)}</fieldset></li>)}</ol><footer><button className="secondary-button" onClick={save} disabled={busy}>Save draft</button><button className="primary-button" onClick={submit} disabled={busy || !consented || !requiredComplete}>Submit survey</button></footer></>}</> : null}</section></div>;
}

function StudentDashboardView({ dashboard, api, supabase, userId, reload }: { dashboard: StudentDashboard; api: PilotApiClient; supabase: SupabaseClient; userId: string; reload: () => void }) {
  const [view, setView] = useState<StudentDestination>("home");
  const [survey, setSurvey] = useState<SurveyAssignmentSummary | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const saved = () => setRefreshToken((current) => current + 1);
  return <><nav className="production-tabs production-tabs--scroll" aria-label="Student dashboard">{([['home', 'Home'], ['sessions', 'Sessions'], ['map', 'Pathway Map'], ['vault', 'Vault'], ['portfolio', 'Portfolio'], ['cohort', 'Cohort'], ['advising', 'Advising']] as Array<[StudentDestination, string]>).map(([id, label]) => <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id)}>{label}</button>)}</nav>
    {view === "home" ? <StudentHome dashboard={dashboard} api={api} onNavigate={setView} /> : null}
    {view === "sessions" ? <div className="production-grid"><section className="production-card production-card--wide"><p className="kicker">Next session</p>{dashboard.nextSession ? <><h2>{dashboard.nextSession.title}</h2><p>{new Date(dashboard.nextSession.startsAt).toLocaleString()} · {dashboard.nextSession.format.replace("_", " ")}</p><button className="primary-button" disabled={!dashboard.nextSession.checkInAvailable}>{dashboard.nextSession.checkInAvailable ? "Check in" : "Check-in opens near the session"}</button></> : <><h2>No upcoming session is scheduled.</h2><p>Your program administrator will publish dates here.</p></>}</section><section className="production-card production-card--wide"><div className="section-heading"><div><p className="kicker">Your surveys</p><h2>Choose a named survey to begin.</h2></div><p>Save a draft and return later. Students see completion only, not scores.</p></div><SurveyCards assignments={dashboard.surveyAssignments} onOpen={setSurvey} /></section><section className="production-card"><h2>Attendance history</h2>{dashboard.attendanceHistory.length ? dashboard.attendanceHistory.map((session) => <p key={session.id}><strong>{session.title}</strong><br />{session.attendanceStatus.replace("_", " ")}</p>) : <p>No attendance records yet.</p>}</section></div> : null}
    {view === "map" ? <ProductionPathwayMap api={api} onOpenCohort={() => setView("cohort")} onArtifactSaved={saved} /> : null}
    {view === "vault" ? <StudentVault api={api} refreshToken={refreshToken} /> : null}
    {view === "portfolio" ? <StudentPortfolio dashboard={dashboard} api={api} supabase={supabase} userId={userId} onReload={reload} refreshToken={refreshToken} /> : null}
    {view === "cohort" ? <CohortBoard api={api} /> : null}
    {view === "advising" ? <StudentAdvising api={api} /> : null}
    {survey ? <SurveyWorkspace assignment={survey} api={api} onClose={() => setSurvey(null)} onSubmitted={() => { setSurvey(null); reload(); }} /> : null}</>;
}

function AdvisorDashboardView({ dashboard, api, reload }: { dashboard: AdvisorDashboard; api: PilotApiClient; reload: () => void }) {
  const [view, setView] = useState<AdvisorView>("home");
  const [selectedId, setSelectedId] = useState(dashboard.assignedStudents[0]?.id || "");
  const [survey, setSurvey] = useState<SurveyAssignmentSummary | null>(null);
  const [packet, setPacket] = useState<AdvisingPacketDetail | null>(null);
  const [comment, setComment] = useState("");
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
    {view === "students" ? <div className="production-grid"><section className="production-card production-card--wide"><div className="section-heading"><div><p className="kicker">Assigned students</p><h2>Student support overview</h2></div><label><span>Student</span><select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>{dashboard.assignedStudents.map((student) => <option key={student.id} value={student.id}>{student.displayName} · {student.cohortName}</option>)}</select></label></div>{selected ? <div className="advisor-summary"><article><span>Attendance</span><strong>{selected.attendance.present}/{selected.attendance.expected}</strong></article><article><span>Shared packets</span><strong>{selected.sharedPacketCount}</strong></article>{selected.surveyCompletion.map((item) => <article key={item.instrumentName}><span>{item.instrumentName}</span><strong>{statusLabels[item.status]}</strong></article>)}</div> : <p>No students are assigned.</p>}<p className="privacy-note">Completion is visible. Answers, scores, private reflections, contacts, drafts, and unshared Portfolio items are not.</p></section><section className="production-card production-card--wide"><p className="kicker">Student-selected advising packet</p><h2>{packet ? packet.title : "No active share"}</h2>{packet ? <><p>{packet.items.length} item{packet.items.length === 1 ? "" : "s"} shared by {selected?.displayName}.</p><div className="vault-grid">{packet.items.map((item) => <article key={item.id}><span>{item.station}</span><h3>{item.title}</h3><p>{item.content.response}</p></article>)}</div><label><span>Comment or next action</span><textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Write a focused, supportive next action." /></label><button className="primary-button" onClick={saveComment} disabled={!comment.trim()}>Share comment with student</button></> : <p>The student has not shared Portfolio items with you.</p>}<p className="form-message">{message}</p></section></div> : null}
    {view === "survey" ? <section className="production-card production-card--wide"><p className="kicker">My Surveys</p><h2>{advisorInstrumentCatalog[0].name}</h2><SurveyCards assignments={dashboard.mySurveys} onOpen={setSurvey} /></section> : null}
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
  const [resendingUserId, setResendingUserId] = useState<string | null>(null);
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

  const resend = async (student: UserAccessStudent) => {
    setResendingUserId(student.userId);
    setMessage(`Resending the invitation to ${student.email}...`);
    try {
      await api.request("/api/admin/invitations/resend", { method: "POST", body: { userId: student.userId } });
      await load();
      setMessage(`A new invitation was sent to ${student.email}. Delivery can still depend on the recipient's email system.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The invitation could not be resent.");
    } finally {
      setResendingUserId(null);
    }
  };

  return <section className="production-card production-card--wide access-log">
    <div className="section-heading"><div><p className="kicker">Student access log</p><h2>Account activity by student</h2><p>Session time is an approximation based on sign-in, activity, and sign-out events.</p></div><div className="access-log-controls"><label><span>Student</span><select value={selectedStudent} onChange={(event) => setSelectedStudent(event.target.value)}><option value="all">All students</option>{students.map((student) => <option key={student.userId} value={student.userId}>{student.displayName}</option>)}</select></label><button className="secondary-button" onClick={() => void load()}>Refresh log</button></div></div>
    <div className="admin-counts"><article><strong>{visibleStudents.length}</strong><span>Students</span></article><article><strong>{sessions.length}</strong><span>Tracked sessions</span></article><article><strong>{activeCount}</strong><span>Active now</span></article><article><strong>{formatDuration(totalMinutes)}</strong><span>Approximate time</span></article></div>
    {message ? <p className="form-message" aria-live="polite">{message}</p> : null}
    {log ? <><div className="access-log-table-wrap"><table className="access-log-table"><caption className="sr-only">Student account directory, invitation status, and access totals</caption><thead><tr><th>Student</th><th>Email</th><th>Last sign-in</th><th>Sessions</th><th>Time logged in</th><th>Account</th><th>Invitation</th></tr></thead><tbody>{visibleStudents.map((student) => <tr key={student.userId}><td>{student.displayName}</td><td>{student.email || "Not available"}</td><td>{student.lastAuthSignInAt ? new Date(student.lastAuthSignInAt).toLocaleString() : "Never"}</td><td>{student.sessionCount}</td><td>{formatDuration(student.totalMinutes)}</td><td><span className="role-chip">{student.accountStatus}</span></td><td>{student.emailConfirmedAt ? <><span className="invitation-status invitation-status--confirmed">Confirmed</span><small>{new Date(student.emailConfirmedAt).toLocaleString()}</small></> : <div className="invitation-action"><span className="invitation-status">Awaiting confirmation</span>{student.lastInvitationSentAt ? <small>Last sent {new Date(student.lastInvitationSentAt).toLocaleString()}</small> : null}<button className="secondary-button table-action-button" disabled={resendingUserId === student.userId || !student.email} onClick={() => void resend(student)} aria-label={`Resend invitation to ${student.email}`}>{resendingUserId === student.userId ? "Sending..." : "Resend invitation"}</button></div>}</td></tr>)}</tbody></table></div><h3>Recent sessions</h3>{sessions.length ? <div className="access-log-table-wrap"><table className="access-log-table"><caption className="sr-only">Recent student sessions</caption><thead><tr><th>Student</th><th>Signed in</th><th>Last activity</th><th>Duration</th><th>Status</th></tr></thead><tbody>{sessions.map((session) => <tr key={session.sessionId}><td><strong>{session.displayName}</strong><br /><small>{session.email}</small></td><td>{new Date(session.signedInAt).toLocaleString()}</td><td>{new Date(session.lastActiveAt).toLocaleString()}</td><td>{formatDuration(session.durationMinutes)}</td><td><span className={`access-status access-status--${session.status}`}>{session.status === "active" ? "Active now" : "Ended"}</span></td></tr>)}</tbody></table></div> : <p className="privacy-note">No application sessions have been recorded for this selection yet. Authentication sign-in dates remain visible above.</p>}</> : null}
    <p className="privacy-note">This log does not collect IP addresses, precise location, or device fingerprints. Administrator access requires staff MFA.</p>
  </section>;
}

function AdminEvaluationResults({ api }: { api: PilotApiClient }) {
  const [summary, setSummary] = useState<EvaluationSummary | null>(null);
  const [message, setMessage] = useState("Loading quantified survey results...");
  const load = useCallback(async () => { try { setSummary(await api.request<EvaluationSummary>("/api/evaluation/summary")); setMessage(""); } catch (error) { setMessage(error instanceof Error ? error.message : "Quantified results could not be loaded."); } }, [api]);
  useEffect(() => {
    const task = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(task);
  }, [load]);
  const totalSubmissions = summary?.submissions.length || 0;
  const scoredInstruments = summary?.instruments.filter((instrument) => instrument.scoreMean !== null) || [];
  const overallMean = scoredInstruments.length ? Number((scoredInstruments.reduce((sum, instrument) => sum + (instrument.scoreMean || 0), 0) / scoredInstruments.length).toFixed(2)) : null;
  return <section className="production-card production-card--wide evaluation-results"><div className="section-heading"><div><p className="kicker">Evaluation-authorized view</p><h2>Quantified survey results</h2><p>These scores support pilot evaluation only. They do not affect student recommendations or advising access.</p></div><button className="secondary-button" onClick={() => void load()}>Refresh results</button></div>{message ? <p className="form-message">{message}</p> : null}{summary ? <><div className="evaluation-summary"><article><strong>{totalSubmissions}</strong><span>Submitted surveys</span></article><article><strong>{summary.instruments.length}</strong><span>Instruments represented</span></article><article><strong>{overallMean ?? "N/A"}</strong><span>Mean across instruments</span></article></div><div className="evaluation-chart" role="img" aria-label="Mean survey score by instrument on a five point scale">{summary.instruments.map((instrument) => <article key={instrument.instrumentSlug}><div><strong>{instrument.instrumentName}</strong><span>{instrument.submitted} submitted</span></div><div className="evaluation-score-row"><div className="evaluation-meter" aria-label={`${instrument.instrumentName} mean ${instrument.scoreMean ?? "not available"} out of 5`}><i style={{ width: `${((instrument.scoreMean || 0) / 5) * 100}%` }} /></div><b>{instrument.scoreMean ?? "N/A"}</b></div><p>Range {instrument.scoreMin ?? "N/A"} to {instrument.scoreMax ?? "N/A"} on a five point scale</p></article>)}</div>{summary.submissions.length ? <div className="access-log-table-wrap"><table className="access-log-table"><caption className="sr-only">Identifiable quantified survey results</caption><thead><tr><th>Participant</th><th>Instrument</th><th>Submitted</th><th>Calculated results</th></tr></thead><tbody>{summary.submissions.map((submission) => <tr key={`${submission.userId}-${submission.instrumentSlug}-${submission.submittedAt}`}><td><strong>{submission.displayName}</strong><br /><small>{submission.email}</small></td><td>{submission.instrumentName}</td><td>{new Date(submission.submittedAt).toLocaleString()}</td><td>{Object.entries(submission.scores).map(([key, value]) => <span className="score-chip" key={key}>{key}: {value}</span>)}</td></tr>)}</tbody></table></div> : <p>No submitted surveys are available yet. Complete one from the Student Sessions dashboard to populate this graph.</p>}</> : null}</section>;
}

function AdminSurveyCompletionChart({ completion }: { completion: AdminDashboard["surveyCompletion"] }) {
  return <section className="production-card production-card--wide completion-chart"><div className="section-heading"><div><p className="kicker">Live participation</p><h2>Survey completion graph</h2><p>Assigned and submitted counts update as participants complete integrated surveys.</p></div></div><div className="completion-chart__rows">{completion.map((item) => { const percent = item.assigned ? Math.round((item.submitted / item.assigned) * 100) : 0; return <article key={item.instrumentName}><div><strong>{item.instrumentName}</strong><span>{item.submitted} of {item.assigned} submitted</span></div><div className="completion-chart__track" aria-label={`${item.instrumentName} ${percent} percent complete`}><i style={{ width: `${percent}%` }} /></div><b>{percent}%</b></article>; })}{!completion.length ? <p>Survey assignments will appear here when a student or advisor opens their dashboard.</p> : null}</div></section>;
}

function AdminDashboardView({ dashboard, api, canViewResults, reload }: { dashboard: AdminDashboard; api: PilotApiClient; canViewResults: boolean; reload: () => void }) {
  const [view, setView] = useState<AdminView>("home");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<PilotRole>("student");
  const [message, setMessage] = useState("");
  const invite = async (event: React.FormEvent) => { event.preventDefault(); try { await api.request("/api/admin/invitations", { method: "POST", body: { email, roles: [role] } }); setEmail(""); setMessage("Invitation sent and recorded."); reload(); } catch (error) { setMessage(error instanceof Error ? error.message : "Invitation could not be sent."); } };
  return <><nav className="production-tabs production-tabs--scroll" aria-label="Administrator dashboard">{([['home', 'Home'], ['people', 'People'], ['sessions', 'Sessions'], ['surveys', 'Surveys'], ['configuration', 'Configuration']] as Array<[AdminView, string]>).map(([id, label]) => <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id)}>{label}</button>)}</nav>
    {view === "home" ? <div className="production-grid"><section className="production-card production-card--wide"><RosieGuide pose="idle" compact eyebrow="Administrator home" title="Run the pilot from one clear starting point." body="Use the dashboard destinations to manage people, review Sessions, monitor survey completion, and maintain program configuration." /><div className="admin-counts"><article><strong>{dashboard.counts.invitedUsers}</strong><span>Invited</span></article><article><strong>{dashboard.counts.activeUsers}</strong><span>Active</span></article><article><strong>{dashboard.counts.cohorts}</strong><span>Cohorts</span></article><article><strong>{dashboard.counts.sessions}</strong><span>Sessions</span></article></div><div className="home-action-grid"><button onClick={() => setView("people")}><span>👥</span><strong>People</strong><small>Invitations and student access</small></button><button onClick={() => setView("sessions")}><span>▦</span><strong>Sessions</strong><small>Schedule and attendance</small></button><button onClick={() => setView("surveys")}><span>▤</span><strong>Surveys</strong><small>Completion and quantified results</small></button><button onClick={() => setView("configuration")}><span>⚙</span><strong>Configuration</strong><small>Cohorts, curriculum, and waves</small></button></div></section><AdminSurveyCompletionChart completion={dashboard.surveyCompletion} />{canViewResults ? <AdminEvaluationResults api={api} /> : null}</div> : null}
    {view === "people" ? <div className="production-grid"><AdminUserAccessLog api={api} /><section className="production-card"><h2>Invite an account</h2><form className="production-form" onSubmit={invite}><label><span>Verified email</span><input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label><label><span>Initial role</span><select value={role} onChange={(event) => setRole(event.target.value as PilotRole)}><option value="student">Student</option><option value="advisor">Advisor</option><option value="administrator">Administrator</option></select></label><button className="primary-button">Send invitation</button><p className="form-message" aria-live="polite">{message}</p></form></section></div> : null}
    {view === "sessions" ? <div className="production-grid"><section className="production-card production-card--wide"><p className="kicker">Sessions and Attendance</p><h2>Program session operations</h2><div className="admin-counts"><article><strong>{dashboard.counts.sessions}</strong><span>Sessions</span></article><article><strong>{dashboard.attendanceCorrections}</strong><span>Attendance corrections</span></article></div><p>Attendance corrections remain in the audit history. Session scheduling, check-in windows, and cohort availability are managed from this workspace.</p></section></div> : null}
    {view === "surveys" ? <div className="production-grid"><section className="production-card production-card--wide"><div className="section-heading"><div><p className="kicker">Survey operations</p><h2>Completion by instrument</h2></div><p>Students and advisors see completion only.</p></div><div className="survey-completion-grid">{dashboard.surveyCompletion.map((item) => <article key={item.instrumentName}><strong>{item.instrumentName}</strong><span>{item.submitted}/{item.assigned} submitted</span><div><i style={{ width: `${item.assigned ? (item.submitted / item.assigned) * 100 : 0}%` }} /></div></article>)}</div></section>{canViewResults ? <AdminEvaluationResults api={api} /> : <section className="production-card production-card--wide"><p className="privacy-note">Identifiable and quantified results require the separate evaluation permission.</p></section>}</div> : null}
    {view === "configuration" ? <div className="production-grid"><section className="production-card"><h2>Curriculum review</h2><p>{dashboard.pendingCurriculumReviews} curriculum references await review.</p></section><section className="production-card"><h2>Survey waves</h2><p>Instrument version, audience, required status, open date, and close date are configured per wave. No schedule is hardcoded.</p></section><section className="production-card"><h2>Program and cohorts</h2><p>Organization, program, cohort, advisor assignment, and role boundaries are enforced on the server.</p></section></div> : null}</>;
}

function Dashboard({ session, supabase }: { session: Session; supabase: SupabaseClient }) {
  const api = useMemo(() => new PilotApiClient(supabase), [supabase]);
  const [context, setContext] = useState<AuthorizationContext | null>(null);
  const [role, setRole] = useState<PilotRole | null>(null);
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
        value = await api.request<AuthorizationContext>("/api/me");
      } catch (initialError) {
        const refreshed = await supabase.auth.refreshSession();
        if (refreshed.error || !refreshed.data.session) throw initialError;
        value = await api.request<AuthorizationContext>("/api/me");
      }
      setContext(value);
      setRole((current) => current && value.roles.includes(current)
        ? current
        : value.roles.includes("student") ? "student" : value.roles[0] || null);
      setMessage("");
    } catch {
      setContextError(true);
      setMessage("Your invitation is confirmed, but this browser needs to reconnect to the secure pilot.");
    } finally {
      setRecovering(false);
    }
  }, [api, supabase]);
  useEffect(() => {
    // The request resolves asynchronously and synchronizes remote authorization state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadContext();
  }, [loadContext, session.access_token]);
  const loadDashboard = useCallback(async () => { if (!role) return; setMessage("Loading your dashboard..."); try { const value = await api.request<PilotDashboard>(`/api/dashboard?role=${role}`); setDashboard(value); setMessage(""); } catch (error) { setMessage(error instanceof Error ? error.message : "The dashboard could not be loaded."); } }, [api, role]);
  useEffect(() => {
    if (context && role && (role === "student" || context.aal === "aal2" || mfaVerified)) {
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
  if (!context || !role) return <main className="production-auth"><section className="production-auth-card"><RosieGuide pose={contextError ? "idle" : "tracks"} eyebrow="Secure pilot" title={contextError ? "Let’s reconnect your dashboard." : "Preparing your dashboard..."} body={message} />{contextError ? <div className="production-recovery" aria-live="polite"><button className="primary-button" onClick={() => void loadContext()} disabled={recovering}>{recovering ? "Reconnecting..." : "Retry secure connection"}</button><button className="text-button" onClick={() => void supabase.auth.signOut()} disabled={recovering}>Sign out</button><p>Your account and pilot roles are already active. Retrying refreshes only this browser session.</p></div> : null}</section></main>;
  if (role !== "student" && context.aal !== "aal2" && !mfaVerified) return <MfaGate supabase={supabase} onVerified={() => { setMfaVerified(true); void loadContext(); }} />;
  return <div className="production-shell"><AppHeader context={context} role={role} onRole={(next) => { setRole(next); setDashboard(null); }} onSignOut={() => void signOut()} /><main className="production-main"><div className="production-welcome"><p className="kicker">{role} dashboard</p><h1>{role === "student" ? "Your pathway home." : role === "advisor" ? "Your advising home." : "Your program home."}</h1></div>{message ? <p className="form-message" aria-live="polite">{message}</p> : null}{dashboard && role === "student" ? <StudentDashboardView dashboard={dashboard as StudentDashboard} api={api} supabase={supabase} userId={context.userId} reload={loadDashboard} /> : dashboard && role === "advisor" ? <AdvisorDashboardView dashboard={dashboard as AdvisorDashboard} api={api} reload={loadDashboard} /> : dashboard && role === "administrator" ? <AdminDashboardView dashboard={dashboard as AdminDashboard} api={api} canViewResults={context.capabilities.includes("evaluation.identifiable_results")} reload={loadDashboard} /> : null}</main></div>;
}

export function ProductionPilotApp() {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [configurationError, setConfigurationError] = useState(false);
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => {
    loadProductionConfiguration().then(() => {
      const configuredClient = getSupabaseBrowserClient();
      if (!configuredClient) throw new Error("Secure setup is not connected yet.");
      setSupabase(configuredClient);
    }).catch(() => setConfigurationError(true));
  }, []);
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthState(data.session ? "signed_in" : "signed_out"); });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => { setSession(nextSession); setAuthState(nextSession ? "signed_in" : "signed_out"); });
    return () => data.subscription.unsubscribe();
  }, [supabase]);
  if (configurationError) return <ConfigurationRequired />;
  if (!supabase) return <main className="production-auth"><section className="production-auth-card"><RosieGuide pose="tracks" eyebrow="Navigate The Pathway" title="Connecting your secure pathway..." /></section></main>;
  if (authState === "loading") return <main className="production-auth"><section className="production-auth-card"><RosieGuide pose="tracks" eyebrow="Navigate The Pathway" title="Opening your secure pathway..." /></section></main>;
  if (authState === "signed_out" || !session) return <SignIn supabase={supabase} />;
  return <Dashboard session={session} supabase={supabase} />;
}
