import assert from "node:assert/strict";
import test from "node:test";
import { testDatabase } from "./workspace-database.mjs";

const org = "41000000-0000-4000-8000-000000000001";
const academic = "41000000-0000-4000-8000-000000000002";
const dropin = "41000000-0000-4000-8000-000000000003";
const career = "41000000-0000-4000-8000-000000000004";
const director = "41000000-0000-4000-8000-000000000005";
const student = "41000000-0000-4000-8000-000000000006";
const otherStudent = "41000000-0000-4000-8000-000000000007";
const academicProvider = "41000000-0000-4000-8000-000000000008";
const dropinProvider = "41000000-0000-4000-8000-000000000009";
const careerProvider = "41000000-0000-4000-8000-000000000010";
const academicService = "41000000-0000-4000-8000-000000000011";
const careerService = "41000000-0000-4000-8000-000000000012";

async function asUser(db, userId, sql, params = [], aal = "aal2") {
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",
    [userId, JSON.stringify({ sub: userId, aal })],
  );
  await db.exec("set role authenticated");
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec("reset role");
  }
}

test("advisor workspaces share records while preserving student denial, immutable addenda, tasks, roadmaps, reports, and sequenced handoffs", async () => {
  const db = await testDatabase("202609110003");
  try {
    await db.exec(`
      insert into public.organizations(id,name,slug) values('${org}','Roseman University College of Medicine','rucom-advisor-test');
      insert into auth.users(id,email,email_confirmed_at) values
        ('${academic}','academic@roseman.edu',now()),('${dropin}','dropin@roseman.edu',now()),('${career}','career@roseman.edu',now()),('${director}','director@roseman.edu',now()),('${student}','student@roseman.edu',now()),('${otherStudent}','other@roseman.edu',now());
      insert into public.profiles(user_id,display_name,status,active_organization_id) values
        ('${academic}','Academic Advisor','active','${org}'),('${dropin}','Drop-in Advisor','active','${org}'),('${career}','Career Advisor','active','${org}'),('${director}','Compass Director','active','${org}'),('${student}','Assigned Student','active','${org}'),('${otherStudent}','Outside Student','active','${org}');
      insert into public.experience_role_assignments(user_id,experience_key,role,organization_id) values
        ('${academic}','oaca','staff','${org}'),('${dropin}','oaca','staff','${org}'),('${career}','oaca','staff','${org}'),('${director}','oaca','administrator','${org}'),('${student}','oaca','student','${org}'),('${otherStudent}','oaca','student','${org}');
      insert into public.oaca_service_lines(id,organization_id,key,name,provider_rule,duration_minutes,policy_status) values
        ('${academicService}','${org}','academic_advising','Academic advising','assigned',30,'sandbox_approved'),('${careerService}','${org}','career_advising','Career advising','choice_or_first',30,'sandbox_approved');
      insert into public.oaca_providers(id,user_id,organization_id,classification,modalities) values
        ('${academicProvider}','${academic}','${org}','staff',array['in_person','teams']),('${dropinProvider}','${dropin}','${org}','staff',array['in_person','teams']),('${careerProvider}','${career}','${org}','staff',array['in_person','teams']);
      insert into public.oaca_provider_services(provider_id,service_line_id) values
        ('${academicProvider}','${academicService}'),('${dropinProvider}','${academicService}'),('${careerProvider}','${careerService}');
      insert into public.oaca_advisor_assignments(student_id,provider_id) values('${student}','${academicProvider}');
      insert into public.oaca_student_program_contexts(student_id,organization_id,phase,year_number,exam_block_key) values('${student}','${org}','foundations',2,'Block A');
    `);

    const academicHome = await asUser(
      db,
      academic,
      "select public.oaca_advisor_workspace($1::jsonb) result",
      [JSON.stringify({ workspace: "academic" })],
    );
    assert.equal(academicHome.rows[0].result.students.length, 2);
    assert.ok(
      academicHome.rows[0].result.allowedWorkspaces.includes("academic"),
    );

    const first = await asUser(
      db,
      dropin,
      "select public.oaca_advisor_schedule($1::jsonb) result",
      [
        JSON.stringify({
          workspace: "academic",
          studentId: student,
          startsAt: "2031-02-04T10:00:00-08:00",
          modality: "teams",
          topic: "Drop-in one",
          confirmationMode: "confirmed",
        }),
      ],
    );
    assert.equal(first.rows[0].result.status, "confirmed");
    await asUser(db, dropin, "select public.oaca_advisor_schedule($1::jsonb)", [
      JSON.stringify({
        workspace: "academic",
        studentId: student,
        startsAt: "2031-02-11T10:00:00-08:00",
        modality: "teams",
        topic: "Drop-in two",
        confirmationMode: "confirmed",
      }),
    ]);
    await assert.rejects(
      () =>
        asUser(db, dropin, "select public.oaca_advisor_schedule($1::jsonb)", [
          JSON.stringify({
            workspace: "academic",
            studentId: student,
            startsAt: "2031-02-18T10:00:00-08:00",
            modality: "teams",
            topic: "Drop-in three",
            confirmationMode: "confirmed",
          }),
        ]),
      /two academic drop-ins/i,
    );
    const override = await asUser(
      db,
      dropin,
      "select public.oaca_advisor_schedule($1::jsonb) result",
      [
        JSON.stringify({
          workspace: "academic",
          studentId: student,
          startsAt: "2031-02-18T10:00:00-08:00",
          modality: "teams",
          topic: "Drop-in three",
          confirmationMode: "confirmed",
          overrideLimit: true,
        }),
      ],
    );
    assert.equal(override.rows[0].result.status, "confirmed");

    const appointmentId = first.rows[0].result.id;
    await asUser(db, dropin, "select public.oaca_save_encounter($1::jsonb)", [
      JSON.stringify({
        appointmentId,
        workingNotes: "Protected working note",
        studentRecap: "Student recap",
        structuredData: { categories: ["learning_strategy"] },
        publishRecap: false,
      }),
    ]);
    const sharedNote = await asUser(
      db,
      career,
      "select staff_working_notes from public.oaca_encounter_records where appointment_id=$1",
      [appointmentId],
    );
    assert.equal(
      sharedNote.rows[0].staff_working_notes,
      "Protected working note",
    );
    const studentNotes = await asUser(
      db,
      student,
      "select count(*)::int count from public.oaca_encounter_records where appointment_id=$1",
      [appointmentId],
    );
    assert.equal(studentNotes.rows[0].count, 0);

    const addendum = await asUser(
      db,
      career,
      "select public.oaca_advisor_add_addendum($1::jsonb) result",
      [
        JSON.stringify({
          workspace: "career",
          appointmentId,
          body: "Attributed career context.",
        }),
      ],
    );
    await assert.rejects(
      () =>
        asUser(
          db,
          career,
          "update public.oaca_note_addenda set body='changed' where id=$1",
          [addendum.rows[0].result.id],
        ),
      /permission denied/i,
    );

    const task = await asUser(
      db,
      academic,
      "select public.oaca_advisor_save_task($1::jsonb) result",
      [
        JSON.stringify({
          workspace: "academic",
          studentId: student,
          title: "Bring updated study plan",
          assignedTo: "student",
          dueAt: "2031-02-20",
        }),
      ],
    );
    const completed = await asUser(
      db,
      student,
      "select public.oaca_advisor_update_task($1::jsonb) result",
      [JSON.stringify({ taskId: task.rows[0].result.id, action: "complete" })],
    );
    assert.equal(completed.rows[0].result.status, "completed");

    await asUser(
      db,
      career,
      "select public.oaca_advisor_update_career_roadmap($1::jsonb)",
      [
        JSON.stringify({
          studentId: student,
          itemKey: "career_y2_cim_explore",
          completed: true,
        }),
      ],
    );
    const roadmap = await db.query(
      "select count(*)::int count from public.oaca_career_roadmap_completions where student_id=$1",
      [student],
    );
    assert.equal(roadmap.rows[0].count, 1);

    const exported = await asUser(
      db,
      director,
      "select public.oaca_advisor_prepare_export($1::jsonb) result",
      [JSON.stringify({ workspace: "academic", format: "xlsx" })],
    );
    assert.equal(exported.rows[0].result.minimumGroupSize, 10);
    const exportAudit = await db.query(
      "select count(*)::int count from public.audit_events where subject_id=$1",
      [exported.rows[0].result.id],
    );
    assert.equal(exportAudit.rows[0].count, 1);

    const handoff = await asUser(
      db,
      academic,
      "select public.oaca_advisor_update_handoff($1::jsonb) result",
      [
        JSON.stringify({
          action: "request",
          studentId: student,
          outgoingProviderId: academicProvider,
          incomingProviderId: dropinProvider,
          note: "Prepare transfer",
        }),
      ],
    );
    await asUser(
      db,
      director,
      "select public.oaca_advisor_update_handoff($1::jsonb)",
      [
        JSON.stringify({
          action: "authorize",
          handoffId: handoff.rows[0].result.id,
        }),
      ],
    );
    await asUser(
      db,
      academic,
      "select public.oaca_advisor_update_handoff($1::jsonb)",
      [
        JSON.stringify({
          action: "prepare",
          handoffId: handoff.rows[0].result.id,
          note: "Handoff prepared",
        }),
      ],
    );
    await asUser(
      db,
      dropin,
      "select public.oaca_advisor_update_handoff($1::jsonb)",
      [
        JSON.stringify({
          action: "acknowledge",
          handoffId: handoff.rows[0].result.id,
        }),
      ],
    );
    const activated = await asUser(
      db,
      director,
      "select public.oaca_advisor_update_handoff($1::jsonb) result",
      [
        JSON.stringify({
          action: "activate",
          handoffId: handoff.rows[0].result.id,
        }),
      ],
    );
    assert.equal(activated.rows[0].result.status, "activated");
    const activeAssignment = await db.query(
      "select provider_id from public.oaca_advisor_assignments where student_id=$1 and ended_at is null",
      [student],
    );
    assert.equal(activeAssignment.rows[0].provider_id, dropinProvider);
  } finally {
    await db.close();
  }
});
