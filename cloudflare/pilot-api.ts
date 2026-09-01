type AuthenticatedUser = {
  id: string;
  email: string;
  token: string;
  aal: "aal1" | "aal2";
  sessionId: string;
};

type AuthorizationContext = {
  userId?: string;
  displayName?: string;
  email?: string;
  roles: string[];
  capabilities: string[];
  aal: "aal1" | "aal2";
  activeOrganizationId: string | null;
  activeProgramId: string | null;
  activeCohortId?: string | null;
  environment?: string;
  principalType?: "creator" | "principal_investigator" | null;
  principalAcknowledged?: boolean;
};

class HttpError extends Error {
  constructor(public readonly status: number, message: string, public readonly code = "request_failed") {
    super(message);
  }
}

const json = (value: unknown, status = 200, headers: HeadersInit = {}) => new Response(JSON.stringify(value), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", ...headers },
});

function allowedOrigin(request: Request, env: Env) {
  const origin = request.headers.get("origin") || "";
  const configured = env.ALLOWED_ORIGINS.split(",").map((item) => item.trim()).filter(Boolean);
  return configured.includes(origin) ? origin : "";
}

function corsHeaders(request: Request, env: Env) {
  const origin = allowedOrigin(request, env);
  return origin ? {
    "access-control-allow-origin": origin,
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
    "access-control-max-age": "86400",
    vary: "Origin",
  } : {};
}

function tokenClaims(token: string) {
  try {
    const payload = token.split(".")[1];
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
    return JSON.parse(atob(normalized)) as { aal?: "aal1" | "aal2"; session_id?: string };
  } catch {
    return {};
  }
}

async function authenticate(request: Request, env: Env): Promise<AuthenticatedUser> {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw new HttpError(401, "Sign in to continue.", "authentication_required");
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new HttpError(401, "Your session has ended. Sign in again.", "invalid_session");
  const user = await response.json() as { id: string; email?: string };
  const claims = tokenClaims(token);
  return { id: user.id, email: user.email || "", token, aal: claims.aal || "aal1", sessionId: claims.session_id || user.id };
}

async function rpc<T>(env: Env, token: string, fn: string, body: unknown = {}): Promise<T> {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const details = await response.json().catch(() => ({})) as { message?: string; code?: string };
    console.warn(JSON.stringify({ event: "supabase_rpc_rejected", fn, status: response.status, code: details.code || "unknown" }));
    const status = response.status === 401 ? 401 : response.status === 403 ? 403 : response.status === 409 ? 409 : 400;
    throw new HttpError(status, details.message || "The requested action was not accepted.", details.code || "rpc_rejected");
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

async function authorization(env: Env, user: AuthenticatedUser) {
  return rpc<AuthorizationContext>(env, user.token, "pilot_authorization_context");
}

function requireStaffMfa(user: AuthenticatedUser) {
  if (user.aal !== "aal2") throw new HttpError(403, "Verify your second factor to continue.", "mfa_required");
}

function requireRole(context: AuthorizationContext, role: string) {
  if (!context.roles.includes(role)) throw new HttpError(403, "This account does not have access to that dashboard.", "role_required");
}

function requireCapability(context: AuthorizationContext, capability: string) {
  if (!context.capabilities.includes(capability)) throw new HttpError(403, "This account does not have permission for that action.", "capability_required");
}

const creatorCapabilities = [
  "platform.creator",
  "pilot.reset_records",
  "accounts.purge",
  "accounts.manage",
  "program.configure",
  "evaluation.governance",
  "evaluation.raw_export",
  "evaluation.identifiable_results",
  "evaluation.individual_insights",
  "evaluation.qualitative_analysis",
] as const;

const principalInvestigatorCapabilities = [
  "platform.principal_investigator",
  "accounts.manage",
  "program.configure",
  "evaluation.governance",
  "evaluation.raw_export",
  "evaluation.identifiable_results",
  "evaluation.individual_insights",
  "evaluation.qualitative_analysis",
] as const;

const permissionDescriptions: Record<string, string> = {
  "platform.creator": "Sole platform creator principal",
  "platform.principal_investigator": "Principal investigator governance principal",
  "pilot.reset_records": "Preview, request, and execute a pilot record reset",
  "accounts.purge": "Request and execute permanent account purges",
  "accounts.manage": "Manage invitations, roles, deactivation, and restoration",
  "program.configure": "Manage program, cohort, session, and wave configuration",
  "evaluation.governance": "Manage evaluation configuration and approve releases",
  "evaluation.raw_export": "Download protected response-level evaluation exports",
  "evaluation.identifiable_results": "View identifiable evaluation responses and approved calculations",
  "evaluation.individual_insights": "View person-level evaluation change summaries",
  "evaluation.qualitative_analysis": "Code and review protected open responses",
};

async function ensurePermissionDefinitions(env: Env) {
  await serviceRest<void>(env, "permissions?on_conflict=key", {
    method: "POST",
    headers: { prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(Object.entries(permissionDescriptions).map(([key, description]) => ({ key, description }))),
  });
}

async function grantCapabilities(env: Env, actorId: string, targetUserId: string, context: AuthorizationContext, capabilities: readonly string[]) {
  if (!context.activeOrganizationId) throw new HttpError(409, "Choose an active organization first.", "active_organization_required");
  await ensurePermissionDefinitions(env);
  await serviceRest<void>(env, "permission_assignments?on_conflict=user_id,permission_key,organization_id,program_id", {
    method: "POST",
    headers: { prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(capabilities.map((permission_key) => ({
      user_id: targetUserId,
      permission_key,
      organization_id: context.activeOrganizationId,
      program_id: context.activeProgramId,
      granted_by: actorId,
      revoked_at: null,
    }))),
  });
}

async function enrichPrincipalContext(env: Env, user: AuthenticatedUser, context: AuthorizationContext) {
  const bootstrapEmail = String((env as unknown as Record<string, unknown>).CREATOR_BOOTSTRAP_EMAIL || "").trim().toLowerCase();
  if (bootstrapEmail && user.email.trim().toLowerCase() === bootstrapEmail && context.activeOrganizationId && !context.capabilities.includes("platform.creator")) {
    await grantCapabilities(env, user.id, user.id, context, creatorCapabilities);
    context.capabilities.push(...creatorCapabilities.filter((capability) => !context.capabilities.includes(capability)));
  }
  context.principalType = context.capabilities.includes("platform.creator")
    ? "creator"
    : context.capabilities.includes("platform.principal_investigator") ? "principal_investigator" : null;
  if (context.principalType) {
    const acknowledged = await serviceRest<Array<{ id: string }>>(env, `audit_events?actor_id=eq.${encodeURIComponent(user.id)}&event_type=eq.principal_onboarding_acknowledged&select=id&limit=1`);
    context.principalAcknowledged = acknowledged.length > 0;
  } else context.principalAcknowledged = true;
  return context;
}

async function readBody(request: Request) {
  try { return await request.json() as Record<string, unknown>; }
  catch { throw new HttpError(400, "A valid JSON request is required.", "invalid_json"); }
}

async function serviceRest<T>(env: Env, path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": "application/json",
      ...options.headers,
    },
  });
  if (!response.ok) {
    const details = await response.json().catch(() => ({})) as { message?: string; code?: string };
    console.warn(JSON.stringify({ event: "supabase_rest_rejected", path, status: response.status, code: details.code || "unknown" }));
    throw new HttpError(400, "The saved work request was not accepted.", details.code || "rest_rejected");
  }
  const body = await response.text();
  return (body ? JSON.parse(body) : undefined) as T;
}

async function optionalServiceMutation(env: Env, path: string, options: RequestInit) {
  try { return await serviceRest(env, path, options); }
  catch { return null; }
}

type AccessEventType = "user_session_opened" | "user_session_heartbeat" | "user_session_signed_out";

type StoredAccessEvent = {
  actor_id: string;
  event_type: AccessEventType;
  subject_id: string;
  metadata: { email?: string; role?: string };
  created_at: string;
};

async function recordAccessEvent(env: Env, user: AuthenticatedUser, context: AuthorizationContext, eventType: AccessEventType, role?: string) {
  if (!context.activeOrganizationId) return;
  const prior = await serviceRest<Array<{ id: string; created_at: string }>>(
    env,
    `audit_events?actor_id=eq.${encodeURIComponent(user.id)}&subject_id=eq.${encodeURIComponent(user.sessionId)}&event_type=eq.${eventType}&select=id,created_at&order=created_at.desc&limit=1`,
  );
  if (eventType === "user_session_opened" && prior.length) return;
  if (eventType === "user_session_heartbeat" && prior[0] && Date.now() - new Date(prior[0].created_at).getTime() < 240_000) return;
  await serviceRest<Array<{ id: string }>>(env, "audit_events?select=id", {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({
      organization_id: context.activeOrganizationId,
      actor_id: user.id,
      event_type: eventType,
      subject_type: "user_session",
      subject_id: user.sessionId,
      metadata: { email: user.email, role: role || null },
    }),
  });
}

