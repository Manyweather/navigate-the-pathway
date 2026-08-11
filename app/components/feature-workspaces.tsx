"use client";

import { useEffect, useMemo, useState } from "react";
import { buildApplicationExport, buildApplicationExportText } from "../application-export";
import {
  aamcAcademicStatuses,
  aamcCourseClassifications,
  aamcCourseworkChecks,
  aamcExperienceChecks,
  aamcGuide,
  aamcLimits,
  aamcSpecialCourseTypes,
  pathwayExperienceTypes,
} from "../aamc-guidance";
import {
  advisorDemoStudents,
  makeArtifact,
  makeDraft,
  makeId,
  nowIso,
  personaIntakes,
  recommendRoute,
  routeContent,
  sensitiveSignals,
  type Artifact,
  type CoursePlan,
  type DestinationId,
  type PersonaPreset,
  type WorkflowType,
} from "../demo-model";
import { usePrototype } from "../prototype-store";
import { RosieGuide } from "./rosie-guide";

export type WorkspaceId = "course" | "experience" | "compassion" | "cohort" | "reflection" | "application";

const workspaceLabels: { id: WorkspaceId; name: string; action: string }[] = [
  { id: "course", name: "Courses", action: "Plan" },
  { id: "experience", name: "Experiences", action: "Track" },
  { id: "compassion", name: "Compassion & Values", action: "Notice" },
  { id: "cohort", name: "Cohort", action: "Connect" },
  { id: "reflection", name: "Your Story", action: "Reflect" },
  { id: "application", name: "Application", action: "Prepare" },
];

const routeDestination: Record<WorkspaceId, DestinationId> = {
  course: "course",
  experience: "experience",
  compassion: "reflection",
  cohort: "community",
  reflection: "reflection",
  application: "advisor",
};

const presetLabels: Record<PersonaPreset, string> = {
  sparse: "Sparse records",
  quiet: "Quiet participation",
  overloaded: "Limited bandwidth",
  course: "Course uncertainty",
  story: "Reflection gap",
  exposure: "Narrow exposure",
  support: "Thin support network",
  application: "Application preparation",
};

const destinationWorkspace: Record<DestinationId, WorkspaceId> = {
  course: "course",
  experience: "experience",
  reflection: "reflection",
  learning: "course",
  support: "cohort",
  community: "cohort",
  story: "reflection",
  advisor: "application",
};

