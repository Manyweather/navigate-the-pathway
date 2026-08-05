"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Focus = "records" | "courses" | "story" | "support" | "unsure";
type View = "welcome" | "trust" | "setup" | "map" | "mission" | "stamp" | "home" | "cohort" | "vault";
type StationId = "courses" | "evidence" | "service" | "cohort" | "reflection" | "application";

type MediaSource = { src: string; type: "video/mp4" | "video/webm" };

export type MediaDefinition = {
  id: string;
  title: string;
  sources: MediaSource[];
  poster: string;
  captions: string;
  transcript: string;
  duration: number;
  autoplayOnce: boolean;
  storyboard: string[];
};

type DiagramStep = { label: string; icon: string; hint: string };

export type DiagramDefinition = {
  id: string;
  steps: DiagramStep[];
  studentPrompt: string;
  learningPrinciple: string;
  completionState: string;
};

export type MissionDefinition = {
  id: string;
  title: string;
  stationId: StationId;
  requiredArtifact: string;
  diagram: DiagramDefinition;
  mediaId?: string;
  stamp: string;
};

type Artifact = {
  id: string;
  missionId: string;
  stationId: StationId;
  label: string;
  response: string;
  savedAt: string;
};

export type ProgressState = {
  artifacts: Artifact[];
  stamps: StationId[];
  suggestedStation: StationId;
  diagramProgress: Record<string, number>;
  viewedVideos: string[];
  commitment: string | null;
  reminderDate: string;
  focus: Focus | null;
  lastUpdate: string;
  lastView: View;
};

type Station = {
  id: StationId;
  name: string;
  short: string;
  icon: string;
  missionId: string;
};

const STORAGE_KEY = "navigate.pipeline.progress.v1";
const stationOrder: StationId[] = ["evidence", "reflection", "cohort", "courses", "service", "application"];

const diagrams: Record<StationId, DiagramDefinition> = {
  courses: {
    id: "course-camp-diagram",
    steps: [
      { label: "Course status", icon: "01", hint: "Name what is complete or in progress." },
      { label: "Uncertainty", icon: "?", hint: "Turn the fuzzy part into one question." },
      { label: "Person to ask", icon: "@", hint: "Choose the person with the right context." },
      { label: "Follow-up date", icon: "+", hint: "Give the question a next date." },
    ],
    studentPrompt: "Write the course question, who you will ask, and when.",
    learningPrinciple: "Chunking reduces planning load.",
    completionState: "Course question saved",
  },
  evidence: {
    id: "experience-vault-diagram",
    steps: [
      { label: "Activity", icon: "01", hint: "Name the role or setting." },
      { label: "Specific moment", icon: "02", hint: "Zoom in on one scene." },
      { label: "Learning", icon: "03", hint: "Name what shifted for you." },
      { label: "Future use", icon: "04", hint: "Connect it to a future action." },
    ],
    studentPrompt: "Capture one moment, what it taught you, and how you may use it.",
    learningPrinciple: "Retrieval preserves useful detail.",
    completionState: "Experience evidence saved",
  },
  service: {
    id: "compassion-commons-diagram",
    steps: [
      { label: "Person and context", icon: "01", hint: "Center the person, not your role." },
      { label: "Need or barrier", icon: "02", hint: "Notice what made access harder." },
      { label: "Compassionate response", icon: "03", hint: "Describe listening plus action." },
      { label: "Reflection", icon: "04", hint: "Name what you would carry forward." },
    ],
    studentPrompt: "Describe a barrier you noticed and the response it called for.",
    learningPrinciple: "Self-explanation turns service into learning.",
    completionState: "Compassion reflection saved",
  },
  cohort: {
    id: "cohort-commons-diagram",
    steps: [
      { label: "Observe", icon: "01", hint: "Read and notice what helps." },
      { label: "React", icon: "02", hint: "A signal of support is participation." },
      { label: "Respond", icon: "03", hint: "Add one useful idea or question." },
      { label: "Connect", icon: "04", hint: "Reach out only when it feels useful." },
    ],
    studentPrompt: "Choose your participation mode and one small action.",
    learningPrinciple: "Belonging grows through low-risk steps.",
    completionState: "Cohort action saved",
  },
  reflection: {
    id: "reflection-studio-diagram",
    steps: [
      { label: "What happened", icon: "01", hint: "Describe one observable moment." },
      { label: "Why it mattered", icon: "02", hint: "Name the meaning, tension, or change." },
      { label: "What changes next", icon: "03", hint: "Choose how you will act differently." },
    ],
    studentPrompt: "Write the moment, its meaning, and what changes next.",
    learningPrinciple: "Elaboration connects experience to action.",
    completionState: "Reflection seed saved",
  },
  application: {
    id: "application-outlook-diagram",
    steps: [
      { label: "Context", icon: "01", hint: "Give the reader only what they need." },
      { label: "Contribution", icon: "02", hint: "Name what you actually did." },
      { label: "Learning", icon: "03", hint: "Show how your thinking changed." },
      { label: "Future direction", icon: "04", hint: "Connect learning to the physician you seek to become." },
    ],
    studentPrompt: "Build one evidence block using context, contribution, learning, and direction.",
    learningPrinciple: "Structured recall lowers drafting effort.",
    completionState: "Application evidence saved",
  },
};

