"use client";

import { useCallback, useEffect, useState } from "react";
import { assetUrl } from "../asset-url";
import { RosieGuide } from "../components/rosie-guide";
import type { PilotApiClient } from "./api-client";

type StationId = "courses" | "evidence" | "service" | "cohort" | "reflection" | "application";

type Station = {
  id: StationId;
  name: string;
  short: string;
  icon: string;
  description: string;
  why: string;
  prompt: string;
  artifactType: string;
  artifactTitle: string;
};

type PathwayArtifact = {
  id: string;
  station: StationId;
  artifactType: string;
  title: string;
  content: { response?: string; prompt?: string };
  createdAt: string;
  updatedAt: string;
};

type PrimerAnswers = {
  stage: "junior" | "senior" | "gap" | "exploring";
  applicationTiming: "within_12_months" | "later" | "unsure";
  coursework: "clear" | "questions" | "starting";
  experienceTracking: "detailed" | "some" | "none";
  reflectionHabit: "regular" | "sometimes" | "not_yet";
  participation: "observe" | "structured" | "open";
  focus: StationId;
};

type PathwayPrimer = Omit<PathwayArtifact, "content"> & {
  content: {
    answers: PrimerAnswers;
    recommendedStation: StationId;
    reason: string;
    completedAt: string;
  };
};

type PrimerQuestion = {
  key: keyof PrimerAnswers;
  eyebrow: string;
  question: string;
  instruction: string;
  options: Array<{ value: string; icon: string; label: string; detail: string }>;
};

const stations: Station[] = [
  { id: "courses", name: "Courses", short: "Plan", icon: "📚", description: "Track prerequisites, clarify course questions, and plan study strategies.", why: "Clear course plans protect your time and keep more options open.", prompt: "What course question or study strategy do you want to act on next?", artifactType: "course_plan", artifactTitle: "Course question and follow-up" },
  { id: "evidence", name: "Experiences", short: "Track", icon: "🗂️", description: "Capture meaningful moments from service, clinical work, research, leadership, employment, and campus life.", why: "Specific examples fade. Recording them now makes later reflection and application writing easier.", prompt: "What happened, what did you do, and what mattered?", artifactType: "experience", artifactTitle: "Meaningful experience" },
  { id: "service", name: "Compassion & Values", short: "Notice", icon: "♡", description: "Notice how people experience care, access, barriers, dignity, and support.", why: "Noticing needs and responses connects your values to action and builds compassionate practice.", prompt: "What need or barrier did you notice, and what compassionate response followed?", artifactType: "reflection", artifactTitle: "Compassion and values reflection" },
  { id: "cohort", name: "Cohort", short: "Connect", icon: "👥", description: "Identify support, ask questions, encourage classmates, and exchange useful resources.", why: "Small, low-pressure interactions make support easier to give, receive, and request.", prompt: "What small way would you like to participate or ask for support?", artifactType: "action_plan", artifactTitle: "Cohort participation plan" },
  { id: "reflection", name: "Your Story", short: "Reflect", icon: "✍️", description: "Look across experiences to notice what matters to you, how you learn, and who you are becoming.", why: "Strong personal statements grow from repeated evidence and honest reflection.", prompt: "What pattern or meaning are you noticing across your experiences?", artifactType: "reflection", artifactTitle: "Story reflection" },
  { id: "application", name: "Application", short: "Prepare", icon: "📄", description: "Turn saved experiences and reflections into application examples and advising questions.", why: "Building from your own records reduces blank-page pressure and reveals what to develop next.", prompt: "What specific example could support an application or advising conversation?", artifactType: "application_example", artifactTitle: "Application-ready example" },
];

