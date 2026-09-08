import { WorkspaceError, workspaceBody, workspaceJson } from "./workspace-api";

type Provider = "google" | "microsoft";
type Connection = {
  id: string;
  user_id: string;
  provider: Provider;
  credential_ciphertext: string;
  availability_calendar_ids: string[];
  destination_calendar_id: string | null;
  status: string;
  provider_account_id: string;
  subscription_id: string | null;
  subscription_resource_id: string | null;
  subscription_secret: string | null;
  subscription_expires_at: string | null;
  last_synced_at: string | null;
};
type Tokens = {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
  token_type?: string;
};
type PortalEvent = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  status: string;
  version?: number;
  topic?: string;
};
export type CalendarServices = {
  config: {
    googleClientId: string;
    googleClientSecret: string;
    microsoftClientId: string;
    microsoftClientSecret: string;
    encryptionKey: string;
    callbackUrl: string;
    allowedOrigins: string[];
  };
  user?: { id: string; token: string; aal: string; sessionId: string };
  rpc?<T>(name: string, body?: unknown): Promise<T>;
  service<T>(path: string, options?: RequestInit): Promise<T>;
};
const b64 = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
const unb64 = (value: string) =>
  Uint8Array.from(
    atob(
      value
        .replaceAll("-", "+")
        .replaceAll("_", "/")
        .padEnd(Math.ceil(value.length / 4) * 4, "="),
    ),
    (c) => c.charCodeAt(0),
  );
const digest = async (s: string) =>
  b64(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    ),
  );