const media: Record<string, MediaDefinition> = {
  welcome: {
    id: "welcome",
    title: "Welcome from your Navigate Learning Coach",
    sources: [],
    poster: "/assets/navigate-learning-coach-v1.png",
    captions: "/media/welcome.vtt",
    transcript: "Welcome to Navigate. Your experiences already matter. This device keeps your private drafts. After setup, you will see a district built around your next useful action. You can skip any media and keep moving.",
    duration: 36,
    autoplayOnce: true,
    storyboard: ["Your experiences matter.", "Drafts stay on this device.", "Choose one useful next move."],
  },
  reflection: {
    id: "reflection",
    title: "How an hour becomes evidence",
    sources: [],
    poster: "/assets/premed-pathway-illustration.png",
    captions: "/media/reflection-studio.vtt",
    transcript: "An hour is a record. A specific moment reveals what happened. Meaning shows why it mattered. A next action turns reflection into evidence you can use later.",
    duration: 25,
    autoplayOnce: true,
    storyboard: ["Hour", "Specific moment", "Meaning", "Usable evidence"],
  },
  cohort: {
    id: "cohort",
    title: "Many ways to participate",
    sources: [],
    poster: "/assets/premed-district-map.png",
    captions: "/media/cohort-commons.vtt",
    transcript: "Cohort participation has more than one valid mode. Observe, react, respond, or connect. Start where your energy allows. You do not have to reach the final step to belong.",
    duration: 24,
    autoplayOnce: true,
    storyboard: ["Observe", "React", "Respond", "Connect when useful"],
  },
};

const missions: MissionDefinition[] = [
  { id: "log-experience", title: "Recover one experience", stationId: "evidence", requiredArtifact: "Experience evidence", diagram: diagrams.evidence, mediaId: "reflection", stamp: "Evidence Keeper" },
  { id: "course-question", title: "Resolve one course question", stationId: "courses", requiredArtifact: "Course question", diagram: diagrams.courses, stamp: "Route Clarifier" },
  { id: "support-outreach", title: "Plan one support ask", stationId: "cohort", requiredArtifact: "Support outreach", diagram: diagrams.cohort, mediaId: "cohort", stamp: "Connection Builder" },
  { id: "study-strategy", title: "Design one study experiment", stationId: "courses", requiredArtifact: "Study experiment", diagram: diagrams.courses, stamp: "Strategy Tester" },
  { id: "cohort-participation", title: "Choose a cohort mode", stationId: "cohort", requiredArtifact: "Cohort action", diagram: diagrams.cohort, mediaId: "cohort", stamp: "Cohort Contributor" },
  { id: "reflection-review", title: "Deepen one reflection", stationId: "reflection", requiredArtifact: "Reflection seed", diagram: diagrams.reflection, mediaId: "reflection", stamp: "Meaning Maker" },
  { id: "service-reflection", title: "Notice compassion in action", stationId: "service", requiredArtifact: "Compassion reflection", diagram: diagrams.service, stamp: "Compassion Observer" },
  { id: "application-evidence", title: "Build one evidence block", stationId: "application", requiredArtifact: "Application evidence", diagram: diagrams.application, stamp: "Evidence Architect" },
];

