"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { RosieGuide } from "../components/rosie-guide";
import { PilotApiClient } from "./api-client";
import { ConfigurationRequired, MfaGate, SignIn } from "./production-pilot-app";
import { getSupabaseBrowserClient, loadProductionConfiguration } from "./supabase-client";
import { staffMfaRoles, type ExperienceKey, type ExperienceMembership } from "./platform-model";
import type { AuthorizationContext } from "./types";

export type PlatformAccessValue = {
  session: Session;
  supabase: SupabaseClient;
  api: PilotApiClient;
  context: AuthorizationContext;
  memberships: ExperienceMembership[];
  signOut: () => Promise<void>;
};

export function PlatformAccess({ experience, children }: {
  experience?: ExperienceKey;
  children: (value: PlatformAccessValue) => React.ReactNode;
}) {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [configured, setConfigured] = useState<"loading" | "ready" | "error">("loading");
  const [context, setContext] = useState<AuthorizationContext | null>(null);
  const [memberships, setMemberships] = useState<ExperienceMembership[]>([]);
  const [message, setMessage] = useState("Opening your Navigate account…");
  const [mfaVerified, setMfaVerified] = useState(false);
  const api = useMemo(() => supabase ? new PilotApiClient(supabase, undefined, experience) : null, [experience, supabase]);

  useEffect(() => {
    loadProductionConfiguration().then(() => {
      const client = getSupabaseBrowserClient();
      if (!client) throw new Error("Secure setup is not connected yet.");
      setSupabase(client); setConfigured("ready");
    }).catch(() => setConfigured("error"));
  }, []);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  const load = useCallback(async () => {
    if (!api || !session) return;
    setMessage("Opening your Navigate account…");
    try {
      const value = await api.request<{ context: AuthorizationContext; memberships: ExperienceMembership[] }>("/api/platform/experiences");
      setContext(value.context); setMemberships(value.memberships); setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Your account could not be opened.");
    }
  }, [api, session]);

  useEffect(() => {
    const task = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(task);
  }, [load]);

  if (configured === "error") return <ConfigurationRequired />;
  if (!supabase || configured === "loading") return <main className="production-auth"><section className="production-auth-card"><RosieGuide pose="tracks" eyebrow="Navigate" title="Connecting your secure account…" /></section></main>;
  if (!session) return <SignIn supabase={supabase} />;
  if (!context || !api) return <main className="production-auth"><section className="production-auth-card"><RosieGuide pose="tracks" eyebrow="Navigate" title="Opening your account hub…" /><p className="form-message" aria-live="polite">{message}</p></section></main>;

  const membership = experience ? memberships.find((item) => item.experienceKey === experience && item.status === "active" && item.featureEnabled) : null;
  if (experience && !membership) return <main className="production-auth"><section className="production-auth-card"><p className="kicker">Membership required</p><h1>This experience is not assigned to your account.</h1><p>Return to the Navigate hub or ask an administrator to review your membership.</p><a className="secondary-button" href="/app">Return to Navigate</a></section></main>;
  const needsMfa = membership?.roles.some((role) => staffMfaRoles.has(role)) && context.aal !== "aal2" && !mfaVerified;
  if (needsMfa) return <MfaGate supabase={supabase} onVerified={() => { setMfaVerified(true); void load(); }} />;

  const signOut = async () => { try { await api.request("/api/activity/signout", { method: "POST", body: {} }); } finally { await supabase.auth.signOut(); } };
  return <>{children({ session, supabase, api, context, memberships, signOut })}</>;
}
