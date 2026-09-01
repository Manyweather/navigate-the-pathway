"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assetUrl } from "../asset-url";
import { RosieGuide } from "../components/rosie-guide";
import type { PilotApiClient } from "./api-client";
import type { AdvisingPacketDetail, CohortPost, PathwayArtifact, StudentDashboard } from "./types";

export type StudentDestination = "home" | "sessions" | "map" | "vault" | "portfolio" | "cohort" | "advising";

const stationNames: Record<string, string> = {
  courses: "Courses",
  evidence: "Experiences",
  service: "Compassion & Values",
  cohort: "Cohort",
  reflection: "Your Story",
  application: "Application",
};

export function StudentHome({ dashboard, api, onNavigate }: { dashboard: StudentDashboard; api: PilotApiClient; onNavigate: (view: StudentDestination) => void }) {
  const [artifacts, setArtifacts] = useState<PathwayArtifact[]>([]);
  const [transcript, setTranscript] = useState(false);
  useEffect(() => { api.request<PathwayArtifact[]>("/api/artifacts").then(setArtifacts).catch(() => setArtifacts([])); }, [api]);
  const submitted = dashboard.surveyAssignments.filter((item) => item.status === "submitted").length;
  return <div className="production-grid student-home">
    <section className="production-card production-card--wide student-home__welcome">
      <div className="student-home__intro"><RosieGuide pose="gesture" eyebrow="Rosie, your pathway guide" title="Welcome to Navigate The Pathway." body="I’ll help you make your premedical journey visible, understand why each step matters, and turn your work into useful records for reflection, advising, and your application." priority /><button className="primary-button" type="button" onClick={() => onNavigate("map")}>{artifacts.length ? "Continue my pathway" : "Complete my pathway setup"}</button></div>
      <div className="production-welcome-media"><video controls playsInline preload="metadata" poster={assetUrl("/media/welcome-poster.jpg")}><source src={assetUrl("/media/welcome.webm")} type="video/webm" /><source src={assetUrl("/media/welcome.mp4")} type="video/mp4" /><track kind="captions" src={assetUrl("/media/welcome.vtt")} srcLang="en" label="English" default /></video><button className="text-button" type="button" onClick={() => setTranscript((current) => !current)}>{transcript ? "Hide transcript" : "Read transcript"}</button>{transcript ? <div className="production-transcript"><h3>Rosie’s explanation</h3><p>Hi, I’m Rosie, your guide to Navigate The Pathway. You already have experiences that matter. This is a private practice space where you can track courses and experiences, reflect on compassion and your values, learn with your cohort, and shape the story you may use in your medical school application. Each station explains why the work matters, guides one manageable action, and saves something useful to your Vault and Portfolio. There are no points, rankings, or perfect routes. You choose where to begin, and you can change direction whenever you need to.</p></div> : null}</div>
    </section>
    <section className="production-card production-card--wide"><div className="section-heading"><div><p className="kicker">Your pathway at a glance</p><h2>Pick up where you left off.</h2></div><p>Each destination has a different job. Saved station work lives in the Vault and Portfolio.</p></div><div className="home-action-grid"><button onClick={() => onNavigate("map")}><span>🧭</span><strong>Pathway Map</strong><small>Complete setup and use station tools</small></button><button onClick={() => onNavigate("vault")}><span>🗂️</span><strong>Vault</strong><small>{artifacts.length} saved station item{artifacts.length === 1 ? "" : "s"}</small></button><button onClick={() => onNavigate("cohort")}><span>👥</span><strong>Cohort Board</strong><small>Ask, encourage, respond, or share</small></button><button onClick={() => onNavigate("portfolio")}><span>◫</span><strong>Portfolio</strong><small>Organize and share selected work</small></button></div></section>
    <section className="production-card"><p className="kicker">Sessions</p><h2>{dashboard.nextSession?.title || "No upcoming session"}</h2><p>{dashboard.nextSession ? new Date(dashboard.nextSession.startsAt).toLocaleString() : "Your program will publish the next session here."}</p><button className="secondary-button" onClick={() => onNavigate("sessions")}>Open Sessions</button></section>
    <section className="production-card"><p className="kicker">Surveys</p><h2>{submitted} of {dashboard.surveyAssignments.length} submitted</h2><p>Open surveys can be completed in Sessions. Results never control your pathway recommendation.</p><button className="secondary-button" onClick={() => onNavigate("sessions")}>View surveys</button></section>
  </div>;
}

