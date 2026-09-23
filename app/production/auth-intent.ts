import {
  SYNTHETIC_PERSONA_KEY,
  SYNTHETIC_PREVIEW_KEY,
  SYNTHETIC_PREVIEW_SCOPE_KEY,
} from "./synthetic-preview";

const CALLBACK_KEYS = ["code", "access_token", "refresh_token", "type", "error", "error_code", "error_description"] as const;

function parameters(value: string, prefix: "?" | "#") {
  return new URLSearchParams(value.startsWith(prefix) ? value.slice(1) : value);
}

export function hasAuthenticationCallback(search: string, hash: string) {
  const query = parameters(search, "?");
  const fragment = parameters(hash, "#");
  return CALLBACK_KEYS.some((key) => query.has(key) || fragment.has(key));
}

export function clearStoredPreview(storage: Pick<Storage, "removeItem">) {
  storage.removeItem(SYNTHETIC_PREVIEW_KEY);
  storage.removeItem(SYNTHETIC_PERSONA_KEY);
  storage.removeItem(SYNTHETIC_PREVIEW_SCOPE_KEY);
}

export function safeAppDestination(value: string | null | undefined) {
  if (!value) return "/app";
  try {
    const decoded = decodeURIComponent(value);
    return /^\/app(?:\/|$|\?)/.test(decoded) && !decoded.startsWith("//") ? decoded : "/app";
  } catch {
    return "/app";
  }
}

