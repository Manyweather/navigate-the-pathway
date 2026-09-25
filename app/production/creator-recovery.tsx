"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { RosieGuide } from "../components/rosie-guide";
import { clearStoredPreview } from "./auth-intent";
import { PasswordRecovery } from "./production-pilot-app";
import { getSupabaseBrowserClient, loadProductionConfiguration, productionConfiguration } from "./supabase-client";
import { InstallCompass } from "./install-compass";

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
    <InstallCompass compact /><a className="secondary-button" href="/app?signin=1">Roseman staff sign-in</a>
  </section></main>;
}

function RecoveryGate({ onPassed }: { onPassed: () => void }) {
  const [passphrase, setPassphrase] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const apiUrl = productionConfiguration().apiUrl || window.location.origin;
      const response = await fetch(`${apiUrl.replace(/\/$/, "")}/api/auth/creator-recovery-gate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ passphrase }) });
      const payload = await response.json().catch(() => ({})) as { ok?: boolean; message?: string };
      if (!response.ok || !payload.ok) { setMessage(payload.message || "The recovery gate could not be completed."); return; }
      setPassphrase(""); onPassed();
    } catch { setMessage("The recovery gate could not be completed."); }
    finally { setBusy(false); }
  };
  return <main className="production-auth"><section className="production-auth-card production-auth-card--recovery">
    <p className="kicker">Recovery access</p><h1>Protected recovery</h1><p className="privacy-note">Enter the recovery passphrase to continue. This does not grant workspace access; the configured recovery identity and MFA are still required.</p>
    <form className="production-form" onSubmit={submit}><label><span>Recovery passphrase</span><input type="password" autoComplete="off" required value={passphrase} onChange={(event) => setPassphrase(event.target.value)} /></label><button className="primary-button" disabled={busy}>{busy ? "Verifying…" : "Continue"}</button><p className="form-message" role="status">{message}</p></form>
    <InstallCompass compact /><a className="secondary-button" href="/app?signin=1">Roseman staff sign-in</a>
  </section></main>;
}

export function CreatorRecovery() {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [failed, setFailed] = useState(false);
  const [gatePassed, setGatePassed] = useState(false);
  const setPassword = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("mode") === "set-password";

  useEffect(() => {
    clearStoredPreview(window.localStorage);
    void loadProductionConfiguration().then(() => {
      const client = getSupabaseBrowserClient();
      if (!client) throw new Error("missing_configuration");
      setSupabase(client);
    }).catch(() => setFailed(true));
  }, []);

  if (failed) return <main className="production-auth"><section className="production-auth-card"><h1>Recovery is not connected.</h1><InstallCompass compact /><a className="secondary-button" href="/app?signin=1">Return to sign in</a></section></main>;
  if (!supabase) return <main className="production-auth"><section className="production-auth-card"><RosieGuide pose="tracks" eyebrow="Creator recovery" title="Opening secure recovery…" /><InstallCompass compact /></section></main>;
  if (!gatePassed && !setPassword) return <RecoveryGate onPassed={() => setGatePassed(true)} />;
  if (setPassword) return <PasswordRecovery supabase={supabase} onComplete={() => window.location.replace("/app")} />;
  return <RecoverySignIn supabase={supabase} />;
}