async function supabaseAuthUsers(env: Env) {
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=1000`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
  });
  if (!response.ok) throw new HttpError(400, "The account directory could not be loaded.", "account_directory_failed");
  const payload = await response.json() as { users?: Array<{
    id: string;
    email?: string;
    last_sign_in_at?: string | null;
    invited_at?: string | null;
    confirmation_sent_at?: string | null;
    email_confirmed_at?: string | null;
    confirmed_at?: string | null;
  }> };
  return payload.users || [];
}

async function supabaseAuthUser(env: Env, userId: string) {
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
  });
  if (!response.ok) throw new HttpError(404, "The invited account could not be found.", "invited_account_not_found");
  return response.json() as Promise<{
    id: string;
    email?: string;
    invited_at?: string | null;
    confirmation_sent_at?: string | null;
    email_confirmed_at?: string | null;
    confirmed_at?: string | null;
  }>;
}

async function adminUserAccessLog(env: Env, user: AuthenticatedUser, context: AuthorizationContext) {
  requireStaffMfa(user);
  requireRole(context, "administrator");
  if (!context.activeOrganizationId) throw new HttpError(409, "Choose an active organization to view access history.", "active_organization_required");

  const organizationId = encodeURIComponent(context.activeOrganizationId);
  const [roles, profiles, events, authUsers, principals, lifecycle] = await Promise.all([
    serviceRest<Array<{ user_id: string; role: string }>>(env, `role_assignments?organization_id=eq.${organizationId}&revoked_at=is.null&select=user_id,role`),
    serviceRest<Array<{ user_id: string; display_name: string; preferred_name: string | null; status: string }>>(env, `profiles?active_organization_id=eq.${organizationId}&select=user_id,display_name,preferred_name,status`),
    serviceRest<StoredAccessEvent[]>(env, `audit_events?organization_id=eq.${organizationId}&subject_type=eq.user_session&event_type=in.(user_session_opened,user_session_heartbeat,user_session_signed_out)&select=actor_id,event_type,subject_id,metadata,created_at&order=created_at.desc&limit=5000`),
    supabaseAuthUsers(env),
    serviceRest<Array<{ user_id: string; permission_key: string }>>(env, `permission_assignments?organization_id=eq.${organizationId}&permission_key=in.(platform.creator,platform.principal_investigator)&revoked_at=is.null&select=user_id,permission_key`),
    optionalServiceRest<Array<{ user_id: string; status: string; deactivated_at: string | null; purge_eligible_at: string | null }>>(env, `account_lifecycle?organization_id=eq.${organizationId}&select=user_id,status,deactivated_at,purge_eligible_at`, []),
  ]);

  const peopleIds = new Set(roles.map((item) => item.user_id));
  const rolesById = new Map<string, string[]>();
  roles.forEach((item) => rolesById.set(item.user_id, [...new Set([...(rolesById.get(item.user_id) || []), item.role])]));
  const principalById = new Map(principals.map((item) => [item.user_id, item.permission_key === "platform.creator" ? "creator" : "principal_investigator"] as const));
  const lifecycleById = new Map(lifecycle.map((item) => [item.user_id, item]));
  const profileById = new Map(profiles.map((profile) => [profile.user_id, profile]));
  const authById = new Map(authUsers.map((entry) => [entry.id, entry]));
  const sessionMap = new Map<string, { userId: string; sessionId: string; signedInAt: string; lastActiveAt: string; signedOutAt: string | null; role: string | null }>();

  for (const event of events) {
    if (!peopleIds.has(event.actor_id)) continue;
    const key = `${event.actor_id}:${event.subject_id}`;
    const current = sessionMap.get(key);
    const occurredAt = event.created_at;
    if (!current) {
      sessionMap.set(key, {
        userId: event.actor_id,
        sessionId: event.subject_id,
        signedInAt: occurredAt,
        lastActiveAt: occurredAt,
        signedOutAt: event.event_type === "user_session_signed_out" ? occurredAt : null,
        role: event.metadata?.role || null,
      });
      continue;
    }
    if (new Date(occurredAt) < new Date(current.signedInAt)) current.signedInAt = occurredAt;
    if (new Date(occurredAt) > new Date(current.lastActiveAt)) current.lastActiveAt = occurredAt;
    if (event.event_type === "user_session_opened") current.signedInAt = occurredAt;
    if (event.event_type === "user_session_signed_out") current.signedOutAt = occurredAt;
    if (event.metadata?.role) current.role = event.metadata.role;
  }

  const now = Date.now();
  const sessions = [...sessionMap.values()].map((session) => {
    const profile = profileById.get(session.userId);
    const auth = authById.get(session.userId);
    const end = session.signedOutAt || session.lastActiveAt;
    return {
      userId: session.userId,
      sessionId: session.sessionId,
      displayName: profile?.preferred_name || profile?.display_name || auth?.email?.split("@")[0] || "Student",
      email: auth?.email || "",
      signedInAt: session.signedInAt,
      lastActiveAt: session.lastActiveAt,
      signedOutAt: session.signedOutAt,
      durationMinutes: Math.max(0, Math.round((new Date(end).getTime() - new Date(session.signedInAt).getTime()) / 60_000)),
      status: !session.signedOutAt && now - new Date(session.lastActiveAt).getTime() <= 600_000 ? "active" : "ended",
      role: session.role || "student",
    };
  }).sort((a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime());

  const people = [...peopleIds].map((personId) => {
    const profile = profileById.get(personId);
    const auth = authById.get(personId);
    const personSessions = sessions.filter((session) => session.userId === personId);
    const lifecycleState = lifecycleById.get(personId);
    return {
      userId: personId,
      displayName: profile?.preferred_name || profile?.display_name || auth?.email?.split("@")[0] || "Student",
      email: auth?.email || "",
      accountStatus: profile?.status || "invited",
      lastAuthSignInAt: auth?.last_sign_in_at || null,
      emailConfirmedAt: auth?.email_confirmed_at || auth?.confirmed_at || null,
      lastInvitationSentAt: auth?.confirmation_sent_at || auth?.invited_at || null,
      sessionCount: personSessions.length,
      totalMinutes: personSessions.reduce((sum, session) => sum + session.durationMinutes, 0),
      roles: rolesById.get(personId) || [],
      principalType: principalById.get(personId) || null,
      deactivatedAt: lifecycleState?.deactivated_at || null,
      purgeEligibleAt: lifecycleState?.purge_eligible_at || null,
    };
  }).sort((a, b) => a.displayName.localeCompare(b.displayName));
  const students = people.filter((person) => person.roles.includes("student"));

  await recordAccessEvent(env, user, context, "user_session_heartbeat", "administrator");
  return { students, people, sessions, generatedAt: new Date().toISOString() };
}

type StoredArtifact = {
  id: string;
  station: string;
  artifact_type: string;
  title: string;
  content: Record<string, unknown> & { response?: string; prompt?: string };
  created_at: string;
  updated_at: string;
};

function presentArtifact(artifact: StoredArtifact) {
  return { id: artifact.id, station: artifact.station, artifactType: artifact.artifact_type, title: artifact.title, content: artifact.content, createdAt: artifact.created_at, updatedAt: artifact.updated_at };
}

async function pathwayArtifacts(request: Request, env: Env, user: AuthenticatedUser) {
  const context = await authorization(env, user);
  requireRole(context, "student");
  if (request.method === "GET") {
    const rows = await serviceRest<StoredArtifact[]>(env, `artifacts?student_id=eq.${encodeURIComponent(user.id)}&artifact_type=neq.pathway_primer&select=id,station,artifact_type,title,content,created_at,updated_at&order=created_at.desc`);
    return json(rows.map(presentArtifact));
  }
  if (!context.activeOrganizationId || !context.activeProgramId) throw new HttpError(409, "Your account needs an active program before station work can be saved.", "active_program_required");
  const body = await readBody(request);
  const stations = ["courses", "evidence", "service", "cohort", "reflection", "application"];
  const station = typeof body.station === "string" && stations.includes(body.station) ? body.station : "";
  const artifactType = typeof body.artifactType === "string" ? body.artifactType.trim().slice(0, 80) : "";
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 160) : "";
  const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 1000) : "";
  const response = typeof body.response === "string" ? body.response.trim().slice(0, 5000) : "";
  const fields = body.fields && typeof body.fields === "object"
    ? Object.fromEntries(Object.entries(body.fields as Record<string, unknown>).filter(([, value]) => typeof value === "string").map(([key, value]) => [key.slice(0, 80), String(value).trim().slice(0, 3000)]))
    : {};
  if (!station || !artifactType || !title || !response) throw new HttpError(400, "Choose a station and enter a response before saving.", "invalid_artifact");
  const rows = await serviceRest<StoredArtifact[]>(env, "artifacts?select=id,station,artifact_type,title,content,created_at,updated_at", {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({
      student_id: user.id,
      organization_id: context.activeOrganizationId,
      program_id: context.activeProgramId,
      station,
      artifact_type: artifactType,
      title,
      content: { prompt, response, fields },
      private_by_default: true,
    }),
  });
  console.log(JSON.stringify({ event: "pathway_artifact_saved", actor: user.id, station, artifact_id: rows[0]?.id || null }));
  return json(presentArtifact(rows[0]), 201);
}

type PrimerAnswers = {
  stage: "junior" | "senior" | "gap" | "exploring";
  applicationTiming: "within_12_months" | "later" | "unsure";
  coursework: "clear" | "questions" | "starting";
  experienceTracking: "detailed" | "some" | "none";
  reflectionHabit: "regular" | "sometimes" | "not_yet";
  participation: "observe" | "structured" | "open";
  focus: "courses" | "evidence" | "service" | "cohort" | "reflection" | "application";
};

const primerChoices = {
  stage: ["junior", "senior", "gap", "exploring"],
  applicationTiming: ["within_12_months", "later", "unsure"],
  coursework: ["clear", "questions", "starting"],
  experienceTracking: ["detailed", "some", "none"],
  reflectionHabit: ["regular", "sometimes", "not_yet"],
  participation: ["observe", "structured", "open"],
  focus: ["courses", "evidence", "service", "cohort", "reflection", "application"],
} as const;

function parsePrimerAnswers(value: unknown): PrimerAnswers {
  const answers = value && typeof value === "object" ? value as Record<string, unknown> : {};
  for (const [key, values] of Object.entries(primerChoices)) {
    if (typeof answers[key] !== "string" || !(values as readonly string[]).includes(answers[key] as string)) {
      throw new HttpError(400, "Complete each primer question before building your map.", "primer_incomplete");
    }
  }
  return answers as PrimerAnswers;
}

function recommendPrimerStation(answers: PrimerAnswers) {
  const stations = ["evidence", "reflection", "cohort", "courses", "service", "application"] as const;
  const scores = Object.fromEntries(stations.map((station) => [station, 0])) as Record<typeof stations[number], number>;
  scores[answers.focus] += 6;
  if (answers.applicationTiming === "within_12_months") scores.application += 4;
  if (answers.stage === "gap") scores.application += 2;
  if (answers.coursework !== "clear") scores.courses += 3;
  if (answers.experienceTracking !== "detailed") scores.evidence += 4;
  if (answers.reflectionHabit !== "regular") scores.reflection += 3;
  if (answers.participation !== "open") scores.cohort += 3;
  const recommendedStation = [...stations].sort((a, b) => scores[b] - scores[a] || stations.indexOf(a) - stations.indexOf(b))[0];
  const reasons: Record<typeof recommendedStation, string> = {
    courses: "You identified a course-planning need that can become one clear next question.",
    evidence: "Capturing one experience now will protect useful details for later reflection and application writing.",
    service: "You chose to begin by noticing how compassion and values show up in action.",
    cohort: "A low-pressure connection step can help you build support in a way that fits you.",
    reflection: "A short reflection can help you notice meaning and patterns across what you have already done.",
    application: "Your timing and focus suggest organizing existing evidence for your application pathway.",
  };
  return { recommendedStation, reason: reasons[recommendedStation] };
}

async function pathwayPrimer(request: Request, env: Env, user: AuthenticatedUser) {
  const context = await authorization(env, user);
  requireRole(context, "student");
  const query = `artifacts?student_id=eq.${encodeURIComponent(user.id)}&artifact_type=eq.pathway_primer&select=id,station,artifact_type,title,content,created_at,updated_at&order=updated_at.desc&limit=1`;
  const current = await serviceRest<StoredArtifact[]>(env, query);
  if (request.method === "GET") return json(current[0] ? presentArtifact(current[0]) : null);
  if (!context.activeOrganizationId || !context.activeProgramId) throw new HttpError(409, "Your account needs an active program before the primer can be saved.", "active_program_required");
  const body = await readBody(request);
  const answers = parsePrimerAnswers(body.answers);
  const recommendation = recommendPrimerStation(answers);
  const completedAt = new Date().toISOString();
  const content = { answers, ...recommendation, completedAt };
  const payload = {
    station: recommendation.recommendedStation,
    title: "Pathway primer",
    content,
    updated_at: completedAt,
  };
  const rows = current[0]
    ? await serviceRest<StoredArtifact[]>(env, `artifacts?id=eq.${encodeURIComponent(current[0].id)}&select=id,station,artifact_type,title,content,created_at,updated_at`, { method: "PATCH", headers: { prefer: "return=representation" }, body: JSON.stringify(payload) })
    : await serviceRest<StoredArtifact[]>(env, "artifacts?select=id,station,artifact_type,title,content,created_at,updated_at", {
      method: "POST",
      headers: { prefer: "return=representation" },
      body: JSON.stringify({
        student_id: user.id,
        organization_id: context.activeOrganizationId,
        program_id: context.activeProgramId,
        artifact_type: "pathway_primer",
        private_by_default: true,
        ...payload,
      }),
    });
  await serviceRest<Array<{ id: string }>>(env, "audit_events?select=id", {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({ organization_id: context.activeOrganizationId, actor_id: user.id, event_type: "pathway_primer_saved", subject_type: "artifact", subject_id: rows[0].id, metadata: { recommendedStation: recommendation.recommendedStation } }),
  });
  return json(presentArtifact(rows[0]), current[0] ? 200 : 201);
}

type CohortPostContent = {
  body?: string;
  participationMode?: string;
  parentId?: string | null;
  cohortId?: string;
};

async function cohortBoard(request: Request, env: Env, user: AuthenticatedUser) {
  const context = await authorization(env, user);
  requireRole(context, "student");
  if (!context.activeOrganizationId || !context.activeProgramId || !context.activeCohortId) throw new HttpError(409, "Your account needs an active cohort before the discussion board can open.", "active_cohort_required");
  const cohortId = context.activeCohortId;
  if (request.method === "POST") {
    const body = await readBody(request);
    const message = typeof body.body === "string" ? body.body.trim().slice(0, 1800) : "";
    const modes = ["question", "resource", "encouragement", "reflection"];
    const participationMode = typeof body.participationMode === "string" && modes.includes(body.participationMode) ? body.participationMode : "question";
    const parentId = typeof body.parentId === "string" && /^[0-9a-f-]{36}$/i.test(body.parentId) ? body.parentId : null;
    if (!message) throw new HttpError(400, "Write a message before posting.", "empty_cohort_post");
    await serviceRest<StoredArtifact[]>(env, "artifacts?select=id", {
      method: "POST",
      headers: { prefer: "return=representation" },
      body: JSON.stringify({ student_id: user.id, organization_id: context.activeOrganizationId, program_id: context.activeProgramId, station: "cohort", artifact_type: "cohort_post", title: "Cohort contribution", content: { body: message, participationMode, parentId, cohortId }, private_by_default: false }),
    });
    console.log(JSON.stringify({ event: "cohort_post_created", actor: user.id, cohort_id: cohortId, mode: participationMode }));
  }
  const posts = await serviceRest<Array<StoredArtifact & { student_id: string }>>(env, `artifacts?organization_id=eq.${encodeURIComponent(context.activeOrganizationId)}&program_id=eq.${encodeURIComponent(context.activeProgramId)}&station=eq.cohort&artifact_type=eq.cohort_post&private_by_default=eq.false&content-%3E%3EcohortId=eq.${encodeURIComponent(cohortId)}&select=id,student_id,content,created_at,updated_at,title,station,artifact_type&order=created_at.asc&limit=200`);
  const studentIds = [...new Set(posts.map((post) => post.student_id))];
  const profiles = studentIds.length ? await serviceRest<Array<{ user_id: string; display_name: string; preferred_name: string | null }>>(env, `profiles?user_id=in.(${studentIds.join(",")})&select=user_id,display_name,preferred_name`) : [];
  const names = new Map(profiles.map((profile) => [profile.user_id, profile.preferred_name || profile.display_name]));
  return json(posts.map((post) => {
    const content = post.content as CohortPostContent;
    return { id: post.id, authorName: names.get(post.student_id) || "Cohort member", body: content.body || "", participationMode: content.participationMode || "question", parentId: content.parentId || null, createdAt: post.created_at };
  }));
}

async function assignedAdvisor(env: Env, user: AuthenticatedUser, context: AuthorizationContext) {
  const rows = await serviceRest<Array<{ advisor_id: string }>>(env, `advisor_assignments?student_id=eq.${encodeURIComponent(user.id)}&program_id=eq.${encodeURIComponent(context.activeProgramId || "")}&starts_at=lte.${encodeURIComponent(new Date().toISOString())}&or=(ends_at.is.null,ends_at.gt.${encodeURIComponent(new Date().toISOString())})&select=advisor_id&limit=1`);
  if (rows[0]) return rows[0].advisor_id;
  return env.PILOT_ENVIRONMENT === "staging" && context.roles.includes("advisor") ? user.id : null;
}

async function presentPacket(env: Env, packet: { id: string; title: string; status: string; advisor_id: string; expires_at: string | null; revoked_at: string | null } | undefined) {
  if (!packet) return null;
  const [profile, packetItems, comments] = await Promise.all([
    serviceRest<Array<{ display_name: string; preferred_name: string | null }>>(env, `profiles?user_id=eq.${encodeURIComponent(packet.advisor_id)}&select=display_name,preferred_name&limit=1`),
    serviceRest<Array<{ item_id: string }>>(env, `packet_items?packet_id=eq.${encodeURIComponent(packet.id)}&item_type=eq.artifact&item_id=not.is.null&select=item_id&order=created_at.asc`),
    serviceRest<Array<{ id: string; author_id: string; body: string; created_at: string }>>(env, `comments?packet_id=eq.${encodeURIComponent(packet.id)}&select=id,author_id,body,created_at&order=created_at.asc`),
  ]);
  const itemIds = packetItems.map((item) => item.item_id);
  const items = itemIds.length ? await serviceRest<StoredArtifact[]>(env, `artifacts?id=in.(${itemIds.join(",")})&select=id,station,artifact_type,title,content,created_at,updated_at`) : [];
  const authorIds = [...new Set(comments.map((comment) => comment.author_id))];
  const authors = authorIds.length ? await serviceRest<Array<{ user_id: string; display_name: string; preferred_name: string | null }>>(env, `profiles?user_id=in.(${authorIds.join(",")})&select=user_id,display_name,preferred_name`) : [];
  const authorNames = new Map(authors.map((author) => [author.user_id, author.preferred_name || author.display_name]));
  const expired = packet.expires_at && new Date(packet.expires_at) < new Date();
  return {
    id: packet.id,
    title: packet.title,
    status: packet.revoked_at ? "revoked" : expired ? "expired" : packet.status,
    advisorName: profile[0]?.preferred_name || profile[0]?.display_name || "Assigned advisor",
    expiresAt: packet.expires_at,
    itemIds,
    items: items.map(presentArtifact),
    comments: comments.map((comment) => ({ id: comment.id, authorName: authorNames.get(comment.author_id) || "Advisor", body: comment.body, createdAt: comment.created_at })),
  };
}

async function studentAdvisingShare(request: Request, env: Env, user: AuthenticatedUser) {
  const context = await authorization(env, user);
  requireRole(context, "student");
  if (!context.activeOrganizationId || !context.activeProgramId) throw new HttpError(409, "Your account needs an active program before work can be shared.", "active_program_required");
  const existing = await serviceRest<Array<{ id: string; title: string; status: string; advisor_id: string; expires_at: string | null; revoked_at: string | null }>>(env, `advising_packets?student_id=eq.${encodeURIComponent(user.id)}&program_id=eq.${encodeURIComponent(context.activeProgramId)}&status=eq.active&revoked_at=is.null&select=id,title,status,advisor_id,expires_at,revoked_at&order=created_at.desc&limit=1`);
  if (request.method === "GET") return json(await presentPacket(env, existing[0]));
  if (request.method === "DELETE") {
    if (existing[0]) await serviceRest(env, `advising_packets?id=eq.${encodeURIComponent(existing[0].id)}`, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify({ status: "revoked", revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() }) });
    return json({ ok: true });
  }
  const body = await readBody(request);
  const requestedIds = Array.isArray(body.artifactIds) ? [...new Set(body.artifactIds.filter((id): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)))].slice(0, 50) : [];
  if (!requestedIds.length) throw new HttpError(400, "Select at least one Portfolio item to share.", "packet_items_required");
  const owned = await serviceRest<Array<{ id: string }>>(env, `artifacts?student_id=eq.${encodeURIComponent(user.id)}&id=in.(${requestedIds.join(",")})&artifact_type=neq.pathway_primer&select=id`);
  if (owned.length !== requestedIds.length) throw new HttpError(403, "One or more selected items are not available to share.", "packet_item_forbidden");
  const advisorId = existing[0]?.advisor_id || await assignedAdvisor(env, user, context);
  if (!advisorId) throw new HttpError(409, "An advisor must be assigned before a packet can be shared.", "advisor_assignment_required");
  let packet = existing[0];
  if (!packet) {
    const created = await serviceRest<typeof existing>(env, "advising_packets?select=id,title,status,advisor_id,expires_at,revoked_at", { method: "POST", headers: { prefer: "return=representation" }, body: JSON.stringify({ student_id: user.id, advisor_id: advisorId, organization_id: context.activeOrganizationId, program_id: context.activeProgramId, title: "Pathway advising packet", status: "active", expires_at: new Date(Date.now() + 90 * 86400000).toISOString() }) });
    packet = created[0];
  }
  await serviceRest(env, `packet_items?packet_id=eq.${encodeURIComponent(packet.id)}&item_type=eq.artifact`, { method: "DELETE", headers: { prefer: "return=minimal" } });
  await serviceRest(env, "packet_items", { method: "POST", headers: { prefer: "return=minimal" }, body: JSON.stringify(requestedIds.map((itemId) => ({ packet_id: packet.id, item_type: "artifact", item_id: itemId }))) });
  await serviceRest(env, `advising_packets?id=eq.${encodeURIComponent(packet.id)}`, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify({ updated_at: new Date().toISOString() }) });
  console.log(JSON.stringify({ event: "advising_packet_shared", actor: user.id, packet_id: packet.id, item_count: requestedIds.length }));
  return json(await presentPacket(env, packet));
}

async function advisorStudentPacket(request: Request, env: Env, user: AuthenticatedUser, studentId: string) {
  requireStaffMfa(user);
  const context = await authorization(env, user);
  requireRole(context, "advisor");
  const assigned = await serviceRest<Array<{ student_id: string }>>(env, `advisor_assignments?advisor_id=eq.${encodeURIComponent(user.id)}&student_id=eq.${encodeURIComponent(studentId)}&select=student_id&limit=1`);
  const selfStaging = env.PILOT_ENVIRONMENT === "staging" && studentId === user.id && context.roles.includes("student");
  if (!assigned.length && !selfStaging) throw new HttpError(403, "This student is not assigned to your advising roster.", "student_assignment_required");
  const packets = await serviceRest<Array<{ id: string; title: string; status: string; advisor_id: string; expires_at: string | null; revoked_at: string | null }>>(env, `advising_packets?student_id=eq.${encodeURIComponent(studentId)}&advisor_id=eq.${encodeURIComponent(user.id)}&status=eq.active&revoked_at=is.null&select=id,title,status,advisor_id,expires_at,revoked_at&order=created_at.desc&limit=1`);
  if (request.method === "POST") {
    if (!packets[0]) throw new HttpError(409, "The student has not shared an active packet.", "active_packet_required");
    const body = await readBody(request);
    const comment = typeof body.comment === "string" ? body.comment.trim().slice(0, 2000) : "";
    if (!comment) throw new HttpError(400, "Write a comment before saving.", "empty_comment");
    await serviceRest(env, "comments", { method: "POST", headers: { prefer: "return=minimal" }, body: JSON.stringify({ packet_id: packets[0].id, author_id: user.id, body: comment }) });
  }
  return json(await presentPacket(env, packets[0]));
}

async function portfolioDocumentMetadata(request: Request, env: Env, user: AuthenticatedUser) {
  const context = await authorization(env, user);
  requireRole(context, "student");
  if (!context.activeOrganizationId || !context.activeProgramId) throw new HttpError(409, "Your account needs an active program before documents can be saved.", "active_program_required");
  const body = await readBody(request);
  const storagePath = typeof body.storagePath === "string" ? body.storagePath.trim().slice(0, 500) : "";
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 160) : "";
  const documentType = typeof body.documentType === "string" ? body.documentType.trim().slice(0, 80) : "Other";
  if (!storagePath.startsWith(`${user.id}/`) || !title) throw new HttpError(400, "The uploaded document metadata was not accepted.", "invalid_document_metadata");
  const rows = await serviceRest<Array<{ id: string }>>(env, "portfolio_documents?select=id", { method: "POST", headers: { prefer: "return=representation" }, body: JSON.stringify({ student_id: user.id, organization_id: context.activeOrganizationId, program_id: context.activeProgramId, storage_path: storagePath, title, document_type: documentType }) });
  return json({ ok: true, id: rows[0]?.id }, 201);
}

type SecretSurveyItem = {
  prompt: string;
  responseType?: "single_choice" | "text";
  required?: boolean;
  options?: Array<{ label: string; value: string }>;
};

type SecretSurveyDefinition = {
  instructions: string;
  items: SecretSurveyItem[];
  scoreKey: string;
  scoreLabel: string;
  reversePositions?: number[];
};

const stagingSurveyCatalog = [
  { slug: "pre-health-application-profile", name: "Your Pre-Health Application Profile: A Self-Assessment", audience: "student" },
  { slug: "short-grit-survey", name: "Short Grit Survey", audience: "student" },
  { slug: "macleod-clark-professional-identity-scale", name: "MacLeod Clark Professional Identity Scale", audience: "student" },
  { slug: "brief-resilience-scale", name: "Brief Resilience Scale", audience: "student" },
  { slug: "advisor-coaching-competency-scale", name: "Advisor Coaching Competency Scale (ACCS)", audience: "advisor" },
  { slug: "macleod-clark-professional-identity-scale-advisor", name: "MacLeod Clark Professional Identity Scale", audience: "advisor" },
] as const;

function secretSurvey(env: Env, slug: string): SecretSurveyDefinition | null {
  const optionalEnv = env as unknown as Record<string, string | undefined>;
  const raw = ({
    "pre-health-application-profile": env.SURVEY_PRE_HEALTH,
    "short-grit-survey": env.SURVEY_GRIT,
    "macleod-clark-professional-identity-scale": env.SURVEY_IDENTITY,
    "macleod-clark-professional-identity-scale-advisor": optionalEnv.SURVEY_IDENTITY_ADVISOR || env.SURVEY_IDENTITY,
    "brief-resilience-scale": env.SURVEY_RESILIENCE,
    "advisor-coaching-competency-scale": env.SURVEY_ACCS,
  } as Record<string, string | undefined>)[slug];
  if (!raw || env.PILOT_ENVIRONMENT !== "staging") return null;
  try {
    const parsed = JSON.parse(raw) as SecretSurveyDefinition;
    return Array.isArray(parsed.items) && parsed.items.length ? parsed : null;
  } catch {
    console.error(JSON.stringify({ event: "staging_survey_content_invalid", instrument_slug: slug }));
    return null;
  }
}

async function stableUuid(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))).slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function ensureStagingSurveyAssignments(env: Env, user: AuthenticatedUser, context: AuthorizationContext, audiences: Array<"student" | "advisor">) {
  if (env.PILOT_ENVIRONMENT !== "staging" || !context.activeOrganizationId || !context.activeProgramId) return;
  const eligible = stagingSurveyCatalog.filter((instrument) => audiences.includes(instrument.audience) && secretSurvey(env, instrument.slug));
  if (!eligible.length) return;
  const rows = await Promise.all(eligible.map(async (instrument) => ({
    assignment_id: await stableUuid(`navigate-pathway:assignment:${user.id}:${instrument.slug}`),
    user_id: user.id,
    organization_id: context.activeOrganizationId,
    program_id: context.activeProgramId,
    cohort_id: context.activeCohortId || null,
    instrument_slug: instrument.slug,
    instrument_name: instrument.name,
    wave_id: await stableUuid(`navigate-pathway:wave:${context.activeOrganizationId}:${context.activeProgramId}:${instrument.slug}`),
    wave_label: "Navigate Pilot Baseline",
    audience: instrument.audience,
    status: "not_started",
  })));
  await serviceRest<void>(env, "survey_completion_projection?on_conflict=assignment_id", {
    method: "POST",
    headers: { prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
}

function base64Bytes(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function bytesBase64(value: Uint8Array) {
  let result = "";
  value.forEach((byte) => { result += String.fromCharCode(byte); });
  return btoa(result);
}

async function surveyKey(env: Env) {
  if (!env.SURVEY_ENCRYPTION_KEY) throw new HttpError(503, "Protected survey storage is not configured.", "survey_storage_unavailable");
  return crypto.subtle.importKey("raw", base64Bytes(env.SURVEY_ENCRYPTION_KEY), "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptSurvey(env: Env, value: unknown) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await surveyKey(env), plaintext);
  return { iv: bytesBase64(iv), ciphertext: bytesBase64(new Uint8Array(ciphertext)) };
}

async function decryptSurvey<T>(env: Env, value: unknown): Promise<T> {
  const encrypted = value && typeof value === "object" ? value as { iv?: string; ciphertext?: string } : {};
  if (!encrypted.iv || !encrypted.ciphertext) throw new HttpError(400, "The protected survey draft could not be read.", "survey_draft_unreadable");
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64Bytes(encrypted.iv) }, await surveyKey(env), base64Bytes(encrypted.ciphertext));
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

type SurveyProjection = {
  assignment_id: string;
  user_id: string;
  organization_id: string;
  program_id: string;
  cohort_id: string | null;
  instrument_slug: string;
  instrument_name: string;
  wave_id: string;
  wave_label: string;
  status: string;
  opens_at: string | null;
  closes_at: string | null;
  submitted_at: string | null;
  audience: "student" | "advisor";
};

async function surveyProjection(env: Env, userId: string, assignmentId: string) {
  const rows = await serviceRest<SurveyProjection[]>(env, `survey_completion_projection?assignment_id=eq.${encodeURIComponent(assignmentId)}&user_id=eq.${encodeURIComponent(userId)}&select=assignment_id,user_id,organization_id,program_id,cohort_id,instrument_slug,instrument_name,wave_id,wave_label,status,opens_at,closes_at,submitted_at,audience&limit=1`);
  if (!rows[0]) throw new HttpError(404, "That survey assignment is not available to this account.", "survey_assignment_missing");
  return rows[0];
}

async function stagingSurveyArtifact(env: Env, userId: string, assignmentId: string) {
  const rows = await serviceRest<StoredArtifact[]>(env, `artifacts?student_id=eq.${encodeURIComponent(userId)}&artifact_type=eq.staging_survey&content-%3E%3EassignmentId=eq.${encodeURIComponent(assignmentId)}&select=id,station,artifact_type,title,content,created_at,updated_at&order=updated_at.desc&limit=1`);
  return rows[0];
}

function stagingEnabledAssignments(env: Env, value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  const dashboard = value as Record<string, unknown>;
  if (env.PILOT_ENVIRONMENT !== "staging") return dashboard;
  for (const key of ["surveyAssignments", "mySurveys"]) {
    if (!Array.isArray(dashboard[key])) continue;
    dashboard[key] = (dashboard[key] as Array<Record<string, unknown>>).map((assignment) => {
      const catalog = stagingSurveyCatalog.find((instrument) => instrument.slug === String(assignment.instrumentSlug || ""));
      const enabled = secretSurvey(env, String(assignment.instrumentSlug || "")) && assignment.status === "not_available" ? { ...assignment, status: "not_started" } : assignment;
      return catalog ? { ...enabled, audience: catalog.audience } : enabled;
    });
  }
  return dashboard;
}

async function adminSurveyCompletion(env: Env, context: AuthorizationContext) {
  if (!context.activeOrganizationId) return [];
  const rows = await serviceRest<Array<{ instrument_slug: string; instrument_name: string; audience: "student" | "advisor"; status: string }>>(
    env,
    `survey_completion_projection?organization_id=eq.${encodeURIComponent(context.activeOrganizationId)}&select=instrument_slug,instrument_name,audience,status`,
  );
  const grouped = new Map<string, { instrumentSlug: string; instrumentName: string; audience: "student" | "advisor"; assigned: number; submitted: number }>();
  for (const row of rows) {
    const key = `${row.audience}:${row.instrument_slug}`;
    const current = grouped.get(key) || { instrumentSlug: row.instrument_slug, instrumentName: row.instrument_name, audience: row.audience, assigned: 0, submitted: 0 };
    current.assigned += 1;
    if (row.status === "submitted") current.submitted += 1;
    grouped.set(key, current);
  }
  return [...grouped.values()].sort((a, b) => a.audience.localeCompare(b.audience) || a.instrumentName.localeCompare(b.instrumentName));
}

async function stagingAdvisorSelf(env: Env, user: AuthenticatedUser, context: AuthorizationContext, dashboard: Record<string, unknown>) {
  if (env.PILOT_ENVIRONMENT !== "staging" || !context.roles.includes("student") || !Array.isArray(dashboard.assignedStudents) || dashboard.assignedStudents.length) return dashboard;
  const [profile, attendance, sessions, completion, packets] = await Promise.all([
    serviceRest<Array<{ display_name: string; preferred_name: string | null }>>(env, `profiles?user_id=eq.${encodeURIComponent(user.id)}&select=display_name,preferred_name&limit=1`),
    serviceRest<Array<{ status: string }>>(env, `attendance?student_id=eq.${encodeURIComponent(user.id)}&select=status`),
    context.activeProgramId ? serviceRest<Array<{ id: string }>>(env, `sessions?program_id=eq.${encodeURIComponent(context.activeProgramId)}&starts_at=lt.${encodeURIComponent(new Date().toISOString())}&select=id`) : [],
    serviceRest<Array<{ instrument_name: string; status: string; submitted_at: string | null }>>(env, `survey_completion_projection?user_id=eq.${encodeURIComponent(user.id)}&audience=eq.student&select=instrument_name,status,submitted_at`) ,
    serviceRest<Array<{ id: string }>>(env, `advising_packets?student_id=eq.${encodeURIComponent(user.id)}&advisor_id=eq.${encodeURIComponent(user.id)}&status=eq.active&revoked_at=is.null&select=id`),
  ]);
  dashboard.assignedStudents = [{ id: user.id, displayName: profile[0]?.preferred_name || profile[0]?.display_name || user.email.split("@")[0], cohortName: "Fictional Staging Cohort", attendance: { present: attendance.filter((item) => item.status === "present").length, expected: sessions.length }, surveyCompletion: completion.map((item) => ({ instrumentName: item.instrument_name, status: item.status, submittedAt: item.submitted_at })), sharedPacketCount: packets.length }];
  return dashboard;
}

async function stagingSurveyDetail(env: Env, user: AuthenticatedUser, assignmentId: string) {
  const projection = await surveyProjection(env, user.id, assignmentId);
  let official: Record<string, unknown>;
  if (env.PILOT_ENVIRONMENT === "staging" && projection.wave_label === "Navigate Pilot Baseline") {
    official = {
      id: projection.assignment_id,
      instrumentSlug: projection.instrument_slug,
      instrumentName: projection.instrument_name,
      waveLabel: projection.wave_label,
      required: false,
      opensAt: projection.opens_at,
      closesAt: projection.closes_at,
      status: projection.status,
      submittedAt: projection.submitted_at,
      consentVersionId: projection.wave_id,
      instrumentVersion: "protected-staging-v1",
      items: [],
    };
  } else {
    official = await rpc<Record<string, unknown>>(env, user.token, "get_my_survey_assignment", { assignment_id: assignmentId });
  }
  const definition = secretSurvey(env, String(official.instrumentSlug || projection.instrument_slug));
  if (!definition || (Array.isArray(official.items) && official.items.length)) return official;
  const saved = await stagingSurveyArtifact(env, user.id, assignmentId);
  const protectedPayload = saved ? await decryptSurvey<{ answers: Record<string, string>; scores?: Record<string, number> }>(env, saved.content.encrypted) : null;
  const sharedOptions = definition.items.find((item) => item.options?.length)?.options || [];
  return {
    ...official,
    audience: projection.audience,
    itemCount: definition.items.filter((item) => (item.responseType || "single_choice") !== "text").length,
    openResponseCount: definition.items.filter((item) => item.responseType === "text").length,
    status: saved?.content.status === "submitted" ? "submitted" : saved ? "in_progress" : projection.status,
    consentTitle: "Navigate the Pathway pilot survey information",
    consentBody: "Your responses support the approved pilot evaluation. Students and advisors see completion status only. Evaluation-authorized administrators may review identifiable responses and calculated results. Survey results do not affect pathway recommendations or admissions decisions.",
    items: definition.items.map((item, index) => ({
      id: `${String(official.instrumentSlug)}:${index + 1}`,
      position: index + 1,
      prompt: item.prompt,
      responseType: item.responseType || "single_choice",
      required: item.required !== false,
      options: (item.options?.length ? item.options : sharedOptions).map((option, optionIndex) => ({ id: `${String(official.instrumentSlug)}:${index + 1}:${optionIndex + 1}`, label: option.label, value: option.value, position: optionIndex + 1 })),
    })),
    draft: protectedPayload?.answers || {},
    lastSavedAt: saved?.updated_at || null,
    instructions: definition.instructions,
  };
}

function calculateSurveyScores(definition: SecretSurveyDefinition, answers: Record<string, string>) {
  const reverse = new Set(definition.reversePositions || []);
  const values = definition.items.map((item, index) => {
    if ((item.responseType || "single_choice") === "text") return null;
    const raw = Number(answers[`${index + 1}`] ?? answers[Object.keys(answers).find((key) => key.endsWith(`:${index + 1}`)) || ""]);
    if (!Number.isFinite(raw)) return null;
    return reverse.has(index + 1) ? 6 - raw : raw;
  }).filter((value): value is number => value !== null);
  if (!values.length) return {};
  const total = values.reduce((sum, value) => sum + value, 0);
  return { [definition.scoreKey]: Number((total / values.length).toFixed(2)), total: Number(total.toFixed(2)), answeredItems: values.length };
}

async function saveStagingSurvey(request: Request, env: Env, user: AuthenticatedUser, assignmentId: string, submit: boolean) {
  const projection = await surveyProjection(env, user.id, assignmentId);
  const definition = secretSurvey(env, projection.instrument_slug);
  if (!definition) return null;
  const body = submit ? {} : await readBody(request);
  const existing = await stagingSurveyArtifact(env, user.id, assignmentId);
  const prior = existing ? await decryptSurvey<{ answers: Record<string, string> }>(env, existing.content.encrypted) : { answers: {} };
  const answers = submit ? prior.answers : body.answers && typeof body.answers === "object" ? Object.fromEntries(Object.entries(body.answers as Record<string, unknown>).filter(([, value]) => typeof value === "string").map(([key, value]) => [key.slice(0, 160), String(value).slice(0, 5000)])) : {};
  if (submit) {
    const missing = definition.items.some((item, index) => item.required !== false && !String(answers[`${projection.instrument_slug}:${index + 1}`] || "").trim());
    if (missing) throw new HttpError(400, "Complete each required survey item before submitting.", "survey_incomplete");
  }
  const scores = submit ? calculateSurveyScores(definition, Object.fromEntries(Object.entries(answers).map(([key, value]) => [key.split(":").pop() || key, value]))) : {};
  const encrypted = await encryptSurvey(env, { answers, scores });
  const status = submit ? "submitted" : "in_progress";
  const content = { assignmentId, instrumentSlug: projection.instrument_slug, instrumentName: projection.instrument_name, waveId: projection.wave_id, waveLabel: projection.wave_label, status, encrypted };
  if (existing) await serviceRest(env, `artifacts?id=eq.${encodeURIComponent(existing.id)}`, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify({ content, updated_at: new Date().toISOString() }) });
  else await serviceRest(env, "artifacts", { method: "POST", headers: { prefer: "return=minimal" }, body: JSON.stringify({ student_id: user.id, organization_id: projection.organization_id, program_id: projection.program_id, station: "sessions", artifact_type: "staging_survey", title: projection.instrument_name, content, private_by_default: true }) });
  await serviceRest(env, `survey_completion_projection?assignment_id=eq.${encodeURIComponent(assignmentId)}&user_id=eq.${encodeURIComponent(user.id)}`, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify({ status, started_at: new Date().toISOString(), submitted_at: submit ? new Date().toISOString() : null, updated_at: new Date().toISOString() }) });
  console.log(JSON.stringify({ event: submit ? "staging_survey_submitted" : "staging_survey_draft_saved", actor: user.id, assignment_id: assignmentId, instrument_slug: projection.instrument_slug }));
  return { ok: true, status };
}

type EvaluationSubmission = {
  assignmentId: string;
  userId: string;
  displayName: string;
  email: string;
  audience: "student" | "advisor";
  instrumentSlug: string;
  instrumentName: string;
  waveId: string;
  waveLabel: string;
  submittedAt: string;
  answers: Record<string, string>;
  scores: Record<string, number>;
  cohortName: string;
  institution: string;
  classYear: string;
  attendanceCount: number;
  completionStatus: string;
  demographics: Record<string, string>;
};

type AnalyticsConfiguration = {
  enabledDimensions: string[];
  sensitiveDimensions: string[];
  minimumGroupSize: number;
  smallSampleWarningBelow: number;
  enabledDepths: Array<"descriptive" | "comparative" | "statistical">;
  defaultDepth: "descriptive" | "comparative" | "statistical";
  grantCheckpointsStatus: "disabled" | "pending_approval" | "enabled";
};

const defaultAnalyticsConfiguration: AnalyticsConfiguration = {
  enabledDimensions: ["wave", "institution", "cohort", "class_year", "attendance_band", "completion_status"],
  sensitiveDimensions: [],
  minimumGroupSize: 2,
  smallSampleWarningBelow: 5,
  enabledDepths: ["descriptive", "comparative", "statistical"],
  defaultDepth: "descriptive",
  grantCheckpointsStatus: "disabled",
};

async function optionalServiceRest<T>(env: Env, path: string, fallback: T): Promise<T> {
  try { return await serviceRest<T>(env, path); }
  catch { return fallback; }
}

function primaryScore(submission: EvaluationSubmission) {
  if (submission.instrumentSlug === "pre-health-application-profile") return null;
  return Object.entries(submission.scores).find(([key, value]) => !["total", "answeredItems"].includes(key) && Number.isFinite(value))?.[1] ?? null;
}

function numericAnswers(answers: Record<string, string>) {
  return Object.entries(answers).map(([key, value]) => ({ key: key.split(":").pop() || key, value: Number(value) })).filter((entry) => Number.isFinite(entry.value));
}

async function evaluationSubmissions(env: Env, user: AuthenticatedUser, context: AuthorizationContext) {
  if (!context.activeOrganizationId) return [] as EvaluationSubmission[];
  const rows = await serviceRest<Array<StoredArtifact & { student_id: string }>>(env, `artifacts?organization_id=eq.${encodeURIComponent(context.activeOrganizationId)}&artifact_type=eq.staging_survey&content-%3E%3Estatus=eq.submitted&select=id,student_id,station,artifact_type,title,content,created_at,updated_at&order=updated_at.desc`);
  if (!rows.length && env.PILOT_ENVIRONMENT !== "staging") {
    const official = await rpc<Array<Record<string, unknown>>>(env, user.token, "evaluation_authorized_results", { wave_id: null, instrument_slug: null });
    return official.map((row) => ({
      assignmentId: String(row.assignmentId || ""), userId: String(row.userId || ""), displayName: "Participant", email: "",
      audience: row.audience === "advisor" ? "advisor" : "student", instrumentSlug: String(row.instrumentSlug || ""), instrumentName: String(row.instrument || ""),
      waveId: String(row.waveId || ""), waveLabel: String(row.waveLabel || ""), submittedAt: String(row.submittedAt || ""),
      answers: (row.answers || {}) as Record<string, string>, scores: (row.approvedScores || {}) as Record<string, number>, cohortName: "Not recorded",
      institution: "Not recorded", classYear: "Not recorded", attendanceCount: 0, completionStatus: "Not recorded", demographics: {},
    }));
  }
  const userIds = [...new Set(rows.map((row) => row.student_id))];
  const idFilter = userIds.length ? `(${userIds.join(",")})` : "()";
  const [profiles, authUsers, projections, attendance, enrollments, cohorts, attributes] = await Promise.all([
    userIds.length ? serviceRest<Array<{ user_id: string; display_name: string; preferred_name: string | null; active_cohort_id: string | null }>>(env, `profiles?user_id=in.${idFilter}&select=user_id,display_name,preferred_name,active_cohort_id`) : [],
    supabaseAuthUsers(env),
    serviceRest<Array<{ assignment_id: string; user_id: string; audience: "student" | "advisor"; instrument_slug: string; instrument_name: string; wave_id: string; wave_label: string; submitted_at: string | null }>>(env, `survey_completion_projection?organization_id=eq.${encodeURIComponent(context.activeOrganizationId)}&status=eq.submitted&select=assignment_id,user_id,audience,instrument_slug,instrument_name,wave_id,wave_label,submitted_at`),
    userIds.length ? serviceRest<Array<{ student_id: string; status: string }>>(env, `attendance?student_id=in.${idFilter}&select=student_id,status`) : [],
    userIds.length ? serviceRest<Array<{ student_id: string; status: string }>>(env, `enrollments?student_id=in.${idFilter}&select=student_id,status`) : [],
    serviceRest<Array<{ id: string; name: string }>>(env, `cohorts?organization_id=eq.${encodeURIComponent(context.activeOrganizationId)}&select=id,name`),
    userIds.length ? optionalServiceRest<Array<{ user_id: string; institution: string | null; class_year: string | null; first_generation: boolean | null; socioeconomic_indicator: string | null; gender: string | null; race_ethnicity: string[]; approved_for_analysis: boolean }>>(env, `profile_analysis_attributes?user_id=in.${idFilter}&select=user_id,institution,class_year,first_generation,socioeconomic_indicator,gender,race_ethnicity,approved_for_analysis`, []) : [],
  ]);
  const profileMap = new Map(profiles.map((profile) => [profile.user_id, profile]));
  const authMap = new Map(authUsers.map((entry) => [entry.id, entry]));
  const projectionMap = new Map(projections.map((projection) => [projection.assignment_id, projection]));
  const cohortMap = new Map(cohorts.map((cohort) => [cohort.id, cohort.name]));
  const enrollmentMap = new Map(enrollments.map((entry) => [entry.student_id, entry.status]));
  const attributeMap = new Map(attributes.map((entry) => [entry.user_id, entry]));
  const attendanceMap = new Map<string, number>();
  attendance.forEach((entry) => { if (entry.status === "present") attendanceMap.set(entry.student_id, (attendanceMap.get(entry.student_id) || 0) + 1); });
  const submissions: EvaluationSubmission[] = [];
  for (const row of rows) {
    const content = row.content as Record<string, unknown>;
    const assignmentId = String(content.assignmentId || "");
    const projection = projectionMap.get(assignmentId);
    const payload = await decryptSurvey<{ answers?: Record<string, string>; scores?: Record<string, number> }>(env, content.encrypted);
    const profile = profileMap.get(row.student_id);
    const auth = authMap.get(row.student_id);
    const attributesForUser = attributeMap.get(row.student_id);
    submissions.push({
      assignmentId,
      userId: row.student_id,
      displayName: profile?.preferred_name || profile?.display_name || auth?.email?.split("@")[0] || "Participant",
      email: auth?.email || "",
      audience: projection?.audience || (stagingSurveyCatalog.find((instrument) => instrument.slug === String(content.instrumentSlug || ""))?.audience || "student"),
      instrumentSlug: projection?.instrument_slug || String(content.instrumentSlug || ""),
      instrumentName: projection?.instrument_name || String(content.instrumentName || row.title),
      waveId: projection?.wave_id || String(content.waveId || ""),
      waveLabel: projection?.wave_label || String(content.waveLabel || "Navigate Pilot Baseline"),
      submittedAt: projection?.submitted_at || row.updated_at,
      answers: payload.answers || {}, scores: payload.scores || {},
      cohortName: profile?.active_cohort_id ? cohortMap.get(profile.active_cohort_id) || "Not recorded" : "Not recorded",
      institution: attributesForUser?.approved_for_analysis ? attributesForUser.institution || "Not recorded" : "Not recorded",
      classYear: attributesForUser?.approved_for_analysis ? attributesForUser.class_year || "Not recorded" : "Not recorded",
      attendanceCount: attendanceMap.get(row.student_id) || 0,
      completionStatus: enrollmentMap.get(row.student_id) || "Not recorded",
      demographics: attributesForUser?.approved_for_analysis ? {
        first_generation: attributesForUser.first_generation === null ? "Not recorded" : attributesForUser.first_generation ? "Yes" : "No",
        socioeconomic_indicator: attributesForUser.socioeconomic_indicator || "Not recorded",
        gender: attributesForUser.gender || "Not recorded",
        race_ethnicity: attributesForUser.race_ethnicity?.join("; ") || "Not recorded",
      } : {},
    });
  }
  return submissions;
}

function mean(values: number[]) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; }
function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
function standardDeviation(values: number[]) {
  if (values.length < 2) return null;
  const average = mean(values) || 0;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1));
}
function quartile(values: number[], percentile: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b); const position = (sorted.length - 1) * percentile; const lower = Math.floor(position); const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}
function rank(values: number[]) {
  return values.map((value, original) => ({ value, original })).sort((a, b) => a.value - b.value).map((entry, index, sorted) => {
    const same = sorted.filter((candidate) => candidate.value === entry.value); const first = sorted.findIndex((candidate) => candidate.value === entry.value);
    return { original: entry.original, rank: first + (same.length + 1) / 2 };
  }).sort((a, b) => a.original - b.original).map((entry) => entry.rank);
}
function correlation(left: number[], right: number[]) {
  if (left.length < 2 || left.length !== right.length) return null;
  const leftMean = mean(left) || 0; const rightMean = mean(right) || 0;
  const numerator = left.reduce((sum, value, index) => sum + (value - leftMean) * (right[index] - rightMean), 0);
  const denominator = Math.sqrt(left.reduce((sum, value) => sum + (value - leftMean) ** 2, 0) * right.reduce((sum, value) => sum + (value - rightMean) ** 2, 0));
  return denominator ? numerator / denominator : null;
}
function normalCdf(value: number) {
  const sign = value < 0 ? -1 : 1; const x = Math.abs(value) / Math.sqrt(2); const t = 1 / (1 + 0.3275911 * x);
  const erf = sign * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x));
  return 0.5 * (1 + erf);
}
function falseDiscoveryRate(values: Array<number | null>) {
  const ranked = values.map((value, index) => ({ value, index })).filter((entry): entry is { value: number; index: number } => entry.value !== null && Number.isFinite(entry.value)).sort((a, b) => a.value - b.value);
  const adjusted = Array<number | null>(values.length).fill(null); let prior = 1;
  for (let index = ranked.length - 1; index >= 0; index -= 1) {
    const candidate = Math.min(1, ranked[index].value * ranked.length / (index + 1), prior); prior = candidate; adjusted[ranked[index].index] = candidate;
  }
  return adjusted;
}
function round(value: number | null, digits = 2) { return value === null || !Number.isFinite(value) ? null : Number(value.toFixed(digits)); }

async function analyticsConfiguration(env: Env, context: AuthorizationContext) {
  if (!context.activeProgramId) return defaultAnalyticsConfiguration;
  const rows = await serviceRest<Array<{ settings: Record<string, unknown> }>>(env, `programs?id=eq.${encodeURIComponent(context.activeProgramId)}&select=settings&limit=1`);
  const saved = (rows[0]?.settings?.surveyAnalytics || {}) as Partial<AnalyticsConfiguration>;
  return { ...defaultAnalyticsConfiguration, ...saved };
}

async function saveAnalyticsConfiguration(request: Request, env: Env, user: AuthenticatedUser, context: AuthorizationContext) {
  requireStaffMfa(user); requireRole(context, "administrator"); requireCapability(context, "evaluation.governance");
  if (!context.activeProgramId || !context.activeOrganizationId) throw new HttpError(409, "Choose an active program first.", "active_program_required");
  const body = await readBody(request);
  const currentRows = await serviceRest<Array<{ settings: Record<string, unknown> }>>(env, `programs?id=eq.${encodeURIComponent(context.activeProgramId)}&select=settings&limit=1`);
  const prior = currentRows[0]?.settings || {};
  const allowedDimensions = ["wave", "institution", "cohort", "class_year", "attendance_band", "completion_status", "first_generation", "socioeconomic_indicator", "gender", "race_ethnicity"];
  const enabledDimensions = Array.isArray(body.enabledDimensions) ? body.enabledDimensions.map(String).filter((item) => allowedDimensions.includes(item)) : defaultAnalyticsConfiguration.enabledDimensions;
  const sensitiveDimensions = Array.isArray(body.sensitiveDimensions) ? body.sensitiveDimensions.map(String).filter((item) => ["first_generation", "socioeconomic_indicator", "gender", "race_ethnicity"].includes(item)) : [];
  const saved: AnalyticsConfiguration = { ...defaultAnalyticsConfiguration, enabledDimensions, sensitiveDimensions, defaultDepth: ["descriptive", "comparative", "statistical"].includes(String(body.defaultDepth)) ? body.defaultDepth as AnalyticsConfiguration["defaultDepth"] : "descriptive", grantCheckpointsStatus: prior.surveyAnalytics && typeof prior.surveyAnalytics === "object" ? ((prior.surveyAnalytics as Record<string, unknown>).grantCheckpointsStatus as AnalyticsConfiguration["grantCheckpointsStatus"] || "disabled") : "disabled" };
  await serviceRest(env, `programs?id=eq.${encodeURIComponent(context.activeProgramId)}`, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify({ settings: { ...prior, surveyAnalytics: saved } }) });
  await serviceRest(env, "audit_events", { method: "POST", headers: { prefer: "return=minimal" }, body: JSON.stringify({ organization_id: context.activeOrganizationId, actor_id: user.id, event_type: "survey_analytics_configuration_updated", subject_type: "program", subject_id: context.activeProgramId, metadata: saved }) });
  return saved;
}

function dimensionValue(submission: EvaluationSubmission, dimension: string) {
  if (dimension === "wave") return submission.waveLabel;
  if (dimension === "institution") return submission.institution;
  if (dimension === "cohort") return submission.cohortName;
  if (dimension === "class_year") return submission.classYear;
  if (dimension === "attendance_band") return submission.attendanceCount === 0 ? "No attended sessions" : submission.attendanceCount < 5 ? "1 to 4 sessions" : "5 or more sessions";
  if (dimension === "completion_status") return submission.completionStatus;
  return submission.demographics[dimension] || "Not recorded";
}

async function surveyAnalytics(url: URL, env: Env, user: AuthenticatedUser, context: AuthorizationContext) {
  requireStaffMfa(user); requireRole(context, "administrator");
  if (!context.capabilities.includes("evaluation.governance") && !context.capabilities.includes("evaluation.identifiable_results")) throw new HttpError(403, "Evaluation analytics require separate authorization.", "capability_required");
  const configuration = await analyticsConfiguration(env, context);
  const audience = url.searchParams.get("audience") === "advisor" ? "advisor" : "student";
  const requestedDepth = url.searchParams.get("depth") || configuration.defaultDepth;
  const depth = configuration.enabledDepths.includes(requestedDepth as AnalyticsConfiguration["defaultDepth"]) ? requestedDepth as AnalyticsConfiguration["defaultDepth"] : configuration.defaultDepth;
  const dimension = configuration.enabledDimensions.includes(url.searchParams.get("dimension") || "wave") ? (url.searchParams.get("dimension") || "wave") : "wave";
  const instrumentSlug = url.searchParams.get("instrument") || null;
  const allSubmissions = await evaluationSubmissions(env, user, context);
  const filtered = allSubmissions.filter((submission) => submission.audience === audience && (!instrumentSlug || submission.instrumentSlug === instrumentSlug));
  const completionRows = await serviceRest<Array<{ instrument_slug: string; audience: "student" | "advisor"; status: string }>>(env, `survey_completion_projection?organization_id=eq.${encodeURIComponent(context.activeOrganizationId || "")}&audience=eq.${audience}&select=instrument_slug,audience,status`);
  const assigned = completionRows.filter((row) => !instrumentSlug || row.instrument_slug === instrumentSlug).length;
  const grouped = new Map<string, EvaluationSubmission[]>();
  filtered.forEach((submission) => { const key = dimensionValue(submission, dimension); grouped.set(key, [...(grouped.get(key) || []), submission]); });
  const groups = [...grouped.entries()].map(([key, group]) => {
    const values = group.map(primaryScore).filter((value): value is number => value !== null);
    const suppressed = group.length < configuration.minimumGroupSize;
    return { key, label: suppressed ? "Suppressed small group" : key, count: suppressed ? 0 : group.length, suppressed, smallSample: group.length < configuration.smallSampleWarningBelow, mean: suppressed ? null : round(mean(values)), median: suppressed ? null : round(median(values)), standardDeviation: suppressed ? null : round(standardDeviation(values)), interquartileRange: suppressed ? null : round(values.length ? (quartile(values, .75) || 0) - (quartile(values, .25) || 0) : null), minimum: suppressed || !values.length ? null : Math.min(...values), maximum: suppressed || !values.length ? null : Math.max(...values) };
  });
  const itemMap = new Map<string, number[]>();
  filtered.forEach((submission) => numericAnswers(submission.answers).forEach((entry) => itemMap.set(entry.key, [...(itemMap.get(entry.key) || []), entry.value])));
  const itemResults = [...itemMap.entries()].map(([itemKey, values]) => ({ itemKey, count: values.length, mean: values.length >= configuration.minimumGroupSize ? round(mean(values)) : null }));
  const instrumentFiltered = instrumentSlug ? filtered : [];
  const byParticipant = new Map<string, EvaluationSubmission[]>();
  instrumentFiltered.forEach((submission) => byParticipant.set(submission.userId, [...(byParticipant.get(submission.userId) || []), submission]));
  const pairs = [...byParticipant.values()].map((entries) => [...entries].sort((a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime())).filter((entries) => entries.length >= 2).map((entries) => ({ baseline: primaryScore(entries[0]), final: primaryScore(entries[entries.length - 1]) })).filter((pair): pair is { baseline: number; final: number } => pair.baseline !== null && pair.final !== null);
  const differences = pairs.map((pair) => pair.final - pair.baseline); const differenceMean = mean(differences); const differenceSd = standardDeviation(differences);
  const standardError = differenceSd !== null && pairs.length ? differenceSd / Math.sqrt(pairs.length) : null;
  const z = standardError && differenceMean !== null ? differenceMean / standardError : null;
  const pValue = z === null ? null : 2 * (1 - normalCdf(Math.abs(z)));
  const pairedChange = pairs.length >= configuration.minimumGroupSize ? { count: pairs.length, baselineMean: round(mean(pairs.map((pair) => pair.baseline))), finalMean: round(mean(pairs.map((pair) => pair.final))), meanChange: round(differenceMean), percentImproved: round(pairs.filter((pair) => pair.final > pair.baseline).length / pairs.length * 100, 1), confidenceInterval: standardError !== null && differenceMean !== null ? [round(differenceMean - 1.96 * standardError) || 0, round(differenceMean + 1.96 * standardError) || 0] as [number, number] : null, effectSize: differenceSd && differenceMean !== null ? round(differenceMean / differenceSd) : null, pValue: depth === "statistical" ? round(pValue, 4) : null, adjustedPValue: depth === "statistical" ? round(pValue, 4) : null } : null;
  const scored = filtered.map((submission) => ({ attendance: submission.attendanceCount, score: primaryScore(submission) })).filter((entry): entry is { attendance: number; score: number } => entry.score !== null);
  const rho = scored.length >= configuration.minimumGroupSize ? correlation(rank(scored.map((entry) => entry.attendance)), rank(scored.map((entry) => entry.score))) : null;
  const associationP = rho !== null && scored.length > 2 ? 2 * (1 - normalCdf(Math.abs(rho) * Math.sqrt(scored.length - 1))) : null;
  const adjusted = falseDiscoveryRate([pValue, associationP]);
  if (pairedChange && depth === "statistical") pairedChange.adjustedPValue = round(adjusted[0], 4);
  const attendanceAssociation = scored.length >= configuration.minimumGroupSize ? { count: scored.length, spearmanRho: round(rho), pValue: depth === "statistical" ? round(associationP, 4) : null, adjustedPValue: depth === "statistical" ? round(adjusted[1], 4) : null } : null;
  const insights = [] as Array<{ level: string; title: string; body: string }>;
  if (!filtered.length) insights.push({ level: "information", title: "No submitted responses yet", body: "This view will update after participants submit the selected survey." });
  else if (!instrumentSlug) insights.push({ level: "information", title: "Choose one instrument for change analysis", body: "Cross-instrument averages are intentionally avoided because the measures represent different constructs." });
  if (pairedChange?.meanChange !== null && pairedChange.meanChange !== undefined) insights.push({ level: pairedChange.meanChange > 0 ? "encouraging" : "attention", title: pairedChange.meanChange > 0 ? "Scores increased across paired waves" : "Paired change did not increase", body: `The mean paired change was ${pairedChange.meanChange}. This is an association within submitted responses and does not establish that the program caused the change.` });
  if (groups.some((group) => group.smallSample && !group.suppressed)) insights.push({ level: "attention", title: "Interpret small groups cautiously", body: `At least one displayed group has fewer than ${configuration.smallSampleWarningBelow} responses. Avoid generalizing beyond this pilot.` });
  const availableInstruments = [...new Map(allSubmissions.filter((submission) => submission.audience === audience).map((submission) => [submission.instrumentSlug, { slug: submission.instrumentSlug, name: submission.instrumentName, audience: submission.audience }])).values()];
  const dimensionLabels: Record<string, string> = { wave: "Survey wave", institution: "Institution", cohort: "Cohort", class_year: "Class year", attendance_band: "Attendance band", completion_status: "Program completion", first_generation: "First-generation status", socioeconomic_indicator: "Socioeconomic indicator", gender: "Gender", race_ethnicity: "Race and ethnicity" };
  await serviceRest(env, "audit_events", { method: "POST", headers: { prefer: "return=minimal" }, body: JSON.stringify({ organization_id: context.activeOrganizationId, actor_id: user.id, event_type: "survey_analytics_viewed", subject_type: "evaluation_analytics", metadata: { audience, instrumentSlug, depth, dimension } }) });
  return { audience, instrumentSlug, instrumentName: filtered[0]?.instrumentName || null, depth, dimension, submitted: filtered.length, assigned, completionPercent: assigned ? Math.round(filtered.length / assigned * 100) : 0, groups, pairedChange: depth === "descriptive" ? null : pairedChange, attendanceAssociation: depth === "descriptive" ? null : attendanceAssociation, insights, itemResults, availableInstruments, availableDimensions: Object.entries(dimensionLabels).map(([key, label]) => ({ key, label, enabled: configuration.enabledDimensions.includes(key), sensitive: ["first_generation", "socioeconomic_indicator", "gender", "race_ethnicity"].includes(key) })), generatedAt: new Date().toISOString() };
}

async function evaluationSummary(env: Env, user: AuthenticatedUser, context: AuthorizationContext) {
  requireStaffMfa(user); requireRole(context, "administrator");
  if (!context.capabilities.includes("evaluation.identifiable_results") && !context.capabilities.includes("evaluation.governance")) throw new HttpError(403, "Quantified evaluation results require separate authorization.", "capability_required");
  const submissions = await evaluationSubmissions(env, user, context);
  const configuration = await analyticsConfiguration(env, context);
  const grouped = new Map<string, EvaluationSubmission[]>();
  submissions.forEach((submission) => grouped.set(`${submission.audience}:${submission.instrumentSlug}`, [...(grouped.get(`${submission.audience}:${submission.instrumentSlug}`) || []), submission]));
  const instruments = [...grouped.entries()].map(([, group]) => {
    const values = group.map(primaryScore).filter((value): value is number => value !== null);
    return { instrumentSlug: group[0].instrumentSlug, instrumentName: group[0].instrumentName, audience: group[0].audience, submitted: group.length, scoreMean: round(mean(values)), scoreMin: values.length ? Math.min(...values) : null, scoreMax: values.length ? Math.max(...values) : null, smallSample: group.length < configuration.smallSampleWarningBelow };
  });
  await serviceRest(env, "audit_events", { method: "POST", headers: { prefer: "return=minimal" }, body: JSON.stringify({ organization_id: context.activeOrganizationId, actor_id: user.id, event_type: "quantified_evaluation_summary_accessed", subject_type: "evaluation_summary", metadata: { submissionCount: submissions.length } }) });
  return {
    instruments,
    submissions: submissions.map((submission) => ({
      userId: submission.userId,
      displayName: submission.displayName,
      email: submission.email,
      audience: submission.audience,
      instrumentSlug: submission.instrumentSlug,
      instrumentName: submission.instrumentName,
      submittedAt: submission.submittedAt,
      scores: submission.scores,
      waveLabel: submission.waveLabel,
    })),
    generatedAt: new Date().toISOString(),
  };
}

function asCsv(rows: Array<Record<string, unknown>>) {
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const cell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return [columns.map(cell).join(","), ...rows.map((row) => columns.map((column) => cell(row[column])).join(","))].join("\r\n");
}

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of data) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function little(value: number, bytes: number) { const output = new Uint8Array(bytes); for (let index = 0; index < bytes; index += 1) output[index] = (value >>> (index * 8)) & 0xff; return output; }
function concatenate(parts: Uint8Array[]) { const length = parts.reduce((sum, part) => sum + part.length, 0); const output = new Uint8Array(length); let offset = 0; parts.forEach((part) => { output.set(part, offset); offset += part.length; }); return output; }
function zipFiles(files: Array<{ name: string; content: string }>) {
  const encoder = new TextEncoder(); const localParts: Uint8Array[] = []; const centralParts: Uint8Array[] = []; let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name); const data = encoder.encode(file.content); const checksum = crc32(data);
    const local = concatenate([little(0x04034b50, 4), little(20, 2), little(0, 2), little(0, 2), little(0, 2), little(0, 2), little(checksum, 4), little(data.length, 4), little(data.length, 4), little(name.length, 2), little(0, 2), name, data]);
    const central = concatenate([little(0x02014b50, 4), little(20, 2), little(20, 2), little(0, 2), little(0, 2), little(0, 2), little(0, 2), little(checksum, 4), little(data.length, 4), little(data.length, 4), little(name.length, 2), little(0, 2), little(0, 2), little(0, 2), little(0, 2), little(0, 4), little(offset, 4), name]);
    localParts.push(local); centralParts.push(central); offset += local.length;
  }
  const central = concatenate(centralParts); const end = concatenate([little(0x06054b50, 4), little(0, 2), little(0, 2), little(files.length, 2), little(files.length, 2), little(central.length, 4), little(offset, 4), little(0, 2)]);
  return concatenate([...localParts, central, end]);
}
function xmlEscape(value: unknown) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }
function xlsxWorkbook(sheets: Array<{ name: string; rows: Array<Record<string, unknown>> }>) {
  const worksheetFiles = sheets.map((sheet, sheetIndex) => {
    const columns = [...new Set(sheet.rows.flatMap((row) => Object.keys(row)))]; const data = [Object.fromEntries(columns.map((column) => [column, column])), ...sheet.rows];
    const rows = data.map((row, rowIndex) => `<row r="${rowIndex + 1}">${columns.map((column, columnIndex) => `<c r="${String.fromCharCode(65 + (columnIndex % 26))}${rowIndex + 1}" t="inlineStr"><is><t>${xmlEscape(row[column])}</t></is></c>`).join("")}</row>`).join("");
    return { name: `xl/worksheets/sheet${sheetIndex + 1}.xml`, content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>` };
  });
  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sheet, index) => `<sheet name="${xmlEscape(sheet.name.slice(0, 31))}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}</sheets></workbook>`;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("")}</Relationships>`;
  return zipFiles([{ name: "[Content_Types].xml", content: contentTypes }, { name: "_rels/.rels", content: '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' }, { name: "xl/workbook.xml", content: workbook }, { name: "xl/_rels/workbook.xml.rels", content: workbookRels }, ...worksheetFiles]);
}

async function evaluationExport(url: URL, env: Env, user: AuthenticatedUser, context: AuthorizationContext) {
  requireStaffMfa(user); requireRole(context, "administrator"); requireCapability(context, "evaluation.raw_export");
  const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : "csv_zip"; const identifiable = url.searchParams.get("identity") === "identifiable";
  const purpose = (url.searchParams.get("purpose") || "").trim().slice(0, 500);
  if (!purpose) throw new HttpError(400, "Enter the purpose for this protected download.", "export_purpose_required");
  if (identifiable && url.searchParams.get("confirm") !== "IDENTIFIABLE") throw new HttpError(400, "Confirm the identifiable download before continuing.", "identifiable_confirmation_required");
  const submissions = await evaluationSubmissions(env, user, context); const codes = new Map<string, string>();
  for (const submission of submissions) codes.set(submission.userId, `NTP-${(await stableUuid(`export:${submission.userId}`)).replaceAll("-", "").slice(0, 10).toUpperCase()}`);
  const participants = [...new Map(submissions.map((submission) => [submission.userId, submission])).values()].map((submission) => ({ participant_id: codes.get(submission.userId), name: identifiable ? submission.displayName : "", email: identifiable ? submission.email : "", audience: submission.audience, cohort: submission.cohortName, institution: submission.institution, class_year: submission.classYear, attendance_count: submission.attendanceCount, completion_status: submission.completionStatus }));
  const responses = submissions.flatMap((submission) => Object.entries(submission.answers).map(([item_key, response_value]) => ({ participant_id: codes.get(submission.userId), audience: submission.audience, instrument_slug: submission.instrumentSlug, instrument_name: submission.instrumentName, wave_id: submission.waveId, wave_label: submission.waveLabel, item_key, response_value, submitted_at: submission.submittedAt })));
  const scores = submissions.flatMap((submission) => Object.entries(submission.scores).map(([score_key, score_value]) => ({ participant_id: codes.get(submission.userId), audience: submission.audience, instrument_slug: submission.instrumentSlug, wave_label: submission.waveLabel, score_key, score_value, provisional: submission.instrumentSlug === "advisor-coaching-competency-scale" })));
  const waves = [...new Map(submissions.map((submission) => [submission.waveId, submission])).values()].map((submission) => ({ wave_id: submission.waveId, wave_label: submission.waveLabel, audience: submission.audience, instrument_slug: submission.instrumentSlug }));
  const attendance = participants.map((participant) => ({ participant_id: participant.participant_id, present_sessions: participant.attendance_count, completion_status: participant.completion_status }));
  const dictionary = [{ table: "participants", description: identifiable ? "Participant directory with names and email addresses" : "De-identified participant directory" }, { table: "responses", description: "One row per submitted survey item response" }, { table: "scores", description: "Approved or staging calculation outputs; ACCS values remain provisional" }, { table: "waves", description: "Survey wave and audience lookup" }, { table: "attendance", description: "Attendance and program completion fields" }, { table: "activities", description: "Grant activity milestones when enabled" }, { table: "qualitative_codes", description: "Human-approved qualitative coding records" }];
  const sheets = [{ name: "Participants", rows: participants }, { name: "Responses", rows: responses }, { name: "Scores", rows: scores }, { name: "Waves", rows: waves }, { name: "Attendance", rows: attendance }, { name: "Activities", rows: [] }, { name: "Qualitative Codes", rows: [] }, { name: "Data Dictionary", rows: dictionary }];
  const bytes = format === "xlsx" ? xlsxWorkbook(sheets) : zipFiles(sheets.map((sheet) => ({ name: `${sheet.name.toLowerCase().replaceAll(" ", "_")}.csv`, content: asCsv(sheet.rows) })));
  await serviceRest(env, "audit_events", { method: "POST", headers: { prefer: "return=minimal" }, body: JSON.stringify({ organization_id: context.activeOrganizationId, actor_id: user.id, event_type: identifiable ? "identifiable_evaluation_export_downloaded" : "deidentified_evaluation_export_downloaded", subject_type: "evaluation_export", metadata: { format, purpose, rowCount: responses.length } }) });
  const filename = `navigate-evaluation-${identifiable ? "identifiable" : "deidentified"}.${format === "xlsx" ? "xlsx" : "zip"}`;
  return new Response(bytes, { headers: { "content-type": format === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/zip", "content-disposition": `attachment; filename="${filename}"`, "cache-control": "no-store" } });
}

async function principalOverview(env: Env, user: AuthenticatedUser, context: AuthorizationContext) {
  requireStaffMfa(user); requireRole(context, "administrator");
  const organizationId = context.activeOrganizationId;
  if (!organizationId) throw new HttpError(409, "Choose an active organization first.", "active_organization_required");
  const assignments = await serviceRest<Array<{ user_id: string; permission_key: string }>>(env, `permission_assignments?organization_id=eq.${encodeURIComponent(organizationId)}&permission_key=in.(platform.creator,platform.principal_investigator)&revoked_at=is.null&select=user_id,permission_key`);
  const ids = [...new Set(assignments.map((assignment) => assignment.user_id))]; const profiles = ids.length ? await serviceRest<Array<{ user_id: string; display_name: string; preferred_name: string | null }>>(env, `profiles?user_id=in.(${ids.join(",")})&select=user_id,display_name,preferred_name`) : [];
  const authUsers = await supabaseAuthUsers(env); const profileMap = new Map(profiles.map((profile) => [profile.user_id, profile])); const authMap = new Map(authUsers.map((entry) => [entry.id, entry]));
  const present = (permission: string) => {
    const assignment = assignments.find((entry) => entry.permission_key === permission); if (!assignment) return null;
    const profile = profileMap.get(assignment.user_id); const auth = authMap.get(assignment.user_id);
    return { userId: assignment.user_id, displayName: profile?.preferred_name || profile?.display_name || auth?.email?.split("@")[0] || "Principal", email: auth?.email || "" };
  };
  return { principalType: context.capabilities.includes("platform.creator") ? "creator" : context.capabilities.includes("platform.principal_investigator") ? "principal_investigator" : null, acknowledged: Boolean(context.principalAcknowledged), creator: present("platform.creator"), principalInvestigator: present("platform.principal_investigator"), canInitiateDestructiveActions: context.capabilities.includes("platform.creator"), canApproveGovernance: context.capabilities.includes("platform.principal_investigator") || context.capabilities.includes("platform.creator") };
}

async function acknowledgePrincipal(env: Env, user: AuthenticatedUser, context: AuthorizationContext) {
  requireStaffMfa(user); requireRole(context, "administrator");
  if (!context.capabilities.includes("platform.creator") && !context.capabilities.includes("platform.principal_investigator")) throw new HttpError(403, "Principal access is not assigned to this account.", "principal_required");
  await serviceRest(env, "audit_events", { method: "POST", headers: { prefer: "return=minimal" }, body: JSON.stringify({ organization_id: context.activeOrganizationId, actor_id: user.id, event_type: "principal_onboarding_acknowledged", subject_type: "principal", subject_id: user.id, metadata: { principalType: context.capabilities.includes("platform.creator") ? "creator" : "principal_investigator" } }) });
  return { ok: true };
}

async function designatePrincipalInvestigator(request: Request, env: Env, user: AuthenticatedUser, context: AuthorizationContext) {
  requireStaffMfa(user); requireRole(context, "administrator"); requireCapability(context, "platform.creator");
  const body = await readBody(request); const targetUserId = String(body.userId || "");
  if (!/^[0-9a-f-]{36}$/i.test(targetUserId) || targetUserId === user.id) throw new HttpError(400, "Choose a different administrator account for the Principal Investigator.", "invalid_principal_investigator");
  const adminRole = await serviceRest<Array<{ id: string }>>(env, `role_assignments?user_id=eq.${encodeURIComponent(targetUserId)}&role=eq.administrator&organization_id=eq.${encodeURIComponent(context.activeOrganizationId || "")}&revoked_at=is.null&select=id&limit=1`);
  if (!adminRole.length) throw new HttpError(409, "The Principal Investigator must have an active Administrator role.", "administrator_role_required");
  const prior = await serviceRest<Array<{ user_id: string }>>(env, `permission_assignments?organization_id=eq.${encodeURIComponent(context.activeOrganizationId || "")}&permission_key=eq.platform.principal_investigator&revoked_at=is.null&select=user_id`);
  for (const assignment of prior.filter((entry) => entry.user_id !== targetUserId)) await serviceRest(env, `permission_assignments?user_id=eq.${encodeURIComponent(assignment.user_id)}&permission_key=eq.platform.principal_investigator&organization_id=eq.${encodeURIComponent(context.activeOrganizationId || "")}`, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify({ revoked_at: new Date().toISOString() }) });
  await grantCapabilities(env, user.id, targetUserId, context, principalInvestigatorCapabilities);
  await serviceRest(env, "audit_events", { method: "POST", headers: { prefer: "return=minimal" }, body: JSON.stringify({ organization_id: context.activeOrganizationId, actor_id: user.id, event_type: "principal_investigator_designated", subject_type: "profile", subject_id: targetUserId }) });
  return { ok: true, userId: targetUserId };
}

async function pilotResetPreview(env: Env, user: AuthenticatedUser, context: AuthorizationContext) {
  requireStaffMfa(user); requireRole(context, "administrator"); requireCapability(context, "pilot.reset_records");
  const organizationId = encodeURIComponent(context.activeOrganizationId || "");
  const tables = ["artifacts", "portfolio_documents", "attendance", "attendance_changes", "advising_packets", "comments", "survey_completion_projection", "grant_outcome_checkpoints"];
  const counts: Record<string, number> = {};
  for (const table of tables) {
    const rows = await optionalServiceRest<Array<{ id?: string; assignment_id?: string }>>(env, `${table}?organization_id=eq.${organizationId}&select=${table === "survey_completion_projection" ? "assignment_id" : "id"}`, []);
    counts[table] = rows.length;
  }
  return { counts, preserves: ["accounts", "roles", "principal designations", "program configuration", "survey definitions", "audit history"] };
}

type GovernanceEvent = { actor_id: string; event_type: string; subject_id: string; metadata: Record<string, unknown>; created_at: string };
async function governanceEvents(env: Env, requestId?: string) {
  return serviceRest<GovernanceEvent[]>(env, `audit_events?subject_type=eq.governance_request${requestId ? `&subject_id=eq.${encodeURIComponent(requestId)}` : ""}&event_type=in.(governance_request_created,governance_request_approved,governance_request_rejected,governance_request_cancelled,governance_request_executed)&select=actor_id,event_type,subject_id,metadata,created_at&order=created_at.asc`);
}
function presentGovernanceRequests(events: GovernanceEvent[]) {
  const grouped = new Map<string, GovernanceEvent[]>(); events.forEach((event) => grouped.set(event.subject_id, [...(grouped.get(event.subject_id) || []), event]));
  return [...grouped.entries()].map(([id, group]) => {
    const created = group.find((event) => event.event_type === "governance_request_created")!; const final = group[group.length - 1]; const approved = group.find((event) => event.event_type === "governance_request_approved");
    const rawStatus = final.event_type.replace("governance_request_", ""); const expiresAt = String(created.metadata.expiresAt || "");
    const status = rawStatus === "created" ? (expiresAt && new Date(expiresAt) < new Date() ? "expired" : "pending") : rawStatus;
    return { id, requestType: String(created.metadata.requestType || "pilot_reset"), subjectId: created.metadata.subjectId ? String(created.metadata.subjectId) : null, status, manifest: (created.metadata.manifest || {}) as Record<string, unknown>, initiatedBy: created.actor_id, approvedBy: approved?.actor_id || null, expiresAt, createdAt: created.created_at };
  }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

async function createGovernanceRequest(request: Request, env: Env, user: AuthenticatedUser, context: AuthorizationContext) {
  requireStaffMfa(user); requireRole(context, "administrator");
  const body = await readBody(request); const requestType = String(body.requestType || "");
  if (!["pilot_reset", "account_purge", "survey_publication", "grant_checkpoints_activation"].includes(requestType)) throw new HttpError(400, "Choose a valid governance request.", "invalid_governance_request");
  const destructive = ["pilot_reset", "account_purge"].includes(requestType);
  if (destructive) requireCapability(context, "platform.creator");
  else if (!context.capabilities.includes("platform.creator") && !context.capabilities.includes("platform.principal_investigator")) throw new HttpError(403, "A principal must initiate this governance request.", "principal_required");
  if (["pilot_reset", "account_purge"].includes(requestType) && !context.capabilities.includes(requestType === "pilot_reset" ? "pilot.reset_records" : "accounts.purge")) throw new HttpError(403, "This account cannot request that destructive action.", "capability_required");
  const manifest = requestType === "pilot_reset" ? (await pilotResetPreview(env, user, context)).counts : { retentionReviewRequired: requestType === "account_purge" };
  const id = crypto.randomUUID(); const subjectId = body.subjectId ? String(body.subjectId) : null; const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  if (requestType === "account_purge" && subjectId) await deactivateAccount(env, user, context, subjectId, true);
  await serviceRest(env, "audit_events", { method: "POST", headers: { prefer: "return=minimal" }, body: JSON.stringify({ organization_id: context.activeOrganizationId, actor_id: user.id, event_type: "governance_request_created", subject_type: "governance_request", subject_id: id, metadata: { requestType, subjectId, manifest, expiresAt, purpose: String(body.purpose || "").slice(0, 500), eligibleAt: requestType === "account_purge" ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() : null } }) });
  return { ok: true, id, expiresAt };
}

async function decideGovernanceRequest(request: Request, env: Env, user: AuthenticatedUser, context: AuthorizationContext, requestId: string) {
  requireStaffMfa(user); requireRole(context, "administrator");
  if (!context.capabilities.includes("platform.creator") && !context.capabilities.includes("platform.principal_investigator")) throw new HttpError(403, "A principal must review this request.", "principal_required");
  const events = await governanceEvents(env, requestId); const presented = presentGovernanceRequests(events)[0];
  if (!presented || presented.status !== "pending") throw new HttpError(409, "That request is no longer pending.", "governance_request_not_pending");
  if (presented.initiatedBy === user.id) throw new HttpError(409, "A principal cannot approve their own request.", "self_approval_denied");
  const body = await readBody(request); const decision = body.decision === "approve" ? "approved" : "rejected";
  if (presented.requestType === "account_purge" && decision === "approved" && body.retentionCleared !== true) throw new HttpError(400, "Confirm that consent and retention obligations were reviewed.", "retention_review_required");
  await serviceRest(env, "audit_events", { method: "POST", headers: { prefer: "return=minimal" }, body: JSON.stringify({ organization_id: context.activeOrganizationId, actor_id: user.id, event_type: `governance_request_${decision}`, subject_type: "governance_request", subject_id: requestId, metadata: { note: String(body.note || "").slice(0, 1000), retentionCleared: body.retentionCleared === true } }) });
  return { ok: true, status: decision };
}

async function deleteStorageObject(env: Env, path: string) {
  const response = await fetch(`${env.SUPABASE_URL}/storage/v1/object/pilot-portfolio/${path.split("/").map(encodeURIComponent).join("/")}`, { method: "DELETE", headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } });
  if (!response.ok && response.status !== 404) console.warn(JSON.stringify({ event: "portfolio_object_delete_failed", status: response.status }));
}

async function executePilotReset(env: Env, user: AuthenticatedUser, context: AuthorizationContext, requestId: string) {
  requireStaffMfa(user); requireRole(context, "administrator"); requireCapability(context, "platform.creator"); requireCapability(context, "pilot.reset_records");
  const presented = presentGovernanceRequests(await governanceEvents(env, requestId))[0];
  if (!presented || presented.requestType !== "pilot_reset" || presented.status !== "approved") throw new HttpError(409, "An approved pilot reset request is required.", "approved_reset_required");
  const documents = await serviceRest<Array<{ storage_path: string }>>(env, `portfolio_documents?organization_id=eq.${encodeURIComponent(context.activeOrganizationId || "")}&select=storage_path`);
  for (const document of documents) await deleteStorageObject(env, document.storage_path);
  const deleteTable = async (table: string) => { try { await serviceRest(env, `${table}?organization_id=eq.${encodeURIComponent(context.activeOrganizationId || "")}`, { method: "DELETE", headers: { prefer: "return=minimal" } }); } catch { if (!["grant_outcome_checkpoints"].includes(table)) throw new HttpError(500, "The pilot reset stopped before completion.", "reset_failed"); } };
  for (const table of ["advising_packets", "portfolio_documents", "artifacts", "attendance", "survey_completion_projection", "grant_outcome_checkpoints"]) await deleteTable(table);
  await optionalServiceMutation(env, "rpc/reset_evaluation_pilot_records", { method: "POST", headers: { prefer: "return=minimal" }, body: JSON.stringify({ target_organization_id: context.activeOrganizationId }) });
  await serviceRest(env, "audit_events", { method: "POST", headers: { prefer: "return=minimal" }, body: JSON.stringify({ organization_id: context.activeOrganizationId, actor_id: user.id, event_type: "governance_request_executed", subject_type: "governance_request", subject_id: requestId, metadata: { requestType: "pilot_reset" } }) });
  return { ok: true };
}

async function updateAuthBan(env: Env, userId: string, banned: boolean) {
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`, { method: "PUT", headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "content-type": "application/json" }, body: JSON.stringify({ ban_duration: banned ? "876000h" : "none" }) });
  if (!response.ok) throw new HttpError(400, banned ? "The account could not be deactivated." : "The account could not be restored.", "account_lifecycle_failed");
}