const primerQuestions: PrimerQuestion[] = [
  { key: "stage", eyebrow: "Your starting point", question: "Where are you in your premedical journey?", instruction: "Choose the closest fit. You can update this later.", options: [
    { value: "junior", icon: "③", label: "Junior", detail: "Building coursework and experiences" },
    { value: "senior", icon: "④", label: "Senior", detail: "Planning next steps and application timing" },
    { value: "gap", icon: "↗", label: "Gap-year planning", detail: "Continuing preparation after graduation" },
    { value: "exploring", icon: "⌁", label: "Still exploring", detail: "Not sure which description fits yet" },
  ] },
  { key: "applicationTiming", eyebrow: "Your timing", question: "When might you apply?", instruction: "An estimate is enough. This is not a commitment.", options: [
    { value: "within_12_months", icon: "◷", label: "Within 12 months", detail: "Application preparation is getting closer" },
    { value: "later", icon: "⌛", label: "More than a year away", detail: "There is time to build and reflect" },
    { value: "unsure", icon: "?", label: "Not sure yet", detail: "I am still considering my timeline" },
  ] },
  { key: "coursework", eyebrow: "Your courses", question: "How clear is your course plan?", instruction: "You do not need a transcript in front of you.", options: [
    { value: "clear", icon: "✓", label: "Mostly clear", detail: "I know what I have taken and what comes next" },
    { value: "questions", icon: "?", label: "I have questions", detail: "I want help checking choices or prerequisites" },
    { value: "starting", icon: "+", label: "Just starting", detail: "I have not mapped everything yet" },
  ] },
  { key: "experienceTracking", eyebrow: "Your experiences", question: "How much have you recorded?", instruction: "Think about service, clinical work, research, leadership, employment, and campus life.", options: [
    { value: "detailed", icon: "▤", label: "Useful details", detail: "I have dates, hours, and meaningful moments" },
    { value: "some", icon: "◫", label: "Some notes", detail: "I remember the work but details are scattered" },
    { value: "none", icon: "○", label: "Not yet", detail: "Most of it is still in my memory" },
  ] },
  { key: "reflectionHabit", eyebrow: "Your story", question: "How often do you reflect on what you are learning?", instruction: "Reflection can be a short note. It does not need to be an essay.", options: [
    { value: "regular", icon: "✎", label: "Regularly", detail: "I often capture meaning or change" },
    { value: "sometimes", icon: "◇", label: "Sometimes", detail: "I reflect when something stands out" },
    { value: "not_yet", icon: "○", label: "Not yet", detail: "I usually move on to the next task" },
  ] },
  { key: "participation", eyebrow: "Your support style", question: "How do you prefer to enter a new group?", instruction: "Every participation style can contribute to a strong cohort.", options: [
    { value: "observe", icon: "◉", label: "Observe first", detail: "I like time to understand the group" },
    { value: "structured", icon: "▦", label: "Use a prompt", detail: "A clear question makes participation easier" },
    { value: "open", icon: "☍", label: "Jump in", detail: "I am comfortable starting a conversation" },
  ] },
  { key: "focus", eyebrow: "Your first move", question: "What would you like to focus on first?", instruction: "This helps Rosie suggest a starting station. Every station stays open.", options: stations.map((station) => ({ value: station.id, icon: station.icon, label: station.name, detail: station.description })),
  },
];

