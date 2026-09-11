"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { RosieGuide } from "../components/rosie-guide";
import { PilotApiClient } from "./api-client";
import { ConfigurationRequired, MfaGate, PasswordRecovery, PasswordRecoveryProblem, SignIn } from "./production-pilot-app";
import { parseRecoveryCallback } from "./auth-recovery";
import { getSupabaseBrowserClient, loadProductionConfiguration } from "./supabase-client";
import { staffMfaRoles, type ExperienceKey, type ExperienceMembership } from "./platform-model";
import type { AuthorizationContext } from "./types";
import {
  getSyntheticPreviewPersona,
  setSyntheticPreviewPersona,
  SYNTHETIC_PREVIEW_KEY,
  SYNTHETIC_PREVIEW_SCOPE_KEY,
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
  previewScope: "creator" | "compass" | null;
  previewPersona: SyntheticPersonaKey | null;
  setPreviewPersona: (persona: SyntheticPersonaKey) => void;
  signOut: () => Promise<void>;
};

function PreviewWorkspaceRedirect({ href }: { href: string }) {
  useEffect(() => { window.location.replace(href); }, [href]);
  return <main className="production-auth"><section className="production-auth-card"><RosieGuide pose="tracks" eyebrow="Impact" title="Opening your workspace…" /></section></main>;
}

