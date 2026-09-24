"use client";

import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type InstallState = "available" | "installed" | "unsupported" | "unavailable";

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

export function InstallCompass({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<InstallState>("unavailable");
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const initialize = window.setTimeout(() => {
    if (isStandalone()) {
      setState("installed");
      return;
    }
    const supported = "serviceWorker" in navigator;
    if (!supported) {
      setState("unsupported");
      return;
    }
    }, 0);
    const handlePrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
      setState("available");
    };
    const handleInstalled = () => {
      setPromptEvent(null);
      setState("installed");
      setMessage("Compass was added to this device.");
    };
    window.addEventListener("beforeinstallprompt", handlePrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.clearTimeout(initialize);
      window.removeEventListener("beforeinstallprompt", handlePrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const install = async () => {
    if (!promptEvent) {
      setHelpOpen((current) => !current);
      return;
    }
    setMessage("");
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    setPromptEvent(null);
    if (choice.outcome === "accepted") {
      setState("installed");
      setMessage("Compass is being added to this device.");
    } else {
      setState("unavailable");
      setMessage("You can add Compass later from your browser menu.");
    }
  };

  return <div className={`compass-install${compact ? " compass-install--compact" : ""}`}>
    <div className="compass-install__actions">
      <button type="button" className="secondary-button" onClick={() => void install()} aria-expanded={helpOpen}>
        {state === "installed" ? "Compass is on this device" : promptEvent ? "Add Compass to this device" : "Add Compass to home screen or desktop"}
      </button>
      <a className="text-button" href="/app?signin=1">Open Compass sign-in</a>
    </div>
    {message ? <p className="form-message" role="status">{message}</p> : null}
    {helpOpen || state === "unsupported" || state === "unavailable" ? <div className="compass-install__help" role="note">
      <strong>Add Compass without an install prompt</strong>
      <p><b>iPhone or iPad:</b> open Compass in Safari, choose Share, then Add to Home Screen.</p>
      <p><b>Android:</b> open the browser menu, then choose Install app or Add to Home screen.</p>
      <p><b>Desktop:</b> choose the install icon or browser menu option to Install/Create shortcut. Safari users can bookmark the Compass sign-in page.</p>
    </div> : null}
  </div>;
}
