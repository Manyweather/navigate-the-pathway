"use client";

import { useEffect, useState } from "react";
import { AccessGate } from "./access-gate";
import { RosieGuide } from "./components/rosie-guide";
import { PrototypeShell } from "./prototype-shell";

const ACCESS_SESSION_KEY = "navigate.pathway.access.v1";

type AccessReply = {
  ok?: boolean;
  token?: string;
};

export function StaticPrototype({ accessApiUrl }: { accessApiUrl: string }) {
  const [accessState, setAccessState] = useState<"checking" | "locked" | "open">(() => {
    if (typeof window === "undefined" || !accessApiUrl) return "locked";
    return window.sessionStorage.getItem(ACCESS_SESSION_KEY) ? "checking" : "locked";
  });

  useEffect(() => {
    if (accessState !== "checking") return;
    const token = window.sessionStorage.getItem(ACCESS_SESSION_KEY) || "";

    const controller = new AbortController();
    fetch(`${accessApiUrl}/api/access/verify`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error("Session expired");
        setAccessState("open");
      })
      .catch(() => {
        window.sessionStorage.removeItem(ACCESS_SESSION_KEY);
        setAccessState("locked");
      });

    return () => controller.abort();
  }, [accessApiUrl, accessState]);

  const unlock = async (code: string) => {
    if (!accessApiUrl) return false;
    const response = await fetch(`${accessApiUrl}/api/access/unlock`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    if (!response.ok) return false;
    const reply = await response.json() as AccessReply;
    if (!reply.ok || !reply.token) return false;
    window.sessionStorage.setItem(ACCESS_SESSION_KEY, reply.token);
    setAccessState("open");
    return true;
  };

  const signOut = () => {
    window.sessionStorage.removeItem(ACCESS_SESSION_KEY);
    setAccessState("locked");
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  if (accessState === "checking") {
    return <main className="access-page"><section className="access-card"><RosieGuide pose="tracks" eyebrow="Navigate the Pathway" title="Finding your saved place..." priority /></section></main>;
  }

  return accessState === "open"
    ? <PrototypeShell onSignOut={signOut} />
    : <AccessGate requestUnlock={unlock} />;
}