export function StudentVault({ api, refreshToken = 0 }: { api: PilotApiClient; refreshToken?: number }) {
  const [artifacts, setArtifacts] = useState<PathwayArtifact[]>([]);
  const [filter, setFilter] = useState("all");
  const [message, setMessage] = useState("Loading your Vault...");
  useEffect(() => { api.request<PathwayArtifact[]>("/api/artifacts").then((items) => { setArtifacts(items); setMessage(""); }).catch((error) => setMessage(error.message)); }, [api, refreshToken]);
  const visible = filter === "all" ? artifacts : artifacts.filter((artifact) => artifact.station === filter);
  return <section className="production-card production-card--wide vault-workspace"><div className="section-heading"><div><p className="kicker">Experience Vault</p><h2>Your saved station work</h2><p>The Vault keeps each item separate. Nothing follows into another station form.</p></div><label><span>Filter</span><select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All stations</option>{Object.entries(stationNames).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label></div>{message ? <p className="form-message">{message}</p> : null}<div className="vault-grid">{visible.map((artifact) => <article key={artifact.id}><div><span>{stationNames[artifact.station] || artifact.station}</span><time dateTime={artifact.updatedAt}>{new Date(artifact.updatedAt).toLocaleDateString()}</time></div><h3>{artifact.title}</h3>{artifact.content.fields ? <dl>{Object.entries(artifact.content.fields).filter(([, value]) => value).slice(0, 5).map(([key, value]) => <div key={key}><dt>{key.replace(/([A-Z])/g, " $1")}</dt><dd>{value}</dd></div>)}</dl> : <p>{artifact.content.response}</p>}</article>)}{!visible.length && !message ? <p>No saved work in this view yet.</p> : null}</div></section>;
}

export function StudentPortfolio({ dashboard, api, supabase, userId, onReload, refreshToken = 0 }: { dashboard: StudentDashboard; api: PilotApiClient; supabase: SupabaseClient; userId: string; onReload: () => void; refreshToken?: number }) {
  const [artifacts, setArtifacts] = useState<PathwayArtifact[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [packet, setPacket] = useState<AdvisingPacketDetail | null>(null);
  const [message, setMessage] = useState("Loading your Portfolio...");
  const [busy, setBusy] = useState(false);
  const [documentType, setDocumentType] = useState("Transcript or course record");
  const load = useCallback(async () => {
    try {
      const [saved, shared] = await Promise.all([api.request<PathwayArtifact[]>("/api/artifacts"), api.request<AdvisingPacketDetail | null>("/api/advising/share")]);
      setArtifacts(saved); setPacket(shared); setSelected(shared?.itemIds || []); setMessage("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Your Portfolio could not be loaded."); }
  }, [api]);
  useEffect(() => {
    const task = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(task);
  }, [load, refreshToken]);
  const share = async () => { setBusy(true); try { const shared = await api.request<AdvisingPacketDetail>("/api/advising/share", { method: "POST", body: { artifactIds: selected } }); setPacket(shared); setMessage(`Shared ${shared.items.length} item${shared.items.length === 1 ? "" : "s"} with ${shared.advisorName}.`); } catch (error) { setMessage(error instanceof Error ? error.message : "The packet could not be shared."); } finally { setBusy(false); } };
  const revoke = async () => { setBusy(true); try { await api.request("/api/advising/share", { method: "DELETE" }); setPacket(null); setSelected([]); setMessage("Advisor access was revoked."); } catch (error) { setMessage(error instanceof Error ? error.message : "Advisor access could not be revoked."); } finally { setBusy(false); } };
  const upload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    if (file.size > 20 * 1024 * 1024) { setMessage("Choose a file smaller than 20 MB."); return; }
    setBusy(true); setMessage("Uploading securely...");
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const path = `${userId}/${crypto.randomUUID()}-${safeName}`;
    const uploaded = await supabase.storage.from("pilot-portfolio").upload(path, file, { contentType: file.type, upsert: false });
    if (uploaded.error) { setBusy(false); setMessage("The document could not be uploaded."); return; }
    try { await api.request("/api/portfolio/documents", { method: "POST", body: { storagePath: path, title: file.name, documentType } }); setMessage("Document added to your private Portfolio."); onReload(); } catch (error) { setMessage(error instanceof Error ? error.message : "The document record could not be saved."); }
    setBusy(false); event.target.value = "";
  };
  return <div className="production-grid portfolio-workspace"><section className="production-card production-card--wide"><div className="section-heading"><div><p className="kicker">Portfolio</p><h2>Build a useful record over time.</h2><p>Every saved station artifact appears here. Select only the items you want an advisor to see.</p></div>{packet ? <span className="role-chip">Shared with {packet.advisorName}</span> : <span className="role-chip">Private</span>}</div><div className="portfolio-selection">{artifacts.map((artifact) => <label key={artifact.id}><input type="checkbox" aria-label={`Select ${artifact.title} to share with an advisor`} checked={selected.includes(artifact.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...new Set([...current, artifact.id])] : current.filter((id) => id !== artifact.id))} /><span><strong>{artifact.title}</strong><small>{stationNames[artifact.station]} · {new Date(artifact.updatedAt).toLocaleDateString()}</small></span></label>)}{!artifacts.length && !message ? <p>Complete a station to add the first Portfolio item.</p> : null}</div><div className="portfolio-share-actions"><button className="primary-button" disabled={busy || !selected.length} onClick={share}>{packet ? "Update advisor share" : "Share selected with advisor"}</button>{packet ? <button className="text-button" disabled={busy} onClick={revoke}>Revoke advisor access</button> : null}</div><p className="form-message" aria-live="polite">{message}</p></section><section className="production-card"><p className="kicker">Documents</p><h2>Add a private file</h2><p>PDF, Word, image, or text files up to 20 MB.</p><label><span>Document type</span><select value={documentType} onChange={(event) => setDocumentType(event.target.value)}><option>Transcript or course record</option><option>Resume or CV</option><option>Experience verification</option><option>Draft writing</option><option>Other</option></select></label><label className="file-upload"><span>{busy ? "Working..." : "Choose a document"}</span><input type="file" aria-label="Choose a private Portfolio document" disabled={busy} accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.txt" onChange={upload} /></label></section><section className="production-card"><p className="kicker">Uploaded documents</p><h2>{dashboard.portfolio.length} document{dashboard.portfolio.length === 1 ? "" : "s"}</h2>{dashboard.portfolio.map((item) => <article className="portfolio-row" key={item.id}><div><strong>{item.title}</strong><span>{item.documentType}</span></div><span>{item.sharedWithAdvisor ? "Shared" : "Private"}</span></article>)}</section></div>;
}

