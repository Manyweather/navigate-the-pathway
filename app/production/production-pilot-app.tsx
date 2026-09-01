"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AuthMFAEnrollResponse, Session, SupabaseClient } from "@supabase/supabase-js";
import Link from "next/link";
import { assetUrl } from "../asset-url";
import { RosieGuide } from "../components/rosie-guide";
import { PilotApiClient } from "./api-client";
import { advisorInstrumentCatalog, type PilotRole } from "./catalog";
import { getSupabaseBrowserClient, productionConfiguration } from "./supabase-client";
import type {
  AdminDashboard,
  AdvisorDashboard,
  AuthorizationContext,
  PilotDashboard,
  StudentDashboard,
  SurveyAssignmentDetail,
  SurveyAssignmentStatus,
  SurveyAssignmentSummary,
} from "./types";

type AuthState = "loading" | "signed_out" | "signed_in";
type StudentView = "sessions" | "map" | "portfolio" | "advising";

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
  return <div className="survey-overlay" role="dialog" aria-modal="true" aria-label={assignment.instrumentName}><section className="survey-workspace"><header><div><p className="kicker">{assignment.waveLabel}</p><h2>{assignment.instrumentName}</h2></div><button className="text-button" onClick={onClose}>Close</button></header>{message ? <p className="form-message" aria-live="polite">{message}</p> : null}{detail ? <>{detail.items.length === 0 ? <div className="release-block"><h3>Content release pending</h3><p>This instrument cannot open until approved wording, permissions, consent, and any scoring key have been loaded into the protected backend.</p></div> : <><div className="consent-card"><h3>{detail.consentTitle}</h3><p>{detail.consentBody}</p><label className="check-row"><input type="checkbox" checked={consented} onChange={(event) => setConsented(event.target.checked)} />I have reviewed this approved consent information.</label></div><ol className="survey-items">{detail.items.map((item) => <li key={item.id}><fieldset><legend>{item.position}. {item.prompt}</legend>{item.responseType === "text" ? <textarea value={answers[item.id] || ""} onChange={(event) => setAnswers((current) => ({ ...current, [item.id]: event.target.value }))} /> : item.options.map((option) => <label key={option.id}><input type="radio" name={item.id} value={option.value} checked={answers[item.id] === option.value} onChange={(event) => setAnswers((current) => ({ ...current, [item.id]: event.target.value }))} />{option.label}</label>)}</fieldset></li>)}</ol><footer><button className="secondary-button" onClick={save} disabled={busy}>Save draft</button><button className="primary-button" onClick={submit} disabled={busy || !consented}>Submit once complete</button></footer></>}</> : null}</section></div>;
}

function StudentDashboardView({ dashboard, api, reload }: { dashboard: StudentDashboard; api: PilotApiClient; reload: () => void }) {
  const [view, setView] = useState<StudentView>("sessions");
  const [survey, setSurvey] = useState<SurveyAssignmentSummary | null>(null);
  return <><nav className="production-tabs" aria-label="Student dashboard"><button className={view === "sessions" ? "active" : ""} onClick={() => setView("sessions")}>Sessions</button><button className={view === "map" ? "active" : ""} onClick={() => setView("map")}>Pathway Map</button><button className={view === "portfolio" ? "active" : ""} onClick={() => setView("portfolio")}>Portfolio</button><button className={view === "advising" ? "active" : ""} onClick={() => setView("advising")}>Advising</button></nav>{view === "sessions" ? <div className="production-grid"><section className="production-card production-card--wide"><p className="kicker">Next session</p>{dashboard.nextSession ? <><h2>{dashboard.nextSession.title}</h2><p>{new Date(dashboard.nextSession.startsAt).toLocaleString()} · {dashboard.nextSession.format.replace("_", " ")}</p><button className="primary-button" disabled={!dashboard.nextSession.checkInAvailable}>{dashboard.nextSession.checkInAvailable ? "Check in" : "Check-in opens near the session"}</button></> : <><h2>No upcoming session is scheduled.</h2><p>Your program administrator will publish dates here.</p></>}</section><section className="production-card production-card--wide"><div className="section-heading"><div><p className="kicker">Your surveys</p><h2>Complete only the surveys currently open.</h2></div><p>Results are not used to rank, label, or recommend a pathway.</p></div><SurveyCards assignments={dashboard.surveyAssignments} onOpen={setSurvey} /></section><section className="production-card"><h2>Attendance history</h2>{dashboard.attendanceHistory.length ? dashboard.attendanceHistory.map((session) => <p key={session.id}><strong>{session.title}</strong><br />{session.attendanceStatus.replace("_", " ")}</p>) : <p>No attendance records yet.</p>}</section></div> : view === "map" ? <section className="production-card map-bridge"><RosieGuide pose="pointing" eyebrow="Pathway map" title="Your learning stations are still here." body="Courses, Experiences, Reflection and Values, Cohort, Your Story, and Application remain available in the media-first pathway." /><Link className="primary-button" href="/">Open the pathway map</Link></section> : view === "portfolio" ? <section className="production-card"><h2>Your Portfolio</h2><p>Documents are private until you deliberately add them to an active advising packet.</p>{dashboard.portfolio.map((item) => <article className="portfolio-row" key={item.id}><div><strong>{item.title}</strong><span>{item.documentType}</span></div><span>{item.sharedWithAdvisor ? "Shared in active packet" : "Private"}</span></article>)}</section> : <section className="production-card"><h2>Advising shares</h2><p>Only the items you select are visible to your assigned advisor. You can revoke or let a packet expire.</p>{dashboard.advisingPackets.map((packet) => <article className="portfolio-row" key={packet.id}><div><strong>{packet.title}</strong><span>{packet.status}</span></div><span>{packet.expiresAt ? `Expires ${new Date(packet.expiresAt).toLocaleDateString()}` : "No expiration"}</span></article>)}</section>}{survey ? <SurveyWorkspace assignment={survey} api={api} onClose={() => setSurvey(null)} onSubmitted={() => { setSurvey(null); reload(); }} /> : null}</>;
}

