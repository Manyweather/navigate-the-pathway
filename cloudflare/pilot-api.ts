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
};

type AuthorizationContext = {
  roles: string[];
  capabilities: string[];
  aal: "aal1" | "aal2";
  activeOrganizationId: string | null;
  activeProgramId: string | null;
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
    return JSON.parse(atob(normalized)) as { aal?: "aal1" | "aal2" };
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
  return { id: user.id, email: user.email || "", token, aal: tokenClaims(token).aal || "aal1" };
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

type StoredArtifact = {
  id: string;
  station: string;
  artifact_type: string;
  title: string;
  content: { response?: string; prompt?: string };
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
    const rows = await serviceRest<StoredArtifact[]>(env, `artifacts?student_id=eq.${encodeURIComponent(user.id)}&select=id,station,artifact_type,title,content,created_at,updated_at&order=created_at.desc`);
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
  if (url.pathname === "/api/me" && request.method === "GET") return json(await rpc(env, user.token, "pilot_authorization_context"));
  if (url.pathname === "/api/dashboard" && request.method === "GET") {
    const role = url.searchParams.get("role") || "";
    if (!["student", "advisor", "administrator"].includes(role)) throw new HttpError(400, "Choose a valid dashboard.", "invalid_role");
    const context = await authorization(env, user);
    requireRole(context, role);
    if (role !== "student") requireStaffMfa(user);
    return json(await rpc(env, user.token, "pilot_dashboard", { requested_role: role }));
  }
  if (url.pathname === "/api/artifacts" && (request.method === "GET" || request.method === "POST")) return pathwayArtifacts(request, env, user);
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
