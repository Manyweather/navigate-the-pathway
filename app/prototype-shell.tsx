"use client";

import { useState } from "react";
import { FeatureWorkspaces, ReviewerWorkspace, type WorkspaceId } from "./components/feature-workspaces";
import { RosieGuide } from "./components/rosie-guide";
import { JourneyExperience } from "./journey-experience";
import { PrototypeProvider, usePrototype } from "./prototype-store";

type Surface = "entry" | "pathway" | "workspace" | "advisor" | "admin";

function EntryScreen({ onStudent, onAdvisor, onAdmin }: { onStudent: () => void; onAdvisor: () => void; onAdmin: () => void }) {
  const { state } = usePrototype();
  const returning = Boolean(state.media.lastUpdate || state.artifacts.length > 4);
  return <main className="entry-screen"><header className="entry-topbar"><img src="/assets/navigate-pathway-mark.svg" alt="Navigate the Pathway" /><form action="/api/access/signout" method="post"><button className="text-button" type="submit">Sign out</button></form></header><section className="entry-card"><RosieGuide pose={returning ? "tracks" : "gesture"} eyebrow="Navigate the Pathway" title={returning ? "Your pathway is ready." : "Choose how you want to explore."} body="Student work stays on this device. Reviewer views use fictional demonstration records." priority /><div className="entry-actions"><button className="primary-button" onClick={onStudent}>{returning ? "Continue student pathway" : "Open student pathway"}</button><button className="secondary-button" onClick={onAdvisor}>Open advisor example</button><button className="text-button" onClick={onAdmin}>Pilot administration</button></div></section></main>;
}

function PrototypeRouter() {
  const { dispatch } = usePrototype();
  const [surface, setSurface] = useState<Surface>("entry");
  const [workspace, setWorkspace] = useState<WorkspaceId>("experience");
  const [quick, setQuick] = useState(false);

  const openWorkspace = (next: WorkspaceId, quickCapture = false) => {
    setWorkspace(next);
    setQuick(quickCapture);
    setSurface("workspace");
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  if (surface === "entry") return <EntryScreen onStudent={() => setSurface("pathway")} onAdvisor={() => { dispatch({ type: "LOAD_SCENARIO", scenario: "advisor" }); setSurface("advisor"); }} onAdmin={() => { dispatch({ type: "LOAD_SCENARIO", scenario: "admin" }); setSurface("admin"); }} />;
  if (surface === "workspace") return <FeatureWorkspaces initial={workspace} quick={quick} onBack={() => setSurface("pathway")} />;
  if (surface === "advisor" || surface === "admin") return <ReviewerWorkspace mode={surface} onBack={() => setSurface("entry")} />;

  return <><JourneyExperience onOpenWorkspace={(next) => openWorkspace(next)} onOpenReviewers={() => setSurface("entry")} /><button className="quick-capture" type="button" onClick={() => openWorkspace("experience", true)}><span>+</span>Quick capture</button></>;
}

export function PrototypeShell() {
  return <PrototypeProvider><PrototypeRouter /></PrototypeProvider>;
}
