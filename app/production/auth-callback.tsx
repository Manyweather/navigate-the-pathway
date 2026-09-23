"use client";

import { useCallback, useEffect, useState } from "react";
import { RosieGuide } from "../components/rosie-guide";
import { clearStoredPreview, safeAppDestination } from "./auth-intent";
import { parseRecoveryCallback } from "./auth-recovery";
import { getSupabaseBrowserClient, loadProductionConfiguration } from "./supabase-client";

const CALLBACK_TIMEOUT_MS = 15_000;

async function withTimeout<T>(work: Promise<T>) {
  return Promise.race([
    work,
    new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("callback_timeout")), CALLBACK_TIMEOUT_MS)),
  ]);
}

export function AuthCallback() {
  const [state, setState] = useState<"working" | "failed" | "timed_out">("working");
  const [detail, setDetail] = useState("Compass is establishing your secure session.");

  const complete = useCallback(async () => {
    setState("working");
    setDetail("Compass is establishing your secure session.");
    clearStoredPreview(window.localStorage);
    const original = new URL(window.location.href);
    const recovery = parseRecoveryCallback(original.search, original.hash);
    if (recovery.errorMessage) {
      setState("failed");
      setDetail(recovery.errorMessage);
      return;
    }
    try {
      await loadProductionConfiguration();
      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw new Error("configuration_missing");
      const code = original.searchParams.get("code");
      if (code) {
        const exchanged = await withTimeout(supabase.auth.exchangeCodeForSession(code));
        if (exchanged.error && !/already|verifier/i.test(exchanged.error.message)) throw exchanged.error;
      }
      const session = await withTimeout(supabase.auth.getSession());
      if (session.error || !session.data.session) throw session.error || new Error("session_missing");
      const destination = recovery.requested
        ? "/app/creator-recovery?mode=set-password"
        : safeAppDestination(original.searchParams.get("next"));
      window.location.replace(destination);
    } catch (error) {
      const timedOut = error instanceof Error && error.message === "callback_timeout";
      setState(timedOut ? "timed_out" : "failed");
      setDetail(timedOut
        ? "The identity service did not finish within 15 seconds. Your link is still visible in this tab so you can retry without requesting another one."
        : "Compass could not establish a session from this link. It may have expired or already been used.");
    }
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => void complete(), 0); return () => window.clearTimeout(timer); }, [complete]);

  const returnToSignIn = async () => {
    clearStoredPreview(window.localStorage);
    const supabase = getSupabaseBrowserClient();
    await supabase?.auth.signOut({ scope: "local" }).catch(() => undefined);
    window.location.replace("/app?signin=1");
  };

  return <main className="production-auth"><section className="production-auth-card">
    <RosieGuide pose={state === "working" ? "tracks" : "idle"} eyebrow="Compass" title={state === "working" ? "Validating your secure link…" : state === "timed_out" ? "The connection took too long." : "This link could not be validated."} body={detail} priority />
    {state !== "working" ? <div className="production-form">
      <button className="primary-button" onClick={() => void complete()}>Retry this link</button>
      <button className="secondary-button" onClick={() => void returnToSignIn()}>Return to sign in</button>
      <a className="text-button" href="/app/creator-recovery">Creator recovery</a>
    </div> : null}
  </section></main>;
}