const stations: Station[] = [
  { id: "courses", name: "Course Camp", short: "Clarify", icon: "C", missionId: "course-question" },
  { id: "evidence", name: "Experience Vault", short: "Capture", icon: "E", missionId: "log-experience" },
  { id: "service", name: "Compassion Commons", short: "Notice", icon: "♥", missionId: "service-reflection" },
  { id: "cohort", name: "Cohort Commons", short: "Connect", icon: "O", missionId: "cohort-participation" },
  { id: "reflection", name: "Reflection Studio", short: "Reflect", icon: "R", missionId: "reflection-review" },
  { id: "application", name: "Application Outlook", short: "Assemble", icon: "A", missionId: "application-evidence" },
];

const focusOptions: { id: Focus; label: string; missionId: string; icon: string }[] = [
  { id: "records", label: "Organize experiences", missionId: "log-experience", icon: "E" },
  { id: "courses", label: "Clarify courses", missionId: "course-question", icon: "C" },
  { id: "story", label: "Find my story", missionId: "reflection-review", icon: "R" },
  { id: "support", label: "Build support", missionId: "support-outreach", icon: "O" },
  { id: "unsure", label: "Explore a starting point", missionId: "service-reflection", icon: "?" },
];

const commitmentOptions = [
  { id: "log-experience", label: "Log an experience", icon: "E" },
  { id: "course-question", label: "Map a course question", icon: "C" },
  { id: "support-outreach", label: "Plan support outreach", icon: "O" },
  { id: "study-strategy", label: "Try a study strategy", icon: "S" },
  { id: "cohort-participation", label: "Join a cohort prompt", icon: "+" },
  { id: "reflection-review", label: "Review a reflection", icon: "R" },
];

const emptyProgress: ProgressState = {
  artifacts: [],
  stamps: [],
  suggestedStation: "evidence",
  diagramProgress: {},
  viewedVideos: [],
  commitment: null,
  reminderDate: "In 3 days",
  focus: null,
  lastUpdate: "",
  lastView: "welcome",
};

function MediaMoment({ definition, viewed, onViewed }: { definition: MediaDefinition; viewed: boolean; onViewed: (id: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [mediaFailed, setMediaFailed] = useState(definition.sources.length === 0);
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => {
      if (definition.autoplayOnce && !viewed && !reduced) setPlaying(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [definition.autoplayOnce, viewed]);

  useEffect(() => {
    if (!playing || !mediaFailed) return;
    const timer = window.setInterval(() => {
      setFrame((current) => {
        if (current >= definition.storyboard.length - 1) {
          window.clearInterval(timer);
          setPlaying(false);
          onViewed(definition.id);
          return current;
        }
        return current + 1;
      });
    }, 1600);
    return () => window.clearInterval(timer);
  }, [definition.id, definition.storyboard.length, mediaFailed, onViewed, playing]);

  const replay = () => {
    setFrame(0);
    setPlaying(true);
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      void videoRef.current.play();
    }
  };

  const togglePlayback = () => {
    if (videoRef.current && !mediaFailed) {
      if (videoRef.current.paused) void videoRef.current.play();
      else videoRef.current.pause();
    }
    setPlaying((current) => !current);
  };

  return (
    <section className="media-moment" aria-label={definition.title}>
      <div className={`media-stage ${playing ? "media-stage--playing" : ""}`}>
        {!mediaFailed ? (
          <video ref={videoRef} autoPlay={definition.autoplayOnce && !viewed} muted={muted} playsInline poster={definition.poster} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); onViewed(definition.id); }} onError={() => setMediaFailed(true)}>
            {definition.sources.map((source) => <source key={source.src} src={source.src} type={source.type} />)}
            <track default kind="captions" src={definition.captions} srcLang="en" label="English" />
          </video>
        ) : <img src={definition.poster} alt="" />}
        <div className="media-caption" aria-live="polite"><span>{definition.storyboard[frame]}</span></div>
        <span className="media-duration">{definition.duration}s</span>
      </div>
      <div className="media-controls" aria-label="Media controls">
        <button type="button" onClick={togglePlayback}>{playing ? "Pause" : "Play"}</button>
        <button type="button" onClick={replay}>Replay</button>
        <button type="button" disabled={mediaFailed} onClick={() => { setMuted((current) => !current); if (videoRef.current) videoRef.current.muted = !muted; }}>{muted ? "Sound" : "Mute"}</button>
        <button type="button" onClick={() => { setPlaying(false); videoRef.current?.pause(); onViewed(definition.id); }}>Skip</button>
        <button type="button" aria-expanded={transcriptOpen} onClick={() => setTranscriptOpen((current) => !current)}>Transcript</button>
      </div>
      {transcriptOpen ? <p className="media-transcript">{definition.transcript}</p> : null}
      {mediaFailed ? <p className="media-ready-note">Visual preview shown. Narration will be added after audio approval.</p> : null}
    </section>
  );
}

