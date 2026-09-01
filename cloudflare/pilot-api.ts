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
      emailConfirmedAt: auth?.email_confirmed_at || auth?.confirmed_at || null,
      lastInvitationSentAt: auth?.confirmation_sent_at || auth?.invited_at || null,
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
] as const;

function secretSurvey(env: Env, slug: string): SecretSurveyDefinition | null {
  const raw = ({
    "pre-health-application-profile": env.SURVEY_PRE_HEALTH,
    "short-grit-survey": env.SURVEY_GRIT,
    "macleod-clark-professional-identity-scale": env.SURVEY_IDENTITY,
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

async function ensureStagingEvaluationCapability(env: Env, user: AuthenticatedUser, context: AuthorizationContext) {
  if (env.PILOT_ENVIRONMENT !== "staging" || !context.roles.includes("administrator") || !context.activeOrganizationId) return;
  const rows = await serviceRest<Array<{ id: string }>>(env, `permission_assignments?user_id=eq.${encodeURIComponent(user.id)}&permission_key=eq.evaluation.identifiable_results&revoked_at=is.null&select=id&limit=1`);
  if (!rows.length) {
    await serviceRest<void>(env, "permission_assignments?on_conflict=user_id,permission_key,organization_id,program_id", {
      method: "POST",
      headers: { prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify({ user_id: user.id, permission_key: "evaluation.identifiable_results", organization_id: context.activeOrganizationId, program_id: context.activeProgramId, granted_by: user.id }),
    });
  }
  if (!context.capabilities.includes("evaluation.identifiable_results")) context.capabilities.push("evaluation.identifiable_results");
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
};

async function surveyProjection(env: Env, userId: string, assignmentId: string) {
  const rows = await serviceRest<SurveyProjection[]>(env, `survey_completion_projection?assignment_id=eq.${encodeURIComponent(assignmentId)}&user_id=eq.${encodeURIComponent(userId)}&select=assignment_id,user_id,organization_id,program_id,cohort_id,instrument_slug,instrument_name,wave_id,wave_label,status,opens_at,closes_at,submitted_at&limit=1`);
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
    dashboard[key] = (dashboard[key] as Array<Record<string, unknown>>).map((assignment) => secretSurvey(env, String(assignment.instrumentSlug || "")) && assignment.status === "not_available" ? { ...assignment, status: "not_started" } : assignment);
  }
  return dashboard;
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

async function evaluationSummary(env: Env, user: AuthenticatedUser, context: AuthorizationContext) {
  requireStaffMfa(user);
  requireRole(context, "administrator");
  if (!context.capabilities.includes("evaluation.identifiable_results")) throw new HttpError(403, "Quantified evaluation results require separate authorization.", "capability_required");
  const rows = await serviceRest<Array<StoredArtifact & { student_id: string }>>(env, `artifacts?organization_id=eq.${encodeURIComponent(context.activeOrganizationId || "")}&artifact_type=eq.staging_survey&content-%3E%3Estatus=eq.submitted&select=id,student_id,station,artifact_type,title,content,created_at,updated_at&order=updated_at.desc`);
  const studentIds = [...new Set(rows.map((row) => row.student_id))];
  const [profiles, authUsers] = await Promise.all([
    studentIds.length ? serviceRest<Array<{ user_id: string; display_name: string; preferred_name: string | null }>>(env, `profiles?user_id=in.(${studentIds.join(",")})&select=user_id,display_name,preferred_name`) : [],
    supabaseAuthUsers(env),
  ]);
  const names = new Map(profiles.map((profile) => [profile.user_id, profile.preferred_name || profile.display_name]));
  const emails = new Map(authUsers.map((entry) => [entry.id, entry.email || ""]));
  const submissions = [] as Array<{ userId: string; displayName: string; email: string; instrumentSlug: string; instrumentName: string; submittedAt: string; scores: Record<string, number> }>;
  for (const row of rows) {
    const content = row.content as Record<string, unknown>;
    const payload = await decryptSurvey<{ scores: Record<string, number> }>(env, content.encrypted);
    submissions.push({ userId: row.student_id, displayName: names.get(row.student_id) || "Student", email: emails.get(row.student_id) || "", instrumentSlug: String(content.instrumentSlug || ""), instrumentName: String(content.instrumentName || row.title), submittedAt: row.updated_at, scores: payload.scores || {} });
  }
  const grouped = new Map<string, typeof submissions>();
  submissions.forEach((submission) => grouped.set(submission.instrumentSlug, [...(grouped.get(submission.instrumentSlug) || []), submission]));
  const instruments = [...grouped.entries()].map(([instrumentSlug, group]) => {
    const values = group.map((submission) => Object.entries(submission.scores).find(([key]) => !["total", "answeredItems"].includes(key))?.[1]).filter((value): value is number => typeof value === "number");
    return { instrumentSlug, instrumentName: group[0].instrumentName, submitted: group.length, scoreMean: values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)) : null, scoreMin: values.length ? Math.min(...values) : null, scoreMax: values.length ? Math.max(...values) : null };
  });
  await serviceRest(env, "audit_events", { method: "POST", headers: { prefer: "return=minimal" }, body: JSON.stringify({ organization_id: context.activeOrganizationId, actor_id: user.id, event_type: "quantified_evaluation_summary_accessed", subject_type: "evaluation_summary", metadata: { submissionCount: submissions.length } }) });
  return { instruments, submissions, generatedAt: new Date().toISOString() };
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
    const context = await authorization(env, user);
    await ensureStagingEvaluationCapability(env, user, context);
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
  if (url.pathname === "/api/evaluation/summary" && request.method === "GET") {
    const context = await authorization(env, user);
    return json(await evaluationSummary(env, user, context));
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
