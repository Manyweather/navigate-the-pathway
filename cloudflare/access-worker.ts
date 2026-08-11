interface Env {
  NAVIGATE_ACCESS_CODE?: string;
  NAVIGATE_SESSION_SECRET?: string;
}

const ALLOWED_ORIGINS = new Set([
  "https://manyweather.github.io",
  "http://localhost:4173",
]);
const SESSION_LIFETIME_SECONDS = 12 * 60 * 60;
const encoder = new TextEncoder();

function normalizeCode(value: string) {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

async function digest(value: string) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

function bytesMatch(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function codesMatch(candidate: string, configured: string) {
  const [candidateDigest, configuredDigest] = await Promise.all([
    digest(normalizeCode(candidate)),
    digest(normalizeCode(configured)),
  ]);
  return bytesMatch(candidateDigest, configuredDigest);
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function signature(payload: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload))));
}

async function createToken(secret: string) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = base64Url(encoder.encode(JSON.stringify({ version: 1, issuedAt, expiresAt: issuedAt + SESSION_LIFETIME_SECONDS })));
  return `${payload}.${await signature(payload, secret)}`;
}

function decodePayload(payload: string) {
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as { version?: number; expiresAt?: number };
  } catch {
    return null;
  }
}

async function verifyToken(token: string, secret: string) {
  const [payload, suppliedSignature, extra] = token.split(".");
  if (!payload || !suppliedSignature || extra) return false;
  const expectedSignature = await signature(payload, secret);
  const signaturesMatch = bytesMatch(encoder.encode(suppliedSignature), encoder.encode(expectedSignature));
  const decoded = decodePayload(payload);
  return signaturesMatch && decoded?.version === 1 && typeof decoded.expiresAt === "number" && decoded.expiresAt > Math.floor(Date.now() / 1000);
}

function corsHeaders(origin: string | null) {
  const headers = new Headers({
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    vary: "Origin",
  });
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set("access-control-allow-origin", origin);
    headers.set("access-control-allow-headers", "authorization, content-type");
    headers.set("access-control-allow-methods", "POST, OPTIONS");
    headers.set("access-control-max-age", "86400");
  }
  return headers;
}

function json(origin: string | null, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(origin) });
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("origin");

    if (request.method === "GET" && url.pathname === "/health") {
      return json(origin, { ok: true, service: "navigate-pathway-access" });
    }

    if (!origin || !ALLOWED_ORIGINS.has(origin)) return json(origin, { ok: false }, 403);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
    if (request.method !== "POST") return json(origin, { ok: false }, 405);

    const accessCode = env.NAVIGATE_ACCESS_CODE;
    const sessionSecret = env.NAVIGATE_SESSION_SECRET;
    if (!accessCode || !sessionSecret) return json(origin, { ok: false }, 503);

    if (url.pathname === "/api/access/unlock") {
      try {
        const body = await request.json() as { code?: unknown };
        const candidate = typeof body.code === "string" ? body.code.slice(0, 200) : "";
        if (!(await codesMatch(candidate, accessCode))) return json(origin, { ok: false }, 401);
        return json(origin, { ok: true, token: await createToken(sessionSecret), expiresIn: SESSION_LIFETIME_SECONDS });
      } catch {
        return json(origin, { ok: false }, 401);
      }
    }

    if (url.pathname === "/api/access/verify") {
      const authorization = request.headers.get("authorization") || "";
      const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
      return (await verifyToken(token, sessionSecret))
        ? json(origin, { ok: true })
        : json(origin, { ok: false }, 401);
    }

    return json(origin, { ok: false }, 404);
  },
};

export default worker;
export { codesMatch, createToken, verifyToken };
