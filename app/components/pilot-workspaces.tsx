"use client";

import { useMemo, useState } from "react";
import {
  approvedCourseResources,
  approvedCourseScenarios,
  curriculumAnnotations,
  curriculumDataNotes,
  curriculumDisclaimer,
  curriculumPrograms,
  matchCourseCode,
  normalizeCourseCode,
  snapshotCompleteness,
} from "../curriculum-data";
import { makeId, nowIso, type CoursePlan } from "../demo-model";
import {
  acceptedPortfolioTypes,
  advisorVisiblePortfolio,
  attendanceSummary,
  correctAttendance,
  isCheckInOpen,
  isSurveyWaveAvailable,
  recordStudentCheckIn,
  upsertSurveyResponseSet,
  validatePortfolioFile,
  type AdvisorPilotDemo,
  type AttendanceStatus,
  type PortfolioDestination,
  type PortfolioDocumentType,
} from "../pilot-model";
import { usePrototype } from "../prototype-store";

const referenceChoices = [
  ...curriculumPrograms.map((program) => ({ value: program.id, label: `${program.name}, ${program.catalogYear}` })),
  { value: "undecided", label: "Undecided" },
  { value: "another_major", label: "Another major" },
  { value: "not_sure", label: "Not sure yet" },
];

const documentTypes: PortfolioDocumentType[] = ["Resume", "CV", "Activity list", "Course list", "Reflection", "Personal statement draft", "Advising document", "Hour record", "Research summary", "Other"];
const destinations: PortfolioDestination[] = ["Courses", "Experiences", "Reflection and Values", "Cohort or Support Network", "Your Story", "Application"];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="workspace-field"><span>{label}</span>{children}</label>;
}

