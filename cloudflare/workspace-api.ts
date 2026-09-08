import { isIP } from "node:net";
import {
  validateRoster,
  workspacePages,
} from "../app/production/workspace-model";
import {
  calendarRequest,
  checkAppointmentAvailability,
  syncCalendars,
  type CalendarServices,
} from "./workspace-calendars";

export type WorkspaceUser = {
  id: string;
  token: string;
  aal: string;
  sessionId: string;
};
export type WorkspaceServices = CalendarServices & {
  user: WorkspaceUser;
  rpc<T>(name: string, body?: unknown): Promise<T>;
  service<T>(path: string, options?: RequestInit): Promise<T>;
  createAuthUser(email: string, name: string): Promise<{ id: string }>;
};
export class WorkspaceError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const workspaceJson = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });

export async function workspaceBody(
  request: Request,
): Promise<Record<string, unknown>> {
  if (Number(request.headers.get("content-length") || 0) > 1_000_000)
    throw new WorkspaceError(413, "Request is too large.");
  const reader = request.body?.getReader();
  if (!reader) return {};
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 1_000_000) {
      await reader.cancel();
      throw new WorkspaceError(413, "Request is too large.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    const body = JSON.parse(new TextDecoder().decode(bytes));
    if (!body || Array.isArray(body) || typeof body !== "object")
      throw new Error();
    return body;
  } catch {
    throw new WorkspaceError(400, "Provide a JSON object.");
  }
}

const reads = new Set([
  "directory",
  "notifications",
  "appointments",
  "conversations",
  "messages",
  "support",
  "support_materials",
  "session_context",
  "sessions",
  "calendar_connections",
  "analytics",
  "access",
  "roster_context",
  "roster_status",
]);
const writes = new Set([
  "notification_read",
  "appointment_request",
  "appointment_change",
  "dm_create",
  "message_send",
  "message_read",
  "message_report",
  "support_share",
  "support_revoke",
  "support_review",
  "support_generate",
  "session_save",
  "access_update",
  "communication_policy",
  "calendar_disconnect",
]);

export async function workspaceRoute(
  request: Request,
  services: WorkspaceServices,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/calendar/"))
    return calendarRequest(request, services);
  if (url.pathname === "/api/activity/page" && request.method === "POST") {
    const body = await workspaceBody(request);
    if (
      !(workspacePages as readonly unknown[]).includes(body.page) ||
      !/^[0-9a-f-]{36}$/i.test(String(body.eventId))
    )
      throw new WorkspaceError(400, "Invalid page event.");
    const rawIp = request.headers.get("cf-connecting-ip") || "";
    const ip = isIP(rawIp) ? rawIp : null;
    await services.service("rpc/pathway_record_page", {
      method: "POST",
      body: JSON.stringify({
        actor: services.user.id,
        event_id: body.eventId,
        page_key: body.page,
        session_key: services.user.sessionId,
        ip,
      }),
    });
    return workspaceJson({ ok: true });
  }
  const match = url.pathname.match(/^\/api\/workspace\/([a-z_]+)$/);
  if (!match) return null;
  const action = match[1];
  const body =
    request.method === "GET"
      ? Object.fromEntries(url.searchParams)
      : await workspaceBody(request);
  if (action === "roster_preview" && request.method === "POST") {
    const rows = validateRoster(body.rows);
    if (rows.some((row) => row.errors.length))
      return workspaceJson({ rows, valid: false });
    const result = await services.rpc("pathway_action", {
      action,
      payload: { requestKey: body.requestKey, rows },
    });
    return workspaceJson(result);
  }
  if (action === "roster_commit" && request.method === "POST") {
    // Validate current JWT/MFA/scope again on every batch. Each row commits in its
    // own DB transaction; auth email uniqueness makes retries safe after timeouts.
    const preview = await services.rpc<{
      id: string;
      rows: Array<{
        row_number: number;
        values: Record<string, string>;
        status: string;
        user_id: string | null;
      }>;
    }>("pathway_action", { action: "roster_commit", payload: body });
    const pending = preview.rows
      .filter((row) => ["pending", "failed"].includes(row.status))
      .sort(
        (a, b) =>
          Number(b.values.role === "advisor") -
          Number(a.values.role === "advisor"),
      )
      .slice(0, 10);
    for (const row of pending) {
      try {
        const findIdentity = async (email: string) =>
          (
            await services.service<
              Array<{ auth_user_id: string; canonical_user_id: string }>
            >(
              `account_auth_identities?email=eq.${encodeURIComponent(email)}&select=auth_user_id,canonical_user_id`,
            )
          )[0];
        const existing = await findIdentity(row.values.primary_email);
        const primary =
          existing?.canonical_user_id ||
          (
            await services.createAuthUser(
              row.values.primary_email,
              row.values.name,
            )
          ).id;
        let secondary: string | null = null;
        if (row.values.secondary_email) {
          const linked = await findIdentity(row.values.secondary_email);
          if (linked && linked.canonical_user_id !== primary)
            throw new Error(
              "Secondary email belongs to another account; use the explicit merge workflow.",
            );
          secondary =
            linked?.auth_user_id ||
            (
              await services.createAuthUser(
                row.values.secondary_email,
                row.values.name,
              )
            ).id;
        }
        await services.service("rpc/pathway_apply_roster_row", {
          method: "POST",
          body: JSON.stringify({
            import_id: preview.id,
            row_number: row.row_number,
            actor: services.user.id,
            primary_id: primary,
            secondary_id: secondary,
          }),
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Row could not be imported.";
        await services.service(
          `pathway_roster_rows?import_id=eq.${preview.id}&row_number=eq.${row.row_number}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              status: "failed",
              error: message.slice(0, 300),
            }),
          },
        );
      }
    }
    const result = await services.rpc<{ rows: Array<{ status: string }> }>(
      "pathway_action",
      { action: "roster_status", payload: body },
    );
    await services.service(`pathway_roster_imports?id=eq.${preview.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: result.rows.every((row) =>
          ["created", "updated"].includes(row.status),
        )
          ? "committed"
          : "partial",
      }),
    });
    return workspaceJson(result);
  }
  if (action === "appointment_change" && body.decision === "accept")
    await checkAppointmentAvailability(String(body.id), services);
  if (
    (request.method === "GET" && reads.has(action)) ||
    (request.method === "POST" && writes.has(action))
  )
    return workspaceJson(
      await services.rpc("pathway_action", { action, payload: body }),
    );
  throw new WorkspaceError(404, "Workspace action not found.");
}

export async function workspaceScheduled(services: CalendarServices) {
  await services.service("rpc/pathway_maintenance", {
    method: "POST",
    body: "{}",
  });
  await syncCalendars(services);
}
