"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { RosieGuide } from "../components/rosie-guide";
import { PilotApiClient } from "./api-client";
import { ConfigurationRequired, MfaGate, PasswordRecovery, SignIn } from "./production-pilot-app";
import { getSupabaseBrowserClient, loadProductionConfiguration } from "./supabase-client";
import { staffMfaRoles, type ExperienceKey, type ExperienceMembership } from "./platform-model";
import type { AuthorizationContext } from "./types";
import {
  getSyntheticPreviewPersona,
  setSyntheticPreviewPersona,
  SYNTHETIC_PREVIEW_KEY,
  SYNTHETIC_PERSONA_KEY,
  syntheticPreviewApi,
  syntheticContextForPersona,
  syntheticMembershipsForPersona,
  syntheticPreviewSession,
  syntheticPreviewSupabase,
  type SyntheticPersonaKey,
} from "./synthetic-preview";

export type PlatformAccessValue = {
  session: Session;
  supabase: SupabaseClient;
  api: PilotApiClient;
  context: AuthorizationContext;
  memberships: ExperienceMembership[];
  previewMode: boolean;
  previewPersona: SyntheticPersonaKey | null;
  setPreviewPersona: (persona: SyntheticPersonaKey) => void;
  signOut: () => Promise<void>;
};

export function PlatformAccess({ experience, children }: {
  experience?: ExperienceKey;
  children: (value: PlatformAccessValue) => React.ReactNode;
}) {
  const [clientReady, setClientReady] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [previewPersona, updatePreviewPersona] = useState<SyntheticPersonaKey>(() => getSyntheticPreviewPersona());
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [configured, setConfigured] = useState<"loading" | "ready" | "preview" | "error">("loading");
  const [context, setContext] = useState<AuthorizationContext | null>(null);
  const [memberships, setMemberships] = useState<ExperienceMembership[]>([]);
  const [message, setMessage] = useState("Opening your Navigate account…");
  const [accountLoadFailed, setAccountLoadFailed] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [mfaVerified, setMfaVerified] = useState(false);
  const api = useMemo(() => previewMode ? syntheticPreviewApi : supabase ? new PilotApiClient(supabase, undefined, experience) : null, [experience, previewMode, supabase]);

  useEffect(() => {
    const task = window.setTimeout(() => {
      const query = new URLSearchParams(window.location.search);
      const preview = query.get("preview") === "creator" || window.localStorage.getItem(SYNTHETIC_PREVIEW_KEY) === "true";
      setPreviewMode(preview);
      setConfigured(preview ? "preview" : "loading");
      setRecoveryMode(/(?:^|[?#&])type=recovery(?:&|$)/.test(`${window.location.search}${window.location.hash}`));
      setClientReady(true);
    }, 0);
    return () => window.clearTimeout(task);
  }, []);

  useEffect(() => {
    if (!clientReady) return;
    if (previewMode) {
      const requestedPreview = new URLSearchParams(window.location.search).get("preview") === "creator";
      window.localStorage.setItem(SYNTHETIC_PREVIEW_KEY, "true");
      if (requestedPreview) window.history.replaceState({}, "", window.location.pathname);
      return;
    }
    loadProductionConfiguration().then(() => {
      const client = getSupabaseBrowserClient();
      if (!client) throw new Error("Secure setup is not connected yet.");
      setSupabase(client); setConfigured("ready");
    }).catch(() => setConfigured("error"));
  }, [clientReady, previewMode]);

  useEffect(() => {
    if (!previewMode) return;
    const update = (event: Event) => updatePreviewPersona((event as CustomEvent<SyntheticPersonaKey>).detail || getSyntheticPreviewPersona());
    window.addEventListener("navigate:preview-persona", update);
    return () => window.removeEventListener("navigate:preview-persona", update);
  }, [previewMode]);

  useEffect(() => {
    if (!supabase || previewMode) return;
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (event === "PASSWORD_RECOVERY") setRecoveryMode(true);
    });
    return () => data.subscription.unsubscribe();
  }, [previewMode, supabase]);

  const load = useCallback(async () => {
    if (!api || !session || recoveryMode) return;
    setMessage("Opening your Navigate account…");
    setAccountLoadFailed(false);
    try {
      const value = await api.request<{ context: AuthorizationContext; memberships: ExperienceMembership[] }>("/api/platform/experiences");
      setContext(value.context); setMemberships(value.memberships); setMessage("");
    } catch {
      setAccountLoadFailed(true);
      setMessage("The secure workspace update is not connected yet.");
    }
  }, [api, recoveryMode, session]);

  useEffect(() => {
    const task = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(task);
  }, [load]);

  if (previewMode && configured === "preview") {
    const previewMemberships = syntheticMembershipsForPersona(previewPersona);
    const previewContext = syntheticContextForPersona(previewPersona);
    const membership = experience ? previewMemberships.find((item) => item.experienceKey === experience) : null;
    if (experience && !membership) return <main className="production-auth"><section className="production-auth-card"><h1>Preview unavailable</h1><a className="secondary-button" href="/app">Return to Navigate</a></section></main>;
    const exitPreview = async () => {
      window.localStorage.removeItem(SYNTHETIC_PREVIEW_KEY);
      window.localStorage.removeItem(SYNTHETIC_PERSONA_KEY);
      window.location.assign("/app");
    };
    return <>{children({ session: syntheticPreviewSession, supabase: syntheticPreviewSupabase, api: syntheticPreviewApi, context: previewContext, memberships: previewMemberships, previewMode: true, previewPersona, setPreviewPersona: setSyntheticPreviewPersona, signOut: exitPreview })}</>;
  }

  if (configured === "error") return <ConfigurationRequired />;
  if (!supabase || configured === "loading") return <main className="production-auth"><section className="production-auth-card"><RosieGuide pose="tracks" eyebrow="Navigate" title="Connecting your secure account…" /></section></main>;
  if (!session) return <SignIn supabase={supabase} />;
  if (recoveryMode) return <PasswordRecovery supabase={supabase} onComplete={() => {
    window.history.replaceState({}, "", window.location.pathname);
    setRecoveryMode(false);
    setContext(null);
    setMessage("Opening your Navigate account…");
  }} />;
  if (accountLoadFailed) return <main className="production-auth"><section className="production-auth-card">
    <RosieGuide pose="idle" compact eyebrow="Account connected" title="Your password was accepted." body="The expanded secure workspace is still being connected to this pilot. You can explore every new dashboard now with fictional records." priority />
    <a className="preview-entry" href="/app?preview=creator"><span><strong>Open the Creator preview</strong><small>Compass, Navigate the Pathway, and Impact Studio with synthetic data only.</small></span><span aria-hidden="true">→</span></a>
    <button className="text-button" onClick={() => void supabase.auth.signOut()}>Return to sign in</button>
    <p className="form-message" aria-live="polite">{message}</p>
  </section></main>;
  if (!context || !api) return <main className="production-auth"><section className="production-auth-card"><RosieGuide pose="tracks" eyebrow="Navigate" title="Opening your account hub…" /><p className="form-message" aria-live="polite">{message}</p></section></main>;

  const membership = experience ? memberships.find((item) => item.experienceKey === experience && item.status === "active" && item.featureEnabled) : null;
  if (experience && !membership) return <main className="production-auth"><section className="production-auth-card"><p className="kicker">Membership required</p><h1>This experience is not assigned to your account.</h1><p>Return to the Navigate hub or ask an administrator to review your membership.</p><a className="secondary-button" href="/app">Return to Navigate</a></section></main>;
  const needsMfa = membership?.roles.some((role) => staffMfaRoles.has(role)) && context.aal !== "aal2" && !mfaVerified;
  if (needsMfa) return <MfaGate supabase={supabase} onVerified={() => { setMfaVerified(true); void load(); }} />;

  const signOut = async () => { try { await api.request("/api/activity/signout", { method: "POST", body: {} }); } finally { await supabase.auth.signOut(); } };
  return <>{children({ session, supabase, api, context, memberships, previewMode: false, previewPersona: null, setPreviewPersona: () => undefined, signOut })}</>;
}
