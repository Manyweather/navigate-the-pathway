"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { RosieGuide } from "../components/rosie-guide";
import { clearStoredPreview } from "./auth-intent";
import { PasswordRecovery } from "./production-pilot-app";
import { getSupabaseBrowserClient, loadProductionConfiguration } from "./supabase-client";

function RecoverySignIn({ supabase }: { supabase: SupabaseClient }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage("");
    const result = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (result.error) {
      setMessage("That recovery sign-in could not be completed.");
      return;
    }
    window.location.replace("/app");
  };

  const reset = async () => {
    if (!email.trim()) { setMessage("Enter the recovery email address first."); return; }
    setBusy(true);
    const result = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/app/auth/callback` });
    setBusy(false);
    setMessage(result.error ? "A recovery message could not be requested." : "If this is the configured recovery identity, a secure message has been requested.");
  };

  return <main className="production-auth"><section className="production-auth-card production-auth-card--recovery">
    <RosieGuide pose="idle" eyebrow="Creator recovery" title="Use the protected break-glass identity." body="This route is restricted to the configured secondary Creator identity and still requires an authenticator code before staff data is available." priority />
    <form className="production-form" onSubmit={signIn}>
      <label><span>Recovery email</span><input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label><span>Password</span><input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      <button className="primary-button" disabled={busy}>{busy ? "Checking…" : "Continue securely"}</button>
      <button type="button" className="text-button" disabled={busy} onClick={() => void reset()}>Request a recovery link</button>
      <p className="form-message" aria-live="polite">{message}</p>
    </form>
    <a className="secondary-button" href="/app?signin=1">Roseman staff sign-in</a>
  </section></main>;
}

export function CreatorRecovery() {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [failed, setFailed] = useState(false);
  const setPassword = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("mode") === "set-password";

  useEffect(() => {
    clearStoredPreview(window.localStorage);
    void loadProductionConfiguration().then(() => {
      const client = getSupabaseBrowserClient();
      if (!client) throw new Error("missing_configuration");
      setSupabase(client);
    }).catch(() => setFailed(true));
  }, []);

  if (failed) return <main className="production-auth"><section className="production-auth-card"><h1>Recovery is not connected.</h1><a className="secondary-button" href="/app?signin=1">Return to sign in</a></section></main>;
  if (!supabase) return <main className="production-auth"><section className="production-auth-card"><RosieGuide pose="tracks" eyebrow="Creator recovery" title="Opening secure recovery…" /></section></main>;
  if (setPassword) return <PasswordRecovery supabase={supabase} onComplete={() => window.location.replace("/app")} />;
  return <RecoverySignIn supabase={supabase} />;
}