async function protectedPrincipal(env: Env, context: AuthorizationContext, targetUserId: string) {
  const rows = await serviceRest<Array<{ permission_key: string }>>(env, `permission_assignments?user_id=eq.${encodeURIComponent(targetUserId)}&organization_id=eq.${encodeURIComponent(context.activeOrganizationId || "")}&permission_key=in.(platform.creator,platform.principal_investigator)&revoked_at=is.null&select=permission_key`);
  return rows.map((row) => row.permission_key);
}

async function deactivateAccount(env: Env, user: AuthenticatedUser, context: AuthorizationContext, targetUserId: string, purgeRequested = false) {
  requireStaffMfa(user); requireRole(context, "administrator"); requireCapability(context, "accounts.manage");
  const protectedCapabilities = await protectedPrincipal(env, context, targetUserId);
  if (protectedCapabilities.includes("platform.creator")) throw new HttpError(409, "The Creator account cannot be deactivated.", "creator_account_protected");
  if (protectedCapabilities.includes("platform.principal_investigator")) throw new HttpError(409, "Designate another Principal Investigator before deactivating this account.", "principal_investigator_protected");
  await updateAuthBan(env, targetUserId, true);
  await serviceRest(env, `profiles?user_id=eq.${encodeURIComponent(targetUserId)}`, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify({ status: "suspended", updated_at: new Date().toISOString() }) });
  const deactivatedAt = new Date().toISOString(); const purgeEligibleAt = purgeRequested ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() : null;
  await optionalServiceMutation(env, "account_lifecycle?on_conflict=user_id", { method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ user_id: targetUserId, organization_id: context.activeOrganizationId, program_id: context.activeProgramId, status: purgeRequested ? "purge_requested" : "deactivated", deactivated_by: user.id, deactivated_at: deactivatedAt, purge_eligible_at: purgeEligibleAt, updated_at: deactivatedAt }) });
  await serviceRest(env, "audit_events", { method: "POST", headers: { prefer: "return=minimal" }, body: JSON.stringify({ organization_id: context.activeOrganizationId, actor_id: user.id, event_type: purgeRequested ? "account_purge_requested_and_deactivated" : "account_deactivated", subject_type: "profile", subject_id: targetUserId, metadata: { purgeEligibleAt: purgeRequested ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() : null } }) });
  return { ok: true };
}