export function CohortBoard({ api }: { api: PilotApiClient }) {
  const [posts, setPosts] = useState<CohortPost[]>([]);
  const [body, setBody] = useState("");
  const [mode, setMode] = useState<CohortPost["participationMode"]>("question");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [message, setMessage] = useState("Loading your cohort...");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { setPosts(await api.request<CohortPost[]>("/api/cohort/posts")); setMessage(""); } catch (error) { setMessage(error instanceof Error ? error.message : "The cohort board could not be loaded."); } }, [api]);
  useEffect(() => {
    const task = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(task);
  }, [load]);
  const submit = async () => { if (!body.trim()) return; setBusy(true); try { await api.request("/api/cohort/posts", { method: "POST", body: { body, participationMode: mode, parentId: replyTo } }); setBody(""); setReplyTo(null); await load(); } catch (error) { setMessage(error instanceof Error ? error.message : "Your message could not be posted."); } finally { setBusy(false); } };
  const roots = useMemo(() => posts.filter((post) => !post.parentId), [posts]);
  return <div className="production-grid cohort-board"><section className="production-card production-card--wide"><RosieGuide pose="gesture" compact eyebrow="Cohort board" title="There are many valid ways to participate." body="Observe first, encourage someone, ask a question, share a resource, or respond when you have something useful to add." /><div className="cohort-composer"><label><span>Contribution type</span><select value={mode} onChange={(event) => setMode(event.target.value as CohortPost["participationMode"])}><option value="question">Ask a question</option><option value="resource">Share a resource</option><option value="encouragement">Offer encouragement</option><option value="reflection">Share a reflection</option></select></label><label><span>{replyTo ? "Write a reply" : "Start a discussion"}</span><textarea value={body} maxLength={1800} onChange={(event) => setBody(event.target.value)} placeholder="Keep patient names and identifying details out." /></label><div>{replyTo ? <button className="text-button" onClick={() => setReplyTo(null)}>Cancel reply</button> : null}<button className="primary-button" disabled={busy || !body.trim()} onClick={submit}>{busy ? "Posting..." : replyTo ? "Post reply" : "Post to cohort"}</button></div></div><p className="form-message">{message}</p></section><section className="production-card production-card--wide"><div className="section-heading"><div><p className="kicker">Shared discussion</p><h2>Your cohort’s questions and resources</h2></div><button className="secondary-button" onClick={() => void load()}>Refresh</button></div><div className="discussion-list">{roots.map((post) => <article key={post.id}><header><div><strong>{post.authorName}</strong><span>{post.participationMode}</span></div><time dateTime={post.createdAt}>{new Date(post.createdAt).toLocaleString()}</time></header><p>{post.body}</p><button className="text-button" onClick={() => setReplyTo(post.id)}>Reply</button>{posts.filter((reply) => reply.parentId === post.id).map((reply) => <div className="discussion-reply" key={reply.id}><strong>{reply.authorName}</strong><p>{reply.body}</p></div>)}</article>)}{!roots.length && !message ? <p>No posts yet. Observing counts as participation. Post only when you are ready.</p> : null}</div></section></div>;
}

