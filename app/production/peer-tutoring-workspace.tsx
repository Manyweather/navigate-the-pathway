"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PilotApiClient } from "./api-client";

type TutorRequest = {
  id: string;
  studentName: string;
  subject: string;
  startsAt: string;
  endsAt: string;
  modality: string;
  status: string;
  requestedAt: string;
  preparationNote: string;
};

type TutorSession = {
  id: string;
  studentName: string;
  subject: string;
  startsAt: string;
  endsAt: string;
  modality: string;
  location: string;
  type: string;
  status: string;
  attendanceStatus: string;
  logDueAt: string | null;
  logStatus: string;
};

type TutorBootstrap = {
  role: "peer_tutor";
  tutor: { name: string; status: string; subjects: string[]; hoursThisWeek: number };
  eligibility: { active: boolean; checklist: Array<{ key: string; label: string; complete: boolean }> };
  requests: TutorRequest[];
  sessions: TutorSession[];
  availability: { active: boolean; defaultDurationMinutes: 30 | 45 | 60; bufferBeforeMinutes: number; bufferAfterMinutes: number; rules: Array<{ id: string; day: string; startsAt: string; endsAt: string; modalities: string[]; location: string }>; exceptions: Array<{ id: string; date: string; kind: "add" | "remove"; startsAt: string; endsAt: string; note: string }> };
  rooms: Array<{ id: string; name: string; location: string; subject: string; checkedIn: boolean; coverageStartsAt: string; coverageEndsAt: string; queue: Array<{ id: string; studentName: string; status: string }> }>;
  messages: Array<{ id: string; sessionId: string; studentName: string; sender: string; body: string; createdAt: string; unread: boolean }>;
  logs: Array<{ id: string; sessionId: string; version: number; tutoringMinutes: number; prepMinutes: number; topics: string; summary: string; understanding: string; challenges: string; recommendations: string; submittedAt: string }>;
  recaps: Array<{ id: string; sessionId: string; version: number; body: string; nextSteps: string; publishedAt: string }>;
  coaching: { hoursThisWeek: number; medianResponseMinutes: number; attendanceCompletionRate: number; logCompletionRate: number; upcomingLoad: number; feedback: { responseCount: number; helpfulnessPercent: number } };
  privacyBoundary: { sameCoursePublishedRecapsOnly: boolean; advisingNotesIncluded: boolean; gradesIncluded: boolean; portfolioIncluded: boolean; otherTutorRecordsIncluded: boolean };
};

type ManagerBootstrap = {
  role: "tutoring_manager";
  tutors: Array<{ id: string; name: string; status: string; subjects: string[]; handbookAcknowledged: boolean; hoursThisWeek: number; responseMinutes: number; logCompletionRate: number }>;
  requests: TutorRequest[];
  sessions: TutorSession[];
  rooms: Array<{ id: string; name: string; location: string; subject: string; checkedIn: boolean; coverageStartsAt: string; coverageEndsAt: string; queue: Array<{ id: string; studentName: string; status: string }> }>;
  offerings: Array<{ id: string; title: string; subject: string; type: string; tutorName: string; startsAt: string; capacity: number; registered: number; waitlisted: number; status: string }>;
  exceptions: Array<{ id: string; type: string; title: string; detail: string; status: string }>;
  feedbackForms: Array<{ id: string; title: string; version: number; status: string; fields: string[] }>;
  feedback: { responseCount: number; averageHelpfulness: number; concernCount: number; minimumGroupSize: number };
  reports: { activeTutors: number; hoursThisWeek: number; medianResponseMinutes: number; attendanceCompletionRate: number; logCompletionRate: number; averageDropinWaitMinutes: number };
};