async function restoreAccount(env: Env, user: AuthenticatedUser, context: AuthorizationContext, targetUserId: string) {
  requireStaffMfa(user); requireRole(context, "administrator"); requireCapability(context, "accounts.manage");
  await updateAuthBan(env, targetUserId, false);
  await serviceRest(env, `profiles?user_id=eq.${encodeURIComponent(targetUserId)}`, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify({ status: "active", updated_at: new Date().toISOString() }) });
  await optionalServiceMutation(env, `account_lifecycle?user_id=eq.${encodeURIComponent(targetUserId)}`, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify({ status: "active", restored_by: user.id, restored_at: new Date().toISOString(), purge_eligible_at: null, updated_at: new Date().toISOString() }) });
  await serviceRest(env, "audit_events", { method: "POST", headers: { prefer: "return=minimal" }, body: JSON.stringify({ organization_id: context.activeOrganizationId, actor_id: user.id, event_type: "account_restored", subject_type: "profile", subject_id: targetUserId }) });
  return { ok: true };
}

async function executeAccountPurge(env: Env, user: AuthenticatedUser, context: AuthorizationContext, requestId: string) {
  requireStaffMfa(user); requireRole(context, "administrator"); requireCapability(context, "platform.creator"); requireCapability(context, "accounts.purge");
  const events = await governanceEvents(env, requestId); const presented = presentGovernanceRequests(events)[0]; const created = events.find((event) => event.event_type === "governance_request_created");
  if (!presented || presented.requestType !== "account_purge" || presented.status !== "approved" || !presented.subjectId) throw new HttpError(409, "An approved account purge request is required.", "approved_purge_required");
  const eligibleAt = new Date(String(created?.metadata.eligibleAt || "")); if (!Number.isFinite(eligibleAt.getTime()) || eligibleAt > new Date()) throw new HttpError(409, "The seven-day recovery period has not ended.", "purge_recovery_period_active");
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(presented.subjectId)}`, { method: "DELETE", headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } });
  if (!response.ok) throw new HttpError(400, "The account purge could not be completed.", "account_purge_failed");
  await serviceRest(env, "audit_events", { method: "POST", headers: { prefer: "return=minimal" }, body: JSON.stringify({ organization_id: context.activeOrganizationId, actor_id: user.id, event_type: "governance_request_executed", subject_type: "governance_request", subject_id: requestId, metadata: { requestType: "account_purge", purgedUserId: presented.subjectId } }) });
  return { ok: true };
}

async function executeGovernanceApproval(env: Env, user: AuthenticatedUser, context: AuthorizationContext, requestId: string) {
  requireStaffMfa(user); requireRole(context, "administrator");
  if (!context.capabilities.includes("platform.creator") && !context.capabilities.includes("platform.principal_investigator")) throw new HttpError(403, "A principal must execute this approved action.", "principal_required");
  const presented = presentGovernanceRequests(await governanceEvents(env, requestId))[0];
  if (!presented || presented.status !== "approved" || !["survey_publication", "grant_checkpoints_activation"].includes(presented.requestType)) throw new HttpError(409, "An approved governance request is required.", "approved_governance_request_required");
  if (presented.requestType === "grant_checkpoints_activation" && context.activeProgramId) {
    const rows = await serviceRest<Array<{ settings: Record<string, unknown> }>>(env, `programs?id=eq.${encodeURIComponent(context.activeProgramId)}&select=settings&limit=1`);
    const settings = rows[0]?.settings || {}; const analytics = { ...defaultAnalyticsConfiguration, ...((settings.surveyAnalytics || {}) as Partial<AnalyticsConfiguration>), grantCheckpointsStatus: "enabled" };
    await serviceRest(env, `programs?id=eq.${encodeURIComponent(context.activeProgramId)}`, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify({ settings: { ...settings, surveyAnalytics: analytics } }) });
  }
  await serviceRest(env, "audit_events", { method: "POST", headers: { prefer: "return=minimal" }, body: JSON.stringify({ organization_id: context.activeOrganizationId, actor_id: user.id, event_type: "governance_request_executed", subject_type: "governance_request", subject_id: requestId, metadata: { requestType: presented.requestType } }) });
  return { ok: true };
}

function suggestedThemes(responses: Array<{ text: string }>) {
  const stop = new Set(["about", "after", "again", "also", "because", "being", "could", "from", "have", "into", "more", "that", "their", "there", "these", "they", "this", "through", "want", "were", "what", "when", "where", "which", "with", "would", "your"]);
  const counts = new Map<string, number>(); responses.forEach((response) => new Set(response.text.toLowerCase().match(/[a-z]{4,}/g) || []).forEach((word) => { if (!stop.has(word)) counts.set(word, (counts.get(word) || 0) + 1); }));
  return [...counts.entries()].filter(([, count]) => count >= 2).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([label, responseCount]) => ({ id: `suggested:${label}`, label: label[0].toUpperCase() + label.slice(1), keywords: [label], responseCount, status: "suggested", reviewedLabel: null }));
}

async function qualitativeWorkspace(env: Env, user: AuthenticatedUser, context: AuthorizationContext) {
  requireStaffMfa(user); requireRole(context, "administrator"); requireCapability(context, "evaluation.qualitative_analysis");
  const submissions = (await evaluationSubmissions(env, user, context)).filter((submission) => submission.instrumentSlug === "pre-health-application-profile");
  const responses = submissions.flatMap((submission) => Object.entries(submission.answers).filter(([, value]) => Number.isNaN(Number(value)) && value.trim()).map(([itemKey, text]) => ({ responseSetId: submission.assignmentId, participantId: submission.userId, itemKey, text, codes: [] as string[] })));
  const codebooks = await optionalServiceRest<Array<{ id: string }>>(env, `qualitative_codebooks?organization_id=eq.${encodeURIComponent(context.activeOrganizationId || "")}&program_id=eq.${encodeURIComponent(context.activeProgramId || "")}&instrument_slug=eq.pre-health-application-profile&status=eq.active&select=id&limit=1`, []);
  const codes = codebooks[0] ? await optionalServiceRest<Array<{ id: string; label: string; description: string; color: string }>>(env, `qualitative_codes?codebook_id=eq.${encodeURIComponent(codebooks[0].id)}&select=id,label,description,color`, []) : [];
  const codings = await optionalServiceRest<Array<{ response_set_id: string; item_key: string; code_id: string }>>(env, `qualitative_response_codings?select=response_set_id,item_key,code_id`, []);
  const codingMap = new Map<string, string[]>(); codings.forEach((coding) => codingMap.set(`${coding.response_set_id}:${coding.item_key}`, [...(codingMap.get(`${coding.response_set_id}:${coding.item_key}`) || []), coding.code_id]));
  const reviewed = await optionalServiceRest<Array<{ id: string; label: string; keywords: string[]; response_count: number; status: string; reviewed_label: string | null }>>(env, `qualitative_theme_suggestions?organization_id=eq.${encodeURIComponent(context.activeOrganizationId || "")}&program_id=eq.${encodeURIComponent(context.activeProgramId || "")}&instrument_slug=eq.pre-health-application-profile&select=id,label,keywords,response_count,status,reviewed_label`, []);
  const suggestions = reviewed.length ? reviewed.map((item) => ({ id: item.id, label: item.label, keywords: item.keywords, responseCount: item.response_count, status: item.status, reviewedLabel: item.reviewed_label })) : suggestedThemes(responses);
  return { responses: responses.map((response) => ({ ...response, codes: codingMap.get(`${response.responseSetId}:${response.itemKey}`) || [] })), codes, suggestions };
}

async function updateQualitativeWorkspace(request: Request, env: Env, user: AuthenticatedUser, context: AuthorizationContext) {
  requireStaffMfa(user); requireRole(context, "administrator"); requireCapability(context, "evaluation.qualitative_analysis");
  if (!context.activeOrganizationId || !context.activeProgramId) throw new HttpError(409, "Choose an active program first.", "active_program_required");
  const body = await readBody(request); const action = String(body.action || "");
  const ensureCodebook = async () => {
    const existing = await serviceRest<Array<{ id: string }>>(env, `qualitative_codebooks?organization_id=eq.${encodeURIComponent(context.activeOrganizationId || "")}&program_id=eq.${encodeURIComponent(context.activeProgramId || "")}&instrument_slug=eq.pre-health-application-profile&status=eq.active&select=id&limit=1`);
    if (existing[0]) return existing[0].id;
    const created = await serviceRest<Array<{ id: string }>>(env, "qualitative_codebooks", { method: "POST", headers: { prefer: "return=representation" }, body: JSON.stringify({ organization_id: context.activeOrganizationId, program_id: context.activeProgramId, instrument_slug: "pre-health-application-profile", name: "Self-Assessment Codebook", version: 1, status: "active", created_by: user.id }) });
    return created[0].id;
  };
  if (action === "create_code") {
    const label = String(body.label || "").trim().slice(0, 100); if (!label) throw new HttpError(400, "Enter a code label.", "code_label_required");
    await serviceRest(env, "qualitative_codes", { method: "POST", headers: { prefer: "return=minimal" }, body: JSON.stringify({ codebook_id: await ensureCodebook(), label, description: String(body.description || "").slice(0, 500), color: String(body.color || "#7b163a"), created_by: user.id }) });
  } else if (action === "tag_response") {
    const codeId = String(body.codeId || ""); const responseSetId = String(body.responseSetId || ""); const itemKey = String(body.itemKey || ""); const excerpt = String(body.excerpt || "").slice(0, 2000);
    if (!codeId || !responseSetId || !itemKey || !excerpt) throw new HttpError(400, "Choose a response and code.", "coding_fields_required");
    await serviceRest(env, "qualitative_response_codings?on_conflict=response_set_id,item_key,code_id,coded_by", { method: "POST", headers: { prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ response_set_id: responseSetId, item_key: itemKey, code_id: codeId, excerpt, coded_by: user.id }) });
  } else if (action === "review_suggestion") {
    const status = String(body.status || ""); if (!["accepted", "renamed", "merged", "rejected"].includes(status)) throw new HttpError(400, "Choose a valid review decision.", "theme_decision_required");
    const label = String(body.label || "").trim().slice(0, 100); if (!label) throw new HttpError(400, "A theme label is required.", "theme_label_required");
    await serviceRest(env, "qualitative_theme_suggestions", { method: "POST", headers: { prefer: "return=minimal" }, body: JSON.stringify({ organization_id: context.activeOrganizationId, program_id: context.activeProgramId, instrument_slug: "pre-health-application-profile", label, keywords: Array.isArray(body.keywords) ? body.keywords.map(String).slice(0, 20) : [], response_count: Number(body.responseCount || 0), status, reviewed_label: String(body.reviewedLabel || label).slice(0, 100), reviewed_by: user.id, reviewed_at: new Date().toISOString() }) });
  } else throw new HttpError(400, "Choose a valid qualitative analysis action.", "invalid_qualitative_action");
  await serviceRest(env, "audit_events", { method: "POST", headers: { prefer: "return=minimal" }, body: JSON.stringify({ organization_id: context.activeOrganizationId, actor_id: user.id, event_type: `qualitative_${action}`, subject_type: "qualitative_analysis", metadata: { action } }) });
  return qualitativeWorkspace(env, user, context);
}

async function inviteAccount(request: Request, env: Env, user: AuthenticatedUser, context: AuthorizationContext) {
  requireStaffMfa(user); requireRole(context, "administrator");
  const body = await readBody(request);
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const roles = Array.isArray(body.roles) ? body.roles.filter((item): item is string => ["student", "advisor", "administrator"].includes(String(item))) : [];
  if (!email || !email.includes("@") || !roles.length) throw new HttpError(400, "Provide an email and at least one valid role.", "invalid_invitation");
  const invite = await fetch(`${env.SUPABASE_URL}/auth/v1/invite`, {
    method: "POST",
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ email, redirect_to: env.INVITE_REDIRECT_URL, data: { pilot_environment: env.PILOT_ENVIRONMENT } }),
  });
  if (!invite.ok) {
    console.warn(JSON.stringify({ event: "pilot_invitation_failed", actor: user.id, status: invite.status }));
    throw new HttpError(400, "The invitation could not be sent. Confirm the address and try again.", "invitation_failed");
  }
  const invited = await invite.json() as { id: string };
  await rpc(env, user.token, "admin_assign_invited_user", {
    target_user_id: invited.id,
    target_email: email,
    target_roles: roles,
    target_organization_id: body.organizationId || null,
    target_program_id: body.programId || null,
    target_cohort_id: body.cohortId || null,
  });
  console.log(JSON.stringify({ event: "pilot_invitation_created", actor: user.id, invited_user: invited.id, roles }));
  return json({ ok: true, userId: invited.id });
}

async function resendInvitation(request: Request, env: Env, user: AuthenticatedUser, context: AuthorizationContext) {
  requireStaffMfa(user);
  requireRole(context, "administrator");
  if (!context.activeOrganizationId) throw new HttpError(409, "Choose an active organization before resending an invitation.", "active_organization_required");

  const body = await readBody(request);
  const targetUserId = typeof body.userId === "string" ? body.userId.trim() : "";
  if (!/^[0-9a-f-]{36}$/i.test(targetUserId)) throw new HttpError(400, "Choose a valid invited account.", "invalid_invited_account");

  const assignments = await serviceRest<Array<{ user_id: string }>>(
    env,
    `role_assignments?organization_id=eq.${encodeURIComponent(context.activeOrganizationId)}&user_id=eq.${encodeURIComponent(targetUserId)}&revoked_at=is.null&select=user_id&limit=1`,
  );
  if (!assignments.length) throw new HttpError(404, "The invited account could not be found.", "invited_account_not_found");

  const invitedUser = await supabaseAuthUser(env, targetUserId);
  const email = invitedUser.email?.trim().toLowerCase() || "";
  if (!email) throw new HttpError(409, "This account does not have an email address to resend.", "invited_email_missing");
  if (invitedUser.email_confirmed_at || invitedUser.confirmed_at) {
    throw new HttpError(409, "This account is already confirmed and does not need another invitation.", "invitation_already_confirmed");
  }

  const lastSentAt = invitedUser.confirmation_sent_at || invitedUser.invited_at;
  if (lastSentAt && Date.now() - new Date(lastSentAt).getTime() < 60_000) {
    throw new HttpError(429, "Please wait one minute before resending this invitation.", "invitation_resend_too_soon");
  }

  const invite = await fetch(`${env.SUPABASE_URL}/auth/v1/invite`, {
    method: "POST",
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ email, redirect_to: env.INVITE_REDIRECT_URL, data: { pilot_environment: env.PILOT_ENVIRONMENT } }),
  });
  if (!invite.ok) {
    const details = await invite.json().catch(() => ({})) as { code?: string };
    console.warn(JSON.stringify({ event: "pilot_invitation_resend_failed", actor: user.id, invited_user: targetUserId, status: invite.status, code: details.code || "unknown" }));
    throw new HttpError(invite.status === 429 ? 429 : 400, "The invitation could not be resent. Wait a moment and try again.", "invitation_resend_failed");
  }

  await serviceRest(env, "audit_events", {
    method: "POST",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify({
      organization_id: context.activeOrganizationId,
      actor_id: user.id,
      event_type: "account_invitation_resent",
      subject_type: "profile",
      subject_id: targetUserId,
      metadata: { email },
    }),
  });
  console.log(JSON.stringify({ event: "pilot_invitation_resent", actor: user.id, invited_user: targetUserId }));
  return json({ ok: true, userId: targetUserId, sentAt: new Date().toISOString() });
}

async function route(request: Request, env: Env) {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  if (url.pathname === "/api/health") return json({ ok: true, environment: env.PILOT_ENVIRONMENT });

  const user = await authenticate(request, env);
  if (url.pathname === "/api/me" && request.method === "GET") {
    const context = await enrichPrincipalContext(env, user, await authorization(env, user));
    await recordAccessEvent(env, user, context, "user_session_opened");
    return json(context);
  }
  if (url.pathname === "/api/activity/heartbeat" && request.method === "POST") {
    const context = await authorization(env, user);
    const body = await readBody(request);
    const role = typeof body.role === "string" && context.roles.includes(body.role) ? body.role : undefined;
    await recordAccessEvent(env, user, context, "user_session_heartbeat", role);
    return json({ ok: true });
  }
  if (url.pathname === "/api/activity/signout" && request.method === "POST") {
    const context = await authorization(env, user);
    const body = await readBody(request);
    const role = typeof body.role === "string" && context.roles.includes(body.role) ? body.role : undefined;
    await recordAccessEvent(env, user, context, "user_session_signed_out", role);
    return json({ ok: true });
  }
  if (url.pathname === "/api/dashboard" && request.method === "GET") {
    const role = url.searchParams.get("role") || "";
    if (!["student", "advisor", "administrator"].includes(role)) throw new HttpError(400, "Choose a valid dashboard.", "invalid_role");
    const context = await authorization(env, user);
    requireRole(context, role);
    if (role !== "student") requireStaffMfa(user);
    if (role === "student" || role === "advisor") await ensureStagingSurveyAssignments(env, user, context, [role]);
    const dashboard = stagingEnabledAssignments(env, await rpc(env, user.token, "pilot_dashboard", { requested_role: role }));
    if (role === "administrator") dashboard.surveyCompletion = await adminSurveyCompletion(env, context);
    return json(role === "advisor" ? await stagingAdvisorSelf(env, user, context, dashboard) : dashboard);
  }
  if (url.pathname === "/api/artifacts" && (request.method === "GET" || request.method === "POST")) return pathwayArtifacts(request, env, user);
  if (url.pathname === "/api/pathway/primer" && (request.method === "GET" || request.method === "PUT")) return pathwayPrimer(request, env, user);
  if (url.pathname === "/api/cohort/posts" && (request.method === "GET" || request.method === "POST")) return cohortBoard(request, env, user);
  if (url.pathname === "/api/advising/share" && ["GET", "POST", "DELETE"].includes(request.method)) return studentAdvisingShare(request, env, user);
  const advisorPacket = url.pathname.match(/^\/api\/advisor\/students\/([0-9a-f-]+)\/packet$/i);
  if (advisorPacket && (request.method === "GET" || request.method === "POST")) return advisorStudentPacket(request, env, user, advisorPacket[1]);
  if (url.pathname === "/api/portfolio/documents" && request.method === "POST") return portfolioDocumentMetadata(request, env, user);
  if (url.pathname === "/api/surveys/assignments" && request.method === "GET") {
    const context = await authorization(env, user);
    const audiences = [context.roles.includes("student") ? "student" : null, context.roles.includes("advisor") ? "advisor" : null].filter((audience): audience is "student" | "advisor" => audience !== null);
    await ensureStagingSurveyAssignments(env, user, context, audiences);
    return json(stagingEnabledAssignments(env, { surveyAssignments: await rpc(env, user.token, "my_survey_assignments") }).surveyAssignments);
  }
  const assignment = url.pathname.match(/^\/api\/surveys\/assignments\/([0-9a-f-]+)$/i);
  if (assignment && request.method === "GET") return json(await stagingSurveyDetail(env, user, assignment[1]));
  const draft = url.pathname.match(/^\/api\/surveys\/response-sets\/([0-9a-f-]+)\/draft$/i);
  if (draft && request.method === "PUT") {
    const staging = await saveStagingSurvey(request.clone(), env, user, draft[1], false);
    if (staging) return json(staging);
    const body = await readBody(request);
    return json(await rpc(env, user.token, "save_my_survey_draft", { assignment_id: draft[1], consent_version_id: body.consentVersionId, answers: body.answers || {} }));
  }
  const submit = url.pathname.match(/^\/api\/surveys\/response-sets\/([0-9a-f-]+)\/submit$/i);
  if (submit && request.method === "POST") {
    const staging = await saveStagingSurvey(request, env, user, submit[1], true);
    if (staging) return json(staging);
    return json(await rpc(env, user.token, "submit_my_survey_response", { assignment_id: submit[1] }));
  }

  if (url.pathname === "/api/admin/invitations" && request.method === "POST") {
    const context = await authorization(env, user);
    return inviteAccount(request, env, user, context);
  }
  if (url.pathname === "/api/admin/invitations/resend" && request.method === "POST") {
    const context = await authorization(env, user);
    return resendInvitation(request, env, user, context);
  }
  if (url.pathname === "/api/admin/survey-waves" && request.method === "GET") {
    requireStaffMfa(user); const context = await authorization(env, user); requireRole(context, "administrator");
    return json(await rpc(env, user.token, "admin_survey_waves"));
  }
  if (url.pathname === "/api/admin/survey-waves" && request.method === "POST") {
    requireStaffMfa(user); const context = await authorization(env, user); requireRole(context, "administrator");
    return json(await rpc(env, user.token, "admin_upsert_survey_wave", await readBody(request)));
  }
  if (url.pathname === "/api/admin/user-access-log" && request.method === "GET") {
    const context = await authorization(env, user);
    return json(await adminUserAccessLog(env, user, context));
  }
  if (url.pathname === "/api/admin/analytics/config" && request.method === "GET") {
    const context = await authorization(env, user); requireStaffMfa(user); requireRole(context, "administrator"); requireCapability(context, "evaluation.governance");
    return json(await analyticsConfiguration(env, context));
  }
  if (url.pathname === "/api/admin/analytics/config" && request.method === "PUT") {
    const context = await authorization(env, user); return json(await saveAnalyticsConfiguration(request, env, user, context));
  }
  if (url.pathname === "/api/governance/principal" && request.method === "GET") {
    const context = await enrichPrincipalContext(env, user, await authorization(env, user)); return json(await principalOverview(env, user, context));
  }
  if (url.pathname === "/api/governance/principal/acknowledge" && request.method === "POST") {
    const context = await enrichPrincipalContext(env, user, await authorization(env, user)); return json(await acknowledgePrincipal(env, user, context));
  }
  if (url.pathname === "/api/governance/principal-investigator" && request.method === "POST") {
    const context = await enrichPrincipalContext(env, user, await authorization(env, user)); return json(await designatePrincipalInvestigator(request, env, user, context));
  }
  if (url.pathname === "/api/governance/requests" && request.method === "GET") {
    const context = await enrichPrincipalContext(env, user, await authorization(env, user)); requireStaffMfa(user); requireRole(context, "administrator");
    if (!context.principalType) throw new HttpError(403, "Principal access is required.", "principal_required"); return json(presentGovernanceRequests(await governanceEvents(env)));
  }
  if (url.pathname === "/api/governance/requests" && request.method === "POST") {
    const context = await enrichPrincipalContext(env, user, await authorization(env, user)); return json(await createGovernanceRequest(request, env, user, context));
  }
  const governanceDecision = url.pathname.match(/^\/api\/governance\/requests\/([0-9a-f-]+)\/decision$/i);
  if (governanceDecision && request.method === "POST") { const context = await enrichPrincipalContext(env, user, await authorization(env, user)); return json(await decideGovernanceRequest(request, env, user, context, governanceDecision[1])); }
  const governanceExecute = url.pathname.match(/^\/api\/governance\/requests\/([0-9a-f-]+)\/execute$/i);
  if (governanceExecute && request.method === "POST") {
    const context = await enrichPrincipalContext(env, user, await authorization(env, user)); const requests = presentGovernanceRequests(await governanceEvents(env, governanceExecute[1]));
    if (requests[0]?.requestType === "account_purge") return json(await executeAccountPurge(env, user, context, governanceExecute[1]));
    if (requests[0]?.requestType === "pilot_reset") return json(await executePilotReset(env, user, context, governanceExecute[1]));
    return json(await executeGovernanceApproval(env, user, context, governanceExecute[1]));
  }
  if (url.pathname === "/api/admin/reset-preview" && request.method === "GET") { const context = await enrichPrincipalContext(env, user, await authorization(env, user)); return json(await pilotResetPreview(env, user, context)); }
  const accountDeactivate = url.pathname.match(/^\/api\/admin\/accounts\/([0-9a-f-]+)\/deactivate$/i);
  if (accountDeactivate && request.method === "POST") { const context = await authorization(env, user); return json(await deactivateAccount(env, user, context, accountDeactivate[1])); }
  const accountRestore = url.pathname.match(/^\/api\/admin\/accounts\/([0-9a-f-]+)\/restore$/i);
  if (accountRestore && request.method === "POST") { const context = await authorization(env, user); return json(await restoreAccount(env, user, context, accountRestore[1])); }
  if (url.pathname === "/api/evaluation/summary" && request.method === "GET") {
    const context = await authorization(env, user);
    return json(await evaluationSummary(env, user, context));
  }
  if (url.pathname === "/api/evaluation/analytics" && request.method === "GET") {
    const context = await authorization(env, user); return json(await surveyAnalytics(url, env, user, context));
  }
  if (url.pathname === "/api/evaluation/qualitative" && request.method === "GET") {
    const context = await authorization(env, user); return json(await qualitativeWorkspace(env, user, context));
  }
  if (url.pathname === "/api/evaluation/qualitative" && request.method === "POST") {
    const context = await authorization(env, user); return json(await updateQualitativeWorkspace(request, env, user, context));
  }
  if (url.pathname === "/api/evaluation/export" && request.method === "GET") {
    const context = await authorization(env, user); return evaluationExport(url, env, user, context);
  }
  if (url.pathname === "/api/evaluation/results" && request.method === "GET") {
    requireStaffMfa(user);
    const context = await authorization(env, user);
    if (!context.capabilities.includes("evaluation.identifiable_results")) throw new HttpError(403, "Identifiable evaluation results require separate authorization.", "capability_required");
    const rows = await rpc<Array<Record<string, unknown>>>(env, user.token, "evaluation_authorized_results", { wave_id: url.searchParams.get("waveId") || null, instrument_slug: url.searchParams.get("instrument") || null });
    console.log(JSON.stringify({ event: "identifiable_evaluation_access", actor: user.id, format: "json", row_count: rows.length }));
    return json(rows);
  }
  throw new HttpError(404, "That pilot endpoint does not exist.", "not_found");
}

export default {
  async fetch(request: Request, env: Env) {
    const requestId = crypto.randomUUID();
    const startedAt = Date.now();
    try {
      const response = await route(request, env);
      const headers = new Headers(response.headers);
      Object.entries(corsHeaders(request, env)).forEach(([key, value]) => headers.set(key, value));
      headers.set("x-request-id", requestId);
      console.log(JSON.stringify({ event: "pilot_api_request", request_id: requestId, method: request.method, path: new URL(request.url).pathname, status: response.status, duration_ms: Date.now() - startedAt }));
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    } catch (error) {
      const known = error instanceof HttpError ? error : new HttpError(500, "The pilot service could not complete this request.", "internal_error");
      console.error(JSON.stringify({ event: "pilot_api_error", request_id: requestId, method: request.method, path: new URL(request.url).pathname, status: known.status, code: known.code, duration_ms: Date.now() - startedAt }));
      return json({ error: known.message, code: known.code, requestId }, known.status, { ...corsHeaders(request, env), "x-request-id": requestId });
    }
  },
} satisfies ExportedHandler<Env>;

export const pilotAnalyticsTestHelpers = { mean, median, standardDeviation, quartile, rank, correlation, falseDiscoveryRate, calculateSurveyScores };
