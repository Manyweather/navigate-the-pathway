"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { assetUrl } from "./asset-url";
import { makeArtifact, makeId, nowIso } from "./demo-model";
import { RosieGuide } from "./components/rosie-guide";
import { workspaceForStation, type WorkspaceId } from "./components/feature-workspaces";
import {
  usePrototype,
  type MediaArtifact,
  type MediaFocus as Focus,
  type MediaProgressState,
  type MediaView as View,
  type StationId,
} from "./prototype-store";

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

export type ProgressState = MediaProgressState;

type Station = {
  id: StationId;
  name: string;
  short: string;
  icon: string;
  missionId: string;
  description: string;
  why: string;
  outcome: string;
};

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
    studentPrompt: "Describe a moment when a need or barrier became visible, how compassion showed up or was missing, and what you will carry forward.",
    learningPrinciple: "Reflection connects compassionate attention to future action.",
    completionState: "Compassion and values reflection saved",
  },
  cohort: {
    id: "cohort-commons-diagram",
    steps: [
      { label: "Observe", icon: "01", hint: "Read classmates' questions and shared resources." },
      { label: "Encourage", icon: "02", hint: "Acknowledge a classmate's effort or progress." },
      { label: "Respond", icon: "03", hint: "Share one useful idea, resource, or question." },
      { label: "Connect", icon: "04", hint: "Invite a follow-up conversation when it would help." },
    ],
    studentPrompt: "Choose one way to contribute on the shared practice message board and name the first action you will take.",
    learningPrinciple: "Belonging grows through useful, low-pressure interactions.",
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
    studentPrompt: "Use context, contribution, learning, and future direction to draft one application-ready example.",
    learningPrinciple: "Structured recall lowers drafting effort.",
    completionState: "Application-ready example saved",
  },
};

const media: Record<string, MediaDefinition> = {
  welcome: {
    id: "welcome",
    title: "Rosie explains Navigate The Pathway",
    sources: [],
    poster: assetUrl("/assets/rosie/gesture.webp"),
    captions: assetUrl("/media/welcome.vtt"),
    transcript: "Hi, I'm Rosie. Navigate The Pathway is a private practice space that helps you make your premedical journey visible. You will use a map of six stations to organize courses and experiences, reflect on compassion and your values, learn with your cohort, discover the story connecting your experiences, and shape application-ready examples. Each station explains why the work matters, guides one small action, and saves something useful on this device. You choose where to begin, and you can change direction at any time.",
    duration: 40,
    autoplayOnce: true,
    storyboard: ["Make your premedical journey visible.", "Explore six stations at your pace.", "See why the work matters.", "Complete one useful action.", "Save it for advising and applications."],
  },
  reflection: {
    id: "reflection",
    title: "How an hour becomes evidence",
    sources: [],
    poster: assetUrl("/assets/premed-pathway-illustration.png"),
    captions: assetUrl("/media/reflection-studio.vtt"),
    transcript: "An hour is a record. A specific moment reveals what happened. Meaning shows why it mattered. A next action turns reflection into evidence you can use later.",
    duration: 25,
    autoplayOnce: true,
    storyboard: ["Hour", "Specific moment", "Meaning", "Usable evidence"],
  },
  cohort: {
    id: "cohort",
    title: "Many ways to participate",
    sources: [],
    poster: assetUrl("/assets/premed-district-map.png"),
    captions: assetUrl("/media/cohort-commons.vtt"),
    transcript: "Cohort participation has more than one valid mode. Observe, react, respond, or connect. Start where your energy allows. You do not have to reach the final step to belong.",
    duration: 24,
    autoplayOnce: true,
    storyboard: ["Observe", "React", "Respond", "Connect when useful"],
  },
};