function useAutosavedDraft(
  key: string,
  workflow: WorkflowType,
  fields: Record<string, string | number | boolean | string[]>,
  enabled = true,
) {
  const { dispatch } = usePrototype();
  const serialized = JSON.stringify(fields);
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setTimeout(() => {
      const savedFields = JSON.parse(serialized) as Record<string, string | number | boolean | string[]>;
      dispatch({ type: "UPSERT_DRAFT", draft: makeDraft(key, workflow, savedFields) });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [dispatch, enabled, key, serialized, workflow]);
}

function PrivacySignals({ value }: { value: string }) {
  const signals = sensitiveSignals(value);
  if (!signals.length) return <p className="workspace-safe">No common identifiers detected.</p>;
  return <p className="workspace-warning" role="alert">Remove {signals.join(", ")} before saving.</p>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="workspace-field"><span>{label}</span>{children}</label>;
}

function WorkspaceHeader({ id, onBack }: { id: WorkspaceId; onBack: () => void }) {
  const current = workspaceLabels.find((item) => item.id === id) ?? workspaceLabels[0];
  return <header className="workspace-header"><button className="text-button" onClick={onBack}>Back to map</button><div><p className="kicker">{current.action}</p><h1>{current.name}</h1></div></header>;
}

function CourseWorkspace() {
  const { state, dispatch } = usePrototype();
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [courseState, setCourseState] = useState<"completed" | "enrolled" | "planned" | "uncertain" | "advisor-review">("planned");
  const [term, setTerm] = useState("");
  const [question, setQuestion] = useState("");
  const [institution, setInstitution] = useState("");
  const [courseNumber, setCourseNumber] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [academicStatus, setAcademicStatus] = useState("");
  const [classification, setClassification] = useState("");
  const [credits, setCredits] = useState("");
  const [transcriptGrade, setTranscriptGrade] = useState("");
  const [labType, setLabType] = useState("");
  const [specialCourseType, setSpecialCourseType] = useState("");
  const [transcriptChecked, setTranscriptChecked] = useState(false);
  const [strategy, setStrategy] = useState("");
  const [prediction, setPrediction] = useState("");
  const [schedule, setSchedule] = useState("");

  useAutosavedDraft("course:active", "course", {
    name, courseState, term, question, institution, courseNumber, academicYear,
    academicStatus, classification, credits, transcriptGrade, labType,
    specialCourseType, transcriptChecked,
  });

  const saveCourse = () => {
    dispatch({ type: "UPSERT_COURSE", course: {
      id: editingCourseId ?? makeId("course"), name: name.trim(), state: courseState, term: term.trim(),
      requirement: "Student planning note", question: question.trim(), updatedAt: nowIso(),
      institution: institution.trim(), courseNumber: courseNumber.trim(), academicYear: academicYear.trim(),
      academicStatus, classification, credits: credits.trim(), transcriptGrade: transcriptGrade.trim(),
      labType, specialCourseType, transcriptChecked,
    } });
    dispatch({ type: "CLEAR_DRAFT", key: "course:active" });
    setName(""); setTerm(""); setQuestion(""); setInstitution(""); setCourseNumber("");
    setAcademicYear(""); setAcademicStatus(""); setClassification(""); setCredits("");
    setTranscriptGrade(""); setLabType(""); setSpecialCourseType(""); setTranscriptChecked(false);
    setEditingCourseId(null);
  };
  const editCourse = (course: CoursePlan) => {
    setEditingCourseId(course.id); setName(course.name); setCourseState(course.state); setTerm(course.term); setQuestion(course.question);
    setInstitution(course.institution || ""); setCourseNumber(course.courseNumber || ""); setAcademicYear(course.academicYear || "");
    setAcademicStatus(course.academicStatus || ""); setClassification(course.classification || ""); setCredits(course.credits || "");
    setTranscriptGrade(course.transcriptGrade || ""); setLabType(course.labType || ""); setSpecialCourseType(course.specialCourseType || "");
    setTranscriptChecked(Boolean(course.transcriptChecked));
  };
  const saveExperiment = () => {
    dispatch({ type: "UPSERT_EXPERIMENT", experiment: { id: makeId("experiment"), strategy: strategy.trim(), prediction: prediction.trim(), intention: `When the study block begins, I will ${strategy.trim()}.`, schedule: schedule.trim(), observation: "", result: "", adjustment: "", status: "planned" } });
    dispatch({ type: "ADD_ARTIFACT", artifact: makeArtifact("learning_experiment", strategy.trim(), prediction.trim(), "Learning") });
    setStrategy(""); setPrediction(""); setSchedule("");
  };

  return <div className="workspace-grid">
    <section className="workspace-card workspace-card--wide">
      <div className="visual-sequence"><span>Transcript</span><span>Course details</span><span>Classification</span><span>Review</span></div>
      <h2>{editingCourseId ? "Review course details" : "Organize one course"}</h2>
      <p className="workspace-intro">Start with what you know. You can save a working note now and compare it with a transcript later.</p>
      <Field label="Course"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="The name you remember is enough for now" /></Field>
      <div className="field-pair"><Field label="Status"><select value={courseState} onChange={(event) => setCourseState(event.target.value as typeof courseState)}><option value="completed">Completed</option><option value="enrolled">Enrolled</option><option value="planned">Planned</option><option value="uncertain">Uncertain</option><option value="advisor-review">Needs advisor review</option></select></Field><Field label="Term"><input value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Fall 2026" /></Field></div>
      <details className="guidance-details"><summary>Align with a transcript when you are ready</summary><p className="guidance-intro">These optional details make later application preparation easier. Leave anything blank until you can verify it.</p><div className="field-pair"><Field label="Institution"><input value={institution} onChange={(event) => setInstitution(event.target.value)} placeholder="Institution on transcript" /></Field><Field label="Course number"><input value={courseNumber} onChange={(event) => setCourseNumber(event.target.value)} placeholder="BIO 101" /></Field></div><div className="field-pair"><Field label="Academic year"><input value={academicYear} onChange={(event) => setAcademicYear(event.target.value)} placeholder="2025-2026" /></Field><Field label="Year in school"><select value={academicStatus} onChange={(event) => setAcademicStatus(event.target.value)}><option value="">Choose later</option>{aamcAcademicStatuses.map(([code, label]) => <option key={code} value={code}>{code}: {label}</option>)}</select></Field></div><Field label="Classification by primary content"><select value={classification} onChange={(event) => setClassification(event.target.value)}><option value="">Choose later</option>{aamcCourseClassifications.map((item) => <option key={item}>{item}</option>)}</select></Field><div className="field-triple"><Field label="Credits"><input value={credits} onChange={(event) => setCredits(event.target.value)} inputMode="decimal" /></Field><Field label="Transcript grade"><input value={transcriptGrade} onChange={(event) => setTranscriptGrade(event.target.value)} /></Field><Field label="Lab"><select value={labType} onChange={(event) => setLabType(event.target.value)}><option value="">Choose later</option><option>Lecture only</option><option>Lab only</option><option>Combined lecture and lab</option></select></Field></div><Field label="Special course type, if applicable"><select value={specialCourseType} onChange={(event) => setSpecialCourseType(event.target.value)}><option value="">None selected</option>{aamcSpecialCourseTypes.map((item) => <option key={item}>{item}</option>)}</select></Field><label className="check-row"><input type="checkbox" checked={transcriptChecked} onChange={(event) => setTranscriptChecked(event.target.checked)} /><span>I compared these details with a personal copy of the official transcript.</span></label></details>
      <Field label="Question for an advisor"><textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="What still needs review?" /></Field>
      <button className="primary-button" disabled={!name.trim()} onClick={saveCourse}>{editingCourseId ? "Update course record" : "Save course record"}</button>
      <details className="source-note"><summary>Why these fields?</summary><ul>{aamcCourseworkChecks.map((item) => <li key={item}>{item}</li>)}</ul><p>{aamcGuide.preparationNotice}</p></details>
    </section>
    <section className="workspace-card"><div className="visual-sequence"><span>Strategy</span><span>Prediction</span><span>Try</span><span>Review</span></div><h2>Run a study experiment</h2><Field label="Strategy"><input value={strategy} onChange={(event) => setStrategy(event.target.value)} placeholder="Two-minute retrieval check" /></Field><Field label="What do you predict?"><textarea value={prediction} onChange={(event) => setPrediction(event.target.value)} /></Field><Field label="When will you try it?"><input value={schedule} onChange={(event) => setSchedule(event.target.value)} /></Field><button className="primary-button" disabled={!strategy.trim() || !prediction.trim()} onClick={saveExperiment}>Save experiment</button></section>
    <section className="workspace-card"><h2>Course and strategy board</h2><div className="workspace-list">{state.courses.map((course) => <article key={course.id}><strong>{course.courseNumber ? `${course.courseNumber}: ` : ""}{course.name}</strong><span>{course.state.replace("-", " ")} · {course.term || "Term open"}</span><small>{[course.institution, course.classification, course.specialCourseType].filter(Boolean).join(" · ") || course.question || "Preparation details not added yet"}</small><button className="text-button" onClick={() => editCourse(course)}>Review or add details</button></article>)}{state.experiments.map((experiment) => <article key={experiment.id}><strong>{experiment.strategy}</strong><span>{experiment.status} · {experiment.schedule}</span><small>{experiment.prediction}</small></article>)}</div></section>
  </div>;
}

function ExperienceWorkspace({ quick = false }: { quick?: boolean }) {
  const { state, dispatch } = usePrototype();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [type, setType] = useState<string>(pathwayExperienceTypes[0]);
  const [organization, setOrganization] = useState("");
  const [role, setRole] = useState("");
  const [completedHours, setCompletedHours] = useState("");
  const [anticipatedHours, setAnticipatedHours] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [anticipatedStart, setAnticipatedStart] = useState("");
  const [anticipatedEnd, setAnticipatedEnd] = useState("");
  const [additionalDateRanges, setAdditionalDateRanges] = useState("");
  const [verifier, setVerifier] = useState("");
  const [mostMeaningful, setMostMeaningful] = useState(false);
  const [mostMeaningfulSummary, setMostMeaningfulSummary] = useState("");
  const fields = useMemo(() => ({ title, body, type, organization, role, completedHours, anticipatedHours, startDate, endDate, anticipatedStart, anticipatedEnd, additionalDateRanges, verifier, mostMeaningful, mostMeaningfulSummary }), [additionalDateRanges, anticipatedEnd, anticipatedHours, anticipatedStart, body, completedHours, endDate, mostMeaningful, mostMeaningfulSummary, organization, role, startDate, title, type, verifier]);
  useAutosavedDraft("experience:active", "experience", fields);
  const signals = sensitiveSignals(`${title} ${body} ${organization}`);
  const experiences = state.artifacts.filter((item) => item.kind === "experience");
  const mostMeaningfulCount = experiences.filter((item) => item.metadata.mostMeaningful === true).length;
  const editingArtifact = editingId ? experiences.find((item) => item.id === editingId) : null;
  const canChooseMostMeaningful = mostMeaningful || editingArtifact?.metadata.mostMeaningful === true || mostMeaningfulCount < aamcLimits.mostMeaningfulEntries;

  const edit = (artifact: Artifact) => {
    setEditingId(artifact.id); setTitle(artifact.title); setBody(artifact.body);
    setType(String(artifact.metadata.type || pathwayExperienceTypes[0])); setOrganization(String(artifact.metadata.organization || ""));
    setRole(String(artifact.metadata.role || "")); setCompletedHours(String(artifact.metadata.completedHours ?? artifact.metadata.hours ?? ""));
    setAnticipatedHours(String(artifact.metadata.anticipatedHours || "")); setAnticipatedStart(String(artifact.metadata.anticipatedStart || "")); setAnticipatedEnd(String(artifact.metadata.anticipatedEnd || ""));
    setAdditionalDateRanges(String(artifact.metadata.additionalDateRanges || "")); setVerifier(String(artifact.metadata.verifier || ""));
    setMostMeaningful(artifact.metadata.mostMeaningful === true); setMostMeaningfulSummary(String(artifact.metadata.mostMeaningfulSummary || ""));
    setStartDate(String(artifact.metadata.startDate || "")); setEndDate(String(artifact.metadata.endDate || ""));
  };
  const reset = () => { setEditingId(null); setTitle(""); setBody(""); setOrganization(""); setRole(""); setCompletedHours(""); setAnticipatedHours(""); setStartDate(""); setEndDate(""); setAnticipatedStart(""); setAnticipatedEnd(""); setAdditionalDateRanges(""); setVerifier(""); setMostMeaningful(false); setMostMeaningfulSummary(""); dispatch({ type: "CLEAR_DRAFT", key: "experience:active" }); };
  const save = () => {
    const metadata = { type, organization, role, hours: Number(completedHours) || 0, completedHours: Number(completedHours) || 0, anticipatedHours: Number(anticipatedHours) || 0, startDate, endDate, anticipatedStart, anticipatedEnd, additionalDateRanges, verifier, mostMeaningful, mostMeaningfulSummary };
    const existing = editingId ? state.artifacts.find((item) => item.id === editingId) : null;
    if (existing) {
      dispatch({ type: "UPDATE_ARTIFACT", artifact: { ...existing, title: title.trim(), body: body.trim(), metadata, revisions: [{ id: makeId("revision"), body: existing.body, createdAt: existing.updatedAt }, ...existing.revisions], updatedAt: nowIso() } });
    } else {
      dispatch({ type: "ADD_ARTIFACT", artifact: makeArtifact("experience", title.trim() || "Quick experience note", body.trim(), "Experience", metadata) });
    }
    reset();
  };

  return <div className="workspace-grid"><section className="workspace-card workspace-card--wide"><div className="visual-sequence"><span>Activity</span><span>Time</span><span>Meaning</span><span>Future use</span></div><h2>{editingId ? "Revise experience" : quick ? "Quick capture" : "Capture an experience"}</h2><p className="workspace-intro">Save what you remember now. Dates, hours, and application details can be added when you are ready.</p><div className="field-pair"><Field label="Experience name"><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="A name that future-you will recognize" /></Field><Field label="Planning category"><select value={type} onChange={(event) => setType(event.target.value)}>{!pathwayExperienceTypes.includes(type as typeof pathwayExperienceTypes[number]) ? <option>{type}</option> : null}{pathwayExperienceTypes.map((item) => <option key={item}>{item}</option>)}</select></Field></div><Field label="Specific moment and learning"><textarea maxLength={aamcLimits.experienceDescriptionCharacters} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Keep names and identifying details out." /></Field><p className="field-counter">{body.length} / {aamcLimits.experienceDescriptionCharacters} characters for a future plain-text description</p>{!quick ? <details className="guidance-details"><summary>Add dates, hours, and application preparation</summary><p className="guidance-intro">These details are optional today. Keeping completed and future hours separate prevents confusion later.</p><div className="field-pair"><Field label="Organization"><input value={organization} onChange={(event) => setOrganization(event.target.value)} /></Field><Field label="Role or title"><input value={role} onChange={(event) => setRole(event.target.value)} /></Field></div><fieldset className="range-card"><legend>Completed time</legend><div className="field-triple"><Field label="Start"><input type="month" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></Field><Field label="End"><input type="month" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></Field><Field label="Completed hours"><input type="number" min="0" value={completedHours} onChange={(event) => setCompletedHours(event.target.value)} /></Field></div></fieldset><fieldset className="range-card"><legend>Anticipated time</legend><div className="field-triple"><Field label="Future start"><input type="month" value={anticipatedStart} onChange={(event) => setAnticipatedStart(event.target.value)} /></Field><Field label="Future end"><input type="month" value={anticipatedEnd} onChange={(event) => setAnticipatedEnd(event.target.value)} /></Field><Field label="Anticipated hours"><input type="number" min="0" value={anticipatedHours} onChange={(event) => setAnticipatedHours(event.target.value)} /></Field></div></fieldset><Field label="Other recurring date ranges"><textarea value={additionalDateRanges} onChange={(event) => setAdditionalDateRanges(event.target.value)} placeholder="Optional. Add up to three more ranges, one per line." /></Field><Field label="Who could verify this experience?"><input value={verifier} onChange={(event) => setVerifier(event.target.value)} placeholder="Name or role. Add contact details only in the official application." /></Field><label className="check-row"><input type="checkbox" checked={mostMeaningful} disabled={!canChooseMostMeaningful} onChange={(event) => setMostMeaningful(event.target.checked)} /><span>Keep this as a possible Most Meaningful experience ({mostMeaningfulCount} of {aamcLimits.mostMeaningfulEntries} selected)</span></label>{mostMeaningful ? <><Field label="Why might this be especially meaningful?"><textarea maxLength={aamcLimits.mostMeaningfulCharacters} value={mostMeaningfulSummary} onChange={(event) => setMostMeaningfulSummary(event.target.value)} /></Field><p className="field-counter">{mostMeaningfulSummary.length} / {aamcLimits.mostMeaningfulCharacters} characters</p></> : null}<details className="source-note"><summary>Application direction</summary><ul>{aamcExperienceChecks.map((item) => <li key={item}>{item}</li>)}</ul><p>{aamcGuide.preparationNotice}</p></details></details> : null}<PrivacySignals value={`${title} ${body} ${organization}`} /><div className="workspace-actions"><button className="primary-button" disabled={!body.trim() || signals.length > 0} onClick={save}>{editingId ? "Save revision" : "Save experience"}</button>{editingId ? <button className="text-button" onClick={reset}>Cancel revision</button> : null}<span>Autosaved on this device</span></div></section><section className="workspace-card workspace-card--wide"><div className="section-count"><div><h2>Experience history</h2><p>{experiences.length} saved. Later, you can choose up to {aamcLimits.experienceEntries} for an AMCAS application.</p></div><strong>{mostMeaningfulCount}/{aamcLimits.mostMeaningfulEntries}<small>possible Most Meaningful</small></strong></div><div className="workspace-list">{experiences.map((artifact) => <article key={artifact.id}><strong>{artifact.title}</strong><span>{String(artifact.metadata.type || "Experience")} · {String(artifact.metadata.completedHours ?? artifact.metadata.hours ?? 0)} completed hours{Number(artifact.metadata.anticipatedHours || 0) > 0 ? ` · ${artifact.metadata.anticipatedHours} anticipated` : ""}</span><small>{artifact.body}</small>{artifact.metadata.mostMeaningful === true ? <em className="meaningful-badge">Possible Most Meaningful</em> : null}<button className="text-button" onClick={() => edit(artifact)}>Revise</button></article>)}</div></section></div>;
}

function CompassionWorkspace() {
  const { state, dispatch } = usePrototype();
  const [context, setContext] = useState("");
  const [barrier, setBarrier] = useState("");
  const [response, setResponse] = useState("");
  const [reflection, setReflection] = useState("");
  const combined = `${context} ${barrier} ${response} ${reflection}`;
  useAutosavedDraft("compassion:active", "reflection", { context, barrier, response, reflection });
  const save = () => {
    dispatch({ type: "ADD_ARTIFACT", artifact: makeArtifact("reflection", "Compassion in context", `Context: ${context}\nBarrier: ${barrier}\nResponse: ${response}\nReflection: ${reflection}`, "Compassion", { mode: "service" }) });
    dispatch({ type: "CLEAR_DRAFT", key: "compassion:active" }); setContext(""); setBarrier(""); setResponse(""); setReflection("");
  };
  const items = state.artifacts.filter((item) => item.domain === "Compassion");
  return <div className="workspace-grid"><section className="workspace-card workspace-card--wide"><div className="workspace-why"><strong>Why notice compassion?</strong><p>Noticing needs, barriers, and responses helps you connect your values to action and become more attentive to the people you may serve.</p></div><div className="visual-sequence"><span>Person + context</span><span>Need or barrier</span><span>Compassionate response</span><span>Reflection</span></div><h2>Connect compassion to your values</h2><div className="field-pair"><Field label="Person and context"><textarea value={context} onChange={(event) => setContext(event.target.value)} /></Field><Field label="Need or barrier"><textarea value={barrier} onChange={(event) => setBarrier(event.target.value)} /></Field></div><div className="field-pair"><Field label="How did compassion show up or go missing?"><textarea value={response} onChange={(event) => setResponse(event.target.value)} /></Field><Field label="What will you carry forward?"><textarea value={reflection} onChange={(event) => setReflection(event.target.value)} /></Field></div><PrivacySignals value={combined} /><button className="primary-button" disabled={!barrier.trim() || !reflection.trim() || sensitiveSignals(combined).length > 0} onClick={save}>Save reflection</button></section>{items.length ? <section className="workspace-card workspace-card--wide"><h2>Compassion and values reflections</h2><div className="workspace-list">{items.map((item) => <article key={item.id}><strong>{item.title}</strong><small>{item.body}</small></article>)}</div></section> : null}</div>;
}

function CohortWorkspace() {
  const { state, dispatch } = usePrototype();
  const [supportLabel, setSupportLabel] = useState("");
  const [helpsWith, setHelpsWith] = useState("");
  const [nextContact, setNextContact] = useState("");
  const [postTitle, setPostTitle] = useState("");
  const [postBody, setPostBody] = useState("");
  const [reply, setReply] = useState<Record<string, string>>({});
  const postSignals = sensitiveSignals(`${postTitle} ${postBody}`);
  const saveSupport = () => { dispatch({ type: "UPSERT_SUPPORT", support: { id: makeId("support"), role: "academic", label: supportLabel.trim(), helpsWith: helpsWith.trim(), contactMethod: "Student choice", nextContact: nextContact.trim(), privateDetails: "Device-only planning note" } }); setSupportLabel(""); setHelpsWith(""); setNextContact(""); };
  const post = () => { dispatch({ type: "ADD_POST", post: { id: makeId("post"), author: "You", type: "ask", title: postTitle.trim(), body: postBody.trim(), createdAt: nowIso(), reactions: 0, reacted: false, replies: [], reported: false, muted: false } }); setPostTitle(""); setPostBody(""); };
  return <div className="workspace-grid"><section className="workspace-card"><div className="visual-sequence"><span>Notice</span><span>Choose role</span><span>Ask</span><span>Follow up</span></div><h2>Map one support role</h2><p className="workspace-intro">Your cohort can include classmates, mentors, advisors, and others who help you stay connected and move forward.</p><Field label="Role or person"><input value={supportLabel} onChange={(event) => setSupportLabel(event.target.value)} placeholder="Faculty advisor" /></Field><Field label="What can they help with?"><input value={helpsWith} onChange={(event) => setHelpsWith(event.target.value)} /></Field><Field label="Next contact"><input value={nextContact} onChange={(event) => setNextContact(event.target.value)} /></Field><button className="primary-button" disabled={!supportLabel.trim()} onClick={saveSupport}>Save privately</button><div className="support-orbit">{state.supports.map((item) => <span key={item.id}>{item.label}<small>{item.helpsWith}</small></span>)}</div></section><section className="workspace-card"><div className="visual-sequence"><span>Observe</span><span>Encourage</span><span>Respond</span><span>Connect, if useful</span></div><h2>Add to the practice message board</h2><p className="workspace-intro">Ask a question, offer encouragement, or share a resource. You can also participate by reading.</p><Field label="Post title"><input value={postTitle} onChange={(event) => setPostTitle(event.target.value)} /></Field><Field label="Message"><textarea value={postBody} onChange={(event) => setPostBody(event.target.value)} /></Field><PrivacySignals value={`${postTitle} ${postBody}`} /><button className="primary-button" disabled={!postTitle.trim() || !postBody.trim() || postSignals.length > 0} onClick={post}>Add to practice board</button></section><section className="workspace-card workspace-card--wide"><h2>Shared practice message board</h2><p className="workspace-intro">This fictional, device-only board demonstrates how students could exchange questions, encouragement, and resources.</p><div className="cohort-board">{state.communityPosts.filter((item) => !item.muted).map((item) => <article key={item.id}><span>{item.type}</span><strong>{item.title}</strong><p>{item.body}</p><div><button onClick={() => dispatch({ type: "UPDATE_POST", post: { ...item, reacted: !item.reacted, reactions: item.reactions + (item.reacted ? -1 : 1) } })}>{item.reacted ? "Supported" : "Encourage"} · {item.reactions}</button><button onClick={() => dispatch({ type: "UPDATE_POST", post: { ...item, reported: true } })}>Report</button></div><Field label="Supportive reply"><input value={reply[item.id] || ""} onChange={(event) => setReply((current) => ({ ...current, [item.id]: event.target.value }))} /></Field><button className="text-button" disabled={!reply[item.id]?.trim()} onClick={() => { dispatch({ type: "UPDATE_POST", post: { ...item, replies: [...item.replies, reply[item.id].trim()] } }); setReply((current) => ({ ...current, [item.id]: "" })); }}>Add reply</button></article>)}</div></section></div>;
}

function ReflectionWorkspace() {
  const { state, dispatch } = usePrototype();
  const experiences = state.artifacts.filter((item) => item.kind === "experience");
  const [linked, setLinked] = useState(experiences[0]?.id || "");
  const [happened, setHappened] = useState("");
  const [mattered, setMattered] = useState("");
  const [next, setNext] = useState("");
  const [theme, setTheme] = useState("");
  const [story, setStory] = useState("");
  const [sourceIds, setSourceIds] = useState<string[]>([]);
  const reflectionText = `${happened} ${mattered} ${next}`;
  useAutosavedDraft("reflection:active", "reflection", { linked, happened, mattered, next });
  const saveReflection = () => { dispatch({ type: "ADD_ARTIFACT", artifact: makeArtifact("reflection", happened.trim().slice(0, 54) || "Reflection", `What happened: ${happened}\nWhy it mattered: ${mattered}\nWhat changes next: ${next}`, "Reflection", { linkedArtifactId: linked }) }); setHappened(""); setMattered(""); setNext(""); dispatch({ type: "CLEAR_DRAFT", key: "reflection:active" }); };
  const saveStory = () => { dispatch({ type: "ADD_ARTIFACT", artifact: makeArtifact("story", theme.trim() || "Story pattern", story.trim(), "Story Studio", { theme, sourceIds: sourceIds.join(",") }) }); setTheme(""); setStory(""); setSourceIds([]); };
  return <div className="workspace-grid"><section className="workspace-card"><div className="visual-sequence"><span>What happened</span><span>Why it mattered</span><span>What changes next</span></div><h2>Build a reflection</h2><Field label="Linked experience"><select value={linked} onChange={(event) => setLinked(event.target.value)}><option value="">None yet</option>{experiences.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></Field><Field label="What happened?"><textarea value={happened} onChange={(event) => setHappened(event.target.value)} /></Field><Field label="Why did it matter?"><textarea value={mattered} onChange={(event) => setMattered(event.target.value)} /></Field><Field label="What changes next?"><textarea value={next} onChange={(event) => setNext(event.target.value)} /></Field><PrivacySignals value={reflectionText} /><button className="primary-button" disabled={!happened.trim() || !mattered.trim() || sensitiveSignals(reflectionText).length > 0} onClick={saveReflection}>Save reflection</button></section><section className="workspace-card"><div className="visual-sequence"><span>Evidence</span><span>Pattern</span><span>Theme</span><span>Direction</span></div><h2>Story Studio</h2><Field label="Theme"><input value={theme} onChange={(event) => setTheme(event.target.value)} placeholder="Clear communication" /></Field><fieldset className="source-picker"><legend>Choose source entries</legend>{state.artifacts.filter((item) => item.kind === "experience" || item.kind === "reflection").map((item) => <label key={item.id}><input type="checkbox" checked={sourceIds.includes(item.id)} onChange={(event) => setSourceIds((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} />{item.title}</label>)}</fieldset><Field label="Story fragment"><textarea value={story} onChange={(event) => setStory(event.target.value)} /></Field><button className="primary-button" disabled={!story.trim() || !sourceIds.length} onClick={saveStory}>Save story fragment</button></section></div>;
}

function ApplicationWorkspace() {
  const { state, dispatch } = usePrototype();
  const [selectedIds, setSelectedIds] = useState<string[]>(state.packet.packetItemIds);
  const [advisorId, setAdvisorId] = useState(state.packet.advisorId || state.advisors[0]?.id || "");
  const [goal, setGoal] = useState(state.packet.meetingGoal);
  const [question, setQuestion] = useState(state.packet.questions.join("\n"));
  const [action, setAction] = useState(state.packet.proposedActions.join("\n"));
  const [expiresAt, setExpiresAt] = useState(state.packet.expiresAt.slice(0, 10));
  const data = useMemo(() => buildApplicationExport(state), [state]);
  const experienceCount = data.experienceGroups.reduce((total, group) => total + group.entries.length, 0);
  const mostMeaningfulCount = data.experienceGroups.flatMap((group) => group.entries).filter((item) => item.mostMeaningful).length;
  const transcriptCheckedCount = state.courses.filter((course) => course.transcriptChecked).length;
  const download = () => { const blob = new Blob([buildApplicationExportText(data)], { type: "text/markdown;charset=utf-8" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "navigate-the-pathway-application-notes.md"; link.click(); URL.revokeObjectURL(url); };
  const share = () => { const advisor = state.advisors.find((item) => item.id === advisorId); dispatch({ type: "PATCH_PACKET", patch: { advisorId, advisorName: advisor?.name || "Fictional advisor", meetingGoal: goal.trim(), questions: question.split("\n").filter(Boolean), proposedActions: action.split("\n").filter(Boolean), packetItemIds: selectedIds, status: "shared", expiresAt: new Date(`${expiresAt}T23:59:59`).toISOString() }, event: { id: makeId("event"), type: "shared", createdAt: nowIso(), safeDetail: "Student opened a limited advising share" } }); };
  const revoke = () => dispatch({ type: "PATCH_PACKET", patch: { status: "revoked", packetItemIds: [] }, event: { id: makeId("event"), type: "revoked", createdAt: nowIso(), safeDetail: "Student ended advisor visibility" } });
  return <div className="workspace-grid"><section className="workspace-card workspace-card--wide"><div className="visual-sequence"><span>Choose evidence</span><span>Name the goal</span><span>Set access</span><span>Review together</span></div><h2>Prepare an advising packet</h2><div className="packet-builder"><fieldset className="source-picker"><legend>Student-selected items</legend>{state.artifacts.map((item) => <label key={item.id}><input type="checkbox" checked={selectedIds.includes(item.id)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} />{item.title}<small>{item.kind.replaceAll("_", " ")}</small></label>)}</fieldset><div><Field label="Fictional advisor"><select value={advisorId} onChange={(event) => setAdvisorId(event.target.value)}>{state.advisors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="Meeting goal"><input value={goal} onChange={(event) => setGoal(event.target.value)} /></Field><Field label="Questions, one per line"><textarea value={question} onChange={(event) => setQuestion(event.target.value)} /></Field><Field label="Possible next actions"><textarea value={action} onChange={(event) => setAction(event.target.value)} /></Field><Field label="Access ends"><input type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></Field><div className="workspace-actions"><button className="primary-button" disabled={!selectedIds.length || !goal.trim()} onClick={share}>Open limited share</button>{state.packet.status === "shared" ? <button className="text-button" onClick={revoke}>Revoke now</button> : null}</div></div></div><p className="workspace-safe">Status: {state.packet.status}. Advisors see only selected items while this share is active.</p></section><section className="workspace-card workspace-card--wide"><div className="section-count"><div><h2>Application preparation</h2><p>Your records can become an application draft when you are ready.</p></div><strong>{experienceCount}/{aamcLimits.experienceEntries}<small>experience entries</small></strong></div><div className="alignment-grid"><article><span>{transcriptCheckedCount}/{state.courses.length || 0}</span><p>course records checked with a transcript</p></article><article><span>{mostMeaningfulCount}/{aamcLimits.mostMeaningfulEntries}</span><p>possible Most Meaningful experiences</p></article><article><span>{data.reflections.length}</span><p>saved reflections to revisit</p></article></div><div className="workspace-actions"><button className="primary-button" onClick={() => window.print()}>Print or save PDF</button><button className="secondary-button" onClick={download}>Download text</button></div><p className="character-note">The export keeps completed and anticipated hours separate and preserves plain-text working notes. {aamcGuide.preparationNotice}</p></section></div>;
}

function PortfolioWorkspace() {
  const { state } = usePrototype();
  const [kind, setKind] = useState("all");
  const items = state.artifacts.filter((item) => kind === "all" || item.kind === kind);
  return <section className="workspace-card workspace-card--wide portfolio-workspace"><div><p className="kicker">Portfolio history</p><h2>Every saved artifact and revision</h2></div><Field label="Filter"><select value={kind} onChange={(event) => setKind(event.target.value)}><option value="all">All work</option><option value="experience">Experiences</option><option value="reflection">Reflections</option><option value="learning_experiment">Study strategies</option><option value="story">Stories</option><option value="course_plan">Course plans</option></select></Field><div className="workspace-list">{items.map((item) => <article key={item.id}><strong>{item.title}</strong><span>{item.kind.replaceAll("_", " ")} · {new Date(item.updatedAt).toLocaleDateString()}</span><small>{item.body}</small>{item.revisions.length ? <details><summary>{item.revisions.length} earlier version{item.revisions.length === 1 ? "" : "s"}</summary>{item.revisions.map((revision) => <p key={revision.id}>{revision.body}</p>)}</details> : null}</article>)}</div></section>;
}

export function FeatureWorkspaces({ initial = "experience", quick = false, onBack }: { initial?: WorkspaceId; quick?: boolean; onBack: () => void }) {
  const [active, setActive] = useState<WorkspaceId>(initial);
  const [portfolio, setPortfolio] = useState(false);
  const current = workspaceLabels.find((item) => item.id === active) ?? workspaceLabels[1];
  return <main className="feature-workspace"><WorkspaceHeader id={active} onBack={onBack} /><RosieGuide pose="pointing" compact eyebrow="Recommended station" title={current.name} body="Choose one practical action. Everything saves on this device." /><nav className="workspace-nav" aria-label="Pathway stations">{workspaceLabels.map((item) => <button key={item.id} className={active === item.id && !portfolio ? "active" : ""} onClick={() => { setActive(item.id); setPortfolio(false); }}>{item.name}</button>)}<button className={portfolio ? "active" : ""} onClick={() => setPortfolio(true)}>Portfolio</button></nav>{portfolio ? <PortfolioWorkspace /> : active === "course" ? <CourseWorkspace /> : active === "experience" ? <ExperienceWorkspace quick={quick} /> : active === "compassion" ? <CompassionWorkspace /> : active === "cohort" ? <CohortWorkspace /> : active === "reflection" ? <ReflectionWorkspace /> : <ApplicationWorkspace />}</main>;
}

export function ReviewerWorkspace({
  mode,
  onBack,
  onOpenWorkspace,
}: {
  mode: "advisor" | "admin";
  onBack: () => void;
  onOpenWorkspace?: (workspace: WorkspaceId) => void;
}) {
  const [comment, setComment] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState(advisorDemoStudents[0].id);
  const [advisorReplies, setAdvisorReplies] = useState<Record<string, string[]>>({});
  const [selectedPreset, setSelectedPreset] = useState<PersonaPreset>("sparse");
  const presets = Object.keys(personaIntakes) as PersonaPreset[];
  const selectedStudent = advisorDemoStudents.find((student) => student.id === selectedStudentId) ?? advisorDemoStudents[0];
  const packetIsActive = selectedStudent.packet.status === "shared";
  const selectedIntake = personaIntakes[selectedPreset];
  const selectedRecommendation = recommendRoute(selectedIntake);
  const selectedRoute = routeContent[selectedRecommendation.recommendedRoute];

  const previewRoute = (preset: PersonaPreset) => {
    setSelectedPreset(preset);
    window.setTimeout(() => {
      const preview = document.getElementById("admin-route-preview");
      if (!preview) return;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      preview.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
      preview.focus({ preventScroll: true });
    }, 0);
  };

  const saveReply = () => {
    if (!comment.trim() || !packetIsActive) return;
    setAdvisorReplies((current) => ({ ...current, [selectedStudent.id]: [...(current[selectedStudent.id] || []), comment.trim()] }));
    setComment("");
  };

  if (mode === "admin") {
    const intakeSummary = [
      ["Stage", selectedIntake.stage || "Not answered"],
      ["First focus", selectedIntake.intention || "Not answered"],
      ["Coursework", selectedIntake.coursework || "Not answered"],
      ["Records", selectedIntake.records || "Not answered"],
      ["Reflection", selectedIntake.reflection || "Not answered"],
      ["Bandwidth", selectedIntake.bandwidth || "Not answered"],
      ["Participation", selectedIntake.participation || "Not answered"],
      ["Support roles", selectedIntake.supportRoles === null ? "Not answered" : String(selectedIntake.supportRoles)],
    ];
    return (
      <main className="feature-workspace reviewer-workspace">
        <header className="workspace-header"><button className="text-button" onClick={onBack}>Back</button><div><p className="kicker">Fictional reviewer view</p><h1>Pilot Administration</h1></div></header>
        <RosieGuide pose="idle" compact title="Nothing here represents a real student." body="Select a route to inspect the student context, recommendation logic, and destination it opens." />
        <section className="workspace-card workspace-card--wide">
          <div className="reviewer-section-heading"><div><p className="kicker">Route testing</p><h2>Eight functional route previews</h2></div><p>Select any fictional profile to open its full explanation below.</p></div>
          <div className="preset-grid">{presets.map((preset) => { const route = recommendRoute(personaIntakes[preset]); return <button key={preset} type="button" className={selectedPreset === preset ? "active" : ""} aria-pressed={selectedPreset === preset} onClick={() => previewRoute(preset)}><strong>{presetLabels[preset]}</strong><span>{routeContent[route.recommendedRoute].title}</span><small>{route.reasons[0]}</small><b>View route</b></button>; })}</div>
        </section>
        <section id="admin-route-preview" className="workspace-card workspace-card--wide route-preview" tabIndex={-1}>
          <div className="route-preview-header"><div><p className="kicker">Recommended for {presetLabels[selectedPreset]}</p><h2>{selectedRoute.title}</h2><p>{selectedRoute.meaning}</p></div><span>{selectedRecommendation.recommendedRoute}</span></div>
          <div className="student-snapshot-grid">{intakeSummary.map(([label, value]) => <article key={label}><span>{label}</span><strong>{value.replaceAll("_", " ")}</strong></article>)}</div>
          <div className="route-preview-columns">
            <section><h3>Why this route appeared</h3><ul>{selectedRecommendation.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul><p><strong>Alternate routes:</strong> {selectedRecommendation.alternateRoutes.map((route) => routeContent[route].title).join(", ")}</p></section>
            <section><h3>What the student sees next</h3><p>{selectedRoute.prompt}</p><p className="workspace-safe">The route uses readiness context only. It does not use GPA, MCAT, demographics, personality labels, or message volume.</p><button className="primary-button" type="button" onClick={() => onOpenWorkspace?.(destinationWorkspace[selectedRoute.destination])}>Open matching station tools</button></section>
          </div>
        </section>
        <section className="workspace-card workspace-card--wide"><h2>Pilot readiness</h2><ul className="readiness-list"><li>Backup moderator named</li><li>Advising relationships confirmed</li><li>Content sources reviewed for accuracy</li><li>Access and invitation strategy decided</li><li>Privacy, evaluation, and possible IRB conversation completed</li></ul><p className="workspace-safe">The Supabase schema is an architecture reference only. No production persistence is active.</p></section>
      </main>
    );
  }

  return (
    <main className="feature-workspace reviewer-workspace">
      <header className="workspace-header"><button className="text-button" onClick={onBack}>Back</button><div><p className="kicker">Fictional reviewer view</p><h1>Advisor student packets</h1></div></header>
      <RosieGuide pose="idle" compact title="Student information is organized one student at a time." body="Choose a fictional student. Only an active packet and the items that student selected will appear." />
      <section className="workspace-card workspace-card--wide advisor-student-picker">
        <Field label="Fictional student"><select value={selectedStudentId} onChange={(event) => { setSelectedStudentId(event.target.value); setComment(""); }}>{advisorDemoStudents.map((student) => <option key={student.id} value={student.id}>{student.name} · {student.packet.status}</option>)}</select></Field>
        <p>Four fictional records demonstrate active, expired, and revoked sharing states.</p>
      </section>
      <section className="workspace-card workspace-card--wide advisor-student-overview">
        <div className="student-profile-header"><span>{selectedStudent.initials}</span><div><p className="kicker">Fictional student</p><h2>{selectedStudent.name}</h2><p>{selectedStudent.focus}</p></div><b className={`packet-state packet-state--${selectedStudent.packet.status}`}>{selectedStudent.packet.status}</b></div>
        <div className="student-snapshot-grid"><article><span>Stage</span><strong>{selectedStudent.stage}</strong></article><article><span>Application timing</span><strong>{selectedStudent.cycle}</strong></article><article><span>Last packet update</span><strong>{new Date(selectedStudent.lastUpdated).toLocaleDateString()}</strong></article><article><span>Student-selected items</span><strong>{packetIsActive ? selectedStudent.packet.items.length : 0}</strong></article></div>
      </section>
      {packetIsActive ? <section className="workspace-card workspace-card--wide advisor-packet-detail">
        <div className="packet-status"><strong>{selectedStudent.packet.meetingGoal}</strong><span>shared · Access ends {new Date(selectedStudent.packet.expiresAt).toLocaleDateString()}</span></div>
        <div className="advisor-context-grid"><section><h3>Meeting goal</h3><p>{selectedStudent.packet.meetingGoal}</p></section><section><h3>Student questions</h3><ul>{selectedStudent.packet.questions.map((question) => <li key={question}>{question}</li>)}</ul></section><section><h3>Proposed next actions</h3><ul>{selectedStudent.packet.proposedActions.map((action) => <li key={action}>{action}</li>)}</ul></section></div>
        <div className="reviewer-section-heading"><div><p className="kicker">Visible to advisor</p><h2>Student-selected packet items</h2></div><p>Private reflections, contacts, drafts, and check-ins are not included.</p></div>
        <div className="workspace-list">{selectedStudent.packet.items.map((item) => <article key={item.id}><strong>{item.title}</strong><span>{item.kind.replaceAll("_", " ")} · {item.domain}</span><small>{item.body}</small></article>)}</div>
        <section className="advisor-thread"><h3>Coaching thread</h3>{selectedStudent.packet.comments.map((item) => <article key={item.id}><span>Advisor</span><p>{item.body}</p></article>)}{(advisorReplies[selectedStudent.id] || []).map((reply, index) => <article key={`${selectedStudent.id}-${index}`}><span>Your draft response</span><p>{reply}</p></article>)}</section>
        <Field label="Coaching question or next action"><textarea value={comment} onChange={(event) => setComment(event.target.value)} /></Field><button className="primary-button" disabled={!comment.trim()} onClick={saveReply}>Return one next action</button>
      </section> : <section className="workspace-card workspace-card--wide"><p className="workspace-warning">This packet is {selectedStudent.packet.status}. Its shared items, questions, and comments are no longer visible to the advisor.</p><p className="workspace-intro">The fictional student can open a new limited share later. Revocation and expiration remove packet visibility immediately.</p></section>}
    </main>
  );
}

export function workspaceForStation(station: string): WorkspaceId {
  return station === "courses" ? "course" : station === "evidence" ? "experience" : station === "service" ? "compassion" : station === "cohort" ? "cohort" : station === "reflection" ? "reflection" : "application";
}

export { routeDestination };
