"use client";

import { useEffect, useState } from "react";
import { PlatformAccess, type PlatformAccessValue } from "./platform-access";
import { defaultWorkspaceFor, experiences, workspaceToExperience, type WorkspaceKey } from "./platform-model";
import { CreatorPreviewBanner } from "./compass-platform-shell";

function Gateway({ access }: { access: PlatformAccessValue }) {
  const [message, setMessage] = useState("Opening your authorized workspace…");
  useEffect(() => {
    let current = true;
    const route = async () => {
      let preferred = (typeof window !== "undefined" ? window.localStorage.getItem("navigate.last-workspace") : null) as WorkspaceKey | null;
      if (!access.previewMode) {
        try {
          const value = await access.api.request<{ lastWorkspaceKey: WorkspaceKey | null }>("/api/platform/workspace-preference");
          preferred = value.lastWorkspaceKey || preferred;
        } catch { /* Membership routing remains safe without a stored preference. */ }
      }
      const workspace = defaultWorkspaceFor(access.memberships, preferred);
      if (!current) return;
      if (!workspace) { setMessage("Your account is connected. Workspace access is pending administrator approval."); return; }
      window.location.replace(experiences[workspaceToExperience[workspace]].href);
    };
    void route();
    return () => { current = false; };
  }, [access]);
  return <div className="navigate-platform navigate-platform--hub">
    <CreatorPreviewBanner persona={access.previewPersona} onPersona={access.setPreviewPersona} onExit={() => void access.signOut()} />
    <header className="platform-header platform-header--oaca"><a className="platform-wordmark" href="/app"><span className="platform-wordmark__logo" aria-hidden="true"><img src="/assets/brand/compass-emblem-v2.png" alt="" /></span><strong>Compass</strong></a><div className="platform-account"><span>{access.context.displayName}</span><button className="text-button" onClick={() => void access.signOut()}>Sign out</button></div></header>
    <main className="platform-main"><section className="access-pending-card" aria-live="polite"><div className="compass-gateway-mark" aria-hidden="true"><img src="/assets/brand/compass-emblem-v2.png" alt="" /></div><p className="kicker">Compass</p><h1>{message}</h1><p>Compass routes each account only to workspaces assigned to its active roles.</p></section></main>
  </div>;
}

export function NavigateHubApp() {
  return <PlatformAccess>{(access) => <Gateway access={access} />}</PlatformAccess>;
}