function AdvisorDashboardView({ dashboard, api, reload }: { dashboard: AdvisorDashboard; api: PilotApiClient; reload: () => void }) {
  const [selectedId, setSelectedId] = useState(dashboard.assignedStudents[0]?.id || "");
  const [survey, setSurvey] = useState<SurveyAssignmentSummary | null>(null);
  const selected = dashboard.assignedStudents.find((student) => student.id === selectedId);
  return <div className="production-grid"><section className="production-card production-card--wide"><div className="section-heading"><div><p className="kicker">Assigned students</p><h2>Student support overview</h2></div><label><span>Student</span><select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>{dashboard.assignedStudents.map((student) => <option key={student.id} value={student.id}>{student.displayName} · {student.cohortName}</option>)}</select></label></div>{selected ? <div className="advisor-summary"><article><span>Attendance</span><strong>{selected.attendance.present}/{selected.attendance.expected}</strong></article><article><span>Shared packets</span><strong>{selected.sharedPacketCount}</strong></article>{selected.surveyCompletion.map((item) => <article key={item.instrumentName}><span>{item.instrumentName}</span><strong>{statusLabels[item.status]}</strong></article>)}</div> : <p>No students are assigned.</p>}<p className="privacy-note">Completion is visible. Answers, scores, private reflections, contacts, drafts, and unshared Portfolio items are not.</p></section><section className="production-card production-card--wide"><p className="kicker">My Surveys</p><h2>{advisorInstrumentCatalog[0].name}</h2><SurveyCards assignments={dashboard.mySurveys} onOpen={setSurvey} /></section>{survey ? <SurveyWorkspace assignment={survey} api={api} onClose={() => setSurvey(null)} onSubmitted={() => { setSurvey(null); reload(); }} /> : null}</div>;
}