const missions: MissionDefinition[] = [
  { id: "log-experience", title: "Capture one meaningful experience", stationId: "evidence", requiredArtifact: "Experience entry", diagram: diagrams.evidence, mediaId: "reflection", stamp: "Experience Keeper" },
  { id: "course-question", title: "Resolve one course question", stationId: "courses", requiredArtifact: "Course question", diagram: diagrams.courses, stamp: "Route Clarifier" },
  { id: "support-outreach", title: "Plan one support ask", stationId: "cohort", requiredArtifact: "Support outreach", diagram: diagrams.cohort, mediaId: "cohort", stamp: "Connection Builder" },
  { id: "study-strategy", title: "Design one study experiment", stationId: "courses", requiredArtifact: "Study experiment", diagram: diagrams.courses, stamp: "Strategy Tester" },
  { id: "cohort-participation", title: "Contribute to your cohort", stationId: "cohort", requiredArtifact: "Cohort contribution plan", diagram: diagrams.cohort, mediaId: "cohort", stamp: "Cohort Contributor" },
  { id: "reflection-review", title: "Deepen one reflection", stationId: "reflection", requiredArtifact: "Reflection seed", diagram: diagrams.reflection, mediaId: "reflection", stamp: "Meaning Maker" },
  { id: "service-reflection", title: "Connect compassion to your values", stationId: "service", requiredArtifact: "Compassion and values reflection", diagram: diagrams.service, stamp: "Compassion Observer" },
  { id: "application-evidence", title: "Shape one application example", stationId: "application", requiredArtifact: "Application-ready example", diagram: diagrams.application, stamp: "Application Builder" },
];

const stations: Station[] = [
  { id: "courses", name: "Courses", short: "Plan", icon: "📚", missionId: "course-question", description: "Track prerequisites, turn uncertainty into clear questions, and test study strategies.", why: "Course questions are easier to solve early. Clear plans protect your time and keep more options open.", outcome: "a course question and follow-up plan" },
  { id: "evidence", name: "Experiences", short: "Track", icon: "🗂️", missionId: "log-experience", description: "Record hours and meaningful moments from service, clinical work, research, leadership, employment, and campus life.", why: "Applications depend on specific examples. Capturing details now keeps meaningful moments from fading later.", outcome: "one organized experience entry" },
  { id: "service", name: "Compassion & Values", short: "Notice", icon: "♡", missionId: "service-reflection", description: "Notice how people experience care, access, barriers, dignity, and support.", why: "Compassion is more than being kind. Noticing needs and responses helps you connect your values to action and become more attentive to the people you may serve.", outcome: "one compassion and values reflection" },
  { id: "cohort", name: "Cohort", short: "Connect", icon: "👥", missionId: "cohort-participation", description: "Use a shared practice message board to ask questions, encourage classmates, exchange resources, and identify support.", why: "A cohort is a group moving through the same process. Small, low-pressure interactions make help easier to give, receive, and ask for.", outcome: "one plan for contributing to your cohort" },
  { id: "reflection", name: "Your Story", short: "Reflect", icon: "✍️", missionId: "reflection-review", description: "Reflect across experiences to notice patterns in what matters to you, how you learn, and who you are becoming.", why: "Strong personal statements grow from repeated evidence and honest reflection, not from finding one perfect event.", outcome: "one reflection you can develop into a story" },
  { id: "application", name: "Application", short: "Prepare", icon: "📄", missionId: "application-evidence", description: "Turn saved experiences and reflections into application-ready examples, advising questions, and exportable notes.", why: "Building from your own records reduces blank-page pressure and shows where you may need more experience or reflection.", outcome: "one application-ready example" },
];

const focusOptions: { id: Focus; label: string; missionId: string; icon: string }[] = [
  { id: "records", label: "Organize experiences", missionId: "log-experience", icon: "🗂️" },
  { id: "courses", label: "Clarify courses", missionId: "course-question", icon: "📚" },
  { id: "story", label: "Find my story", missionId: "reflection-review", icon: "✍️" },
  { id: "support", label: "Build support", missionId: "support-outreach", icon: "👥" },
  { id: "unsure", label: "Explore a starting point", missionId: "service-reflection", icon: "🧭" },
];

const commitmentOptions = [
  { id: "log-experience", label: "Log an experience", icon: "🗂️" },
  { id: "course-question", label: "Map a course question", icon: "📚" },
  { id: "support-outreach", label: "Plan support outreach", icon: "🤝" },
  { id: "study-strategy", label: "Try a study strategy", icon: "🧠" },
  { id: "cohort-participation", label: "Join a cohort prompt", icon: "👥" },
  { id: "reflection-review", label: "Review a reflection", icon: "✍️" },
];

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
        <span className="media-title">{definition.title}</span>
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
      {mediaFailed ? <p className="media-ready-note">Captioned visual introduction. Open the transcript for Rosie&apos;s complete explanation.</p> : null}
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
  return <span className="brand-lockup"><img src={assetUrl("/assets/navigate-pathway-mark.svg")} alt="Navigate the Pathway" /></span>;
}