export async function encryptCalendarSecret(
  value: string,
  key: string,
): Promise<string> {
  const raw = unb64(key);
  if (raw.length !== 32)
    throw new WorkspaceError(503, "Calendar encryption is not configured.");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const secret = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
    "encrypt",
  ]);
  return (
    b64(iv) +
    "." +
    b64(
      new Uint8Array(
        await crypto.subtle.encrypt(
          { name: "AES-GCM", iv },
          secret,
          new TextEncoder().encode(value),
        ),
      ),
    )
  );
}
export async function decryptCalendarSecret(
  value: string,
  key: string,
): Promise<string> {
  const [iv, cipher] = value.split(".");
  const secret = await crypto.subtle.importKey(
    "raw",
    unb64(key),
    "AES-GCM",
    false,
    ["decrypt"],
  );
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: unb64(iv) },
      secret,
      unb64(cipher),
    ),
  );
}
function settings(provider: Provider, s: CalendarServices) {
  return provider === "google"
    ? {
        clientId: s.config.googleClientId,
        clientSecret: s.config.googleClientSecret,
        authorize: "https://accounts.google.com/o/oauth2/v2/auth",
        token: "https://oauth2.googleapis.com/token",
        scope:
          "openid email https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.freebusy",
      }
    : {
        clientId: s.config.microsoftClientId,
        clientSecret: s.config.microsoftClientSecret,
        authorize:
          "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
        token: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        scope: "openid email offline_access User.Read Calendars.ReadWrite",
      };
}
function configured(provider: Provider, s: CalendarServices) {
  const c = settings(provider, s);
  return !!(
    c.clientId &&
    c.clientSecret &&
    s.config.encryptionKey &&
    s.config.callbackUrl
  );
}
async function responseJson(response: Response) {
  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok)
    throw new WorkspaceError(
      response.status === 401 ? 401 : 502,
      "The calendar provider could not complete the request.",
    );
  return body;
}
async function tokens(c: Connection, s: CalendarServices): Promise<Tokens> {
  let token = JSON.parse(
    await decryptCalendarSecret(
      c.credential_ciphertext,
      s.config.encryptionKey,
    ),
  ) as Tokens;
  if (token.expires_at > Date.now() + 120000) return token;
  if (!token.refresh_token)
    throw new WorkspaceError(401, "Reconnect your calendar.");
  const cfg = settings(c.provider, s);
  const response = await fetch(cfg.token, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      grant_type: "refresh_token",
      refresh_token: token.refresh_token,
    }),
  });
  if (!response.ok) {
    await s.service(`pathway_calendar_connections?id=eq.${c.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "reconnect_required" }),
    });
    throw new WorkspaceError(
      409,
      "Reconnect your calendar before confirming this appointment.",
    );
  }
  const fresh = (await response.json()) as Tokens & { expires_in: number };
  token = {
    ...token,
    ...fresh,
    expires_at: Date.now() + fresh.expires_in * 1000,
  };
  c.credential_ciphertext = await encryptCalendarSecret(
    JSON.stringify(token),
    s.config.encryptionKey,
  );
  await s.service(`pathway_calendar_connections?id=eq.${c.id}`, {
    method: "PATCH",
    body: JSON.stringify({ credential_ciphertext: c.credential_ciphertext }),
  });
  return token;
}
async function providerFetch(
  c: Connection,
  s: CalendarServices,
  path: string,
  options: RequestInit = {},
) {
  const token = await tokens(c, s);
  return fetch(
    (c.provider === "google"
      ? "https://www.googleapis.com/calendar/v3"
      : "https://graph.microsoft.com/v1.0") + path,
    {
      ...options,
      headers: {
        authorization: `Bearer ${token.access_token}`,
        "content-type": "application/json",
        ...options.headers,
      },
      signal: AbortSignal.timeout(15000),
    },
  );
}
async function calendars(c: Connection, s: CalendarServices) {
  const data = await responseJson(
    await providerFetch(
      c,
      s,
      c.provider === "google"
        ? "/users/me/calendarList?maxResults=250"
        : "/me/calendars?$top=100",
    ),
  );
  const list = (data.items || data.value || []) as Array<
    Record<string, unknown>
  >;
  return list.map((x) => ({
    id: String(x.id),
    name: String(x.summary || x.name),
    canWrite:
      c.provider === "google"
        ? ["owner", "writer"].includes(String(x.accessRole))
        : x.canEdit === true,
  }));
}

export async function calendarPublicRoute(
  request: Request,
  s: CalendarServices,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === "/api/calendar/webhook") {
    const validation = url.searchParams.get("validationToken");
    if (validation && request.method === "POST")
      return new Response(validation, {
        headers: { "content-type": "text/plain" },
      });
    if (request.method !== "POST")
      throw new WorkspaceError(405, "Method not allowed.");
    const googleId = request.headers.get("x-goog-channel-id");
    const candidates: Array<{ id: string; secret: string }> = googleId
      ? [
          {
            id: googleId,
            secret: request.headers.get("x-goog-channel-token") || "",
          },
        ]
      : (
          ((await workspaceBody(request)).value as Array<{
            subscriptionId: string;
            clientState: string;
          }>) || []
        ).map((v) => ({ id: v.subscriptionId, secret: v.clientState }));
    for (const candidate of candidates.slice(0, 100)) {
      const connections = await s.service<Connection[]>(
        `pathway_calendar_connections?subscription_id=eq.${encodeURIComponent(candidate.id)}&status=eq.connected`,
      );
      for (const c of connections)
        if (
          c.subscription_secret &&
          (await digest(candidate.secret)) ===
            (await digest(c.subscription_secret))
        )
          await s.service("pathway_background_jobs?on_conflict=dedupe_key", {
            method: "POST",
            headers: { prefer: "resolution=ignore-duplicates" },
            body: JSON.stringify({
              kind: "calendar_sync",
              dedupe_key: `webhook:${c.id}:${Math.floor(Date.now() / 60000)}`,
              payload: { connectionId: c.id },
            }),
          });
    }
    return new Response(null, { status: 202 });
  }
  if (url.pathname !== "/api/calendar/callback") return null;
  const state = url.searchParams.get("state") || "";
  if (!state)
    throw new WorkspaceError(400, "Calendar connection state is missing.");
  const hash = await digest(state);
  const states = await s.service<
    Array<{
      user_id: string;
      provider: Provider;
      verifier_ciphertext: string;
      redirect_origin: string;
    }>
  >(
    `pathway_calendar_oauth_states?state_hash=eq.${hash}&used_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}`,
    {
      method: "PATCH",
      headers: { prefer: "return=representation" },
      body: JSON.stringify({ used_at: new Date().toISOString() }),
    },
  );
  const record = states[0];
  if (!record)
    throw new WorkspaceError(
      400,
      "Calendar connection expired or was already used. Try again.",
    );
  if (!s.config.allowedOrigins.includes(record.redirect_origin))
    throw new WorkspaceError(400, "Invalid return address.");
  if (url.searchParams.has("error"))
    return Response.redirect(
      record.redirect_origin + "/app?calendar=cancelled",
      303,
    );
  const cfg = settings(record.provider, s);
  const code = url.searchParams.get("code");
  if (!code) throw new WorkspaceError(400, "Authorization code is missing.");
  const data = await responseJson(
    await fetch(cfg.token, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: s.config.callbackUrl,
        code_verifier: await decryptCalendarSecret(
          record.verifier_ciphertext,
          s.config.encryptionKey,
        ),
      }),
    }),
  );
  const token = {
    ...data,
    expires_at: Date.now() + Number(data.expires_in) * 1000,
  };
  const profile = await responseJson(
    await fetch(
      record.provider === "google"
        ? "https://openidconnect.googleapis.com/v1/userinfo"
        : "https://graph.microsoft.com/v1.0/me?$select=id",
      { headers: { authorization: `Bearer ${data.access_token}` } },
    ),
  );
  await s.service(
    "pathway_calendar_connections?on_conflict=user_id,provider,provider_account_id",
    {
      method: "POST",
      headers: { prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({
        user_id: record.user_id,
        provider: record.provider,
        provider_account_id: String(profile.sub || profile.id),
        credential_ciphertext: await encryptCalendarSecret(
          JSON.stringify(token),
          s.config.encryptionKey,
        ),
        status: "connected",
      }),
    },
  );
  return Response.redirect(
    record.redirect_origin + "/app?calendar=connected",
    303,
  );
}

export async function calendarRequest(
  request: Request,
  s: CalendarServices,
): Promise<Response> {
  if (!s.user || !s.rpc)
    throw new WorkspaceError(401, "Sign in to connect a calendar.");
  // Checks active account, current program and staff MFA without revealing secrets.
  await s.rpc("pathway_action", {
    action: "calendar_connections",
    payload: {},
  });
  const url = new URL(request.url);
  if (url.pathname === "/api/calendar/status")
    return workspaceJson({
      google: configured("google", s),
      microsoft: configured("microsoft", s),
    });
  const body =
    request.method === "GET"
      ? Object.fromEntries(url.searchParams)
      : await workspaceBody(request);
  if (url.pathname === "/api/calendar/connect" && request.method === "POST") {
    const provider = body.provider as Provider;
    if (!["google", "microsoft"].includes(provider) || !configured(provider, s))
      throw new WorkspaceError(
        503,
        "This calendar provider is not configured yet.",
      );
    const origin = request.headers.get("origin") || "";
    if (!s.config.allowedOrigins.includes(origin))
      throw new WorkspaceError(403, "Unknown application origin.");
    const state = b64(crypto.getRandomValues(new Uint8Array(32))),
      verifier = b64(crypto.getRandomValues(new Uint8Array(32))),
      cfg = settings(provider, s);
    await s.service("pathway_calendar_oauth_states", {
      method: "POST",
      body: JSON.stringify({
        state_hash: await digest(state),
        user_id: s.user.id,
        provider,
        verifier_ciphertext: await encryptCalendarSecret(
          verifier,
          s.config.encryptionKey,
        ),
        redirect_origin: origin,
        expires_at: new Date(Date.now() + 600000).toISOString(),
      }),
    });
    const authorize = new URL(cfg.authorize);
    authorize.search = new URLSearchParams({
      client_id: cfg.clientId,
      redirect_uri: s.config.callbackUrl,
      response_type: "code",
      scope: cfg.scope,
      state,
      code_challenge: await digest(verifier),
      code_challenge_method: "S256",
      ...(provider === "google"
        ? { access_type: "offline", prompt: "consent" }
        : {}),
    }).toString();
    return workspaceJson({ url: authorize.toString() });
  }
  const connection = (
    await s.service<Connection[]>(
      `pathway_calendar_connections?id=eq.${encodeURIComponent(String(body.id))}&user_id=eq.${s.user.id}&status=neq.disconnected`,
    )
  )[0];
  if (!connection)
    throw new WorkspaceError(404, "Calendar connection not found.");
  if (url.pathname === "/api/calendar/calendars" && request.method === "GET")
    return workspaceJson(await calendars(connection, s));
  if (
    url.pathname === "/api/calendar/preferences" &&
    request.method === "POST"
  ) {
    const available = await calendars(connection, s);
    const selected = body.availabilityCalendarIds;
    if (
      !Array.isArray(selected) ||
      selected.length > 10 ||
      selected.some((id) => !available.some((c) => c.id === id)) ||
      !available.some((c) => c.id === body.destinationCalendarId && c.canWrite)
    )
      throw new WorkspaceError(
        400,
        "Choose available calendars and a writable destination.",
      );
    await s.service(`pathway_calendar_connections?id=eq.${connection.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        availability_calendar_ids: selected,
        destination_calendar_id: body.destinationCalendarId,
        ...(connection.destination_calendar_id !== body.destinationCalendarId
          ? { subscription_expires_at: null }
          : {}),
      }),
    });
    await s.service("pathway_background_jobs", {
      method: "POST",
      body: JSON.stringify({
        kind: "calendar_sync",
        dedupe_key: `preferences:${connection.id}:${crypto.randomUUID()}`,
        payload: { connectionId: connection.id },
      }),
    });
    return workspaceJson({ ok: true });
  }
  if (
    url.pathname === "/api/calendar/disconnect" &&
    request.method === "POST"
  ) {
    if (connection.subscription_id) {
      try {
        await providerFetch(
          connection,
          s,
          connection.provider === "google"
            ? "/channels/stop"
            : `/subscriptions/${encodeURIComponent(connection.subscription_id)}`,
          {
            method: connection.provider === "google" ? "POST" : "DELETE",
            ...(connection.provider === "google"
              ? {
                  body: JSON.stringify({
                    id: connection.subscription_id,
                    resourceId: connection.subscription_resource_id,
                  }),
                }
              : {}),
          },
        );
      } catch {
        /* Credentials are still removed when provider is unavailable. */
      }
    }
    await s.rpc("pathway_action", {
      action: "calendar_disconnect",
      payload: { id: connection.id },
    });
    return workspaceJson({ ok: true });
  }
  throw new WorkspaceError(404, "Calendar action not found.");
}