function StationDiagram({ definition, revealed, onReveal }: { definition: DiagramDefinition; revealed: number; onReveal: (step: number) => void }) {
  return (
    <div className="diagram" aria-label="Tap through learning diagram">
      <div className="diagram-track">
        {definition.steps.map((item, index) => {
          const available = index <= revealed + 1;
          const isRevealed = index <= revealed;
          return (
            <button key={item.label} type="button" className={`diagram-step ${isRevealed ? "diagram-step--revealed" : ""}`} disabled={!available} aria-pressed={isRevealed} onClick={() => onReveal(index)}>
              <span>{item.icon}</span><strong>{item.label}</strong>{isRevealed ? <small>{item.hint}</small> : <small>Tap to reveal</small>}
            </button>
          );
        })}
      </div>
      <div className="science-chip"><span aria-hidden="true">◎</span><p><b>Learning move</b>{definition.learningPrinciple}</p></div>
    </div>
  );
}

function BrandLockup() {
  return <span className="brand-lockup"><img src="/assets/navigate-pipeline-roseman.png" alt="Navigate the Pipeline" /></span>;
}

function AppDock({ view, enabled, navigate }: { view: View; enabled: boolean; navigate: (view: View) => void }) {
  const items: { id: View; label: string; icon: string }[] = [
    { id: "home", label: "Home", icon: "H" },
    { id: "map", label: "Map", icon: "M" },
    { id: "cohort", label: "Cohort", icon: "C" },
    { id: "vault", label: "Vault", icon: "V" },
  ];
  return <nav className="app-dock" aria-label="App destinations">{items.map((item) => <button key={item.id} type="button" disabled={!enabled} className={view === item.id ? "app-dock__active" : ""} onClick={() => navigate(item.id)}><b aria-hidden="true">{item.icon}</b><span>{item.label}</span></button>)}</nav>;
}

