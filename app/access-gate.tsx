"use client";

import { useEffect, useRef, useState } from "react";
import { assetUrl } from "./asset-url";
import { RosieGuide } from "./components/rosie-guide";

export function AccessGate({
  requestUnlock,
}: {
  requestUnlock?: (code: string) => Promise<boolean>;
} = {}) {
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const unlock = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    try {
      if (requestUnlock) {
        if (!(await requestUnlock(code))) throw new Error("Access rejected");
        return;
      }
      const response = await fetch("/api/access/unlock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!response.ok) throw new Error("Access rejected");
      window.location.assign("/");
    } catch {
      setMessage("That code did not open the playtest. Check it and try again.");
      setSubmitting(false);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  return (
    <main className="access-page">
      <div
        className="access-landscape"
        style={{ backgroundImage: `linear-gradient(rgba(84,10,37,0.22), rgba(84,10,37,0.46)), url("${assetUrl("/assets/premed-district-map.png")}")` }}
        aria-hidden="true"
      />
      <section className="access-card" aria-labelledby="access-title">
        <div className="access-brand">
          <img src={assetUrl("/assets/navigate-pathway-mark.svg")} alt="Navigate the Pathway" />
          <span>Fictional playtest</span>
        </div>
        <RosieGuide
          pose="idle"
          eyebrow="Welcome"
          title="Rosie saved your place."
          body="Enter the shared playtest code to explore the student and reviewer pathways."
          priority
        />
        <form onSubmit={unlock}>
          <label htmlFor="access-code">Playtest access code</label>
          <input
            ref={inputRef}
            id="access-code"
            name="access-code"
            type="password"
            autoComplete="off"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            aria-describedby={message ? "access-message" : "access-note"}
          />
          <button className="primary-button" type="submit" disabled={!code.trim() || submitting}>
            {submitting ? "Opening..." : "Open the pathway"}
          </button>
          {message ? <p id="access-message" className="access-error" role="alert">{message}</p> : null}
          <p id="access-note" className="access-note">This gate supports a hosted playtest. It is not a student account or institutional login.</p>
        </form>
      </section>
    </main>
  );
}