export async function checkAppointmentAvailability(
  id: string,
  s: CalendarServices,
) {
  if (!s.rpc || !s.user) return;
  const appointments = await s.rpc<
    Array<
      PortalEvent & {
        requester_id: string;
        recipient_id: string;
        proposal?: { starts_at: string; ends_at: string };
      }
    >
  >("pathway_action", { action: "appointments", payload: {} });
  const ap = appointments.find((a) => a.id === id);
  if (!ap) throw new WorkspaceError(403, "Appointment access denied.");
  const start = ap.proposal?.starts_at || ap.starts_at,
    end = ap.proposal?.ends_at || ap.ends_at;
  const connections = await s.service<Connection[]>(
    `pathway_calendar_connections?user_id=in.(${ap.requester_id},${ap.recipient_id})&status=neq.disconnected`,
  );
  for (const c of connections) {
    if (c.status === "reconnect_required")
      throw new WorkspaceError(
        409,
        "A participant needs to reconnect their calendar before acceptance.",
      );
    for (const calendar of c.availability_calendar_ids) {
      // Read event time ranges for connected owners, including personal Microsoft
      // accounts (Graph getSchedule does not support personal accounts).
      const path =
        c.provider === "google"
          ? `/calendars/${encodeURIComponent(calendar)}/events?singleEvents=true&timeMin=${encodeURIComponent(start)}&timeMax=${encodeURIComponent(end)}&maxResults=2500`
          : `/me/calendars/${encodeURIComponent(calendar)}/calendarView?startDateTime=${encodeURIComponent(start)}&endDateTime=${encodeURIComponent(end)}&$select=id,start,end,showAs,isCancelled&$top=1000`;
      const data = await responseJson(await providerFetch(c, s, path));
      const mapped = await s.service<Array<{ provider_event_id: string }>>(
        `pathway_calendar_events?connection_id=eq.${c.id}&event_key=eq.appointment:${ap.id}`,
      );
      const events = (data.items || data.value || []) as Array<
        Record<string, unknown>
      >;
      const busy = events.some(
        (e) =>
          !mapped.some((m) => m.provider_event_id === e.id) &&
          e.status !== "cancelled" &&
          !e.isCancelled &&
          e.transparency !== "transparent" &&
          e.showAs !== "free",
      );
      if (busy || data.nextPageToken || data["@odata.nextLink"])
        throw new WorkspaceError(
          409,
          "A connected calendar is busy at this time. Choose another time.",
        );
    }
  }
}

