const SESSION_LIFETIME_SECONDS = 12 * 60 * 60;
const SESSION_VERSION = "v1";

export const ACCESS_COOKIE_NAME = "ntp_access";
export const ACCESS_COOKIE_MAX_AGE = SESSION_LIFETIME_SECONDS;

const encoder = new TextEncoder();

function normalizeCode(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

async function digest(value: string) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

function constantTimeBytesEqual(left: Uint8Array, right: Uint8Array) {
  const length = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    mismatch |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return mismatch === 0;
}

export async function accessCodesMatch(candidate: string, configured: string) {
  const [candidateDigest, configuredDigest] = await Promise.all([
    digest(normalizeCode(candidate)),
    digest(normalizeCode(configured)),
  ]);
  return constantTimeBytesEqual(candidateDigest, configuredDigest);
}

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function hmac(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

export async function createAccessCookie(secret: string, now = Date.now()) {
  const expiresAt = Math.floor(now / 1000) + SESSION_LIFETIME_SECONDS;
  const payload = `${SESSION_VERSION}.${expiresAt}`;
  const signature = toBase64Url(await hmac(payload, secret));
  return `${payload}.${signature}`;
}

export async function verifyAccessCookie(
  value: string | undefined,
  secret: string | undefined,
  now = Date.now(),
) {
  if (!value || !secret) return false;
  const [version, expiresText, signatureText, extra] = value.split(".");
  if (version !== SESSION_VERSION || !expiresText || !signatureText || extra) return false;
  const expiresAt = Number(expiresText);
  if (!Number.isInteger(expiresAt) || expiresAt <= Math.floor(now / 1000)) return false;
  if (expiresAt > Math.floor(now / 1000) + SESSION_LIFETIME_SECONDS + 60) return false;
  try {
    const expected = await hmac(`${version}.${expiresText}`, secret);
    return constantTimeBytesEqual(fromBase64Url(signatureText), expected);
  } catch {
    return false;
  }
}

export function accessCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: ACCESS_COOKIE_MAX_AGE,
  };
}
