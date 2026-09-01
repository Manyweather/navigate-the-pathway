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

const stations: Station[] = [
  { id: "courses", name: "Courses", short: "Plan", icon: "📚", description: "Track prerequisites, clarify course questions, and plan study strategies.", why: "Clear course plans protect your time and keep more options open.", prompt: "What course question or study strategy do you want to act on next?", artifactType: "course_plan", artifactTitle: "Course question and follow-up" },
  { id: "evidence", name: "Experiences", short: "Track", icon: "🗂️", description: "Capture meaningful moments from service, clinical work, research, leadership, employment, and campus life.", why: "Specific examples fade. Recording them now makes later reflection and application writing easier.", prompt: "What happened, what did you do, and what mattered?", artifactType: "experience", artifactTitle: "Meaningful experience" },
  { id: "service", name: "Compassion & Values", short: "Notice", icon: "♡", description: "Notice how people experience care, access, barriers, dignity, and support.", why: "Noticing needs and responses connects your values to action and builds compassionate practice.", prompt: "What need or barrier did you notice, and what compassionate response followed?", artifactType: "reflection", artifactTitle: "Compassion and values reflection" },
  { id: "cohort", name: "Cohort", short: "Connect", icon: "👥", description: "Identify support, ask questions, encourage classmates, and exchange useful resources.", why: "Small, low-pressure interactions make support easier to give, receive, and request.", prompt: "What small way would you like to participate or ask for support?", artifactType: "action_plan", artifactTitle: "Cohort participation plan" },
  { id: "reflection", name: "Your Story", short: "Reflect", icon: "✍️", description: "Look across experiences to notice what matters to you, how you learn, and who you are becoming.", why: "Strong personal statements grow from repeated evidence and honest reflection.", prompt: "What pattern or meaning are you noticing across your experiences?", artifactType: "reflection", artifactTitle: "Story reflection" },
  { id: "application", name: "Application", short: "Prepare", icon: "📄", description: "Turn saved experiences and reflections into application examples and advising questions.", why: "Building from your own records reduces blank-page pressure and reveals what to develop next.", prompt: "What specific example could support an application or advising conversation?", artifactType: "application_example", artifactTitle: "Application-ready example" },
];

export function ProductionPathwayMap({ api }: { api: PilotApiClient }) {
  const [activeId, setActiveId] = useState<StationId>("evidence");
  const [artifacts, setArtifacts] = useState<PathwayArtifact[]>([]);
  const [response, setResponse] = useState("");
  const [message, setMessage] = useState("Loading your saved station work...");
  const [busy, setBusy] = useState(false);
  const active = stations.find((station) => station.id === activeId) ?? stations[1];
  const stamped = new Set(artifacts.map((artifact) => artifact.station));

  const loadArtifacts = useCallback(async () => {
    try {
      const saved = await api.request<PathwayArtifact[]>("/api/artifacts");
      setArtifacts(saved);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Your station work could not be loaded.");
    }
  }, [api]);

  useEffect(() => {
    // This request synchronizes the signed-in student's server-backed pathway work.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadArtifacts();
  }, [loadArtifacts]);

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

  return <section className="production-card production-card--wide production-map" aria-labelledby="production-map-title">
    <div className="section-heading"><div><p className="kicker">Your pathway map</p><h2 id="production-map-title">Choose a station.</h2></div><p>{stamped.size} of {stations.length} stations have saved work.</p></div>
    <RosieGuide pose="pointing" compact eyebrow="Rosie recommends" title={active.name} body="Choose a station on the map, review why it matters, and save one useful response." />
    <div className="district-map" aria-label="Scrollable pathway station map"><div className="district-map__canvas"><img src={assetUrl("/assets/premed-district-map.png")} alt="Illustrated pathway through six premedical learning stations" />{stations.map((station) => <button key={station.id} type="button" aria-label={`${station.name}: ${station.description}`} className={`station station--${station.id} ${activeId === station.id ? "station--active" : ""} ${stamped.has(station.id) ? "station--stamped" : ""}`} onClick={() => selectStation(station)}><span>{stamped.has(station.id) ? "✓" : station.icon}</span><strong>{station.name}</strong></button>)}</div></div>
    <article className="station-sheet production-station-sheet"><div className="station-sheet__title"><span>{active.icon}</span><div><small>{active.short}</small><h2>{active.name}</h2></div>{stamped.has(active.id) ? <b className="earned-label">Saved</b> : null}</div><div className="station-overview"><p className="station-description">{active.description}</p><div className="station-why"><span>Why this matters</span><p>{active.why}</p></div><label className="production-station-response"><span>{active.prompt}</span><textarea value={response} maxLength={5000} onChange={(event) => setResponse(event.target.value)} placeholder="Write a brief note. Keep patient names and identifying details out." /></label><div className="production-station-actions"><button className="primary-button" type="button" disabled={busy || !response.trim()} onClick={save}>{busy ? "Saving..." : "Save this station"}</button><span>{response.length} / 5000</span></div><p className="form-message" aria-live="polite">{message}</p></div></article>
    {artifacts.length ? <div className="production-saved-stations"><h3>Your saved station work</h3>{artifacts.slice(0, 6).map((artifact) => <article key={artifact.id}><div><strong>{artifact.title}</strong><span>{stations.find((station) => station.id === artifact.station)?.name || artifact.station}</span></div><p>{artifact.content.response}</p><time dateTime={artifact.createdAt}>{new Date(artifact.createdAt).toLocaleDateString()}</time></article>)}</div> : null}
  </section>;
}