export function PlatformAccess({ experience, children }: {
  experience?: ExperienceKey;
  children: (value: PlatformAccessValue) => React.ReactNode;
}) {
  const [clientReady, setClientReady] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [previewScope, setPreviewScope] = useState<"creator" | "compass" | null>(null);
  const [previewPersona, updatePreviewPersona] = useState<SyntheticPersonaKey>(() => getSyntheticPreviewPersona());
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [configured, setConfigured] = useState<"loading" | "ready" | "preview" | "error">("loading");
  const [context, setContext] = useState<AuthorizationContext | null>(null);
  const [memberships, setMemberships] = useState<ExperienceMembership[]>([]);
  const [message, setMessage] = useState("Opening your Navigate account…");
  const [accountLoadFailed, setAccountLoadFailed] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [mfaVerified, setMfaVerified] = useState(false);
  const api = useMemo(() => previewMode ? syntheticPreviewApi : supabase ? new PilotApiClient(supabase, undefined, experience) : null, [experience, previewMode, supabase]);

  useEffect(() => {
    const task = window.setTimeout(() => {
      const query = new URLSearchParams(window.location.search);
      const requestedPreview = query.get("preview");
      const requestedDemoRole = query.get("demo");
      const storedPreview = window.localStorage.getItem(SYNTHETIC_PREVIEW_KEY) === "true";
      const storedScope = window.localStorage.getItem(SYNTHETIC_PREVIEW_SCOPE_KEY);
      const scope = requestedPreview === "compass"
        ? "compass"
        : requestedPreview === "creator"
          ? "creator"
          : storedPreview
            ? storedScope === "compass" ? "compass" : "creator"
            : null;
      if (requestedPreview === "compass") {
        const requestedPersona: SyntheticPersonaKey = requestedDemoRole === "admin"
          ? "compass_director"
          : requestedDemoRole === "student"
            ? "compass_student"
            : requestedDemoRole === "career"
              ? "career_advisor"
              : requestedDemoRole === "academic"
                ? "academic_advisor"
                : storedScope !== "compass"
                  ? "academic_advisor"
                  : getSyntheticPreviewPersona();
        window.localStorage.setItem(SYNTHETIC_PERSONA_KEY, requestedPersona);
        updatePreviewPersona(requestedPersona);
      }
      const preview = scope !== null;
      const recovery = parseRecoveryCallback(window.location.search, window.location.hash);
      setPreviewMode(preview);
      setPreviewScope(scope);
      setConfigured(preview ? "preview" : "loading");
      setRecoveryMode(recovery.requested && !recovery.errorMessage);
      setRecoveryError(recovery.errorMessage);
      setClientReady(true);
    }, 0);
    return () => window.clearTimeout(task);
  }, []);

  useEffect(() => {
    if (!clientReady) return;
    if (previewMode) {
      const requestedPreview = new URLSearchParams(window.location.search).get("preview");
      window.localStorage.setItem(SYNTHETIC_PREVIEW_KEY, "true");
      window.localStorage.setItem(SYNTHETIC_PREVIEW_SCOPE_KEY, previewScope || "creator");
      if (requestedPreview === "creator") window.history.replaceState({}, "", window.location.pathname);
      return;
    }
    loadProductionConfiguration().then(() => {
      const client = getSupabaseBrowserClient();
      if (!client) throw new Error("Secure setup is not connected yet.");
      setSupabase(client); setConfigured("ready");
    }).catch(() => setConfigured("error"));
  }, [clientReady, previewMode, previewScope]);

  useEffect(() => {
    if (!previewMode) return;
    const update = (event: Event) => updatePreviewPersona((event as CustomEvent<SyntheticPersonaKey>).detail || getSyntheticPreviewPersona());
    window.addEventListener("navigate:preview-persona", update);
    return () => window.removeEventListener("navigate:preview-persona", update);
  }, [previewMode]);

  useEffect(() => {
    if (!supabase || previewMode) return;
    let active = true;
    setAuthReady(false);
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setAuthReady(true);
      if (event === "PASSWORD_RECOVERY") {
        setRecoveryError(null);
        setRecoveryMode(true);
      }
    });
    void (async () => {
      if (recoveryError) {
        await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
        if (active) { setSession(null); setAuthReady(true); }
        return;
      }
      const initialized = await supabase.auth.initialize();
      const current = await supabase.auth.getSession();
      if (!active) return;
      const nextSession = current.data.session;
      setSession(nextSession);
      setAuthReady(true);
      if (recoveryMode && (initialized.error || current.error || !nextSession)) {
        setRecoveryMode(false);
        setRecoveryError("Compass could not validate a recovery session from that link. This does not necessarily mean the email was old; request one new email and use only its latest reset link.");
      }
    })();
    return () => { active = false; data.subscription.unsubscribe(); };
  }, [previewMode, recoveryError, recoveryMode, supabase]);

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
    const compassPreviewRoles: SyntheticPersonaKey[] = ["compass_student", "academic_advisor", "career_advisor", "compass_director"];
    const scopedPersona = previewScope === "compass" && !compassPreviewRoles.includes(previewPersona) ? "academic_advisor" : previewPersona;
    const previewMemberships = syntheticMembershipsForPersona(scopedPersona);
    const previewContext = syntheticContextForPersona(scopedPersona);
    const membership = experience ? previewMemberships.find((item) => item.experienceKey === experience) : null;
    if (previewPersona === "impact_student" && experience === "oaca") return <PreviewWorkspaceRedirect href="/app/compass/impact" />;
    if (experience && !membership) return <main className="production-auth"><section className="production-auth-card"><h1>Preview unavailable</h1><a className="secondary-button" href="/app">Return to Navigate</a></section></main>;
    const exitPreview = async () => {
      window.localStorage.removeItem(SYNTHETIC_PREVIEW_KEY);
      window.localStorage.removeItem(SYNTHETIC_PERSONA_KEY);
      window.localStorage.removeItem(SYNTHETIC_PREVIEW_SCOPE_KEY);
      window.location.assign("/app");
    };
    return <>{children({ session: syntheticPreviewSession, supabase: syntheticPreviewSupabase, api: syntheticPreviewApi, context: previewContext, memberships: previewMemberships, previewMode: true, previewScope, previewPersona: scopedPersona, setPreviewPersona: setSyntheticPreviewPersona, signOut: exitPreview })}</>;
  }

  if (configured === "error") return <ConfigurationRequired />;
  if (!supabase || configured === "loading") return <main className="production-auth"><section className="production-auth-card"><RosieGuide pose="tracks" eyebrow="Navigate" title="Connecting your secure account…" /></section></main>;
  if (recoveryError) return <PasswordRecoveryProblem supabase={supabase} detail={recoveryError} />;
  if (!authReady) return <main className="production-auth"><section className="production-auth-card"><RosieGuide pose="tracks" eyebrow="Compass" title="Validating your secure link…" /></section></main>;
  if (!session) return <SignIn supabase={supabase} />;
  if (recoveryMode) return <PasswordRecovery supabase={supabase} onComplete={() => {
    window.history.replaceState({}, "", window.location.pathname);
    setRecoveryMode(false);
    setRecoveryError(null);
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
  return <>{children({ session, supabase, api, context, memberships, previewMode: false, previewScope: null, previewPersona: null, setPreviewPersona: () => undefined, signOut })}</>;
}
