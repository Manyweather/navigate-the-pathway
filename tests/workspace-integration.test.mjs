import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { testDatabase, act } from "./workspace-database.mjs";
let db;
const ids = Object.fromEntries(
  [
    "org",
    "program",
    "cohort",
    "otherCohort",
    "student",
    "student2",
    "advisor",
    "advisor2",
    "creator",
    "pi",
    "outsider",
    "org2",
    "program2",
  ].map((k) => [k, randomUUID()]),
);
before(async () => {
  db = await testDatabase();
  await db.query(
    "insert into public.organizations(id,name,slug) values($1,'Test','test'),($2,'Other','other')",
    [ids.org, ids.org2],
  );
  await db.query(
    "insert into public.programs(id,organization_id,name,slug) values($1,$2,'Pathway','pathway'),($3,$4,'Other','other')",
    [ids.program, ids.org, ids.program2, ids.org2],
  );
  await db.query(
    "insert into public.cohorts(id,organization_id,program_id,name) values($1,$2,$3,'A'),($4,$2,$3,'B')",
    [ids.cohort, ids.org, ids.program, ids.otherCohort],
  );
  for (const [name, role] of [
    ["student", "student"],
    ["student2", "student"],
    ["advisor", "advisor"],
    ["advisor2", "advisor"],
    ["creator", "administrator"],
    ["pi", "administrator"],
    ["outsider", "administrator"],
  ]) {
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
      [ids[name], `${name}@example.test`],
    );
    await db.query(
      "insert into public.profiles(user_id,display_name,active_organization_id,active_program_id,active_cohort_id,status) values($1,$2,$3,$4,$5,'active')",
      [
        ids[name],
        name,
        name === "outsider" ? ids.org2 : ids.org,
        name === "outsider" ? ids.program2 : ids.program,
        name === "outsider" ? null : ids.cohort,
      ],
    );
    await db.query(
      "insert into public.role_assignments(user_id,role,organization_id,program_id,cohort_id,granted_by) values($1,$2,$3,$4,$5,$1)",
      [
        ids[name],
        role,
        name === "outsider" ? ids.org2 : ids.org,
        name === "outsider" ? ids.program2 : ids.program,
        ["student", "student2", "advisor", "advisor2"].includes(name)
          ? ids.cohort
          : null,
      ],
    );
  }
  for (const name of ["creator", "pi"])
    for (const cap of [
      name === "creator"
        ? "platform.creator"
        : "platform.principal_investigator",
      "accounts.manage",
      "program.configure",
    ])
      await db.query(
        "insert into public.permission_assignments(user_id,permission_key,organization_id,program_id,granted_by) values($1,$2,$3,$4,$1)",
        [ids[name], cap, ids.org, ids.program],
      );
  await db.query(
    "insert into public.advisor_assignments(advisor_id,student_id,organization_id,program_id,cohort_id,created_by) values($1,$2,$3,$4,$5,$1)",
    [ids.advisor, ids.student, ids.org, ids.program, ids.cohort],
  );
});
after(async () => db?.close());
test('multi-role administrators retain scoped advisor contact and the last Creator cannot be removed', async () => {
  await db.query("insert into public.role_assignments(user_id,role,organization_id,program_id,granted_by) values($1,'student',$2,$3,$1)",[ids.creator,ids.org,ids.program]);
  assert.ok((await act(db,ids.creator,'dm_create',{recipientId:ids.advisor})).id);
  await assert.rejects(act(db,ids.creator,'dm_create',{recipientId:ids.student2}),/not permitted/);
  await db.query("insert into public.principal_assignments(user_id,principal_type,organization_id,program_id,designated_by) values($1,'creator',$2,$3,$1)",[ids.creator,ids.org,ids.program]);
  await assert.rejects(db.query('update public.principal_assignments set revoked_at=now() where user_id=$1',[ids.creator]),/last Creator/);
  await assert.rejects(db.query("delete from public.permission_assignments where user_id=$1 and permission_key='platform.creator'",[ids.creator]),/ownership/);
});
const request = (recipientId = ids.advisor, days = 3) => ({
  recipientId,
  title: "Planning appointment",
  startsAt: new Date(Date.now() + days * 86400000).toISOString(),
  endsAt: new Date(Date.now() + days * 86400000 + 1800000).toISOString(),
  timezone: "America/Los_Angeles",
  requestKey: randomUUID(),
});

