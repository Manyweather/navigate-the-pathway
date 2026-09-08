"use client";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type { PilotApiClient } from "./api-client";
import type { AuthorizationContext } from "./types";
import {
  calendarFile,
  localTimeToUtc,
  workspacePages,
  rosterColumns,
  rosterFromGrid,
  parseCsv,
  csvText,
  type Appointment,
  type DirectoryPerson,
  type Conversation,
  type ChatMessage,
  type SupportSource,
  type SupportReview,
  type RosterRow,
} from "./workspace-model";
import {
  usePathwayView,
  useSessionDraft,
  usePathwayLocation,
} from "./workspace-navigation";

const get = <T,>(
  api: PilotApiClient,
  action: string,
  params: Record<string, string> = {},
) => api.request<T>(`/api/workspace/${action}?${new URLSearchParams(params)}`);
const post = <T,>(api: PilotApiClient, action: string, body: unknown) =>
  api.request<T>(`/api/workspace/${action}`, { method: "POST", body });
function useLoad<T>(load: () => Promise<T>, deps: unknown[], poll = 0) {
  const loadKey = useMemo(
    () => Symbol(),
    [deps[0], deps[1], deps[2], deps[3], deps[4]],
  );
  const [result, setResult] = useState<{ key: symbol; value: T } | null>(null),
    [failure, setFailure] = useState<{ key: symbol; message: string } | null>(
      null,
    );
  const loader = useRef(load);
  useEffect(() => {
    loader.current = load;
  });
  const refresh = useCallback(async () => {
    try {
      const value = await loader.current();
      setResult({ key: loadKey, value });
      setFailure(null);
    } catch (e) {
      setFailure({
        key: loadKey,
        message:
          e instanceof Error ? e.message : "Could not load this workspace.",
      });
    }
  }, [loadKey]);
  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    const interval = poll
      ? setInterval(() => {
          if (document.visibilityState === "visible") void refresh();
        }, poll)
      : null;
    return () => {
      clearTimeout(timer);
      if (interval) clearInterval(interval);
    };
  }, [refresh, poll, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  return {
    data:
      result?.key === loadKey && failure?.key !== loadKey ? result.value : null,
    error: failure?.key === loadKey ? failure.message : "",
    refresh,
  };
}
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="production-card production-card--wide workspace-panel">
      <h2>{title}</h2>
      {children}
    </section>
  );
}
function Notice({ text }: { text: string }) {
  return text ? (
    <p className="form-message" role="status">
      {text}
    </p>
  ) : null;
}
function saveFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function time(value: string) {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
const timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export function AppointmentWorkspace({
  api,
  userId,
  onChat,
}: {
  api: PilotApiClient;
  userId: string;
  onChat: (id: string) => void;
}) {
  const appointments = useLoad(
      () => get<Appointment[]>(api, "appointments"),
      [api],
      15000,
    ),
    directory = useLoad(() => get<DirectoryPerson[]>(api, "directory"), [api]);
  const [draft, setDraft] = useSessionDraft("appointment-form", {
    recipientId: "",
    title: "",
    start: "",
    end: "",
    zone: timezone(),
  });
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const requestKey = useRef(crypto.randomUUID());
  const [editing, setEditing] = usePathwayView<Appointment | null>(
    "appointment-edit",
    null,
  );
  const update = (key: string, value: string) =>
    setDraft({ ...draft, [key]: value });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = {
        recipientId: draft.recipientId,
        title: draft.title,
        startsAt: localTimeToUtc(draft.start, draft.zone),
        endsAt: localTimeToUtc(draft.end, draft.zone),
        timezone: draft.zone,
      };
      if (editing)
        await post(api, "appointment_change", {
          ...payload,
          id: editing.id,
          version: editing.version,
          decision: "reschedule",
        });
      else
        await post(api, "appointment_request", {
          ...payload,
          requestKey: requestKey.current,
        });
      requestKey.current = crypto.randomUUID();
      setDraft({
        recipientId: "",
        title: "",
        start: "",
        end: "",
        zone: timezone(),
      });
      setEditing(null);
      setMessage(
        "Request sent. The recipient must accept before it is confirmed.",
      );
      await appointments.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  };
  const decide = async (a: Appointment, decision: string) => {
    setBusy(true);
    try {
      await post(api, "appointment_change", {
        id: a.id,
        version: a.version,
        decision,
      });
      setMessage("Appointment updated.");
      await appointments.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Update failed.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel title="Appointments">
      <p>
        Propose a time with your advisor or program colleague. Every booking and
        time change requires acceptance.
      </p>
      <Notice text={message || appointments.error || directory.error} />
      <form className="workspace-form" onSubmit={submit}>
        <label>
          Recipient
          <select
            required
            disabled={!!editing}
            value={draft.recipientId}
            onChange={(e) => update("recipientId", e.target.value)}
          >
            <option value="">Choose a person</option>
            {directory.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Appointment title
          <input
            required
            maxLength={160}
            value={draft.title}
            onChange={(e) => update("title", e.target.value)}
          />
        </label>
        <label>
          Starts
          <input
            type="datetime-local"
            required
            value={draft.start}
            onChange={(e) => update("start", e.target.value)}
          />
        </label>
        <label>
          Ends
          <input
            type="datetime-local"
            required
            value={draft.end}
            onChange={(e) => update("end", e.target.value)}
          />
        </label>
        <label>
          Time zone
          <input
            required
            value={draft.zone}
            onChange={(e) => update("zone", e.target.value)}
            list="pathway-timezones"
          />
          <datalist id="pathway-timezones">
            {[
              "America/Los_Angeles",
              "America/Denver",
              "America/Chicago",
              "America/New_York",
              "Pacific/Honolulu",
              "UTC",
            ].map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </label>
        <button className="primary-button" disabled={busy}>
          {editing ? "Propose new time" : "Request appointment"}
        </button>
        {editing ? (
          <button
            type="button"
            className="text-button"
            onClick={() => setEditing(null)}
          >
            Cancel edit
          </button>
        ) : null}
      </form>
      <div className="workspace-list">
        {appointments.data?.map((a) => (
          <article key={a.id}>
            <div className="workspace-row">
              <h3>{a.title}</h3>
              <span className="role-chip">{a.status}</span>
            </div>
            <p>
              {a.other_name} · {time(a.starts_at)} – {time(a.ends_at)}
              <br />
              <small>
                Displayed in {timezone()}; booked in {a.timezone}.
              </small>
            </p>
            {a.proposal ? (
              <p className="privacy-note">
                Proposed change: {time(a.proposal.starts_at)} –{" "}
                {time(a.proposal.ends_at)}. The existing time stays confirmed
                until acceptance.
              </p>
            ) : null}
            <div className="workspace-actions">
              {(a.status === "pending" && a.recipient_id === userId) ||
              (a.proposal && a.proposal.requested_by !== userId) ? (
                <>
                  <button
                    disabled={busy}
                    className="primary-button"
                    onClick={() => void decide(a, "accept")}
                  >
                    Accept
                  </button>
                  <button
                    disabled={busy}
                    className="secondary-button"
                    onClick={() => void decide(a, "decline")}
                  >
                    Decline
                  </button>
                </>
              ) : null}
              {a.status === "accepted" ? (
                <>
                  <button
                    className="secondary-button"
                    onClick={() => {
                      setEditing(a);
                      setDraft({
                        ...draft,
                        recipientId:
                          a.requester_id === userId
                            ? a.recipient_id
                            : a.requester_id,
                        title: a.title,
                      });
                    }}
                  >
                    Reschedule
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() =>
                      saveFile(
                        new Blob([calendarFile(a)], { type: "text/calendar" }),
                        "navigate-appointment.ics",
                      )
                    }
                  >
                    Add to calendar
                  </button>
                </>
              ) : null}
              {a.conversation_id ? (
                <button
                  className="secondary-button"
                  onClick={() => onChat(a.conversation_id!)}
                >
                  Appointment chat
                </button>
              ) : null}
              {["pending", "accepted"].includes(a.status) ? (
                <button
                  disabled={busy}
                  className="text-button"
                  onClick={() => void decide(a, "cancel")}
                >
                  Cancel appointment
                </button>
              ) : null}
            </div>
          </article>
        ))}
        {appointments.data?.length === 0 ? <p>No appointments yet.</p> : null}
      </div>
    </Panel>
  );
}

export function MessagingWorkspace({
  api,
  userId,
  initialConversation,
}: {
  api: PilotApiClient;
  userId: string;
  initialConversation: string | null;
}) {
  const list = useLoad(
      () => get<Conversation[]>(api, "conversations"),
      [api],
      10000,
    ),
    directory = useLoad(
      () => get<DirectoryPerson[]>(api, "directory", { dm: "true" }),
      [api],
    );
  const [selected, setSelected] = usePathwayView<string | null>(
      "conversation",
      initialConversation,
    ),
    [recipient, setRecipient] = useState(""),
    [message, setMessage] = useState("");
  const [bodies, setBodies] = useSessionDraft<Record<string, string>>(
    "message-drafts",
    {},
  );
  const [older, setOlder] = useState<ChatMessage[]>([]);
  const messages = useLoad(
    () =>
      selected
        ? get<ChatMessage[]>(api, "messages", { conversationId: selected })
        : Promise.resolve([]),
    [api, selected],
    5000,
  );
  const conversation = list.data?.find((c) => c.id === selected);
  const key = useRef(crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const choose = (id: string) => {
    setOlder([]);
    setSelected(id);
  };
  const start = async () => {
    try {
      const c = await post<{ id: string }>(api, "dm_create", {
        recipientId: recipient,
      });
      await list.refresh();
      choose(c.id);
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Could not open a conversation.",
      );
    }
  };
  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    try {
      await post(api, "message_send", {
        conversationId: selected,
        body: bodies[selected] || "",
        clientId: key.current,
      });
      key.current = crypto.randomUUID();
      setBodies({ ...bodies, [selected]: "" });
      await messages.refresh();
      await list.refresh();
      setMessage("");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Message failed.");
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    const last = messages.data?.at(-1);
    if (selected && last && !messages.error)
      void post(api, "message_read", {
        conversationId: selected,
        through: last.created_at,
      }).catch(() => undefined);
  }, [api, selected, messages.data, messages.error]);
  const previous = async () => {
    const first = older[0] || messages.data?.[0];
    if (!first || !selected) return;
    try {
      const page = await get<ChatMessage[]>(api, "messages", {
        conversationId: selected,
        before: first.created_at,
        beforeId: first.id,
      });
      setOlder([...page, ...older]);
      if (!page.length)
        setMessage("You have reached the beginning of this conversation.");
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Could not load earlier messages.",
      );
    }
  };
  const report = async (m: ChatMessage) => {
    const reason = window.prompt("Why are you reporting this message?");
    if (!reason) return;
    try {
      await post(api, "message_report", {
        conversationId: selected,
        messageId: m.id,
        reason,
      });
      setMessage("Report recorded for program review.");
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Could not report the message.",
      );
    }
  };
  return (
    <Panel title="Messages">
      <p>
        Appointment chats and direct messages are separate. Students can message
        their assigned advisors; student-to-student DMs are unavailable.
      </p>
      <Notice
        text={message || list.error || directory.error || messages.error}
      />
      <div className="workspace-form">
        <label>
          Start a direct message
          <select
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
          >
            <option value="">Choose a permitted recipient</option>
            {directory.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="secondary-button"
          disabled={!recipient}
          onClick={() => void start()}
        >
          Open DM
        </button>
      </div>
      <div className="messaging-layout">
        <aside aria-label="Conversations">
          {["appointment", "dm"].map((kind) => (
            <div key={kind}>
              <h3>
                {kind === "appointment"
                  ? "Appointment chats"
                  : "Direct messages"}
              </h3>
              {list.data
                ?.filter((c) => c.kind === kind)
                .map((c) => (
                  <button
                    key={c.id}
                    className={selected === c.id ? "active" : ""}
                    onClick={() => choose(c.id)}
                  >
                    {c.title}
                    {c.unread ? (
                      <span aria-label={`${c.unread} unread`}>
                        {" "}
                        · {c.unread}
                      </span>
                    ) : null}
                  </button>
                ))}
            </div>
          ))}
        </aside>
        <div>
          {selected && conversation ? (
            <>
              <h3>{conversation.title}</h3>
              <button className="text-button" onClick={() => void previous()}>
                Load earlier messages
              </button>
              <div className="message-log" role="log" aria-live="polite">
                {!messages.error
                  ? [...older, ...(messages.data || [])]
                      .filter(
                        (m, i, all) =>
                          all.findIndex((x) => x.id === m.id) === i,
                      )
                      .map((m) => (
                        <article
                          key={m.id}
                          className={
                            m.author_id === userId ? "message-own" : ""
                          }
                        >
                          <strong>{m.author_name}</strong>
                          <p>{m.body}</p>
                          <small>{time(m.created_at)}</small>
                          <button
                            className="text-button"
                            onClick={() => void report(m)}
                            aria-label={`Report message from ${m.author_name}`}
                          >
                            Report
                          </button>
                        </article>
                      ))
                  : null}
              </div>
              {conversation.readonly ? (
                <p>This appointment was cancelled. Its chat is read-only.</p>
              ) : (
                <form onSubmit={send}>
                  <label>
                    Your message
                    <textarea
                      required
                      maxLength={4000}
                      value={bodies[selected] || ""}
                      onChange={(e) =>
                        setBodies({ ...bodies, [selected]: e.target.value })
                      }
                    />
                  </label>
                  <button className="primary-button" disabled={busy}>
                    {busy ? "Sending…" : "Send"}
                  </button>
                </form>
              )}
            </>
          ) : (
            <p>Choose a conversation to read or send messages.</p>
          )}
        </div>
      </div>
    </Panel>
  );
}

