type PilotEnvironment = "staging" | "production";

type Env = {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  ALLOWED_ORIGINS: string;
  PILOT_ENVIRONMENT: PilotEnvironment;
  INVITE_REDIRECT_URL: string;
};

type AuthenticatedUser = {
  id: string;
  email: string;
  token: string;
  aal: "aal1" | "aal2";
  sessionId: string;
};

type AuthorizationContext = {
  roles: string[];
  capabilities: string[];
  aal: "aal1" | "aal2";
  activeOrganizationId: string | null;
  activeProgramId: string | null;
  activeCohortId?: string | null;
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
    "access-control-allow-methods": "GET, POST, PUT, OPTIONS",
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
  return response.json() as Promise<T>;
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
  const payload = await response.json() as { users?: Array<{ id: string; email?: string; last_sign_in_at?: string | null }> };
  return payload.users || [];
}

async function adminUserAccessLog(env: Env, user: AuthenticatedUser, context: AuthorizationContext) {
  requireStaffMfa(user);
  requireRole(context, "administrator");
  if (!context.activeOrganizationId) throw new HttpError(409, "Choose an active organization to view access history.", "active_organization_required");

  const organizationId = encodeURIComponent(context.activeOrganizationId);
  const [roles, profiles, events, authUsers] = await Promise.all([
    serviceRest<Array<{ user_id: string }>>(env, `role_assignments?organization_id=eq.${organizationId}&role=eq.student&revoked_at=is.null&select=user_id`),
    serviceRest<Array<{ user_id: string; display_name: string; preferred_name: string | null; status: string }>>(env, `profiles?active_organization_id=eq.${organizationId}&select=user_id,display_name,preferred_name,status`),
    serviceRest<StoredAccessEvent[]>(env, `audit_events?organization_id=eq.${organizationId}&subject_type=eq.user_session&event_type=in.(user_session_opened,user_session_heartbeat,user_session_signed_out)&select=actor_id,event_type,subject_id,metadata,created_at&order=created_at.desc&limit=5000`),
    supabaseAuthUsers(env),
  ]);

  const studentIds = new Set(roles.map((item) => item.user_id));
  const profileById = new Map(profiles.map((profile) => [profile.user_id, profile]));
  const authById = new Map(authUsers.map((entry) => [entry.id, entry]));
  const sessionMap = new Map<string, { userId: string; sessionId: string; signedInAt: string; lastActiveAt: string; signedOutAt: string | null; role: string | null }>();

  for (const event of events) {
    if (!studentIds.has(event.actor_id)) continue;
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

  const students = [...studentIds].map((studentId) => {
    const profile = profileById.get(studentId);
    const auth = authById.get(studentId);
    const studentSessions = sessions.filter((session) => session.userId === studentId);
    return {
      userId: studentId,
      displayName: profile?.preferred_name || profile?.display_name || auth?.email?.split("@")[0] || "Student",
      email: auth?.email || "",
      accountStatus: profile?.status || "invited",
      lastAuthSignInAt: auth?.last_sign_in_at || null,
      sessionCount: studentSessions.length,
      totalMinutes: studentSessions.reduce((sum, session) => sum + session.durationMinutes, 0),
    };
  }).sort((a, b) => a.displayName.localeCompare(b.displayName));

  await recordAccessEvent(env, user, context, "user_session_heartbeat", "administrator");
  return { students, sessions, generatedAt: new Date().toISOString() };
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
      content: { prompt, response },
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

function asCsv(rows: Array<Record<string, unknown>>) {
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const cell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return [columns.map(cell).join(","), ...rows.map((row) => columns.map((column) => cell(row[column])).join(","))].join("\r\n");
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

async function route(request: Request, env: Env) {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  if (url.pathname === "/api/health") return json({ ok: true, environment: env.PILOT_ENVIRONMENT });

  const user = await authenticate(request, env);
  if (url.pathname === "/api/me" && request.method === "GET") {
    const context = await authorization(env, user);
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
    return json(await rpc(env, user.token, "pilot_dashboard", { requested_role: role }));
  }
  if (url.pathname === "/api/artifacts" && (request.method === "GET" || request.method === "POST")) return pathwayArtifacts(request, env, user);
  if (url.pathname === "/api/pathway/primer" && (request.method === "GET" || request.method === "PUT")) return pathwayPrimer(request, env, user);
  if (url.pathname === "/api/surveys/assignments" && request.method === "GET") return json(await rpc(env, user.token, "my_survey_assignments"));
  const assignment = url.pathname.match(/^\/api\/surveys\/assignments\/([0-9a-f-]+)$/i);
  if (assignment && request.method === "GET") return json(await rpc(env, user.token, "get_my_survey_assignment", { assignment_id: assignment[1] }));
  const draft = url.pathname.match(/^\/api\/surveys\/response-sets\/([0-9a-f-]+)\/draft$/i);
  if (draft && request.method === "PUT") {
    const body = await readBody(request);
    return json(await rpc(env, user.token, "save_my_survey_draft", { assignment_id: draft[1], consent_version_id: body.consentVersionId, answers: body.answers || {} }));
  }
  const submit = url.pathname.match(/^\/api\/surveys\/response-sets\/([0-9a-f-]+)\/submit$/i);
  if (submit && request.method === "POST") return json(await rpc(env, user.token, "submit_my_survey_response", { assignment_id: submit[1] }));

  if (url.pathname === "/api/admin/invitations" && request.method === "POST") {
    const context = await authorization(env, user);
    return inviteAccount(request, env, user, context);
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
  if ((url.pathname === "/api/evaluation/results" || url.pathname === "/api/evaluation/export") && request.method === "GET") {
    requireStaffMfa(user);
    const context = await authorization(env, user);
    if (!context.capabilities.includes("evaluation.identifiable_results")) throw new HttpError(403, "Identifiable evaluation results require separate authorization.", "capability_required");
    const rows = await rpc<Array<Record<string, unknown>>>(env, user.token, "evaluation_authorized_results", { wave_id: url.searchParams.get("waveId") || null, instrument_slug: url.searchParams.get("instrument") || null });
    console.log(JSON.stringify({ event: "identifiable_evaluation_access", actor: user.id, format: url.pathname.endsWith("export") ? "csv" : "json", row_count: rows.length }));
    if (url.pathname.endsWith("export")) return new Response(asCsv(rows), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=navigate-evaluation-export.csv" } });
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