function formatSessionTime(value: string) {
  return new Date(value).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function PilotStudentWorkspace() {
  const { state, setPilotState } = usePrototype();
  const [absenceNote, setAbsenceNote] = useState("");
  const summary = attendanceSummary(state.pilot);
  const sessions = [...state.pilot.attendance.sessions].sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  const checkIn = (sessionId: string) => setPilotState((current) => recordStudentCheckIn(current, sessionId).state);
  const notifyAbsence = (sessionId: string) => {
    if (!absenceNote.trim()) return;
    setPilotState((current) => ({ ...current, attendance: { ...current.attendance, notifications: [...current.attendance.notifications, { id: makeId("absence"), sessionId, studentId: current.demoStudentId, createdAt: nowIso(), note: absenceNote.trim(), status: "notified" }] } }));
    setAbsenceNote("");
  };

  return <div className="workspace-grid pilot-workspace">
    <section className="workspace-card workspace-card--wide"><p className="kicker">Pilot checklist</p><h2>Attend, reflect, and keep your planning materials together.</h2><p className="workspace-intro">This local demonstration uses fictional sessions and survey shells. It does not submit institutional records.</p></section>
    <section className="workspace-card"><div className="pilot-card-heading"><div><p className="kicker">Attendance</p><h2>Program sessions</h2></div><strong>{summary.attended}/{summary.expected}</strong></div><div className="workspace-list">{sessions.map((session) => { const record = state.pilot.attendance.records.find((item) => item.sessionId === session.id); const open = isCheckInOpen(session); return <article key={session.id}><strong>{session.title}</strong><span>{session.format.replace("_", " ")} · {formatSessionTime(session.startsAt)}</span><small>{session.topic}. Fictional schedule for interface testing.</small><div className="workspace-actions"><button className="primary-button" disabled={!open || Boolean(record)} onClick={() => checkIn(session.id)}>{record ? `Recorded: ${record.status}` : open ? "Check in" : "Check-in unavailable"}</button></div></article>; })}</div><details className="guidance-details"><summary>Notify the program about an absence</summary><Field label="Brief note"><textarea value={absenceNote} onChange={(event) => setAbsenceNote(event.target.value)} placeholder="Fictional demonstration note only" /></Field><button className="secondary-button" disabled={!absenceNote.trim()} onClick={() => notifyAbsence(sessions[0].id)}>Save notification</button></details></section>
    <section className="workspace-card"><p className="kicker">Evaluation</p><h2>Pre and post surveys</h2><div className="workspace-list">{state.pilot.surveys.waves.map((wave) => { const response = state.pilot.surveys.responseSets.find((item) => item.waveId === wave.id); const available = isSurveyWaveAvailable(wave); return <article key={wave.id}><strong>{wave.label}</strong><span>{response?.status.replace("_", " ") ?? (available ? "not started" : "not available")}</span><small>{wave.instructions}</small><div className="workspace-actions"><button className="secondary-button" disabled={!available || response?.status === "complete"} onClick={() => setPilotState((current) => upsertSurveyResponseSet(current, wave.id, ["Interface shell reviewed"], true))}>{response?.status === "complete" ? "Complete" : "Open survey shell"}</button></div></article>; })}</div><p className="workspace-warning">Approved questions and permissions have not been supplied. No survey responses are collected in this prototype.</p></section>
  </div>;
}

export function CoursesPilotWorkspace() {
  const { state, dispatch, setPilotState } = usePrototype();
  const selected = curriculumPrograms.find((item) => item.id === state.pilot.courses.selectedReference);
  const [rawCourseCode, setRawCourseCode] = useState("");
  const [courseName, setCourseName] = useState("");
  const [courseStatus, setCourseStatus] = useState("planned");
  const [term, setTerm] = useState("");
  const [grade, setGrade] = useState("");
  const [preferNoGrade, setPreferNoGrade] = useState(false);
  const [question, setQuestion] = useState("");
  const match = selected ? matchCourseCode(selected.id, rawCourseCode) : { status: "unmatched" as const, candidateRequirementIds: [] };
  const matchedIds = state.courses.map((course) => course.matchedRequirementId).filter((value): value is string => Boolean(value));
  const completeness = selected && state.pilot.courses.compareThroughTermId ? snapshotCompleteness(selected.id, state.pilot.courses.compareThroughTermId, matchedIds) : null;
  const annotations = selected ? curriculumAnnotations.filter((item) => item.programId === selected.id && item.studentVisible) : [];

  const saveSnapshot = () => {
    if (!courseName.trim() && !question.trim()) return;
    const matchStatus = match.status;
    const course: CoursePlan = {
      id: makeId("course"), name: courseName.trim() || "Planning question", state: courseStatus as CoursePlan["state"], term: term.trim(), requirement: "Student-reported planning snapshot", question: question.trim(), updatedAt: nowIso(), transcriptGrade: preferNoGrade ? "" : grade.trim(), preferNoGrade, rawCourseCode: rawCourseCode.trim(), normalizedCourseCode: normalizeCourseCode(rawCourseCode), matchStatus, matchedRequirementId: match.status === "exact" ? match.candidateRequirementIds[0] : undefined, transcriptChecked: false,
    };
    dispatch({ type: "UPSERT_COURSE", course });
    setRawCourseCode(""); setCourseName(""); setTerm(""); setGrade(""); setQuestion("");
  };

  return <div className="workspace-grid pilot-workspace">
    <section className="workspace-card workspace-card--wide"><div className="visual-sequence"><span>Select a reference</span><span>Explore the sequence</span><span>Save what you know</span><span>Bring questions</span></div><h2>Build a course planning snapshot</h2><p className="workspace-intro">A transcript is helpful, but not required. Start with what you remember and confirm details later.</p><Field label="Curriculum reference"><select value={state.pilot.courses.selectedReference} onChange={(event) => setPilotState((current) => ({ ...current, courses: { ...current.courses, selectedReference: event.target.value as typeof current.courses.selectedReference, compareThroughTermId: "" } }))}>{referenceChoices.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field><p className="character-note">{curriculumDisclaimer}</p></section>
    {selected ? <section className="workspace-card workspace-card--wide"><div className="pilot-card-heading"><div><p className="kicker">Published reference</p><h2>{selected.name}</h2></div><strong>{selected.publishedTotalCreditHours} credits</strong></div><div className="curriculum-terms">{selected.terms.map((publishedTerm) => <details key={publishedTerm.id} open={publishedTerm.sequenceOrder === 1}><summary>{publishedTerm.classYear} · {publishedTerm.term}<span>{publishedTerm.publishedTermTotal} credits</span></summary><ul>{publishedTerm.requirements.map((requirement) => <li key={requirement.id}><div><strong>{requirement.rawCourseCode || "Requirement"}</strong> {requirement.publishedTitle}</div><span>{requirement.publishedCreditText || "Credit not displayed"}</span></li>)}</ul></details>)}</div><div className="planning-attention"><h3>Planning attention points</h3>{annotations.map((item) => <article key={item.id}><strong>{item.title}</strong><p>{item.description}</p><small>{item.evidenceStatus.replaceAll("_", " ")}</small></article>)}</div></section> : <section className="workspace-card workspace-card--wide"><h2>Choose when you are ready.</h2><p className="workspace-intro">You can still save courses and questions without selecting a published curriculum reference.</p></section>}
    <section className="workspace-card"><h2>Add one course or question</h2><div className="field-pair"><Field label="Course code"><input value={rawCourseCode} onChange={(event) => setRawCourseCode(event.target.value)} placeholder="CH 241" /></Field><Field label="Course title"><input value={courseName} onChange={(event) => setCourseName(event.target.value)} placeholder="What you remember is enough" /></Field></div><div className="field-pair"><Field label="Status"><select value={courseStatus} onChange={(event) => setCourseStatus(event.target.value)}><option value="planned">Planned</option><option value="enrolled">In progress</option><option value="completed">Completed</option><option value="uncertain">Unsure</option><option value="advisor-review">Needs advisor review</option></select></Field><Field label="Term"><input value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Fall 2026" /></Field></div><Field label="Optional grade"><input disabled={preferNoGrade} value={grade} onChange={(event) => setGrade(event.target.value)} placeholder="Leave blank if unavailable" /></Field><label className="check-row"><input type="checkbox" checked={preferNoGrade} onChange={(event) => setPreferNoGrade(event.target.checked)} />Prefer not to enter a grade</label><Field label="Question for an advisor"><textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="What do you want to confirm?" /></Field>{rawCourseCode ? <p className={match.status === "exact" ? "workspace-safe" : "workspace-warning"}>Reference match: {match.status}. {match.status === "ambiguous" ? "You or an advisor must confirm the intended row." : match.status === "unmatched" ? "The entry will remain student-reported." : "Exact code match found."}</p> : null}<button className="primary-button" disabled={!courseName.trim() && !question.trim()} onClick={saveSnapshot}>Save snapshot</button></section>
    <section className="workspace-card"><h2>Compare, do not predict</h2>{selected ? <><Field label="Compare entries through"><select value={state.pilot.courses.compareThroughTermId} onChange={(event) => setPilotState((current) => ({ ...current, courses: { ...current.courses, compareThroughTermId: event.target.value } }))}><option value="">Choose a term</option>{selected.terms.map((item) => <option key={item.id} value={item.id}>{item.classYear} · {item.term}</option>)}</select></Field>{completeness ? <div className="alignment-grid"><article><span>{completeness.reported}</span><p>student-reported exact matches</p></article><article><span>{completeness.published}</span><p>published rows through this term</p></article></div> : null}</> : <p className="workspace-intro">Select a curriculum reference to compare your snapshot with published rows.</p>}<p className="character-note">This comparison does not calculate GPA, degree progress, eligibility, risk, or admissions readiness.</p></section>
    <section className="workspace-card workspace-card--wide"><h2>Planning scenarios and resources</h2>{approvedCourseScenarios.length || approvedCourseResources.length ? null : <p className="workspace-warning">Content under development. No scenarios or resources will appear until an authorized reviewer approves them.</p>}</section>
  </div>;
}

export function PortfolioPilotWorkspace() {
  const { state, setPilotState } = usePrototype();
  const [preview, setPreview] = useState<{ name: string; size: number; type: string } | null>(null);
  const [fileError, setFileError] = useState("");
  const [title, setTitle] = useState("");
  const [documentType, setDocumentType] = useState<PortfolioDocumentType>("Resume");
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [proposed, setProposed] = useState<PortfolioDestination[]>([]);
  const [confirmed, setConfirmed] = useState<PortfolioDestination[]>([]);

  const chooseFile = (file?: File) => {
    if (!file) return;
    const error = validatePortfolioFile(file);
    setFileError(error ?? "");
    setPreview(error ? null : { name: file.name, size: file.size, type: file.type });
    if (!error && !title) setTitle(file.name.replace(/\.[^.]+$/, ""));
  };
  const save = () => {
    if (!preview || !title.trim()) return;
    setPilotState((current) => ({ ...current, portfolioDocuments: [{ id: makeId("document"), title: title.trim(), documentType, documentDate: date, description: description.trim(), addedAt: nowIso(), sourceProvenance: "local_preview_only", originalBytesStored: false, revisionHistory: [], proposedDestinations: proposed, confirmedDestinations: confirmed, shareWithAdvisor: false, sharingExpiresAt: null }, ...current.portfolioDocuments] }));
    setPreview(null); setTitle(""); setDate(""); setDescription(""); setProposed([]); setConfirmed([]);
  };

  return <div className="workspace-grid pilot-workspace"><section className="workspace-card"><p className="kicker">Local preview</p><h2>Add a planning document</h2><Field label="Choose a document"><input type="file" accept={acceptedPortfolioTypes.join(",")} onChange={(event) => chooseFile(event.target.files?.[0])} /></Field>{fileError ? <p className="workspace-warning">{fileError}</p> : null}{preview ? <div className="file-preview"><strong>{preview.name}</strong><span>{Math.ceil(preview.size / 1024)} KB · {preview.type}</span><small>Previewed in memory only. The file name and bytes will not be saved.</small></div> : null}<Field label="Title"><input value={title} onChange={(event) => setTitle(event.target.value)} /></Field><div className="field-pair"><Field label="Type"><select value={documentType} onChange={(event) => setDocumentType(event.target.value as PortfolioDocumentType)}>{documentTypes.map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="Document date"><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></Field></div><Field label="Short description"><textarea value={description} onChange={(event) => setDescription(event.target.value)} /></Field><fieldset className="source-picker"><legend>Possible destinations</legend>{destinations.map((item) => <label key={item}><input type="checkbox" checked={proposed.includes(item)} onChange={(event) => setProposed((current) => event.target.checked ? [...current, item] : current.filter((value) => value !== item))} />{item}</label>)}</fieldset>{proposed.length ? <fieldset className="source-picker"><legend>Confirm each destination</legend>{proposed.map((item) => <label key={item}><input type="checkbox" checked={confirmed.includes(item)} onChange={(event) => setConfirmed((current) => event.target.checked ? [...current, item] : current.filter((value) => value !== item))} />Use in {item}</label>)}</fieldset> : null}<button className="primary-button" disabled={!preview || !title.trim()} onClick={save}>Save document details</button><p className="character-note">Do not add real student documents to this public prototype.</p></section><section className="workspace-card"><p className="kicker">Portfolio</p><h2>Document history</h2><div className="workspace-list">{state.pilot.portfolioDocuments.map((document) => <article key={document.id}><strong>{document.title}</strong><span>{document.documentType} · {document.sourceProvenance.replaceAll("_", " ")}</span><small>{document.description || "No description"}</small><small>{document.confirmedDestinations.length ? `Confirmed for ${document.confirmedDestinations.join(", ")}` : "No destination confirmed"}</small></article>)}</div></section></div>;
}

export function AdminPilotPanel() {
  const { state, setPilotState } = usePrototype();
  const [status, setStatus] = useState<AttendanceStatus>("present");
  const [reason, setReason] = useState("");
  const record = state.pilot.attendance.records[0];
  return <><section className="workspace-card workspace-card--wide"><div className="reviewer-section-heading"><div><p className="kicker">Pilot operations</p><h2>Attendance and survey configuration</h2></div><p>Fictional records only. Production identity, authorization, and audit storage are not active.</p></div><div className="advisor-context-grid"><section><h3>Attendance correction</h3>{record ? <><Field label="Correct status"><select value={status} onChange={(event) => setStatus(event.target.value as AttendanceStatus)}><option value="present">Present</option><option value="absent">Absent</option><option value="excused">Excused</option><option value="not_recorded">Not recorded</option></select></Field><Field label="Required reason"><input value={reason} onChange={(event) => setReason(event.target.value)} /></Field><button className="secondary-button" disabled={!reason.trim()} onClick={() => { setPilotState((current) => correctAttendance(current, record.id, status, "fictional-admin", reason.trim())); setReason(""); }}>Record correction</button></> : <p>No fictional check-in has been recorded yet.</p>}</section><section><h3>Survey waves</h3>{state.pilot.surveys.waves.map((wave) => <p key={wave.id}><strong>{wave.label}:</strong> {wave.status.replaceAll("_", " ")}</p>)}<p className="workspace-warning">Instrument items remain blocked until permissions, versions, and approved wording are supplied.</p></section><section><h3>Participation threshold</h3><Field label="Admin-configured percentage"><input type="number" min="0" max="100" value={state.pilot.attendance.participationWarningThreshold} onChange={(event) => setPilotState((current) => ({ ...current, attendance: { ...current.attendance, participationWarningThreshold: Number(event.target.value) } }))} /></Field><p>No automated consequences or notifications.</p></section></div></section><section className="workspace-card workspace-card--wide"><h2>Curriculum data review queue</h2><div className="workspace-list">{curriculumDataNotes.map((note) => <article key={note.id}><strong>{note.noteType.replaceAll("_", " ")}</strong><span>{note.programId} · source page {note.sourcePage}</span><small>{note.description}</small><Field label="Review status"><select value={state.pilot.courses.dataNoteStatuses[note.id] ?? note.reviewStatus} onChange={(event) => setPilotState((current) => ({ ...current, courses: { ...current.courses, dataNoteStatuses: { ...current.courses.dataNoteStatuses, [note.id]: event.target.value as "needs_review" | "confirmed" | "rejected" } } }))}><option value="needs_review">Needs review</option><option value="confirmed">Confirmed</option><option value="rejected">Rejected</option></select></Field></article>)}</div></section></>;
}

export function AdvisorPilotPanel({ demo, packetActive }: { demo: AdvisorPilotDemo; packetActive: boolean }) {
  const { state } = usePrototype();
  const localShared = useMemo(() => advisorVisiblePortfolio(state.pilot.portfolioDocuments, packetActive), [packetActive, state.pilot.portfolioDocuments]);
  if (!packetActive) return null;
  return <section className="workspace-card workspace-card--wide"><div className="reviewer-section-heading"><div><p className="kicker">Student-selected pilot summary</p><h2>Attendance, surveys, courses, and documents</h2></div><p>Read-only. Visibility ends with the advising packet.</p></div><div className="student-snapshot-grid"><article><span>Attendance</span><strong>{demo.attendance.attended}/{demo.attendance.expected} · {demo.attendance.percentage}%</strong></article><article><span>Pre-survey</span><strong>{demo.surveyStatus.pre}</strong></article><article><span>Post-survey</span><strong>{demo.surveyStatus.post}</strong></article><article><span>Curriculum reference</span><strong>{demo.referenceProgram}</strong></article></div><div className="advisor-context-grid"><section><h3>Course snapshot</h3>{demo.courseSnapshot.map((item) => <article key={item.course}><strong>{item.course}</strong><p>{item.status}</p><small>{item.question}</small></article>)}</section><section><h3>Shared documents</h3>{[...demo.sharedDocuments, ...localShared.map((item) => ({ title: item.title, type: item.documentType }))].map((item) => <p key={`${item.title}-${item.type}`}><strong>{item.title}</strong><br />{item.type}</p>) || <p>No documents selected.</p>}</section><section><h3>Packet history</h3>{demo.packetHistory.map((item) => <p key={item}>{item}</p>)}</section></div><p className="character-note">Advisor access is read-only. Private notes, file bytes, survey answers, drafts, contacts, and check-ins are not exposed.</p></section>;
}