export function JourneyExperience() {
  const [view, setView] = useState<View>("welcome");
  const [focus, setFocus] = useState<Focus | null>(null);
  const [activeStationId, setActiveStationId] = useState<StationId>("evidence");
  const [activeMissionId, setActiveMissionId] = useState("log-experience");
  const [response, setResponse] = useState("");
  const [progress, setProgress] = useState<ProgressState>(emptyProgress);
  const [resumeProgress, setResumeProgress] = useState<ProgressState | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [lastStamp, setLastStamp] = useState("");

  const activeStation = stations.find((station) => station.id === activeStationId) ?? stations[1];
  const activeMission = missions.find((mission) => mission.id === activeMissionId) ?? missions[0];
  const diagramRevealed = progress.diagramProgress[activeMission.diagram.id] ?? -1;
  const diagramComplete = diagramRevealed >= activeMission.diagram.steps.length - 1;

  useEffect(() => {
    const timer = window.setTimeout(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setResumeProgress({ ...emptyProgress, ...JSON.parse(saved) } as ProgressState);
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!hydrated || view === "welcome") return;
    const snapshot = { ...progress, focus, lastUpdate: new Date().toISOString(), lastView: view };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  }, [focus, hydrated, progress, view]);

  const suggestedStation = stations.find((station) => station.id === progress.suggestedStation) ?? stations[1];
  const completion = Math.round((progress.stamps.length / stations.length) * 100);

  const markVideoViewed = (id: string) => setProgress((current) => current.viewedVideos.includes(id) ? current : { ...current, viewedVideos: [...current.viewedVideos, id] });

  const scrollTop = () => window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  const navigate = (nextView: View) => { setView(nextView); scrollTop(); };

  const beginMission = (missionId: string) => {
    const mission = missions.find((item) => item.id === missionId) ?? missions[0];
    setActiveMissionId(mission.id);
    setActiveStationId(mission.stationId);
    setResponse("");
    navigate("mission");
  };

  const openStation = (station: Station) => {
    setActiveStationId(station.id);
  };

  const revealDiagram = (index: number) => {
    setProgress((current) => ({ ...current, diagramProgress: { ...current.diagramProgress, [activeMission.diagram.id]: Math.max(current.diagramProgress[activeMission.diagram.id] ?? -1, index) } }));
  };

  const completeMission = () => {
    if (!diagramComplete || !response.trim()) return;
    const savedAt = new Date().toISOString();
    const artifact: Artifact = { id: `${activeMission.id}-${savedAt}`, missionId: activeMission.id, stationId: activeMission.stationId, label: activeMission.requiredArtifact, response: response.trim(), savedAt };
    setProgress((current) => {
      const stamps = current.stamps.includes(activeMission.stationId) ? current.stamps : [...current.stamps, activeMission.stationId];
      const suggestedStation = stationOrder.find((id) => !stamps.includes(id)) ?? "evidence";
      return { ...current, artifacts: [artifact, ...current.artifacts], stamps, suggestedStation, lastUpdate: savedAt };
    });
    setLastStamp(activeMission.stamp);
    navigate("stamp");
  };

  const continuePathway = () => {
    if (!resumeProgress) return;
    setProgress(resumeProgress);
    setFocus(resumeProgress.focus);
    setActiveStationId(resumeProgress.suggestedStation);
    const safeView = ["home", "map", "cohort", "vault"].includes(resumeProgress.lastView) ? resumeProgress.lastView : "home";
    navigate(safeView);
  };

  const restartSetup = () => {
    setFocus(null);
    setResumeProgress(null);
    setView("trust");
    scrollTop();
  };

  const clearDeviceData = () => {
    window.localStorage.removeItem(STORAGE_KEY);
    setProgress(emptyProgress);
    setResumeProgress(null);
    setFocus(null);
    setActiveStationId("evidence");
    setActiveMissionId("log-experience");
    setResponse("");
    setView("welcome");
    scrollTop();
  };

  const finishSetup = () => {
    const option = focusOptions.find((item) => item.id === focus) ?? focusOptions[0];
    const mission = missions.find((item) => item.id === option.missionId) ?? missions[0];
    setActiveStationId(mission.stationId);
    setProgress((current) => ({ ...current, focus, commitment: mission.id, suggestedStation: mission.stationId }));
    navigate("map");
  };

  const selectedCommitment = progress.commitment ?? "log-experience";
  const selectedMission = useMemo(() => missions.find((mission) => mission.id === selectedCommitment) ?? missions[0], [selectedCommitment]);

  return (
    <main className="site-shell">
      <div className="ambient ambient--one" aria-hidden="true" /><div className="ambient ambient--two" aria-hidden="true" />
      <header className="topbar"><button className="brand-button" type="button" onClick={() => view === "welcome" ? scrollTop() : navigate("home")}><BrandLockup /></button><span className="concept-label">Interactive concept</span></header>

      <div className="experience" id="top">
        {view === "welcome" ? <section className="screen welcome-screen" aria-labelledby="welcome-title">
          <div className="institutional-line"><span>Roseman University</span><span>College of Medicine concept</span></div>
          <div className="welcome-grid">
            <div className="welcome-copy"><p className="kicker">Navigate Learning Coach</p><h1 id="welcome-title">Your experiences already matter.</h1><p className="lede">Build one useful piece at a time.</p><button className="primary-button" type="button" onClick={() => navigate("trust")}>Begin setup <span aria-hidden="true">→</span></button></div>
            <MediaMoment definition={media.welcome} viewed={progress.viewedVideos.includes("welcome")} onViewed={markVideoViewed} />
          </div>
          {resumeProgress ? <div className="resume-card"><div><span>Saved on this device</span><strong>{resumeProgress.artifacts.length} artifacts · {resumeProgress.stamps.length} stamps</strong></div><div><button className="primary-button" type="button" onClick={continuePathway}>Continue my pathway</button><button className="text-button" type="button" onClick={restartSetup}>Start over</button></div></div> : null}
        </section> : null}

        {view === "trust" ? <section className="screen compact-screen" aria-labelledby="trust-title">
          <div className="screen-heading"><p className="kicker">Before setup</p><h1 id="trust-title">Private by default.</h1><p>Drafts stay on this device.</p></div>
          <div className="trust-grid">
            <article><span>01</span><strong>You choose what to share.</strong></article>
            <article><span>02</span><strong>No admissions predictions.</strong></article>
            <article><span>03</span><strong>No identifying patient details.</strong></article>
          </div>
          <div className="action-row"><button className="text-button" type="button" onClick={() => navigate("welcome")}>Back</button><button className="primary-button" type="button" onClick={() => navigate("setup")}>I understand</button></div>
        </section> : null}

        {view === "setup" ? <section className="screen compact-screen" aria-labelledby="setup-title">
          <div className="screen-heading"><p className="kicker">Quick setup</p><h1 id="setup-title">What needs attention today?</h1><p>Choose one. Your map stays open.</p></div>
          <div className="focus-grid">{focusOptions.map((option) => <button key={option.id} type="button" className={`focus-card ${focus === option.id ? "focus-card--selected" : ""}`} aria-pressed={focus === option.id} onClick={() => setFocus(option.id)}><span>{option.icon}</span><strong>{option.label}</strong></button>)}</div>
          <div className="action-row"><button className="text-button" type="button" onClick={() => navigate("trust")}>Back</button><button className="primary-button" type="button" disabled={!focus} onClick={finishSetup}>Build my district</button></div>
        </section> : null}

        {view === "map" ? <section className="screen map-screen" aria-labelledby="map-title">
          <div className="screen-heading map-heading"><div><p className="kicker">Premed district</p><h1 id="map-title">Choose a station.</h1><p>All stations are open.</p></div><div className="stamp-count"><span>{progress.stamps.length}</span><small>stamps</small></div></div>
          <div className="map-recommendation"><span>★</span><p>Suggested now: <strong>{suggestedStation.name}</strong></p></div>
          <div className="district-map" aria-label="Scrollable station map"><div className="district-map__canvas"><img src="/assets/premed-district-map.png" alt="Illustrated pathway through six premed learning stations" />{stations.map((station) => <button key={station.id} type="button" className={`station station--${station.id} ${activeStationId === station.id ? "station--active" : ""} ${progress.suggestedStation === station.id ? "station--recommended" : ""} ${progress.stamps.includes(station.id) ? "station--stamped" : ""}`} onClick={() => openStation(station)}><span>{progress.stamps.includes(station.id) ? "✓" : station.icon}</span><strong>{station.name}</strong></button>)}</div></div>
          <article className="station-sheet"><div className="station-sheet__title"><span>{activeStation.icon}</span><div><small>{activeStation.short}</small><h2>{activeStation.name}</h2></div>{progress.stamps.includes(activeStation.id) ? <b className="earned-label">Stamped</b> : null}</div><StationDiagram definition={diagrams[activeStation.id]} revealed={Math.max(-1, progress.diagramProgress[diagrams[activeStation.id].id] ?? -1)} onReveal={(index) => setProgress((current) => ({ ...current, diagramProgress: { ...current.diagramProgress, [diagrams[activeStation.id].id]: Math.max(current.diagramProgress[diagrams[activeStation.id].id] ?? -1, index) } }))} /><button className="primary-button primary-button--wide" type="button" onClick={() => beginMission(activeStation.missionId)}>Start this mission</button></article>
        </section> : null}

        {view === "mission" ? <section className="screen mission-screen" aria-labelledby="mission-title">
          <div className="screen-heading"><p className="kicker">{activeStation.name}</p><h1 id="mission-title">{activeMission.title}</h1><p>Tap each step. Save one response.</p></div>
          {activeMission.mediaId ? <MediaMoment definition={media[activeMission.mediaId]} viewed={progress.viewedVideos.includes(activeMission.mediaId)} onViewed={markVideoViewed} /> : null}
          <StationDiagram definition={activeMission.diagram} revealed={diagramRevealed} onReveal={revealDiagram} />
          {diagramComplete ? <div className="artifact-entry"><label htmlFor="mission-response"><span>{activeMission.diagram.studentPrompt}</span><textarea id="mission-response" value={response} onChange={(event) => setResponse(event.target.value)} placeholder="Keep names and identifying details out." /></label><div className="artifact-status"><span>{response.trim() ? "Ready to save" : "One response required"}</span><small>Device only</small></div></div> : null}
          <div className="action-row"><button className="text-button" type="button" onClick={() => navigate("map")}>Back to map</button><button className="primary-button" type="button" disabled={!diagramComplete || !response.trim()} onClick={completeMission}>Save and stamp</button></div>
        </section> : null}

        {view === "stamp" ? <section className="screen stamp-screen" aria-labelledby="stamp-title"><div className="stamp-seal" aria-hidden="true"><span>✓</span><small>Navigate</small></div><p className="kicker">Station complete</p><h1 id="stamp-title">{lastStamp}</h1><p>{activeMission.diagram.completionState}.</p><button className="primary-button" type="button" onClick={() => navigate("map")}>Return to the district</button></section> : null}

        {view === "home" ? <section className="screen dashboard" aria-labelledby="home-title">
          <div className="dashboard-hero"><div><p className="kicker">Your pathway</p><h1 id="home-title">One clear next move.</h1><p>{progress.artifacts.length} saved artifacts · {progress.stamps.length} station stamps</p></div><div className="completion-ring" aria-label={`${completion}% of stations stamped`}><span>{completion}%</span><small>explored</small></div></div>
          <div className="next-move-card"><div><span>Recommended</span><h2>{selectedMission.title}</h2></div><button className="primary-button" type="button" onClick={() => beginMission(selectedMission.id)}>Open next move</button></div>
          <section className="commitment-panel" aria-labelledby="commitment-title"><h2 id="commitment-title">Change my next move</h2><div className="commitment-grid">{commitmentOptions.map((item) => <button key={item.id} type="button" aria-pressed={selectedCommitment === item.id} className={selectedCommitment === item.id ? "commitment--selected" : ""} onClick={() => setProgress((current) => ({ ...current, commitment: item.id }))}><span>{item.icon}</span>{item.label}</button>)}</div></section>
          <div className="device-actions"><label>Reminder<select value={progress.reminderDate} onChange={(event) => setProgress((current) => ({ ...current, reminderDate: event.target.value }))}><option>Tomorrow</option><option>In 3 days</option><option>Next week</option><option>No reminder</option></select></label><button className="text-button" type="button" onClick={clearDeviceData}>Clear this device&apos;s data</button></div>
        </section> : null}

        {view === "cohort" ? <section className="screen compact-screen" aria-labelledby="cohort-title"><div className="screen-heading"><p className="kicker">Cohort Commons</p><h1 id="cohort-title">Participation has modes.</h1><p>Start where your energy allows.</p></div><MediaMoment definition={media.cohort} viewed={progress.viewedVideos.includes("cohort")} onViewed={markVideoViewed} /><div className="participation-modes">{diagrams.cohort.steps.map((item, index) => <button type="button" key={item.label} onClick={() => beginMission("cohort-participation")}><span>{index + 1}</span><strong>{item.label}</strong><small>{index === 3 ? "Optional" : "Valid participation"}</small></button>)}</div><p className="privacy-note">Drafts stay here. Nothing is sent.</p></section> : null}

        {view === "vault" ? <section className="screen compact-screen" aria-labelledby="vault-title"><div className="screen-heading"><p className="kicker">Experience Vault</p><h1 id="vault-title">Your saved evidence.</h1><p>Device only. Reuse when ready.</p></div>{progress.artifacts.length ? <div className="artifact-list">{progress.artifacts.map((artifact) => <article key={artifact.id}><div><span>{stations.find((station) => station.id === artifact.stationId)?.icon}</span><strong>{artifact.label}</strong></div><p>{artifact.response}</p><small>{new Date(artifact.savedAt).toLocaleDateString()}</small></article>)}</div> : <div className="empty-vault"><span>V</span><h2>No artifacts yet.</h2><button className="primary-button" type="button" onClick={() => beginMission("log-experience")}>Capture one experience</button></div>}<button className="text-button clear-button" type="button" onClick={clearDeviceData}>Clear this device&apos;s data</button></section> : null}
      </div>

      <AppDock view={view} enabled={["map", "mission", "stamp", "home", "cohort", "vault"].includes(view)} navigate={navigate} />
      <footer className="site-footer"><p>Navigate the Pipeline concept</p><p>Not an admissions decision tool</p></footer>
    </main>
  );
}
