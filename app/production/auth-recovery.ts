export type RecoveryCallback = {
  requested: boolean;
  errorCode: string | null;
  errorMessage: string | null;
};

function callbackValue(query: URLSearchParams, fragment: URLSearchParams, key: string) {
  return query.get(key) || fragment.get(key);
}

export function parseRecoveryCallback(search: string, hash: string): RecoveryCallback {
  const query = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const fragment = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const type = callbackValue(query, fragment, "type");
  const errorCode = callbackValue(query, fragment, "error_code") || callbackValue(query, fragment, "error");
  const requested = type === "recovery" || errorCode === "otp_expired";
  if (!requested || !errorCode) return { requested, errorCode: null, errorMessage: null };
  return {
    requested: true,
    errorCode,
    errorMessage: errorCode === "otp_expired"
      ? "Supabase did not issue a recovery session for this link. A one-time link can be consumed by an email security scan, another reset request, or an earlier opening, even when the email itself is new."
      : "Supabase did not issue a recovery session for this link. Request one new email and use only its latest reset link.",
  };
}