export function ProductionPathwayMap({ api }: { api: PilotApiClient }) {
  const [activeId, setActiveId] = useState<StationId>("evidence");
  const [artifacts, setArtifacts] = useState<PathwayArtifact[]>([]);
  const [response, setResponse] = useState("");
  const [message, setMessage] = useState("Loading your saved station work...");
  const [busy, setBusy] = useState(false);
  const [primer, setPrimer] = useState<PathwayPrimer | null | undefined>(undefined);
  const [primerOpen, setPrimerOpen] = useState<boolean | null>(null);
  const [primerStep, setPrimerStep] = useState(0);
  const [primerAnswers, setPrimerAnswers] = useState<Partial<PrimerAnswers>>({});
  const active = stations.find((station) => station.id === activeId) ?? stations[1];
  const stamped = new Set(artifacts.map((artifact) => artifact.station));

  const loadPathway = useCallback(async () => {
    try {
      const [saved, savedPrimer] = await Promise.all([
        api.request<PathwayArtifact[]>("/api/artifacts"),
        api.request<PathwayPrimer | null>("/api/pathway/primer"),
      ]);
      setArtifacts(saved);
      setPrimer(savedPrimer);
      setPrimerOpen(!savedPrimer);
      if (savedPrimer) {
        setPrimerAnswers(savedPrimer.content.answers);
        setActiveId(savedPrimer.content.recommendedStation);
      }
      setMessage("");
    } catch (error) {
      setPrimer(null);
      setPrimerOpen(true);
      setMessage(error instanceof Error ? error.message : "Your station work could not be loaded.");
    }
  }, [api]);

  useEffect(() => {
    // This request synchronizes the signed-in student's server-backed pathway work.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadPathway();
  }, [loadPathway]);

  const savePrimer = async () => {
    if (primerQuestions.some((question) => !primerAnswers[question.key])) return;
    setBusy(true);
    setMessage("");
    try {
      const saved = await api.request<PathwayPrimer>("/api/pathway/primer", { method: "PUT", body: { answers: primerAnswers } });
      setPrimer(saved);
      setActiveId(saved.content.recommendedStation);
      setPrimerOpen(false);
      setMessage(saved.content.reason);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Your primer could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const selectStation = (station: Station) => {
    setActiveId(station.id);
    setResponse("");
    setMessage("");
  };

  const save = async () => {
    if (!response.trim()) return;
    setBusy(true);
    setMessage("");
    try {
      const saved = await api.request<PathwayArtifact>("/api/artifacts", {
        method: "POST",
        body: {
          station: active.id,
          artifactType: active.artifactType,
          title: active.artifactTitle,
          prompt: active.prompt,
          response: response.trim(),
        },
      });
      setArtifacts((current) => [saved, ...current]);
      setResponse("");
      setMessage(`${active.name} station saved securely.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "This station could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  if (primerOpen === null) return <section className="production-card production-card--wide"><RosieGuide pose="tracks" eyebrow="Your pathway primer" title="Preparing a few quick questions..." /></section>;

  if (primerOpen) {
    const question = primerQuestions[primerStep];
    const selected = primerAnswers[question.key];
    return <section className="production-card production-card--wide pathway-primer" aria-labelledby="primer-question"><div className="primer-progress"><span>Step {primerStep + 1} of {primerQuestions.length}</span><div aria-hidden="true"><i style={{ width: `${((primerStep + 1) / primerQuestions.length) * 100}%` }} /></div></div><RosieGuide pose={primerStep === primerQuestions.length - 1 ? "pointing" : "gesture"} compact eyebrow="Rosie, your pathway guide" title={primerStep === 0 ? "Let’s find a useful place to begin." : "Your map is taking shape."} body="These answers personalize your starting point. They do not rank you or close any station." /><div className="primer-question"><p className="kicker">{question.eyebrow}</p><h2 id="primer-question">{question.question}</h2><p>{question.instruction}</p></div><div className="primer-options">{question.options.map((option) => <button key={option.value} type="button" className={selected === option.value ? "selected" : ""} aria-pressed={selected === option.value} onClick={() => setPrimerAnswers((current) => ({ ...current, [question.key]: option.value }))}><span>{option.icon}</span><strong>{option.label}</strong><small>{option.detail}</small></button>)}</div><div className="primer-actions">{primerStep > 0 ? <button className="text-button" type="button" onClick={() => setPrimerStep((current) => current - 1)}>Back</button> : <span />}{primerStep < primerQuestions.length - 1 ? <button className="primary-button" type="button" disabled={!selected} onClick={() => setPrimerStep((current) => current + 1)}>Next question</button> : <button className="primary-button" type="button" disabled={busy || !selected} onClick={() => void savePrimer()}>{busy ? "Building..." : "Build My Map"}</button>}</div>{message ? <p className="form-message" aria-live="polite">{message}</p> : null}</section>;
  }

  const recommended = stations.find((station) => station.id === primer?.content.recommendedStation) || stations[1];
  return <section className="production-card production-card--wide production-map" aria-labelledby="production-map-title">
    <div className="section-heading"><div><p className="kicker">Your pathway map</p><h2 id="production-map-title">Start where it feels useful.</h2></div><div className="map-summary"><p>{stamped.size} of {stations.length} stations have saved work.</p><button className="text-button" type="button" onClick={() => { setPrimerStep(0); setPrimerOpen(true); }}>Update my primer</button></div></div>
    <RosieGuide pose="pointing" compact eyebrow="Rosie recommends" title={recommended.name} body={`${primer?.content.reason || recommended.why} Every station remains open.`} />
    <div className="district-map" aria-label="Scrollable pathway station map"><div className="district-map__canvas"><img src={assetUrl("/assets/premed-district-map.png")} alt="Illustrated pathway through six premedical learning stations" />{stations.map((station) => <button key={station.id} type="button" aria-label={`${station.name}: ${station.description}`} className={`station station--${station.id} ${activeId === station.id ? "station--active" : ""} ${recommended.id === station.id ? "station--recommended" : ""} ${stamped.has(station.id) ? "station--stamped" : ""}`} onClick={() => selectStation(station)}><span>{stamped.has(station.id) ? "✓" : station.icon}</span><strong>{station.name}</strong></button>)}</div></div>
    <article className="station-sheet production-station-sheet"><div className="station-sheet__title"><span>{active.icon}</span><div><small>{active.short}</small><h2>{active.name}</h2></div>{stamped.has(active.id) ? <b className="earned-label">Saved</b> : null}</div><div className="station-overview"><p className="station-description">{active.description}</p><div className="station-why"><span>Why this matters</span><p>{active.why}</p></div><label className="production-station-response"><span>{active.prompt}</span><textarea value={response} maxLength={5000} onChange={(event) => setResponse(event.target.value)} placeholder="Write a brief note. Keep patient names and identifying details out." /></label><div className="production-station-actions"><button className="primary-button" type="button" disabled={busy || !response.trim()} onClick={save}>{busy ? "Saving..." : "Save this station"}</button><span>{response.length} / 5000</span></div><p className="form-message" aria-live="polite">{message}</p></div></article>
    {artifacts.length ? <div className="production-saved-stations"><h3>Your saved station work</h3>{artifacts.slice(0, 6).map((artifact) => <article key={artifact.id}><div><strong>{artifact.title}</strong><span>{stations.find((station) => station.id === artifact.station)?.name || artifact.station}</span></div><p>{artifact.content.response}</p><time dateTime={artifact.createdAt}>{new Date(artifact.createdAt).toLocaleDateString()}</time></article>)}</div> : null}
  </section>;
}