test("directory returns only permitted peers; MFA and direct-table denial are enforced", async () => {
  assert.deepEqual(
    (await act(db, ids.student, "directory", {}, "aal1")).map((p) => p.id),
    [ids.advisor],
  );
  await assert.rejects(act(db, ids.advisor, "appointments", {}, "aal1"), /MFA/);
  await db.exec("set role authenticated");
  try {
    await assert.rejects(
      db.query("select * from public.pathway_messages"),
      /permission denied/,
    );
  } finally {
    await db.exec("reset role");
  }
});
test("student-to-student DMs remain denied when the recipient gains an advisor role", async () => {
  await db.query(
    "insert into public.role_assignments(user_id,role,organization_id,program_id,granted_by) values($1,'advisor',$2,$3,$4)",
    [ids.student2, ids.org, ids.program, ids.creator],
  );
  await assert.rejects(
    act(db, ids.student, "dm_create", { recipientId: ids.student2 }),
    /not permitted/,
  );
  await assert.rejects(
    act(db, ids.student, "dm_create", { recipientId: ids.outsider }),
    /not permitted/,
  );
});
test("recipient must accept; request retry is idempotent; overlap is blocked", async () => {
  const body = request();
  const ap = await act(db, ids.student, "appointment_request", body, "aal1");
  assert.equal(ap.status, "pending");
  assert.equal(
    (await act(db, ids.student, "appointment_request", body, "aal1")).id,
    ap.id,
  );
  await assert.rejects(
    act(
      db,
      ids.student,
      "appointment_change",
      { id: ap.id, version: 1, decision: "accept" },
      "aal1",
    ),
    /acceptance/,
  );
  const accepted = await act(db, ids.advisor, "appointment_change", {
    id: ap.id,
    version: 1,
    decision: "accept",
  });
  assert.equal(accepted.status, "accepted");
  const overlap = await act(db, ids.creator, "appointment_request", {
    ...body,
    recipientId: ids.advisor,
    requestKey: randomUUID(),
  });
  await assert.rejects(
    act(db, ids.advisor, "appointment_change", {
      id: overlap.id,
      version: 1,
      decision: "accept",
    }),
    /already has/,
  );
});
test("reschedule preserves confirmed time until the other participant accepts", async () => {
  const ap = await act(
    db,
    ids.student,
    "appointment_request",
    request(ids.advisor, 4),
  );
  await act(db, ids.advisor, "appointment_change", {
    id: ap.id,
    version: 1,
    decision: "accept",
  });
  const next = request(ids.advisor, 5);
  const proposed = await act(db, ids.student, "appointment_change", {
    ...next,
    id: ap.id,
    version: 2,
    decision: "reschedule",
  });
  assert.equal(proposed.starts_at, ap.starts_at);
  await assert.rejects(
    act(db, ids.student, "appointment_change", {
      id: ap.id,
      version: 3,
      decision: "accept",
    }),
    /acceptance/,
  );
  const accepted = await act(db, ids.advisor, "appointment_change", {
    id: ap.id,
    version: 3,
    decision: "accept",
  });
  assert.equal(Date.parse(accepted.starts_at), Date.parse(next.startsAt));
  await assert.rejects(
    act(db, ids.student, "appointment_change", {
      id: ap.id,
      version: 3,
      decision: "cancel",
    }),
    /changed/,
  );
});
test("chat is private, retry-safe, paginated, and read-only after cancellation", async () => {
  const ap = await act(
    db,
    ids.student,
    "appointment_request",
    request(ids.advisor, 6),
  );
  await act(db, ids.advisor, "appointment_change", {
    id: ap.id,
    version: 1,
    decision: "accept",
  });
  const c = (await act(db, ids.student, "conversations")).find(
    (c) => c.title === ap.title && c.kind === "appointment",
  );
  assert.ok(c);
  const payload = {
    conversationId: c.id,
    body: "Planning question",
    clientId: randomUUID(),
  };
  await act(db, ids.student, "message_send", payload);
  await act(db, ids.student, "message_send", payload);
  assert.equal(
    (await act(db, ids.advisor, "messages", { conversationId: c.id })).length,
    1,
  );
  await assert.rejects(
    act(db, ids.creator, "messages", { conversationId: c.id }),
    /access denied/,
  );
  const appointmentId = (
    await db.query(
      "select appointment_id from public.pathway_conversations where id=$1",
      [c.id],
    )
  ).rows[0].appointment_id;
  await act(db, ids.advisor, "appointment_change", {
    id: appointmentId,
    version: 2,
    decision: "cancel",
  });
  await assert.rejects(
    act(db, ids.student, "message_send", {
      ...payload,
      clientId: randomUUID(),
    }),
    /read-only/,
  );
});
test("PI can narrow DMs and revocation applies to existing conversations", async () => {
  const c = await act(db, ids.student, "dm_create", {
    recipientId: ids.advisor,
  });
  await act(db, ids.pi, "communication_policy", {
    studentAdvisor: false,
    administratorAdvisor: true,
  });
  await assert.rejects(
    act(db, ids.student, "messages", { conversationId: c.id }),
    /access denied/,
  );
  await act(db, ids.pi, "communication_policy", {
    studentAdvisor: true,
    administratorAdvisor: true,
  });
});
test("support drafts are hidden from students and source revocation removes derived access", async () => {
  const source = await act(db, ids.student, "support_share", {
    goals: "Prepare an application plan",
    barriers: "Need scheduling support",
    deadlines: "December",
  });
  const review = await act(db, ids.advisor, "support_review", {
    sourceId: source.id,
    area: "Planning",
    evidence: "Student asked for scheduling support",
    action: "Review weekly availability",
    status: "draft",
    share: true,
  });
  assert.equal((await act(db, ids.student, "support")).reviews.length, 0);
  await act(db, ids.advisor, "support_review", {
    id: review.id,
    sourceId: source.id,
    area: "Planning",
    evidence: "Student asked for scheduling support",
    action: "Review weekly availability",
    status: "reviewed",
    share: true,
  });
  assert.equal((await act(db, ids.student, "support")).reviews.length, 1);
  await assert.rejects(
    act(db, ids.advisor2, "support_review", {
      sourceId: source.id,
      area: "x",
      evidence: "x",
      action: "x",
      status: "draft",
    }),
    /access denied/,
  );
  await act(db, ids.student, "support_revoke", { id: source.id });
  assert.equal((await act(db, ids.advisor, "support")).reviews.length, 0);
  await assert.rejects(
    act(db, ids.advisor, "support_generate"),
    /not configured/,
  );
});
test("page events deduplicate; IP retention and principal visibility are enforced", async () => {
  const event = randomUUID();
  for (let i = 0; i < 2; i++)
    await db.query(
      "select public.pathway_record_page($1,$2,'home','session','192.0.2.1')",
      [ids.student, event],
    );
  assert.equal((await act(db, ids.creator, "analytics")).pages[0].views, 1);
  await assert.rejects(act(db, ids.advisor, "analytics"), /Creator or PI/);
  await db.query(
    "update public.pathway_page_views set viewed_at=now()-interval '31 days' where id=$1",
    [event],
  );
  await db.query("select public.pathway_maintenance()");
  assert.equal(
    (
      await db.query(
        "select ip_address from public.pathway_page_views where id=$1",
        [event],
      )
    ).rows[0].ip_address,
    null,
  );
  assert.equal(
    (
      await db.query(
        "select count(*) from public.pathway_email_jobs where status<>'suppressed'",
      )
    ).rows[0].count,
    0,
  );
});
test("access controls reject self escalation, ownership transfer and cross-program grants", async () => {
  await assert.rejects(
    act(db, ids.creator, "access_update", {
      userId: ids.creator,
      role: "student",
      grant: true,
    }),
    /another principal/,
  );
  await assert.rejects(
    act(db, ids.creator, "access_update", {
      userId: ids.advisor,
      capability: "platform.creator",
      grant: true,
    }),
    /cannot delegate/,
  );
  await assert.rejects(
    act(db, ids.creator, "access_update", {
      userId: ids.outsider,
      role: "advisor",
      grant: true,
    }),
    /outside/,
  );
  await act(db, ids.pi, "access_update", {
    userId: ids.advisor,
    capability: "program.configure",
    grant: true,
  });
});
test("roster import has preview, repeat safety and no implicit invitations", async () => {
  const row = {
    row: 2,
    values: {
      name: "Imported Student",
      primary_email: "imported@example.test",
      secondary_email: "",
      role: "student",
      program: "Pathway",
      cohort: "A",
      advisor_email: "advisor@example.test",
    },
    errors: [],
  };
  const key = randomUUID();
  const preview = await act(db, ids.creator, "roster_preview", {
    requestKey: key,
    rows: [row],
  });
  assert.ok(preview.id);
  assert.equal(
    (
      await act(db, ids.creator, "roster_preview", {
        requestKey: key,
        rows: [row],
      })
    ).id,
    preview.id,
  );
  const user = randomUUID();
  await db.query("insert into auth.users(id,email) values($1,$2)", [
    user,
    row.values.primary_email,
  ]);
  await db.query("select public.pathway_apply_roster_row($1,2,$2,$3,null)", [
    preview.id,
    ids.creator,
    user,
  ]);
  await db.query("select public.pathway_apply_roster_row($1,2,$2,$3,null)", [
    preview.id,
    ids.creator,
    user,
  ]);
  assert.equal(
    (await act(db, ids.creator, "roster_status", { id: preview.id })).rows[0]
      .status,
    "created",
  );
  assert.equal(
    (
      await db.query(
        "select count(*) from public.role_assignments where user_id=$1",
        [user],
      )
    ).rows[0].count,
    1,
  );
});