function AppDock({ view, enabled, navigate }: { view: View; enabled: boolean; navigate: (view: View) => void }) {
  const items: { id: View; label: string; icon: string }[] = [
    { id: "home", label: "Home", icon: "⌂" },
    { id: "map", label: "Map", icon: "◇" },
    { id: "cohort", label: "Cohort", icon: "👥" },
    { id: "vault", label: "Vault", icon: "▤" },
  ];
  return <nav className="app-dock" aria-label="App destinations">{items.map((item) => <button key={item.id} type="button" disabled={!enabled} className={view === item.id ? "app-dock__active" : ""} onClick={() => navigate(item.id)}><b aria-hidden="true">{item.icon}</b><span>{item.label}</span></button>)}</nav>;
}

export function JourneyExperience({
  onOpenWorkspace,
  onOpenReviewers,
}: {
  onOpenWorkspace: (workspace: WorkspaceId) => void;
  onOpenReviewers: () => void;
}) {
  const {
    state,
    dispatch,
    hydrated,
    setMediaProgress: setProgress,
    clearDeviceData: clearPrototypeData,
  } = usePrototype();
  const [view, setView] = useState<View>("welcome");
  const [focus, setFocus] = useState<Focus | null>(null);
  const [activeStationId, setActiveStationId] = useState<StationId>("evidence");
  const [activeMissionId, setActiveMissionId] = useState("log-experience");
  const [response, setResponse] = useState("");
  const [lastStamp, setLastStamp] = useState("");
  const progress = state.media;
  const resumeProgress: ProgressState | null = hydrated && progress.lastUpdate ? progress : null;

  const activeStation = stations.find((station) => station.id === activeStationId) ?? stations[1];
  const activeMission = missions.find((mission) => mission.id === activeMissionId) ?? missions[0];
  const diagramRevealed = progress.diagramProgress[activeMission.diagram.id] ?? -1;
  const diagramComplete = diagramRevealed >= activeMission.diagram.steps.length - 1;

  const suggestedStation = stations.find((station) => station.id === progress.suggestedStation) ?? stations[1];
  const completion = Math.round((progress.stamps.length / stations.length) * 100);

  const markVideoViewed = (id: string) => setProgress((current) => current.viewedVideos.includes(id) ? current : { ...current, viewedVideos: [...current.viewedVideos, id] });

  const scrollTop = () => window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  const navigate = (nextView: View) => {
    setView(nextView);
    if (nextView !== "welcome") {
      setProgress((current) => ({ ...current, lastView: nextView, lastUpdate: nowIso() }));
    }
    scrollTop();
  };

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
    const artifact: MediaArtifact = { id: `${activeMission.id}-${savedAt}`, missionId: activeMission.id, stationId: activeMission.stationId, label: activeMission.requiredArtifact, response: response.trim(), savedAt };
    setProgress((current) => {
      const stamps = current.stamps.includes(activeMission.stationId) ? current.stamps : [...current.stamps, activeMission.stationId];
      const suggestedStation = stationOrder.find((id) => !stamps.includes(id)) ?? "evidence";
      return { ...current, artifacts: [artifact, ...current.artifacts], stamps, suggestedStation, lastUpdate: savedAt };
    });
    const kind = activeMission.stationId === "evidence" ? "experience" : activeMission.stationId === "reflection" || activeMission.stationId === "service" ? "reflection" : activeMission.stationId === "courses" ? "course_plan" : "action_plan";
    dispatch({ type: "ADD_ARTIFACT", artifact: { ...makeArtifact(kind, activeMission.requiredArtifact, response.trim(), activeStation.name, { missionId: activeMission.id }), id: artifact.id, createdAt: savedAt, updatedAt: savedAt } });
    dispatch({ type: "ADD_TRAIL", event: { id: makeId("stamp"), actionType: `${activeMission.id}_completed`, sourceId: artifact.id, earnedAt: savedAt, label: activeMission.stamp } });
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
    setView("trust");
    scrollTop();
  };

  const clearDeviceData = () => {
    clearPrototypeData();
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
    setProgress((current) => ({ ...current, focus, commitment: mission.id, suggestedStation: mission.stationId, lastUpdate: nowIso() }));
    navigate("map");
  };

  const selectedCommitment = progress.commitment ?? "log-experience";
  const selectedMission = useMemo(() => missions.find((mission) => mission.id === selectedCommitment) ?? missions[0], [selectedCommitment]);

  return (
    <main className="site-shell">
      <div className="ambient ambient--one" aria-hidden="true" /><div className="ambient ambient--two" aria-hidden="true" />
      <header className="topbar"><button className="brand-button" type="button" onClick={() => view === "welcome" ? scrollTop() : navigate("home")}><BrandLockup /></button><div className="topbar-actions"><button className="text-button" type="button" onClick={onOpenReviewers}>Reviewer views</button><span className="concept-label">Interactive concept</span></div></header>

      <div className="experience" id="top">
        {view === "welcome" ? <section className="screen welcome-screen" aria-labelledby="welcome-title">
          <div className="welcome-partners"><p>Created for Roseman University College of Medicine students</p><div><img src={assetUrl("/assets/brand/aspire-logo.jpg")} alt="ASPIRE, Roseman University College of Medicine" /><img src={assetUrl("/assets/brand/oaca-emblem.png")} alt="Roseman University College of Medicine Office of Academic and Career Advising" /></div></div>
          <div className="welcome-grid">
            <div className="welcome-copy"><p className="kicker">Rosie, your pathway guide</p><h1 id="welcome-title">Navigate The Pathway</h1><p className="welcome-tagline">Your experiences already matter.</p><p className="lede">See where you are, understand why each step matters, and build useful application material over time.</p><button className="primary-button" type="button" onClick={() => navigate("trust")}>Begin setup <span aria-hidden="true">→</span></button></div>
            <MediaMoment definition={media.welcome} viewed={progress.viewedVideos.includes("welcome")} onViewed={markVideoViewed} />
          </div>
          {resumeProgress ? <div className="resume-card"><div><span>Saved on this device</span><strong>{resumeProgress.artifacts.length} artifacts · {resumeProgress.stamps.length} stamps</strong></div><div><button className="primary-button" type="button" onClick={continuePathway}>Continue my pathway</button><button className="text-button" type="button" onClick={restartSetup}>Start over</button></div></div> : null}
        </section> : null}

        {view === "trust" ? <section className="screen compact-screen" aria-labelledby="trust-title">
          <div className="screen-heading"><p className="kicker">Before setup</p><h1 id="trust-title">Private by default.</h1><p>Drafts stay on this device.</p></div>
          <RosieGuide pose="idle" compact title="Keep identifying details out." body="You control every saved artifact and advising share." />
          <div className="trust-grid">
            <article><span>01</span><strong>You choose what to share.</strong></article>
            <article><span>02</span><strong>No admissions predictions.</strong></article>
            <article><span>03</span><strong>No identifying patient details.</strong></article>
          </div>
          <div className="action-row"><button className="text-button" type="button" onClick={() => navigate("welcome")}>Back</button><button className="primary-button" type="button" onClick={() => navigate("setup")}>I understand</button></div>
        </section> : null}

        {view === "setup" ? <section className="screen compact-screen" aria-labelledby="setup-title">
          <div className="screen-heading"><p className="kicker">Quick setup</p><h1 id="setup-title">What would you like to focus on first?</h1><p>Choose one. Every station will remain open.</p></div>
          <div className="focus-grid">{focusOptions.map((option) => <button key={option.id} type="button" className={`focus-card ${focus === option.id ? "focus-card--selected" : ""}`} aria-pressed={focus === option.id} onClick={() => setFocus(option.id)}><span>{option.icon}</span><strong>{option.label}</strong></button>)}</div>
          <div className="action-row"><button className="text-button" type="button" onClick={() => navigate("trust")}>Back</button><button className="primary-button" type="button" disabled={!focus} onClick={finishSetup}>Build My Map</button></div>
        </section> : null}

        {view === "map" ? <section className="screen map-screen" aria-labelledby="map-title">
          <div className="screen-heading map-heading"><div><p className="kicker">Your pathway map</p><h1 id="map-title">Choose a station.</h1><p>Each station explains why the work matters and guides one useful action.</p></div><div className="stamp-count"><span>{progress.stamps.length}</span><small>stamps</small></div></div>
          <div className="map-recommendation"><span>★</span><p>Suggested now: <strong>{suggestedStation.name}</strong></p></div>
          <RosieGuide pose="pointing" compact eyebrow="Rosie recommends" title={suggestedStation.name} body="Read what the station offers, then follow its guided steps or choose another station." />
          <div className="district-map" aria-label="Scrollable station map"><div className="district-map__canvas"><img src={assetUrl("/assets/premed-district-map.png")} alt="Illustrated pathway through six premed learning stations" />{stations.map((station) => <button key={station.id} type="button" aria-label={`${station.name}: ${station.description}`} className={`station station--${station.id} ${activeStationId === station.id ? "station--active" : ""} ${progress.suggestedStation === station.id ? "station--recommended" : ""} ${progress.stamps.includes(station.id) ? "station--stamped" : ""}`} onClick={() => openStation(station)}><span>{progress.stamps.includes(station.id) ? "✓" : station.icon}</span><strong>{station.name}</strong></button>)}</div></div>
          <article className="station-sheet"><div className="station-sheet__title"><span>{activeStation.icon}</span><div><small>{activeStation.short}</small><h2>{activeStation.name}</h2></div>{progress.stamps.includes(activeStation.id) ? <b className="earned-label">Stamped</b> : null}</div><div className="station-overview"><p className="station-description">{activeStation.description}</p><div className="station-why"><span>Why this matters</span><p>{activeStation.why}</p></div><p className="station-outcome"><strong>At this station:</strong> Follow the steps below, then save {activeStation.outcome}.</p></div><StationDiagram definition={diagrams[activeStation.id]} revealed={Math.max(-1, progress.diagramProgress[diagrams[activeStation.id].id] ?? -1)} onReveal={(index) => setProgress((current) => ({ ...current, diagramProgress: { ...current.diagramProgress, [diagrams[activeStation.id].id]: Math.max(current.diagramProgress[diagrams[activeStation.id].id] ?? -1, index) } }))} /><div className="station-actions"><button className="primary-button primary-button--wide" type="button" onClick={() => beginMission(activeStation.missionId)}>Start this station</button><button className="secondary-button" type="button" onClick={() => onOpenWorkspace(workspaceForStation(activeStation.id))}>Open station tools</button></div></article>
        </section> : null}

        {view === "mission" ? <section className="screen mission-screen" aria-labelledby="mission-title">
          <div className="screen-heading"><p className="kicker">{activeStation.name} station</p><h1 id="mission-title">{activeMission.title}</h1><p>Follow each step, then save one useful response.</p></div>
          {activeMission.mediaId ? <MediaMoment definition={media[activeMission.mediaId]} viewed={progress.viewedVideos.includes(activeMission.mediaId)} onViewed={markVideoViewed} /> : null}
          <StationDiagram definition={activeMission.diagram} revealed={diagramRevealed} onReveal={revealDiagram} />
          {diagramComplete ? <div className="artifact-entry"><label htmlFor="mission-response"><span>{activeMission.diagram.studentPrompt}</span><textarea id="mission-response" value={response} onChange={(event) => setResponse(event.target.value)} placeholder="Keep names and identifying details out." /></label><div className="artifact-status"><span>{response.trim() ? "Ready to save" : "One response required"}</span><small>Device only</small></div></div> : null}
          <div className="action-row"><button className="text-button" type="button" onClick={() => navigate("map")}>Back to map</button><button className="primary-button" type="button" disabled={!diagramComplete || !response.trim()} onClick={completeMission}>Save and stamp</button></div>
        </section> : null}

        {view === "stamp" ? <section className="screen stamp-screen" aria-labelledby="stamp-title"><RosieGuide pose="nodding" compact eyebrow="Saved" title="Your work is in the Vault." /><div className="stamp-seal" aria-hidden="true"><span>✓</span><small>Navigate</small></div><p className="kicker">Station complete</p><h1 id="stamp-title">{lastStamp}</h1><p>{activeMission.diagram.completionState}.</p><button className="primary-button" type="button" onClick={() => navigate("map")}>Return to the map</button></section> : null}

        {view === "home" ? <section className="screen dashboard" aria-labelledby="home-title">
          <div className="dashboard-hero"><div><p className="kicker">Your pathway</p><h1 id="home-title">One clear next move.</h1><p>{progress.artifacts.length} saved artifacts · {progress.stamps.length} station stamps</p></div><div className="completion-ring" aria-label={`${completion}% of stations stamped`}><span>{completion}%</span><small>explored</small></div></div>
          <div className="next-move-card"><div><span>Recommended station</span><h2>{selectedMission.title}</h2></div><div className="next-move-actions"><button className="primary-button" type="button" onClick={() => beginMission(selectedMission.id)}>Open recommended station</button><button className="secondary-button" type="button" onClick={() => onOpenWorkspace(workspaceForStation(selectedMission.stationId))}>Open station tools</button></div></div>
          <section className="commitment-panel" aria-labelledby="commitment-title"><h2 id="commitment-title">Change my next move</h2><div className="commitment-grid">{commitmentOptions.map((item) => <button key={item.id} type="button" aria-pressed={selectedCommitment === item.id} className={selectedCommitment === item.id ? "commitment--selected" : ""} onClick={() => setProgress((current) => ({ ...current, commitment: item.id }))}><span>{item.icon}</span>{item.label}</button>)}</div></section>
          <div className="device-actions"><label>Reminder<select value={progress.reminderDate} onChange={(event) => setProgress((current) => ({ ...current, reminderDate: event.target.value }))}><option>Tomorrow</option><option>In 3 days</option><option>Next week</option><option>No reminder</option></select></label><button className="text-button" type="button" onClick={clearDeviceData}>Clear this device&apos;s data</button></div>
        </section> : null}

        {view === "cohort" ? <section className="screen compact-screen" aria-labelledby="cohort-title"><div className="screen-heading"><p className="kicker">Cohort</p><h1 id="cohort-title">Move forward together.</h1><p>A cohort is a group of classmates sharing the same process. Use the practice message board to ask, encourage, share resources, or connect.</p></div><MediaMoment definition={media.cohort} viewed={progress.viewedVideos.includes("cohort")} onViewed={markVideoViewed} /><div className="participation-modes">{diagrams.cohort.steps.map((item, index) => <button type="button" key={item.label} onClick={() => beginMission("cohort-participation")}><span>{index + 1}</span><strong>{item.label}</strong><small>{item.hint}</small></button>)}</div><button className="secondary-button" type="button" onClick={() => onOpenWorkspace("cohort")}>Open shared message board</button><p className="privacy-note">This prototype board is fictional and stays on this device.</p></section> : null}

        {view === "vault" ? <section className="screen compact-screen" aria-labelledby="vault-title"><div className="screen-heading"><p className="kicker">Vault</p><h1 id="vault-title">Your saved work.</h1><p>Device only. Reuse it for reflection, advising, and application preparation.</p></div>{progress.artifacts.length ? <div className="artifact-list">{progress.artifacts.map((artifact) => <article key={artifact.id}><div><span>{stations.find((station) => station.id === artifact.stationId)?.icon}</span><strong>{artifact.label}</strong></div><p>{artifact.response}</p><small>{new Date(artifact.savedAt).toLocaleDateString()}</small></article>)}</div> : <div className="empty-vault"><span>▤</span><h2>No saved work yet.</h2><button className="primary-button" type="button" onClick={() => beginMission("log-experience")}>Capture one experience</button></div>}<div className="vault-actions"><button className="secondary-button" type="button" onClick={() => onOpenWorkspace("experience")}>Open experience tools</button><button className="text-button clear-button" type="button" onClick={clearDeviceData}>Clear this device&apos;s data</button></div></section> : null}
      </div>

      <AppDock view={view} enabled={["map", "mission", "stamp", "home", "cohort", "vault"].includes(view)} navigate={navigate} />
      <footer className="site-footer"><p>Navigate the Pathway concept</p><p>Not an admissions decision tool</p></footer>
    </main>
  );
}