async function syncConnection(c: Connection, s: CalendarServices) {
  if (!c.destination_calendar_id || c.status !== "connected") return;
  const events = await s.service<
    Array<{ event_key: string; event: PortalEvent }>
  >("rpc/pathway_calendar_feed", {
    method: "POST",
    body: JSON.stringify({ owner_id: c.user_id }),
  });
  const mapped = await s.service<
    Array<{
      id: string;
      event_key: string;
      provider_event_id: string;
      calendar_id: string;
      portal_version: string;
    }>
  >(`pathway_calendar_events?connection_id=eq.${c.id}`);
  for (const orphan of mapped.filter(
    (m) => !events.some((e) => e.event_key === m.event_key),
  )) {
    const response = await providerFetch(
      c,
      s,
      (c.provider === "google"
        ? `/calendars/${encodeURIComponent(orphan.calendar_id)}/events`
        : `/me/calendars/${encodeURIComponent(orphan.calendar_id)}/events`) +
        "/" +
        encodeURIComponent(orphan.provider_event_id),
      { method: "DELETE" },
    );
    if (response.ok || [404, 410].includes(response.status))
      await s.service(`pathway_calendar_events?id=eq.${orphan.id}`, {
        method: "DELETE",
      });
    else
      throw new WorkspaceError(
        502,
        "A revoked calendar event could not be removed.",
      );
  }
  for (const { event_key, event } of events) {
    const version = await digest(JSON.stringify(event));
    let existing = mapped.find((m) => m.event_key === event_key);
    if (existing && existing.calendar_id !== c.destination_calendar_id) {
      const oldBase =
        c.provider === "google" ? "/calendars/" : "/me/calendars/";
      const deleted = await providerFetch(
        c,
        s,
        oldBase +
          encodeURIComponent(existing.calendar_id) +
          "/events/" +
          encodeURIComponent(existing.provider_event_id),
        { method: "DELETE" },
      );
      if (!deleted.ok && ![404, 410].includes(deleted.status))
        throw new WorkspaceError(
          502,
          "Previous calendar event could not be moved.",
        );
      await s.service("pathway_calendar_events?id=eq." + existing.id, {
        method: "DELETE",
      });
      existing = undefined;
    }
    const eventIdentity =
      c.id +
      event_key +
      c.destination_calendar_id +
      (existing?.provider_event_id || "initial");
    const base =
      c.provider === "google"
        ? `/calendars/${encodeURIComponent(c.destination_calendar_id)}/events`
        : `/me/calendars/${encodeURIComponent(c.destination_calendar_id)}/events`;
    if (event.status === "cancelled") {
      if (existing) {
        const r = await providerFetch(
          c,
          s,
          base + "/" + encodeURIComponent(existing.provider_event_id),
          { method: "DELETE" },
        );
        if (!r.ok && r.status !== 404 && r.status !== 410)
          throw new WorkspaceError(502, "Calendar cancellation failed.");
        await s.service(`pathway_calendar_events?id=eq.${existing.id}`, {
          method: "DELETE",
        });
      }
      continue;
    }
    const content =
      c.provider === "google"
        ? {
            summary: event.title,
            description:
              "Managed in Navigate the Pathway. Accept scheduling changes in the portal.",
            start: { dateTime: event.starts_at },
            end: { dateTime: event.ends_at },
            extendedProperties: { private: { navigate_event: event_key } },
          }
        : {
            subject: event.title,
            body: {
              contentType: "text",
              content:
                "Managed in Navigate the Pathway. Accept scheduling changes in the portal.",
            },
            start: { dateTime: event.starts_at, timeZone: "UTC" },
            end: { dateTime: event.ends_at, timeZone: "UTC" },
          };
    let response: Response;
    if (existing) {
      const current = await providerFetch(
        c,
        s,
        base + "/" + encodeURIComponent(existing.provider_event_id),
      );
      if (current.ok) {
        const live = (await current.json()) as Record<string, unknown>;
        const start = (live.start as { dateTime?: string })?.dateTime;
        const end = (live.end as { dateTime?: string })?.dateTime;
        if (
          existing.portal_version === version &&
          start &&
          end &&
          Date.parse(/Z|[+-]\d\d:\d\d$/.test(start) ? start : start + "Z") ===
            Date.parse(event.starts_at) &&
          Date.parse(/Z|[+-]\d\d:\d\d$/.test(end) ? end : end + "Z") ===
            Date.parse(event.ends_at)
        )
          continue;
        // Portal acceptance is authoritative. External edits are restored, not accepted.
        response = await providerFetch(
          c,
          s,
          base + "/" + encodeURIComponent(existing.provider_event_id),
          { method: "PATCH", body: JSON.stringify(content) },
        );
      } else if (current.status === 404 || current.status === 410) {
        response = await providerFetch(c, s, base, {
          method: "POST",
          body: JSON.stringify({
            ...content,
            ...(c.provider === "microsoft"
              ? { transactionId: await digest(eventIdentity) }
              : {
                  id: (await digest(eventIdentity))
                    .toLowerCase()
                    .replace(/[^a-v0-9]/g, "0"),
                }),
          }),
        });
      } else throw new WorkspaceError(502, "Calendar reconciliation failed.");
    } else
      response = await providerFetch(c, s, base, {
        method: "POST",
        body: JSON.stringify({
          ...content,
          ...(c.provider === "microsoft"
            ? { transactionId: await digest(eventIdentity) }
            : {
                id: (await digest(eventIdentity))
                  .toLowerCase()
                  .replace(/[^a-v0-9]/g, "0"),
              }),
        }),
      });
    let data: Record<string, unknown>;
    if (response.status === 409 && c.provider === "google")
      data = await responseJson(
        await providerFetch(
          c,
          s,
          base +
            "/" +
            (await digest(eventIdentity))
              .toLowerCase()
              .replace(/[^a-v0-9]/g, "0"),
        ),
      );
    else data = await responseJson(response);
    await s.service(
      "pathway_calendar_events?on_conflict=connection_id,event_key",
      {
        method: "POST",
        headers: { prefer: "resolution=merge-duplicates" },
        body: JSON.stringify({
          connection_id: c.id,
          event_key,
          provider_event_id: String(data.id),
          calendar_id: c.destination_calendar_id,
          portal_version: version,
          last_synced_at: new Date().toISOString(),
        }),
      },
    );
  }
  await s.service(`pathway_calendar_connections?id=eq.${c.id}`, {
    method: "PATCH",
    body: JSON.stringify({ last_synced_at: new Date().toISOString() }),
  });
  await renewSubscription(c, s);
}