export function StudentAdvising({ api }: { api: PilotApiClient }) {
  const [packet, setPacket] = useState<AdvisingPacketDetail | null>(null);
  const [message, setMessage] = useState("Loading your advising share...");
  useEffect(() => { api.request<AdvisingPacketDetail | null>("/api/advising/share").then((value) => { setPacket(value); setMessage(""); }).catch((error) => setMessage(error.message)); }, [api]);
  return <section className="production-card production-card--wide"><div className="section-heading"><div><p className="kicker">Advising</p><h2>Control what your advisor can see.</h2></div>{packet ? <span className="role-chip">Active share</span> : <span className="role-chip">Nothing shared</span>}</div>{message ? <p className="form-message">{message}</p> : packet ? <><p><strong>{packet.advisorName}</strong> can see {packet.items.length} selected Portfolio item{packet.items.length === 1 ? "" : "s"}. {packet.expiresAt ? `Access expires ${new Date(packet.expiresAt).toLocaleDateString()}.` : ""}</p><div className="vault-grid">{packet.items.map((item) => <article key={item.id}><span>{stationNames[item.station]}</span><h3>{item.title}</h3></article>)}</div><div className="advisor-comments"><h3>Advisor comments and next actions</h3>{packet.comments.map((comment) => <article key={comment.id}><strong>{comment.authorName}</strong><p>{comment.body}</p><time>{new Date(comment.createdAt).toLocaleString()}</time></article>)}{!packet.comments.length ? <p>No advisor comments yet.</p> : null}</div></> : <p>Select Portfolio items and use <strong>Share selected with advisor</strong> when you are ready. Private reflections, drafts, support contacts, and unselected items stay private.</p>}</section>;
}