export function SupportWorkspace({
  api,
  context,
}: {
  api: PilotApiClient;
  context: AuthorizationContext;
}) {
  const records = useLoad(
    () =>
      get<{ sources: SupportSource[]; reviews: SupportReview[] }>(
        api,
        "support",
      ),
    [api],
    15000,
  );
  const materials = useLoad(
    () => context.roles.includes("student") ? get<Array<{ id: string; title: string }>>(api, "support_materials") : Promise.resolve([]),
    [api],
  );
  const [message, setMessage] = useState("");
  const [share, setShare] = useSessionDraft("support-share", {
    goals: "",
    barriers: "",
    deadlines: "",
    expires: "",
    packetId: "",
  });
  const [review, setReview] = useSessionDraft("support-review", {
    id: "",
    sourceId: "",
    area: "",
    evidence: "",
    action: "",
    status: "draft",
    share: false,
    followUpOn: "",
  });
  const sendShare = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await post(api, "support_share", {
        ...share,
        packetId: share.packetId || null,
        expiresAt: share.expires
          ? new Date(share.expires + "T23:59:59").toISOString()
          : null,
      });
      setShare({
        goals: "",
        barriers: "",
        deadlines: "",
        expires: "",
        packetId: "",
      });
      setMessage(
        "Your support information is shared with assigned advisors, Creator, and PI.",
      );
      await records.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not share.");
    }
  };
  const save = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await post(api, "support_review", {
        ...review,
        id: review.id || null,
        followUpOn: review.followUpOn || null,
      });
      setMessage("Support review saved.");
      await records.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not save.");
    }
  };
  const revoke = async (id: string) => {
    try {
      await post(api, "support_revoke", { id });
      await records.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not revoke.");
    }
  };
  const staff = context.roles.includes("advisor") || !!context.principalType;
  return (
    <Panel title="Support priorities">
      <p className="privacy-note">
        <strong>AI generation: Not configured.</strong> Support actions are
        written and reviewed by staff. No automated forecasts are being
        generated.
      </p>
      <Notice text={message || records.error} />
      {context.roles.includes("student") ? (
        <form className="workspace-form" onSubmit={sendShare}>
          <h3>Choose what to share</h3>
          {(
            [
              ["goals", "Goals"],
              ["barriers", "Areas where support would help"],
              ["deadlines", "Upcoming deadlines"],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              {label}
              <textarea
                maxLength={4000}
                value={share[key]}
                onChange={(e) => setShare({ ...share, [key]: e.target.value })}
              />
            </label>
          ))}
          <label>
            Shared advising packet (optional)
            <select
              value={share.packetId}
              onChange={(e) => setShare({ ...share, packetId: e.target.value })}
            >
              <option value="">Goals and barriers only</option>
              {materials.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Sharing expires on (optional)
            <input
              type="date"
              value={share.expires}
              onChange={(e) => setShare({ ...share, expires: e.target.value })}
            />
          </label>
          <button className="primary-button">Share support information</button>
        </form>
      ) : null}
      <div className="workspace-list">
        {records.data?.sources.map((s) => (
          <article key={s.id}>
            <h3>{s.student_name}</h3>
            <p>
              <strong>Goals:</strong> {s.goals || "Not supplied"}
            </p>
            <p>
              <strong>Support areas:</strong> {s.barriers || "Not supplied"}
            </p>
            <p>
              <strong>Deadlines:</strong> {s.deadlines || "Not supplied"}
            </p>
            {s.packet_title ? (
              <p>
                Selected advising material: {s.packet_title}. Open the shared
                packet in Advising to review its contents.
              </p>
            ) : null}
            {s.revoked_at ? (
              <span>Sharing revoked</span>
            ) : s.student_id === context.userId ? (
              <button className="text-button" onClick={() => void revoke(s.id)}>
                Revoke sharing
              </button>
            ) : staff ? (
              <button
                className="secondary-button"
                onClick={() =>
                  setReview({
                    ...review,
                    id: "",
                    sourceId: s.id,
                    evidence: "",
                    action: "",
                    area: "",
                    status: "draft",
                    share: false,
                  })
                }
              >
                Create support action
              </button>
            ) : null}
          </article>
        ))}
      </div>
      {staff &&
      review.sourceId &&
      records.data?.sources.some(
        (s) => s.id === review.sourceId && !s.revoked_at,
      ) ? (
        <form className="workspace-form" onSubmit={save}>
          <h3>Review and follow-up</h3>
          <label>
            Priority area
            <input
              required
              maxLength={160}
              value={review.area}
              onChange={(e) => setReview({ ...review, area: e.target.value })}
            />
          </label>
          <label>
            Evidence from the shared information
            <textarea
              required
              maxLength={4000}
              value={review.evidence}
              onChange={(e) =>
                setReview({ ...review, evidence: e.target.value })
              }
            />
          </label>
          <label>
            Proposed support action
            <textarea
              required
              maxLength={4000}
              value={review.action}
              onChange={(e) => setReview({ ...review, action: e.target.value })}
            />
          </label>
          <label>
            Status
            <select
              value={review.status}
              onChange={(e) => setReview({ ...review, status: e.target.value })}
            >
              {["draft", "reviewed", "in_progress", "completed"].map((s) => (
                <option key={s} value={s}>
                  {s.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label>
            Follow-up date
            <input
              type="date"
              value={review.followUpOn}
              onChange={(e) =>
                setReview({ ...review, followUpOn: e.target.value })
              }
            />
          </label>
          <label className="workspace-check">
            <input
              type="checkbox"
              checked={review.share}
              onChange={(e) =>
                setReview({ ...review, share: e.target.checked })
              }
            />
            Share this action with the student after review
          </label>
          <button className="primary-button">Save support action</button>
        </form>
      ) : null}
      <h3>Support actions</h3>
      <div className="workspace-list">
        {records.data?.reviews.map((r) => (
          <article key={r.id}>
            <h4>
              {r.student_name} · {r.area}
            </h4>
            <p>{r.action}</p>
            <p>
              <small>
                {r.status.replaceAll("_", " ")} ·{" "}
                {r.follow_up_on
                  ? `Follow up ${r.follow_up_on}`
                  : "No follow-up date"}
              </small>
            </p>
            {staff ? (
              <button
                className="text-button"
                onClick={() =>
                  setReview({
                    id: r.id,
                    sourceId: r.source_id,
                    area: r.area,
                    evidence: r.evidence,
                    action: r.action,
                    status: r.status,
                    share: r.shared_with_student,
                    followUpOn: r.follow_up_on || "",
                  })
                }
              >
                Review / update
              </button>
            ) : null}
          </article>
        ))}
      </div>
    </Panel>
  );
}

export function NotificationWorkspace({ api }: { api: PilotApiClient }) {
  const items = useLoad(
    () =>
      get<
        Array<{
          id: string;
          title: string;
          created_at: string;
          read_at: string | null;
        }>
      >(api, "notifications"),
    [api],
    15000,
  );
  return (
    <Panel title="Notifications">
      <p>
        Appointment updates appear here. Automated notification emails are not
        configured.
      </p>
      <Notice text={items.error} />
      <div className="workspace-list">
        {items.data?.map((n) => (
          <article key={n.id}>
            <strong>{n.title}</strong>
            <p>{time(n.created_at)}</p>
            {!n.read_at ? (
              <button
                className="text-button"
                onClick={() =>
                  void post(api, "notification_read", { id: n.id }).then(
                    items.refresh,
                  )
                }
              >
                Mark read
              </button>
            ) : (
              <small>Read</small>
            )}
          </article>
        ))}
        {items.data?.length === 0 ? <p>You’re up to date.</p> : null}
      </div>
    </Panel>
  );
}

type ImportResult = {
  id?: string;
  valid?: boolean;
  rows: Array<{
    row_number?: number;
    row?: number;
    values: RosterRow;
    status?: string;
    user_id?: string;
    errors?: string[];
    error?: string;
  }>;
};
export function RosterWorkspace({ api }: { api: PilotApiClient }) {
  const [result, setResult] = useState<ImportResult | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [fileRows, setFileRows] = useSessionDraft<RosterRow[]>(
    "roster-rows",
    [],
  );
  const requestKey = useRef(crypto.randomUUID());
  const scope = useLoad(
    () =>
      get<{
        programs: Array<{ name: string }>;
        cohorts: Array<{ name: string }>;
      }>(api, "roster_context"),
    [api],
  );
  const template = async (format: "csv" | "xlsx") => {
    const grid = [Array.from(rosterColumns)];
    if (format === "csv")
      saveFile(
        new Blob([csvText(grid)], { type: "text/csv" }),
        "navigate-roster-template.csv",
      );
    else {
      const { default: ExcelJS } = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Roster");
      sheet.addRows(grid);
      sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      sheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF7B1837" },
      };
      sheet.columns.forEach((c) => {
        c.width = 26;
      });
      sheet.views = [{ state: "frozen", ySplit: 1 }];
      sheet.getColumn(4).eachCell({ includeEmpty: false }, () => {});
      const instructions = workbook.addWorksheet("Instructions");
      instructions.addRows([
        ["Navigate the Pathway roster"],
        ["Keep every heading. One person per row; role is student or advisor."],
        [
          "Primary email is required; secondary email is optional and must not belong to another account.",
        ],
        [
          "Use the program and cohort names shown in the portal. Advisor email must identify an advisor.",
        ],
        [
          "Import creates accounts without sending email. Send invitations separately after reviewing the result.",
        ],
      ]);
      instructions.getColumn(1).width = 110;
      const bytes = await workbook.xlsx.writeBuffer();
      saveFile(
        new Blob([bytes as ArrayBuffer], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
        "navigate-roster-template.xlsx",
      );
    }
  };
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      if (file.size > 5 * 1024 * 1024)
        throw new Error("Use a file smaller than 5 MB.");
      let grid: string[][];
      if (file.name.toLowerCase().endsWith(".csv"))
        grid = parseCsv(await file.text());
      else if (file.name.toLowerCase().endsWith(".xlsx")) {
        const { default: ExcelJS } = await import("exceljs");
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(await file.arrayBuffer());
        const sheet = workbook.getWorksheet("Roster") || workbook.worksheets[0];
        if (!sheet || sheet.rowCount > 1001)
          throw new Error("Use up to 1,000 rows.");
        grid = [];
        sheet.eachRow({ includeEmpty: true }, (row) => {
          const cells: string[] = [];
          for (let i = 1; i <= 7; i++) {
            const c = row.getCell(i);
            if (c.type === ExcelJS.ValueType.Formula)
              throw new Error(
                "Replace formulas with plain values before uploading.",
              );
            cells.push(c.text);
          }
          grid.push(cells);
        });
      } else throw new Error("Choose an Excel .xlsx or CSV file.");
      const rows = rosterFromGrid(grid);
      setFileRows(rows);
      setResult(null);
      requestKey.current = crypto.randomUUID();
      setMessage(`${rows.length} rows loaded. Preview before importing.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not read the file.");
    } finally {
      setBusy(false);
    }
  };
  const preview = async () => {
    setBusy(true);
    try {
      setResult(
        await post<ImportResult>(api, "roster_preview", {
          rows: fileRows,
          requestKey: requestKey.current,
        }),
      );
      setMessage(
        "Review every row before importing. No invitations have been sent.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Preview failed.");
    } finally {
      setBusy(false);
    }
  };
  const commit = async () => {
    if (!result?.id) return;
    setBusy(true);
    try {
      let next = await post<ImportResult>(api, "roster_commit", {
        id: result.id,
      });
      setResult(next);
      while (next.rows.some((r) => r.status === "pending")) {
        next = await post<ImportResult>(api, "roster_commit", {
          id: result.id,
        });
        setResult(next);
      }
      setMessage(
        "Import processed. Review failures before retrying. Invitations are a separate action.",
      );
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "Import interrupted; retry the remaining rows.",
      );
    } finally {
      setBusy(false);
    }
  };
  const invite = async () => {
    setBusy(true);
    try {
      for (const row of result?.rows || [])
        if (row.user_id && ["created", "updated"].includes(row.status || "")) {
          await api.request("/api/admin/invitations/resend", {
            method: "POST",
            body: { userId: row.user_id, email: row.values.primary_email },
          });
          if (row.values.secondary_email)
            await api.request("/api/admin/invitations/resend", {
              method: "POST",
              body: { userId: row.user_id, email: row.values.secondary_email },
            });
        }
      setMessage(
        "Invitation requests processed using the existing authentication-email service.",
      );
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Some invitations could not be sent.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel title="Import students and advisors">
      <p>
        Download a template, fill it in, and upload it for review. Account
        creation and invitations are separate steps.
      </p>
      <p>
        <strong>Program:</strong>{" "}
        {scope.data?.programs.map((p) => p.name).join(", ")}
        <br />
        <strong>Cohorts:</strong>{" "}
        {scope.data?.cohorts.map((c) => c.name).join(", ") || "None"}
      </p>
      <Notice text={message || scope.error} />
      <div className="workspace-actions">
        <button
          className="secondary-button"
          onClick={() => void template("xlsx")}
        >
          Download Excel template
        </button>
        <button
          className="secondary-button"
          onClick={() => void template("csv")}
        >
          Download CSV template
        </button>
        <label className="workspace-upload">
          Upload roster
          <input
            type="file"
            accept=".xlsx,.csv"
            disabled={busy}
            onChange={(e) => void upload(e.target.files?.[0])}
          />
        </label>
        <button
          className="primary-button"
          disabled={!fileRows.length || busy}
          onClick={() => void preview()}
        >
          Preview import
        </button>
      </div>
      {result ? (
        <>
          <div className="access-log-table-wrap">
            <table className="access-log-table">
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r) => (
                  <tr key={r.row_number || r.row}>
                    <td>{r.row_number || r.row}</td>
                    <td>{r.values.name}</td>
                    <td>{r.values.primary_email}</td>
                    <td>{r.values.role}</td>
                    <td>
                      {r.errors?.join(" ") ||
                        r.error ||
                        r.status ||
                        (r.user_id ? "Existing account" : "New account")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.id ? (
            <div className="workspace-actions">
              <button
                disabled={busy}
                className="primary-button"
                onClick={() => void commit()}
              >
                {busy ? "Processing…" : "Import / retry failed rows"}
              </button>
              <button
                disabled={
                  busy ||
                  !result.rows.some((r) =>
                    ["created", "updated"].includes(r.status || ""),
                  )
                }
                className="secondary-button"
                onClick={() => void invite()}
              >
                Send account invitations
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </Panel>
  );
}

type AccessData = {
  people: Array<{
    id: string;
    name: string;
    roles: Array<{
      role: string;
      cohort_id: string | null;
      program_id: string | null;
    }>;
    capabilities: string[] | null;
  }>;
  permissions: Array<{ key: string; description: string }>;
  cohorts: Array<{ id: string; name: string }>;
  policy: { student_advisor: boolean; administrator_advisor: boolean };
};
export function AccessWorkspace({
  api,
  context,
}: {
  api: PilotApiClient;
  context: AuthorizationContext;
}) {
  const access = useLoad(() => get<AccessData>(api, "access"), [api]);
  const [person, setPerson] = useState(""),
    [role, setRole] = useState("student"),
    [cohort, setCohort] = useState(""),
    [permission, setPermission] = useState(""),
    [message, setMessage] = useState("");
  const change = async (kind: "role" | "capability", grant: boolean) => {
    try {
      await post(api, "access_update", {
        userId: person,
        [kind]: kind === "role" ? role : permission,
        cohortId: cohort || null,
        grant,
      });
      await access.refresh();
      setMessage("Access updated and audited.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not update access.");
    }
  };
  const policy = async (
    key: "studentAdvisor" | "administratorAdvisor",
    enabled: boolean,
  ) => {
    try {
      await post(api, "communication_policy", {
        studentAdvisor: access.data?.policy.student_advisor,
        administratorAdvisor: access.data?.policy.administrator_advisor,
        [key]: enabled,
      });
      await access.refresh();
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "Could not update messaging permissions.",
      );
    }
  };
  const selected = access.data?.people.find((p) => p.id === person);
  return (
    <Panel title="People and permissions">
      <p>
        Choose a person, then grant or revoke access within this program.
        Principal ownership and governance permissions remain protected.
      </p>
      <Notice text={message || access.error} />
      <div className="workspace-form">
        <label>
          Person
          <select value={person} onChange={(e) => setPerson(e.target.value)}>
            <option value="">Choose an account</option>
            {access.data?.people
              .filter((p) => p.id !== context.userId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Role
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            {["student", "advisor", "administrator"].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <label>
          Cohort scope
          <select value={cohort} onChange={(e) => setCohort(e.target.value)}>
            <option value="">This program</option>
            {access.data?.cohorts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <div className="workspace-actions">
          <button
            className="secondary-button"
            disabled={!person}
            onClick={() => void change("role", true)}
          >
            Grant role
          </button>
          <button
            className="text-button"
            disabled={!person}
            onClick={() => void change("role", false)}
          >
            Revoke role
          </button>
        </div>
        <label>
          Permission
          <select
            value={permission}
            onChange={(e) => setPermission(e.target.value)}
          >
            <option value="">Choose a permission</option>
            {access.data?.permissions
              .filter((p) => context.capabilities.includes(p.key))
              .map((p) => (
                <option key={p.key} value={p.key}>
                  {p.description}
                </option>
              ))}
          </select>
        </label>
        <div className="workspace-actions">
          <button
            className="secondary-button"
            disabled={!person || !permission}
            onClick={() => void change("capability", true)}
          >
            Grant permission
          </button>
          <button
            className="text-button"
            disabled={!person || !permission}
            onClick={() => void change("capability", false)}
          >
            Revoke permission
          </button>
        </div>
      </div>
      {selected ? (
        <div className="privacy-note">
          <strong>{selected.name}</strong>
          <p>
            Roles:{" "}
            {selected.roles
              ?.map(
                (r) =>
                  `${r.role} (${r.cohort_id ? access.data?.cohorts.find((c) => c.id === r.cohort_id)?.name || "cohort" : r.program_id ? "program" : "organization"})`,
              )
              .join(", ") || "None"}
          </p>
          <p>Permissions: {selected.capabilities?.join(", ") || "None"}</p>
        </div>
      ) : null}
      <h3>Direct-message permissions</h3>
      <p>
        These switches can narrow the permitted pairs. Student-to-student DMs
        always remain blocked.
      </p>
      <label className="workspace-check">
        <input
          type="checkbox"
          checked={access.data?.policy.student_advisor || false}
          onChange={(e) => void policy("studentAdvisor", e.target.checked)}
        />
        Assigned student ↔ advisor
      </label>
      <label className="workspace-check">
        <input
          type="checkbox"
          checked={access.data?.policy.administrator_advisor || false}
          onChange={(e) =>
            void policy("administratorAdvisor", e.target.checked)
          }
        />
        Administrator ↔ advisor in scope
      </label>
    </Panel>
  );
}

export function PageAnalyticsWorkspace({ api }: { api: PilotApiClient }) {
  const [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [student, setStudent] = useState("");
  const report = useLoad(
    () =>
      get<{
        pages: Array<{ page: string; views: number; students: number }>;
        visits: Array<{
          id: string;
          user_id: string;
          display_name: string;
          page: string;
          viewed_at: string;
          ip_address: string | null;
        }>;
      }>(api, "analytics", {
        ...(from ? { from: new Date(from + "T00:00:00").toISOString() } : {}),
        ...(to ? { to: new Date(to + "T23:59:59").toISOString() } : {}),
        ...(student ? { studentId: student } : {}),
      }),
    [api, from, to, student],
  );
  return (
    <Panel title="Student page views">
      <p>
        Authenticated page visits are recorded without form answers or message
        contents. Full IP addresses are available for 30 days, then removed. An
        IP address identifies a network connection, not a verified physical
        location or person.
      </p>
      <div className="workspace-form">
        <label>
          From
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          Through
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <label>
          Student
          <select value={student} onChange={(e) => setStudent(e.target.value)}>
            <option value="">All students</option>
            {Array.from(
              new Map(
                report.data?.visits.map((v) => [v.user_id, v.display_name]),
              ).entries(),
            ).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="secondary-button"
          onClick={() => void report.refresh()}
        >
          Refresh
        </button>
      </div>
      <Notice text={report.error} />
      <div className="access-log-table-wrap">
        <table className="access-log-table">
          <thead>
            <tr>
              <th>Page</th>
              <th>Views</th>
              <th>Unique students</th>
            </tr>
          </thead>
          <tbody>
            {report.data?.pages.map((p) => (
              <tr key={p.page}>
                <td>{p.page}</td>
                <td>{p.views}</td>
                <td>{p.students}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3>Recent visits</h3>
        <table className="access-log-table">
          <thead>
            <tr>
              <th>Student</th>
              <th>Page</th>
              <th>Visited</th>
              <th>IP address</th>
            </tr>
          </thead>
          <tbody>
            {report.data?.visits.map((v) => (
              <tr key={v.id}>
                <td>{v.display_name}</td>
                <td>{v.page}</td>
                <td>{time(v.viewed_at)}</td>
                <td>{v.ip_address || "Not retained"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

type CalendarConnection = {
  id: string;
  provider: string;
  status: string;
  availabilityCalendarIds: string[];
  destinationCalendarId: string | null;
  lastSyncedAt: string | null;
};
export function CalendarWorkspace({ api }: { api: PilotApiClient }) {
  const status = useLoad(
      () =>
        api.request<{ google: boolean; microsoft: boolean }>(
          "/api/calendar/status",
        ),
      [api],
    ),
    connections = useLoad(
      () => get<CalendarConnection[]>(api, "calendar_connections"),
      [api],
    );
  const [selected, setSelected] = useState<CalendarConnection | null>(null),
    [calendars, setCalendars] = useState<
      Array<{ id: string; name: string; canWrite: boolean }>
    >([]),
    [message, setMessage] = useState("");
  const connect = async (provider: string) => {
    try {
      const result = await api.request<{ url: string }>(
        "/api/calendar/connect",
        { method: "POST", body: { provider } },
      );
      window.location.assign(result.url);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not connect.");
    }
  };
  const configure = async (c: CalendarConnection) => {
    try {
      setCalendars(
        await api.request(
          `/api/calendar/calendars?id=${encodeURIComponent(c.id)}`,
        ),
      );
      setSelected(c);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not list calendars.");
    }
  };
  const save = async () => {
    if (!selected) return;
    try {
      await api.request("/api/calendar/preferences", {
        method: "POST",
        body: selected,
      });
      setMessage(
        "Calendar preferences saved. Confirmed events will synchronize.",
      );
      setSelected(null);
      await connections.refresh();
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Could not save preferences.",
      );
    }
  };
  const disconnect = async (id: string) => {
    try {
      await api.request("/api/calendar/disconnect", {
        method: "POST",
        body: { id },
      });
      await connections.refresh();
      setSelected(null);
      setMessage("Calendar disconnected; access credentials removed.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not disconnect.");
    }
  };
  return (
    <Panel title="Connected calendars">
      <p>
        Connect Google or Outlook to check availability and synchronize
        confirmed sessions and appointments. These calendars can also appear in
        Apple Calendar. Scheduling decisions stay in Navigate.
      </p>
      <Notice text={message || status.error || connections.error} />
      <div className="workspace-actions">
        {(["google", "microsoft"] as const).map((p) => (
          <button
            className="secondary-button"
            key={p}
            disabled={!status.data?.[p]}
            onClick={() => void connect(p)}
          >
            {p === "google" ? "Google Calendar" : "Outlook Calendar"}
            {!status.data?.[p] ? " · Not configured" : " · Connect"}
          </button>
        ))}
      </div>
      <div className="workspace-list">
        {connections.data?.map((c) => (
          <article key={c.id}>
            <h3>{c.provider}</h3>
            <p>
              {c.status.replaceAll("_", " ")} ·{" "}
              {c.lastSyncedAt
                ? `Last synchronized ${time(c.lastSyncedAt)}`
                : "Awaiting first synchronization"}
            </p>
            <div className="workspace-actions">
              <button
                className="secondary-button"
                onClick={() => void configure(c)}
              >
                Choose calendars
              </button>
              <button
                className="text-button"
                onClick={() => void disconnect(c.id)}
              >
                Disconnect
              </button>
            </div>
          </article>
        ))}
      </div>
      {selected ? (
        <div className="workspace-form">
          <h3>Calendar preferences</h3>
          <div>
            <p>Use these calendars to check availability:</p>
            {calendars.map((c) => (
              <label className="workspace-check" key={c.id}>
                <input
                  type="checkbox"
                  checked={selected.availabilityCalendarIds.includes(c.id)}
                  onChange={(e) =>
                    setSelected({
                      ...selected,
                      availabilityCalendarIds: e.target.checked
                        ? [...selected.availabilityCalendarIds, c.id]
                        : selected.availabilityCalendarIds.filter(
                            (id) => id !== c.id,
                          ),
                    })
                  }
                />
                {c.name}
              </label>
            ))}
          </div>
          <label>
            Add Navigate events to
            <select
              value={selected.destinationCalendarId || ""}
              onChange={(e) =>
                setSelected({
                  ...selected,
                  destinationCalendarId: e.target.value,
                })
              }
            >
              <option value="">Choose a destination</option>
              {calendars
                .filter((c) => c.canWrite)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </label>
          <button
            className="primary-button"
            disabled={!selected.destinationCalendarId}
            onClick={() => void save()}
          >
            Save preferences
          </button>
        </div>
      ) : null}
    </Panel>
  );
}

type ProgramSession = {
  id: string;
  title: string;
  topic: string;
  starts_at: string;
  ends_at: string;
  format: string;
  status: string;
  cohort_id: string | null;
  timezone: string;
};
export function SessionWorkspace({
  api,
  canManage,
}: {
  api: PilotApiClient;
  canManage: boolean;
}) {
  const sessions = useLoad(() => get<ProgramSession[]>(api, "sessions"), [api]);
  const cohorts = useLoad(
    () =>
      canManage
        ? get<Array<{ id: string; name: string }>>(api, "session_context")
        : Promise.resolve([]),
    [api, canManage],
  );
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useSessionDraft("program-session", {
    id: "",
    title: "",
    topic: "",
    start: "",
    end: "",
    zone: timezone(),
    format: "virtual",
    status: "scheduled",
    cohortId: "",
  });
  const save = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await post(api, "session_save", {
        ...draft,
        id: draft.id || null,
        startsAt: localTimeToUtc(draft.start, draft.zone),
        endsAt: localTimeToUtc(draft.end, draft.zone),
        cohortId: draft.cohortId || null,
      });
      await sessions.refresh();
      setMessage("Program session saved.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not save session.");
    }
  };
  const cancel = async (s: ProgramSession) => {
    try {
      await post(api, "session_save", {
        id: s.id,
        title: s.title,
        topic: s.topic,
        startsAt: s.starts_at,
        endsAt: s.ends_at,
        format: s.format,
        status: "cancelled",
        cohortId: s.cohort_id,
        zone: s.timezone,
      });
      await sessions.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not cancel session.");
    }
  };
  return (
    <Panel title="Program sessions">
      <Notice text={message || sessions.error} />
      {canManage ? (
        <form className="workspace-form" onSubmit={save}>
          <label>
            Title
            <input
              required
              maxLength={160}
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </label>
          <label>
            Topic
            <input
              value={draft.topic}
              onChange={(e) => setDraft({ ...draft, topic: e.target.value })}
            />
          </label>
          <label>
            Starts
            <input
              type="datetime-local"
              required
              value={draft.start}
              onChange={(e) => setDraft({ ...draft, start: e.target.value })}
            />
          </label>
          <label>
            Ends
            <input
              type="datetime-local"
              required
              value={draft.end}
              onChange={(e) => setDraft({ ...draft, end: e.target.value })}
            />
          </label>
          <label>
            Time zone
            <input
              required
              value={draft.zone}
              onChange={(e) => setDraft({ ...draft, zone: e.target.value })}
            />
          </label>
          <label>
            Format
            <select
              value={draft.format}
              onChange={(e) => setDraft({ ...draft, format: e.target.value })}
            >
              <option value="virtual">Virtual</option>
              <option value="in_person">In person</option>
            </select>
          </label>
          <label>
            Cohort
            <select
              value={draft.cohortId}
              onChange={(e) => setDraft({ ...draft, cohortId: e.target.value })}
            >
              <option value="">Whole program (requires program access)</option>
              {cohorts.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Publication
            <select
              value={draft.status}
              onChange={(e) => setDraft({ ...draft, status: e.target.value })}
            >
              <option value="draft">Draft</option>
              <option value="scheduled">Publish</option>
            </select>
          </label>
          <button className="primary-button">
            {draft.id ? "Update session" : "Save session"}
          </button>
        </form>
      ) : null}
      <div className="workspace-list">
        {sessions.data?.map((s) => (
          <article key={s.id}>
            <h3>{s.title}</h3>
            <p>
              {s.topic}
              <br />
              {time(s.starts_at)} – {time(s.ends_at)} · {s.status}
            </p>
            <div className="workspace-actions">
              {s.status === "scheduled" ? (
                <button
                  className="secondary-button"
                  onClick={() =>
                    saveFile(
                      new Blob([calendarFile(s)], { type: "text/calendar" }),
                      "navigate-session.ics",
                    )
                  }
                >
                  Add to calendar
                </button>
              ) : null}
              {canManage ? (
                <button
                  className="secondary-button"
                  onClick={() =>
                    setDraft({
                      id: s.id,
                      title: s.title,
                      topic: s.topic,
                      start: s.starts_at.slice(0, 16),
                      end: s.ends_at.slice(0, 16),
                      zone: "UTC",
                      format: s.format,
                      status: s.status === "draft" ? "draft" : "scheduled",
                      cohortId: s.cohort_id || "",
                    })
                  }
                >
                  Edit session
                </button>
              ) : null}
              {canManage && s.status !== "cancelled" ? (
                <button className="text-button" onClick={() => void cancel(s)}>
                  Cancel session
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </Panel>
  );
}

export function WorkspaceHub({
  api,
  context,
  children,
  activeRole,
}: {
  api: PilotApiClient;
  context: AuthorizationContext;
  children: ReactNode;
  activeRole?: string;
}) {
  const [view, setView] = usePathwayView("workspace", "home");
  const [chat, setChat] = usePathwayView<string | null>("workspace-chat", null);
  const location = usePathwayLocation();
  const studentScreen = location["student-screen"] || "home";
  const rawPage =
    view !== "home"
      ? view
      : location["student-survey"]
        ? "survey"
        : studentScreen === "map"
          ? location["map-station"] || "evidence"
          : studentScreen;
  const page = (workspacePages as readonly unknown[]).includes(rawPage)
    ? String(rawPage)
    : "home";
  const openChat = (id: string) => {
    setChat(id);
    setView("messages");
  };
  useEffect(() => {
    if ((activeRole || context.roles[0]) === "student") {
      const eventId = crypto.randomUUID();
      void api
        .request("/api/activity/page", {
          method: "POST",
          body: { page, eventId },
        })
        .catch(() => undefined);
    }
  }, [api, context.userId, activeRole, context.roles, page]);
  return (
    <>
      {view === "home" ? (
        children
      ) : view === "appointments" ? (
        <AppointmentWorkspace
          api={api}
          userId={context.userId}
          onChat={openChat}
        />
      ) : view === "messages" ? (
        <MessagingWorkspace
          api={api}
          userId={context.userId}
          initialConversation={chat}
        />
      ) : view === "support" ? (
        <SupportWorkspace api={api} context={context} />
      ) : view === "notifications" ? (
        <NotificationWorkspace api={api} />
      ) : view === "calendars" ? (
        <CalendarWorkspace api={api} />
      ) : view === "sessions" ? (
        <SessionWorkspace
          api={api}
          canManage={
            context.roles.includes("administrator") &&
            context.capabilities.includes("program.configure")
          }
        />
      ) : view === "roster" && context.roles.includes("administrator") && context.capabilities.includes("accounts.manage") ? (
        <RosterWorkspace api={api} />
      ) : view === "analytics" && context.principalType ? (
        <PageAnalyticsWorkspace api={api} />
      ) : view === "access" && context.principalType ? (
        <AccessWorkspace api={api} context={context} />
      ) : (
        children
      )}
    </>
  );
}

const toolIcons: Record<string,string> = {
 notifications: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4",
 calendars: "M7 2v4M17 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2M7 14h3M14 14h3M7 17h3",
 appointments: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7v5l3 2",
 messages: "M3 4h18v13H9l-6 4V4M7 8h10M7 12h7",
 support: "M12 21S2 15 2 8a5 5 0 0 1 10-1A5 5 0 0 1 22 8c0 7-10 13-10 13",
};
export function WorkspaceTopTools({context}: {context:AuthorizationContext;api:PilotApiClient}) {
 const [view,setView] = usePathwayView("workspace","home");
 const [adminView,setAdminView] = usePathwayView("admin-screen","home");
 const admin = context.roles.includes("administrator");
 const select = (value:string)=>{ if(value.startsWith("admin:")){setAdminView(value.slice(6));setView("home");}else{setAdminView("home");setView(value);} };
 return <nav className="workspace-top-tools" aria-label="Portal tools">{[["notifications","Notifications"],["calendars","Calendar"],["appointments","Appointments"],["messages","Messages"],["support","Support"]].map(([id,label])=><button key={id} title={label} aria-label={label} aria-pressed={view===id} className={view===id?"active":""} onClick={()=>setView(id)}><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={toolIcons[id]}/></svg><span>{label}</span></button>)}{admin ? <label className="workspace-menu"><span className="sr-only">Program tools</span><select aria-label="Program tools" value={view==="home"?"admin:"+adminView:["sessions","roster","analytics","access"].includes(view)?view:""} onChange={e=>select(e.target.value)}><option value="" disabled>Program tools</option><option value="admin:home">{context.principalType?"Governance dashboard":"Dashboard"}</option><option value="admin:people">People and access log</option><option value="sessions">Program sessions</option>{context.capabilities.includes("accounts.manage")?<option value="roster">Roster import</option>:null}{context.principalType?<><option value="admin:surveys">Survey analytics</option><option value="analytics">Page views</option><option value="access">Access controls</option></>:null}<option value="admin:configuration">Configuration</option></select></label>:<button className="workspace-home" title="Dashboard" onClick={()=>setView("home")}>Home</button>}</nav>;
}