async function renewSubscription(c: Connection, s: CalendarServices) {
  if (
    c.subscription_expires_at &&
    Date.parse(c.subscription_expires_at) > Date.now() + 86400000
  )
    return;
  const secret = b64(crypto.getRandomValues(new Uint8Array(24)));
  const callback = new URL(
    "/api/calendar/webhook",
    s.config.callbackUrl,
  ).toString();
  let result: Record<string, unknown>;
  if (c.provider === "google") {
    result = await responseJson(
      await providerFetch(
        c,
        s,
        `/calendars/${encodeURIComponent(c.destination_calendar_id!)}/events/watch`,
        {
          method: "POST",
          body: JSON.stringify({
            id: crypto.randomUUID(),
            type: "web_hook",
            address: callback,
            token: secret,
            expiration: String(Date.now() + 6 * 86400000),
          }),
        },
      ),
    );
    if (c.subscription_id && c.subscription_resource_id)
      await providerFetch(c, s, "/channels/stop", {
        method: "POST",
        body: JSON.stringify({
          id: c.subscription_id,
          resourceId: c.subscription_resource_id,
        }),
      });
  } else {
    if (c.subscription_id) {
      const renewed = await providerFetch(
        c,
        s,
        `/subscriptions/${encodeURIComponent(c.subscription_id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            expirationDateTime: new Date(
              Date.now() + 2 * 86400000,
            ).toISOString(),
          }),
        },
      );
      if (renewed.ok) {
        result = (await renewed.json()) as Record<string, unknown>;
        await s.service(`pathway_calendar_connections?id=eq.${c.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            subscription_expires_at: result.expirationDateTime,
          }),
        });
        return;
      }
    }
    result = await responseJson(
      await providerFetch(c, s, "/subscriptions", {
        method: "POST",
        body: JSON.stringify({
          changeType: "created,updated,deleted",
          notificationUrl: callback,
          resource: "me/events",
          expirationDateTime: new Date(Date.now() + 2 * 86400000).toISOString(),
          clientState: secret,
        }),
      }),
    );
  }
  await s.service(`pathway_calendar_connections?id=eq.${c.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      subscription_id: result.id,
      subscription_resource_id: result.resourceId || null,
      subscription_secret: secret,
      subscription_expires_at:
        c.provider === "google"
          ? new Date(Number(result.expiration)).toISOString()
          : result.expirationDateTime,
    }),
  });
}

export async function syncCalendars(s: CalendarServices) {
  if (!s.config.encryptionKey) return;
  const jobs = await s.service<Array<{ id: string; attempts: number }>>(
    "rpc/pathway_claim_jobs",
    { method: "POST", body: "{}" },
  );
  let failed = false;
  for (let offset = 0; ; offset += 100) {
    let connections: Connection[];
    try {
      connections = await s.service<Connection[]>(
        `pathway_calendar_connections?status=eq.connected&order=id&limit=100&offset=${offset}`,
      );
    } catch {
      failed = true;
      break;
    }
    for (const c of connections) {
      try {
        await syncConnection(c, s);
      } catch {
        failed = true;
      }
    }
    if (connections.length < 100) break;
  }
  for (const j of jobs)
    await s.service(`pathway_background_jobs?id=eq.${j.id}`, {
      method: "PATCH",
      body: JSON.stringify(
        failed
          ? {
              status: j.attempts >= 5 ? "failed" : "pending",
              locked_until: null,
              run_after: new Date(
                Date.now() + Math.min(3600000, 60000 * 2 ** j.attempts),
              ).toISOString(),
              last_error:
                "Calendar synchronization needs retry or reconnection.",
            }
          : { status: "completed", locked_until: null },
      ),
    });
}