function timeLabel(value: string) {
  return new Date(value).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function tutorInputDate(offsetDays = 0) {
  const value = new Date();
  value.setDate(value.getDate() + offsetDays);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

const tutorWeekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

function Metric({ value, label }: { value: string | number; label: string }) {
  return <article><strong>{value}</strong><span>{label}</span></article>;
}

function PeerTutorHome({ data, onOpen, onSave, message }: { data: TutorBootstrap; onOpen: (view: string) => void; onSave: (path: string, body: Record<string, unknown>) => Promise<void>; message: string }) {
  const pending = data.requests.filter((item) => item.status === "pending_approval");
  const today = data.sessions.filter((item) => new Date(item.startsAt).toDateString() === new Date().toDateString());
  const dueLogs = data.sessions.filter((item) => ["due", "overdue"].includes(item.logStatus));
  const unread = data.messages.filter((item) => item.unread).length;
  const [mode, setMode] = useState<"date" | "recurring">("recurring");
  const [days, setDays] = useState(["Monday", "Wednesday"]);
  const [date, setDate] = useState(() => tutorInputDate(1));
  const [startsAt, setStartsAt] = useState("16:00");
  const [endsAt, setEndsAt] = useState("18:00");
  const [duration, setDuration] = useState<30 | 45 | 60>(60);
  const [modality, setModality] = useState("in_person");
  const [location, setLocation] = useState("Learning Commons");
  const upcoming = [...data.sessions].filter((item) => new Date(item.endsAt).getTime() >= Date.now()).sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime()).slice(0, 3);
  const saveHomeAvailability = async (event: React.FormEvent) => {
    event.preventDefault();
    if (startsAt >= endsAt) return;
    if (mode === "date") {
      await onSave("/api/oaca/tutor/availability/exceptions", { date, kind: "add", startsAt, endsAt, note: `${modality.replaceAll("_", " ")} · ${location}` });
      return;
    }
    if (!days.length) return;
    await onSave("/api/oaca/tutor/availability", {
      ...data.availability,
      defaultDurationMinutes: duration,
      rules: [
        ...data.availability.rules,
        ...days.map((day) => ({ id: `tutor-rule-${crypto.randomUUID()}`, day, startsAt, endsAt, modalities: [modality], location })),
      ],
    } as unknown as Record<string, unknown>);
  };
  return <section className="experience-panel tutoring-workspace tutoring-workspace--tutor">
    <div className="tutoring-hero" data-tutorial-id="tutor-home">
      <div><p className="kicker">Peer Tutor workspace</p><h1>Ready for today.</h1><p>Respond to requests, run sessions, and finish documentation without opening student advising records.</p></div>
      <div className="tutoring-hero__status"><span>{data.eligibility.active ? "Active tutor" : "Not cleared"}</span><strong>{today.length}</strong><small>session{today.length === 1 ? "" : "s"} today</small></div>
    </div>
    <section className="provider-home-availability provider-home-availability--tutor" data-tutorial-id="tutor-home-availability">
      <div className="provider-home-availability__heading"><div><p className="kicker">Appointment availability</p><h2>Choose when students can request you</h2><p>Add an extra day or keep a dependable weekly pattern.</p></div><button className="text-button" type="button" onClick={() => onOpen("availability")}>Manage all blocks</button></div>
      <div className="provider-home-availability__layout">
        <div className="provider-home-availability__schedule" aria-label="Current tutoring availability">
          <div className="provider-home-availability__summary"><span><strong>{data.availability.rules.length + data.availability.exceptions.filter((item) => item.kind === "add").length}</strong> active blocks</span><span><strong>{data.availability.defaultDurationMinutes} min</strong> default</span></div>
          {data.availability.exceptions.filter((item) => item.kind === "add").slice(0, 2).map((item) => <article key={item.id}><time>{new Date(`${item.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</time><strong>{item.startsAt}–{item.endsAt}</strong><small>One day · {item.note}</small></article>)}
          {data.availability.rules.slice(0, 3).map((rule) => <article key={rule.id}><time>{rule.day.slice(0, 3)}</time><strong>{rule.startsAt}–{rule.endsAt}</strong><small>Repeats weekly · {rule.modalities.map((item) => item.replaceAll("_", " ")).join(" · ")}</small></article>)}
        </div>
        <form className="provider-home-availability__form" onSubmit={saveHomeAvailability}>
          <div className="provider-availability-mode" role="group" aria-label="Availability frequency"><button type="button" className={mode === "date" ? "active" : ""} aria-pressed={mode === "date"} onClick={() => setMode("date")}>One day</button><button type="button" className={mode === "recurring" ? "active" : ""} aria-pressed={mode === "recurring"} onClick={() => setMode("recurring")}>Repeats weekly</button></div>
          {mode === "date" ? <label><span>Date</span><input required min={tutorInputDate()} type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label> : <fieldset><legend>Days</legend><div className="provider-day-options">{tutorWeekdays.map((day) => <label key={day}><input type="checkbox" checked={days.includes(day)} onChange={() => setDays((current) => current.includes(day) ? current.filter((item) => item !== day) : [...current, day])} /><span>{day.slice(0, 3)}</span></label>)}</div></fieldset>}
          <div className="form-row"><label><span>Start</span><input required type="time" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></label><label><span>End</span><input required type="time" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></label></div>
          <div className="form-row"><label><span>Session length</span><select value={duration} onChange={(event) => setDuration(Number(event.target.value) as 30 | 45 | 60)}><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">60 minutes</option></select></label><label><span>Format</span><select value={modality} onChange={(event) => setModality(event.target.value)}><option value="in_person">In person</option><option value="teams">Teams</option></select></label></div>
          <label><span>Location</span><input value={location} onChange={(event) => setLocation(event.target.value)} /></label>
          <button className="primary-button" disabled={startsAt >= endsAt || (mode === "recurring" && !days.length)}>{mode === "date" ? "Add this day" : "Add weekly block"}</button>
        </form>
      </div>
      {message ? <p className="form-message" aria-live="polite">{message}</p> : null}
    </section>
    <div className="provider-home-work-grid">
      <section className="provider-home-task-list" data-tutorial-id="tutor-home-tasks"><div className="section-heading"><div><p className="kicker">Tasks</p><h2>What needs action</h2></div><button className="text-button" onClick={() => onOpen(pending.length ? "requests" : "logs")}>Open queue</button></div>{pending.slice(0, 2).map((request) => <button key={request.id} onClick={() => onOpen("requests")}><span><strong>Respond to {request.studentName}</strong><small>{request.subject}</small></span><time>{timeLabel(request.startsAt)}</time></button>)}{dueLogs.slice(0, 2).map((session) => <button key={session.id} onClick={() => onOpen("logs")}><span><strong>Finish session log</strong><small>{session.studentName} · {session.subject}</small></span><time>{session.logStatus}</time></button>)}{!pending.length && !dueLogs.length ? <p>Your tutoring tasks are current.</p> : null}</section>
      <section className="provider-home-agenda" data-tutorial-id="tutor-home-agenda"><div className="section-heading"><div><p className="kicker">Agenda</p><h2>Next sessions</h2></div><button className="text-button" onClick={() => onOpen("sessions")}>Full calendar</button></div>{upcoming.map((session) => <button key={session.id} onClick={() => onOpen("sessions")}><time>{timeLabel(session.startsAt)}</time><span><strong>{session.studentName}</strong><small>{session.subject} · {session.modality.replaceAll("_", " ")}</small></span></button>)}{!upcoming.length ? <p>No upcoming tutoring sessions.</p> : null}</section>
    </div>
    <div className="tutoring-today-grid" data-tutorial-id="tutor-today">
      <Metric value={pending.length} label="requests awaiting response" />
      <Metric value={unread} label="unread session messages" />
      <Metric value={dueLogs.length} label="session logs due" />
      <Metric value={data.rooms.filter((room) => room.checkedIn).length} label="active drop-in rooms" />
    </div>
    <div className="tutoring-action-grid" data-tutorial-id="tutor-tools">
      {[
        ["requests", "Requests", "Confirm, decline, or propose another time", "↗"],
        ["sessions", "Calendar & sessions", "Prepare, check in, meet, and close", "◷"],
        ["availability", "Availability", "Recurring blocks and date exceptions", "▦"],
        ["dropin", "Drop-in rooms", "Coverage, check-in, and live queue", "≋"],
        ["messages", "Messages", "Session conversations and follow-up", "✉"],
        ["logs", "Session logs", "Due, overdue, and submitted records", "✎"],
        ["feedback", "Feedback", "Private aggregates after three responses", "◎"],
        ["policies", "Policies & help", "Eligibility, limits, and Workday reminder", "§"],
      ].map(([key, title, description, icon]) => <button key={key} onClick={() => onOpen(key)} data-tutorial-id={`tutor-${key}`}><span aria-hidden="true">{icon}</span><strong>{title}</strong><small>{description}</small></button>)}
    </div>
    <section className="tutoring-coaching" data-tutorial-id="tutor-coaching"><div><p className="kicker">My coaching snapshot</p><h2>Your activity, never a ranking.</h2></div><div><Metric value={`${data.coaching.hoursThisWeek} hr`} label="Tutoring Hours" /><Metric value={`${data.coaching.medianResponseMinutes} min`} label="median response" /><Metric value={`${data.coaching.logCompletionRate}%`} label="logs on time" /><Metric value={`${data.coaching.feedback.helpfulnessPercent}%`} label={`helpful · ${data.coaching.feedback.responseCount} responses`} /></div></section>
  </section>;
}

function ManagerHome({ data, onOpen }: { data: ManagerBootstrap; onOpen: (view: string) => void }) {
  return <section className="experience-panel tutoring-workspace tutoring-workspace--manager">
    <div className="tutoring-hero tutoring-hero--manager" data-tutorial-id="manager-home"><div><p className="kicker">Tutoring Manager workspace</p><h1>Keep tutoring moving.</h1><p>Manage tutors, resolve exceptions, publish group offerings, and monitor service quality without peer rankings.</p></div><div className="tutoring-hero__status"><span>Program overview</span><strong>{data.exceptions.length}</strong><small>items need review</small></div></div>
    <div className="tutoring-today-grid" data-tutorial-id="manager-today"><Metric value={data.reports.activeTutors} label="active tutors" /><Metric value={`${data.reports.hoursThisWeek} hr`} label="tutoring this week" /><Metric value={`${data.reports.medianResponseMinutes} min`} label="median response" /><Metric value={`${data.reports.logCompletionRate}%`} label="logs on time" /></div>
    <section className="tutoring-priority"><div><p className="kicker">Exception queue</p><h2>{data.exceptions[0]?.title || "No urgent exceptions"}</h2><p>{data.exceptions[0]?.detail || "Tutoring operations are current."}</p></div><button className="primary-button" onClick={() => onOpen("exceptions")}>Review queue</button></section>
    <div className="tutoring-action-grid" data-tutorial-id="manager-tools">
      {[
        ["tutors", "Tutor roster", "Activation, qualifications, and handbook status", "◇"],
        ["requests", "Request oversight", "Escalate, reassign, and resolve conflicts", "↗"],
        ["offerings", "Group offerings", "Create reviews, capacity, and waitlists", "◉"],
        ["dropin", "Drop-in operations", "Rooms, coverage, and live queues", "≋"],
        ["logs", "Documentation", "Overdue logs, attendance, and corrections", "✎"],
        ["feedback", "Feedback forms", "Versions, responses, and concerns", "◎"],
        ["reports", "Reports", "Demand, utilization, wait time, and quality", "▥"],
        ["availability", "Availability oversight", "View, amend, or suspend tutor blocks", "▦"],
      ].map(([key, title, description, icon]) => <button key={key} onClick={() => onOpen(key)} data-tutorial-id={`manager-${key}`}><span aria-hidden="true">{icon}</span><strong>{title}</strong><small>{description}</small></button>)}
    </div>
  </section>;
}

type Action = (path: string, body: Record<string, unknown>) => Promise<void>;

function StatusChip({ status }: { status: string }) {
  const style = ["active", "confirmed", "present", "submitted", "published", "completed"].includes(status) ? "confirmed" : ["overdue", "suspended", "no_show", "declined"].includes(status) ? "alert" : "pending";
  return <span className={`status-chip status-chip--${style}`}>{status.replaceAll("_", " ")}</span>;
}

function TutorDetail({ data, view, action, message }: { data: TutorBootstrap; view: string; action: Action; message: string }) {
  const [replacement, setReplacement] = useState("");
  const [availability, setAvailability] = useState(data.availability);
  const [exceptionDate, setExceptionDate] = useState("");
  const [sessionId, setSessionId] = useState(data.sessions.find((item) => ["due", "overdue"].includes(item.logStatus))?.id || data.sessions[0]?.id || "");
  const [topics, setTopics] = useState("");
  const [summary, setSummary] = useState("");
  const [understanding, setUnderstanding] = useState("");
  const [challenges, setChallenges] = useState("");
  const [recommendations, setRecommendations] = useState("");
  const [prepMinutes, setPrepMinutes] = useState("0");
  const [recap, setRecap] = useState("");
  const [nextSteps, setNextSteps] = useState("");
  const [messageBody, setMessageBody] = useState("");
  if (view === "requests") return <div className="tutoring-detail-grid" data-tutorial-id="tutor-request-workflow">{data.requests.map((request) => <article className="tutoring-record" key={request.id}><div><StatusChip status={request.status} /><h2>{request.studentName}</h2><p>{request.subject} · {timeLabel(request.startsAt)}</p><small>{request.modality.replaceAll("_", " ")} · Requested {timeLabel(request.requestedAt)}</small></div><blockquote>{request.preparationNote}</blockquote>{request.status === "pending_approval" ? <div className="workspace-actions"><button className="primary-button" onClick={() => void action("/api/oaca/tutor/requests/action", { requestId: request.id, decision: "confirm" })}>Confirm</button><button className="secondary-button" onClick={() => void action("/api/oaca/tutor/requests/action", { requestId: request.id, decision: "decline" })}>Decline</button></div> : null}<label><span>Propose another time</span><input type="datetime-local" value={replacement} onChange={(event) => setReplacement(event.target.value)} /></label><button className="text-button" disabled={!replacement} onClick={() => void action("/api/oaca/tutor/requests/action", { requestId: request.id, decision: "counterpropose", startsAt: replacement })}>Send counterproposal</button></article>)}</div>;
  if (view === "availability") return <div className="tutoring-two-column" data-tutorial-id="tutor-availability-workflow"><form className="production-card" onSubmit={(event) => { event.preventDefault(); void action("/api/oaca/tutor/availability", availability as unknown as Record<string, unknown>); }}><h2>Recurring availability</h2><p>Students see only blocks that also satisfy tutoring qualifications, limits, buffers, and existing commitments.</p><div className="form-row"><label><span>Default session</span><select value={availability.defaultDurationMinutes} onChange={(event) => setAvailability((current) => ({ ...current, defaultDurationMinutes: Number(event.target.value) as 30 | 45 | 60 }))}><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">60 minutes</option></select></label><label><span>Before / after buffer</span><select value={`${availability.bufferBeforeMinutes}:${availability.bufferAfterMinutes}`} onChange={(event) => { const [before, after] = event.target.value.split(":").map(Number); setAvailability((current) => ({ ...current, bufferBeforeMinutes: before, bufferAfterMinutes: after })); }}><option value="0:0">No buffer</option><option value="10:10">10 minutes</option><option value="15:15">15 minutes</option></select></label></div><div className="tutoring-block-list">{availability.rules.map((rule) => <article key={rule.id}><strong>{rule.day}</strong><span>{rule.startsAt}–{rule.endsAt}</span><small>{rule.modalities.map((item) => item.replaceAll("_", " ")).join(" · ")} · {rule.location}</small></article>)}</div><label className="check-row"><input type="checkbox" checked={availability.active} onChange={(event) => setAvailability((current) => ({ ...current, active: event.target.checked }))} /><span>Accept new tutoring requests from these blocks</span></label><button className="primary-button">Save availability</button></form><form className="production-card" onSubmit={(event) => { event.preventDefault(); if (!exceptionDate) return; void action("/api/oaca/tutor/availability/exceptions", { date: exceptionDate, kind: "remove", startsAt: "09:00", endsAt: "17:00", note: "Unavailable" }); setExceptionDate(""); }}><h2>Date exceptions</h2><p>An exception amends the recurring template; it never replaces the entire day by accident.</p>{data.availability.exceptions.map((item) => <article className="tutoring-exception" key={item.id}><StatusChip status={item.kind} /><strong>{new Date(`${item.date}T12:00:00`).toLocaleDateString()}</strong><span>{item.startsAt}–{item.endsAt} · {item.note}</span></article>)}<label><span>Add unavailable date</span><input type="date" value={exceptionDate} onChange={(event) => setExceptionDate(event.target.value)} /></label><button className="secondary-button" disabled={!exceptionDate}>Add exception</button></form></div>;
  if (view === "sessions") return <div className="tutoring-detail-grid" data-tutorial-id="tutor-session-workflow">{data.sessions.map((session) => <article className="tutoring-record" key={session.id}><div><StatusChip status={session.status} /><h2>{session.studentName}</h2><p>{session.subject} · {timeLabel(session.startsAt)}</p><small>{session.type.replaceAll("_", " ")} · {session.location}</small></div><div className="tutoring-session-context"><strong>Preparation and tutoring-only context</strong><p>{data.requests.find((item) => item.studentName === session.studentName)?.preparationNote || "No preparation note was provided."}</p><small>Only published recaps for this course are available. Advising notes, grades, portfolios, and unrelated tutoring records are excluded.</small></div>{session.status === "scheduled" ? <button className="primary-button" onClick={() => void action("/api/oaca/tutor/sessions/action", { sessionId: session.id, action: "start" })}>Start session</button> : session.status === "in_progress" ? <button className="primary-button" onClick={() => void action("/api/oaca/tutor/sessions/action", { sessionId: session.id, action: "end" })}>End session</button> : <div className="tutoring-attendance"><label><span>Attendance</span><select value={session.attendanceStatus} onChange={(event) => void action("/api/oaca/tutor/attendance", { sessionId: session.id, status: event.target.value })}><option value="present">Present</option><option value="no_show">No-show</option><option value="excused">Excused</option><option value="not_recorded">Not recorded</option></select></label><button className="secondary-button" onClick={() => void action("/api/oaca/tutor/attendance", { sessionId: session.id, status: "present", source: "permanent_qr" })}>Scan permanent QR</button><button className="text-button" onClick={() => void action("/api/oaca/tutor/follow-ups", { sessionId: session.id, durationMinutes: 60 })}>Offer follow-up</button></div>}</article>)}</div>;
  if (view === "dropin") return <div className="tutoring-detail-grid" data-tutorial-id="tutor-dropin-workflow">{data.rooms.map((room) => <article className="tutoring-record" key={room.id}><div><StatusChip status={room.checkedIn ? "active" : "closed"} /><h2>{room.name}</h2><p>{room.subject} · {room.location}</p><small>{timeLabel(room.coverageStartsAt)}–{new Date(room.coverageEndsAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</small></div><button className={room.checkedIn ? "secondary-button" : "primary-button"} onClick={() => void action("/api/oaca/tutor/drop-in/action", { roomId: room.id, action: room.checkedIn ? "check_out" : "check_in" })}>{room.checkedIn ? "Close my coverage" : "Check in and open queue"}</button><div className="tutoring-queue">{room.queue.map((entry, index) => <article key={entry.id}><span>{index + 1}</span><div><strong>{entry.studentName}</strong><small>{entry.status.replaceAll("_", " ")} · estimated {Math.max(0, index * 12)} min</small></div><div className="workspace-actions"><button className="text-button" disabled={!room.checkedIn || entry.status !== "waiting"} onClick={() => void action("/api/oaca/tutor/drop-in/action", { roomId: room.id, queueId: entry.id, action: "call" })}>Call next</button><button className="text-button" disabled={!room.checkedIn} onClick={() => void action("/api/oaca/tutor/drop-in/action", { roomId: room.id, queueId: entry.id, action: "complete" })}>Complete</button></div></article>)}</div></article>)}</div>;
  if (view === "messages") return <div className="tutoring-two-column" data-tutorial-id="tutor-message-workflow"><section className="production-card"><h2>Session conversations</h2><p>Each thread closes to new messages seven days after its session.</p>{data.messages.map((item) => <article className="tutoring-message" key={item.id}><div><strong>{item.studentName}</strong>{item.unread ? <span>New</span> : null}</div><p>{item.body}</p><small>{timeLabel(item.createdAt)}</small></article>)}</section><form className="production-card" onSubmit={(event) => { event.preventDefault(); if (!messageBody.trim()) return; void action("/api/oaca/tutor/messages", { sessionId: data.sessions[0]?.id, body: messageBody }); setMessageBody(""); }}><h2>Reply in the session thread</h2><label><span>Message</span><textarea value={messageBody} onChange={(event) => setMessageBody(event.target.value)} /></label><button className="primary-button" disabled={!messageBody.trim()}>Send reply</button><small>The Tutoring Manager may open a conversation for supervisory purposes. Every access is shown and audited.</small></form></div>;
  if (view === "logs") return <div className="tutoring-two-column" data-tutorial-id="tutor-log-workflow"><section className="production-card"><h2>Documentation queue</h2>{data.sessions.filter((item) => item.status === "completed").map((session) => <button className={`tutoring-log-choice ${sessionId === session.id ? "selected" : ""}`} key={session.id} onClick={() => setSessionId(session.id)}><span><StatusChip status={session.logStatus} /><strong>{session.studentName}</strong></span><small>{session.subject} · {session.logDueAt ? `due ${timeLabel(session.logDueAt)}` : "submitted"}</small></button>)}</section><form className="production-card tutoring-log-form" onSubmit={(event) => { event.preventDefault(); void action("/api/oaca/tutor/logs", { sessionId, tutoringMinutes: 60, prepMinutes: Number(prepMinutes), topics, summary, understanding, challenges, recommendations }); }}><h2>Operational session log</h2><p>Due within 24 hours. Workday remains the official payroll time record.</p><div className="form-row"><label><span>Tutoring minutes</span><select defaultValue="60"><option>30</option><option>45</option><option>60</option></select></label><label><span>Preparation minutes</span><input type="number" min="0" max="180" value={prepMinutes} onChange={(event) => setPrepMinutes(event.target.value)} /></label></div><label><span>Topics and concepts</span><textarea required value={topics} onChange={(event) => setTopics(event.target.value)} /></label><label><span>Brief session summary</span><textarea required value={summary} onChange={(event) => setSummary(event.target.value)} /></label><label><span>Observed understanding</span><textarea value={understanding} onChange={(event) => setUnderstanding(event.target.value)} /></label><label><span>Challenges</span><textarea value={challenges} onChange={(event) => setChallenges(event.target.value)} /></label><label><span>Recommendations</span><textarea value={recommendations} onChange={(event) => setRecommendations(event.target.value)} /></label><button className="primary-button" disabled={!sessionId || !topics.trim() || !summary.trim()}>Submit new version</button><hr /><h3>Student-facing recap</h3><label><span>What we practiced</span><textarea value={recap} onChange={(event) => setRecap(event.target.value)} /></label><label><span>Next steps</span><textarea value={nextSteps} onChange={(event) => setNextSteps(event.target.value)} /></label><button className="secondary-button" type="button" disabled={!sessionId || !recap.trim()} onClick={() => void action("/api/oaca/tutor/recaps", { sessionId, body: recap, nextSteps, publish: true })}>Publish recap to student</button></form></div>;
  if (view === "feedback") return <div className="tutoring-two-column" data-tutorial-id="tutor-feedback-workflow"><section className="production-card"><p className="kicker">Private aggregate</p><h2>{data.coaching.feedback.helpfulnessPercent}% found sessions helpful</h2><p>Based on {data.coaching.feedback.responseCount} responses. Results appear only after at least three responses.</p><div className="tutoring-feedback-bars"><span><i style={{ width: `${data.coaching.feedback.helpfulnessPercent}%` }} />Helpfulness</span><span><i style={{ width: "88%" }} />Clear next step</span></div></section><aside className="production-card"><h2>What stays private</h2><p>Raw responses and comments are visible only to the Tutoring Manager. Your coaching view contains no student names and no comparison or ranking against other tutors.</p></aside></div>;
  return <div className="tutoring-two-column" data-tutorial-id="tutor-policy-workflow"><section className="production-card"><h2>Eligibility checklist</h2><ul className="compliance-list">{data.eligibility.checklist.map((item) => <li key={item.key} className={item.complete ? "complete" : "pending"}><span aria-hidden="true">{item.complete ? "✓" : "○"}</span>{item.label}</li>)}</ul></section><section className="production-card"><h2>Tutoring limits and help</h2><p>Plan for 4–6 tutoring hours each week. Eight tutoring hours is the limit without prior written approval.</p><p>Review preparation is limited to 30 minutes per tutoring hour and three preparation hours weekly unless approved.</p><aside className="configuration-banner"><strong>Remember Workday</strong><p>Compass supports tutoring operations. Continue to record payroll time in Workday.</p></aside></section>{message ? <p className="form-message" aria-live="polite">{message}</p> : null}</div>;
}

function ManagerDetail({ data, view, action }: { data: ManagerBootstrap; view: string; action: Action }) {
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("General");
  const [startsAt, setStartsAt] = useState("");
  const [tutorId, setTutorId] = useState(data.tutors.find((item) => item.status === "active")?.id || "");
  const [capacity, setCapacity] = useState("8");
  const [formTitle, setFormTitle] = useState("Peer tutoring session feedback");
  if (view === "tutors" || view === "availability") return <div className="tutoring-detail-grid" data-tutorial-id="manager-roster-workflow">{data.tutors.map((tutor) => <article className="tutoring-record" key={tutor.id}><div><StatusChip status={tutor.status} /><h2>{tutor.name}</h2><p>{tutor.subjects.join(" · ") || "No active qualification"}</p><small>{tutor.handbookAcknowledged ? "Current handbook acknowledged" : "Handbook acknowledgment pending"} · {tutor.hoursThisWeek} hours this week</small></div><div className="tutoring-manager-stats"><span>{tutor.responseMinutes ? `${tutor.responseMinutes} min response` : "No response data"}</span><span>{tutor.logCompletionRate}% logs on time</span></div><div className="workspace-actions"><button className="secondary-button" onClick={() => void action("/api/oaca/tutoring-manager/tutors/action", { tutorId: tutor.id, action: tutor.status === "active" ? "suspend" : "activate" })}>{tutor.status === "active" ? "Suspend new bookings" : "Activate tutor"}</button><button className="text-button" onClick={() => void action("/api/oaca/tutoring-manager/qualifications", { tutorId: tutor.id, subjects: tutor.subjects.includes("General") ? ["Clinical skills"] : ["General", "Clinical skills"], modalities: ["in_person", "teams"] })}>Update qualifications</button></div></article>)}</div>;
  if (view === "requests" || view === "exceptions") return <div className="tutoring-two-column" data-tutorial-id="manager-exception-workflow"><section className="production-card"><h2>Exception queue</h2>{data.exceptions.map((item) => <article className="tutoring-exception" key={item.id}><StatusChip status={item.status} /><strong>{item.title}</strong><span>{item.detail}</span><button className="text-button" onClick={() => void action("/api/oaca/tutoring-manager/exceptions/action", { exceptionId: item.id, action: "resolve" })}>Mark resolved</button></article>)}</section><section className="production-card"><h2>Pending tutoring requests</h2>{data.requests.filter((item) => item.status === "pending_approval").map((item) => <article className="tutoring-exception" key={item.id}><strong>{item.studentName}</strong><span>{item.subject} · {timeLabel(item.startsAt)}</span><button className="secondary-button" onClick={() => void action("/api/oaca/tutoring-manager/requests/action", { requestId: item.id, action: "reassign", tutorId: data.tutors[1]?.id })}>Reassign to {data.tutors[1]?.name}</button></article>)}</section></div>;
  if (view === "offerings") return <div className="tutoring-two-column" data-tutorial-id="manager-offering-workflow"><section className="production-card"><h2>Group and review offerings</h2>{data.offerings.map((item) => <article className="tutoring-exception" key={item.id}><StatusChip status={item.status} /><strong>{item.title}</strong><span>{item.tutorName} · {timeLabel(item.startsAt)}</span><small>{item.registered}/{item.capacity} registered · {item.waitlisted} waitlisted</small></article>)}</section><form className="production-card" onSubmit={(event) => { event.preventDefault(); void action("/api/oaca/tutoring-manager/offerings", { title, subject, startsAt, tutorId, capacity: Number(capacity), type: "review", action: "publish" }); setTitle(""); setStartsAt(""); }}><h2>Create an offering</h2><label><span>Title</span><input required value={title} onChange={(event) => setTitle(event.target.value)} /></label><label><span>Subject</span><select value={subject} onChange={(event) => setSubject(event.target.value)}><option>General</option><option>Clinical skills</option></select></label><label><span>Assigned tutor</span><select value={tutorId} onChange={(event) => setTutorId(event.target.value)}>{data.tutors.filter((item) => item.status === "active").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><div className="form-row"><label><span>Date and time</span><input required type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></label><label><span>Capacity</span><select value={capacity} onChange={(event) => setCapacity(event.target.value)}>{[3,4,5,6,7,8].map((item) => <option key={item}>{item}</option>)}</select></label></div><button className="primary-button">Publish offering</button></form></div>;
  if (view === "dropin") return <div className="tutoring-detail-grid" data-tutorial-id="manager-dropin-workflow">{data.rooms.map((room) => <article className="tutoring-record" key={room.id}><div><StatusChip status={room.checkedIn ? "active" : "scheduled"} /><h2>{room.name}</h2><p>{room.location} · {room.subject}</p><small>{room.queue.length} students currently in queue</small></div><div className="tutoring-queue">{room.queue.map((item, index) => <article key={item.id}><span>{index + 1}</span><div><strong>{item.studentName}</strong><small>{item.status}</small></div></article>)}</div><button className="secondary-button" onClick={() => void action("/api/oaca/tutoring-manager/rooms/action", { roomId: room.id, action: room.checkedIn ? "suspend" : "open" })}>{room.checkedIn ? "Suspend room" : "Open room"}</button></article>)}</div>;
  if (view === "feedback") return <div className="tutoring-two-column" data-tutorial-id="manager-feedback-workflow"><section className="production-card"><h2>Feedback oversight</h2><div className="tutoring-today-grid"><Metric value={data.feedback.responseCount} label="responses" /><Metric value={data.feedback.averageHelpfulness} label="average helpfulness" /><Metric value={data.feedback.concernCount} label="reported concern" /></div>{data.feedbackForms.map((form) => <article className="tutoring-exception" key={form.id}><StatusChip status={form.status} /><strong>{form.title}</strong><span>Version {form.version} · {form.fields.length} fields</span></article>)}</section><form className="production-card" onSubmit={(event) => { event.preventDefault(); void action("/api/oaca/tutoring-manager/feedback-forms", { title: formTitle, fields: ["Session helped me understand the material", "I know what to practice next", "Optional private comment"], action: "publish" }); }}><h2>Create a new form version</h2><label><span>Form title</span><input value={formTitle} onChange={(event) => setFormTitle(event.target.value)} /></label><label><span>Required scale questions</span><textarea defaultValue={"Session helped me understand the material\nI know what to practice next"} /></label><label><span>Private comment prompt</span><input defaultValue="Optional private comment" /></label><button className="primary-button">Publish new version</button><small>Tutors receive aggregates only after three responses. Raw comments remain in Manager review.</small></form></div>;
  if (view === "reports") return <div className="production-card" data-tutorial-id="manager-report-workflow"><h2>Tutoring service reports</h2><div className="tutoring-report-grid"><Metric value={data.reports.activeTutors} label="active tutors" /><Metric value={`${data.reports.hoursThisWeek} hr`} label="tutoring this week" /><Metric value={`${data.reports.medianResponseMinutes} min`} label="median response" /><Metric value={`${data.reports.attendanceCompletionRate}%`} label="attendance recorded" /><Metric value={`${data.reports.logCompletionRate}%`} label="logs on time" /><Metric value={`${data.reports.averageDropinWaitMinutes} min`} label="average drop-in wait" /></div><p>No tutor is ranked against another. Identifiable detail remains limited to operational supervision.</p><button className="secondary-button" onClick={() => void action("/api/oaca/tutoring-manager/reports/export", { format: "xlsx" })}>Prepare audited XLSX export</button></div>;
  return <div className="tutoring-two-column" data-tutorial-id="manager-documentation-workflow"><section className="production-card"><h2>Documentation exceptions</h2>{data.sessions.filter((item) => ["overdue", "due"].includes(item.logStatus) || item.attendanceStatus === "not_recorded").map((item) => <article className="tutoring-exception" key={item.id}><StatusChip status={item.logStatus} /><strong>{item.studentName} · {item.subject}</strong><span>{item.attendanceStatus.replaceAll("_", " ")} attendance</span><button className="text-button" onClick={() => void action("/api/oaca/tutoring-manager/logs/addendum", { sessionId: item.id, body: "Manager reviewed the operational exception." })}>Add attributed correction</button></article>)}</section><aside className="production-card"><h2>Supervisory boundary</h2><p>Managers may open a session conversation only when supervision requires it. The interface identifies that access to participants and writes an immutable audit entry.</p></aside></div>;
}

export function PeerTutoringWorkspace({ api, mode }: { api: PilotApiClient; mode: "peer_tutor" | "tutoring_manager" }) {
  const [data, setData] = useState<TutorBootstrap | ManagerBootstrap | null>(null);
  const [view, setView] = useState("home");
  const [message, setMessage] = useState("Loading tutoring workspace…");
  const endpoint = mode === "peer_tutor" ? "/api/oaca/tutor/bootstrap" : "/api/oaca/tutoring-manager/bootstrap";
  const load = useCallback(async () => {
    try { setData(await api.request<TutorBootstrap | ManagerBootstrap>(endpoint)); setMessage(""); }
    catch (error) { setMessage(error instanceof Error ? error.message : "The tutoring workspace could not be loaded."); }
  }, [api, endpoint]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  const title = useMemo(() => view.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()), [view]);
  const action = useCallback<Action>(async (path, body) => {
    setMessage("Saving…");
    try { await api.request(path, { method: "POST", body }); await load(); setMessage("Saved."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "That change could not be saved."); }
  }, [api, load]);
  if (!data) return <section className="experience-panel"><p className="form-message" aria-live="polite">{message}</p></section>;
  if (view !== "home") return <section className="experience-panel tutoring-workspace"><button className="workspace-back text-button" onClick={() => setView("home")}>← Tutoring home</button><p className="kicker">{mode === "peer_tutor" ? "Peer Tutor" : "Tutoring Manager"}</p><h1>{title}</h1>{message ? <p className="form-message" aria-live="polite">{message}</p> : null}{data.role === "peer_tutor" ? <TutorDetail data={data} view={view} action={action} message={message} /> : <ManagerDetail data={data} view={view} action={action} />}</section>;
  return data.role === "peer_tutor" ? <PeerTutorHome data={data} onOpen={setView} onSave={action} message={message} /> : <ManagerHome data={data} onOpen={setView} />;
}