function AdminDashboardView({ dashboard, api, canViewResults, reload }: { dashboard: AdminDashboard; api: PilotApiClient; canViewResults: boolean; reload: () => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<PilotRole>("student");
  const [message, setMessage] = useState("");
  const invite = async (event: React.FormEvent) => { event.preventDefault(); try { await api.request("/api/admin/invitations", { method: "POST", body: { email, roles: [role] } }); setEmail(""); setMessage("Invitation sent and recorded."); reload(); } catch (error) { setMessage(error instanceof Error ? error.message : "Invitation could not be sent."); } };
  return <div className="production-grid"><section className="production-card production-card--wide"><p className="kicker">Program Administration</p><h2>Accounts, Sessions, and evaluation operations</h2><div className="admin-counts"><article><strong>{dashboard.counts.invitedUsers}</strong><span>Invited</span></article><article><strong>{dashboard.counts.activeUsers}</strong><span>Active</span></article><article><strong>{dashboard.counts.cohorts}</strong><span>Cohorts</span></article><article><strong>{dashboard.counts.sessions}</strong><span>Sessions</span></article></div></section><section className="production-card"><h2>Invite an account</h2><form className="production-form" onSubmit={invite}><label><span>Verified email</span><input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label><label><span>Initial role</span><select value={role} onChange={(event) => setRole(event.target.value as PilotRole)}><option value="student">Student</option><option value="advisor">Advisor</option><option value="administrator">Administrator</option></select></label><button className="primary-button">Send invitation</button><p className="form-message" aria-live="polite">{message}</p></form></section><section className="production-card"><h2>Survey completion</h2>{dashboard.surveyCompletion.map((item) => <p key={item.instrumentName}><strong>{item.instrumentName}</strong><br />{item.submitted}/{item.assigned} submitted</p>)}{canViewResults ? <a className="secondary-button" href={`${productionConfiguration().apiUrl}/api/evaluation/export`}>Authorized evaluation export</a> : <p className="privacy-note">Identifiable answers and calculations require the separate evaluation permission.</p>}</section><section className="production-card"><h2>Sessions and Attendance</h2><p>{dashboard.attendanceCorrections} attendance corrections are preserved in the audit history.</p><button className="secondary-button">Schedule a session</button></section><section className="production-card"><h2>Program configuration</h2><p>{dashboard.pendingCurriculumReviews} curriculum references await review.</p><p>Survey waves, instrument versions, audiences, required status, and dates are configured here. No pre/post schedule is hardcoded.</p></section></div>;
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
  if (!context || !role) return <main className="production-auth"><section className="production-auth-card"><RosieGuide pose={contextError ? "idle" : "tracks"} eyebrow="Secure pilot" title={contextError ? "Let’s reconnect your dashboard." : "Preparing your dashboard..."} body={message} />{contextError ? <div className="production-recovery" aria-live="polite"><button className="primary-button" onClick={() => void loadContext()} disabled={recovering}>{recovering ? "Reconnecting..." : "Retry secure connection"}</button><button className="text-button" onClick={() => void supabase.auth.signOut()} disabled={recovering}>Sign out</button><p>Your account and pilot roles are already active. Retrying refreshes only this browser session.</p></div> : null}</section></main>;
  if (role !== "student" && context.aal !== "aal2" && !mfaVerified) return <MfaGate supabase={supabase} onVerified={() => { setMfaVerified(true); void loadContext(); }} />;
  return <div className="production-shell"><AppHeader context={context} role={role} onRole={(next) => { setRole(next); setDashboard(null); }} onSignOut={() => void supabase.auth.signOut()} /><main className="production-main"><div className="production-welcome"><p className="kicker">{role} dashboard</p><h1>{role === "student" ? "Your next step, made clearer." : role === "advisor" ? "Support each assigned student with context." : "Run the pilot with clear boundaries."}</h1></div>{message ? <p className="form-message" aria-live="polite">{message}</p> : null}{dashboard && role === "student" ? <StudentDashboardView dashboard={dashboard as StudentDashboard} api={api} reload={loadDashboard} /> : dashboard && role === "advisor" ? <AdvisorDashboardView dashboard={dashboard as AdvisorDashboard} api={api} reload={loadDashboard} /> : dashboard && role === "administrator" ? <AdminDashboardView dashboard={dashboard as AdminDashboard} api={api} canViewResults={context.capabilities.includes("evaluation.identifiable_results")} reload={loadDashboard} /> : null}</main></div>;
}

export function ProductionPilotApp() {
  const config = productionConfiguration();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthState(data.session ? "signed_in" : "signed_out"); });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => { setSession(nextSession); setAuthState(nextSession ? "signed_in" : "signed_out"); });
    return () => data.subscription.unsubscribe();
  }, [supabase]);
  if (!config.supabaseUrl || !config.supabaseAnonKey || !config.apiUrl || !supabase) return <ConfigurationRequired />;
  if (authState === "loading") return <main className="production-auth"><section className="production-auth-card"><RosieGuide pose="tracks" eyebrow="Navigate The Pathway" title="Opening your secure pathway..." /></section></main>;
  if (authState === "signed_out" || !session) return <SignIn supabase={supabase} />;
  return <Dashboard session={session} supabase={supabase} />;
}
