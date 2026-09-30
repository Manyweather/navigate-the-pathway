"use client";
import { useState } from "react";
import { PlatformAccess } from "./platform-access";
import { CreatorControls } from "./creator-controls";
import { StaffSsoAccess } from "./staff-roster-access";
import { OperationsDialog, SupportInbox } from "./pilot-operations-panel";
import type { PilotApiClient } from "./api-client";
import type { AuthorizationContext } from "./types";

function CreatorDashboard({ api, context }: { api: PilotApiClient; context: AuthorizationContext }) {
  const [section, setSection] = useState<"notifications" | "access" | "governance">("notifications");
  const [operations, setOperations] = useState(false);
  return <div className="production-shell">
    <header className="production-header">
      <a className="production-brand" href="/app/compass"><img src="/assets/brand/compass-emblem-v2.png" alt="" /><span>Compass</span></a>
      <nav className="creator-dashboard-nav" aria-label="Creator dashboard sections">
        {([['notifications','Notifications'],['access','Roster and access'],['governance','Governance']] as const).map(([key,label]) => <button key={key} aria-pressed={section===key} onClick={()=>setSection(key)}>{label}</button>)}
        <button onClick={()=>setOperations(true)}>Operations</button>
      </nav>
      <div className="production-account"><span>{context.displayName}</span><a className="text-button" href="/app/compass">Return to Compass</a></div>
    </header>
    <main className="production-main">
      <div className="production-welcome"><p className="kicker">Compass Creator</p><h1>Creator dashboard</h1><p>Manage staff access and review requests across Compass workspaces.</p></div>
      {section==='notifications'?<section className="production-card production-card--wide"><SupportInbox api={api} workspace="oaca" creator /></section>:null}
      {section==='access'?<StaffSsoAccess api={api}/>:null}
      {section==='governance'?<CreatorControls api={api} context={context}/>:null}
    </main>
    {operations?<OperationsDialog api={api} workspace="oaca" creator previewMode={false} onClose={()=>setOperations(false)}/>:null}
  </div>;
}
export function CreatorDashboardApp() {
  return <PlatformAccess experience="oaca">{({ api, context, previewMode }) => {
    if (previewMode || !context.capabilities.includes("platform.creator")) return <main className="production-auth"><section className="production-auth-card"><h1>Creator access required</h1><p>This dashboard is available only to the assigned Compass Creator.</p><a className="secondary-button" href="/app/compass">Return to Compass</a></section></main>;
    return api ? <CreatorDashboard api={api} context={context} /> : <main className="production-auth"><section className="production-auth-card"><h1>Creator dashboard unavailable</h1><a className="secondary-button" href="/app?signin=1">Return to sign in</a></section></main>;
  }}</PlatformAccess>;
}
