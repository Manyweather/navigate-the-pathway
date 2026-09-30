import test from "node:test";
import assert from "node:assert/strict";
import { unzipSync, strFromU8 } from "fflate";
import { testDatabase } from "./workspace-database.mjs";
import { campusDay, combinedCalendar, eventCsv } from "../app/production/shared-event-model.ts";
import { handoffDocx } from "../app/production/event-handoff-docx.ts";
import { sharedEventRoute } from "../cloudflare/shared-event-api.ts";

const org = "10000000-0000-4000-8000-000000000101";
const actor = "10000000-0000-4000-8000-000000000102";
const eventId = "10000000-0000-4000-8000-000000000103";
const sharedId = "10000000-0000-4000-8000-000000000104";

test("migration keeps one stable identity for source events and blocks direct client reads", async () => {
  const db = await testDatabase();
  try {
    // PGlite omits pgcrypto; production provides digest(text,'sha256').
    await db.exec("create function public.digest(value text, algorithm text) returns bytea language sql immutable as $$select decode(md5(value)||md5(value||'x'),'hex')$$");
    await db.exec(`insert into public.organizations(id,name,slug) values('${org}','Test OACA','test-shared-events');
      insert into auth.users(id,email,email_confirmed_at) values('${actor}','events@example.org',now());
      insert into public.profiles(user_id,display_name,status,active_organization_id) values('${actor}','Event host','active','${org}');
      insert into public.oaca_events(id,compass_event_id,organization_id,created_by,title,description,starts_at,ends_at,modality,status)
        values('${eventId}','${sharedId}','${org}','${actor}','Campus event','A shared campus event','2026-10-20T10:00:00-07:00','2026-10-20T12:00:00-07:00','in_person','draft');`);
    const plans = await db.query(`select id,oaca_event_id,owner_experience from public.compass_event_plans where id='${sharedId}'`);
    assert.deepEqual(plans.rows.map(({ id, oaca_event_id, owner_experience }) => [id,oaca_event_id,owner_experience]), [[sharedId,eventId,"oaca"]]);
    const dates = await db.query(`select count(*)::integer as count from public.compass_event_occurrences where event_id='${sharedId}'`);
    assert.equal(dates.rows[0].count,1);
    await db.exec(`update public.oaca_events set title='Revised campus event',status='published',published_at=now() where id='${eventId}'`);
    const updated = await db.query(`select title,status from public.compass_event_plans where id='${sharedId}'`);
    assert.equal(updated.rows[0].title,"Revised campus event");
    assert.equal(updated.rows[0].status,"published");
    await db.exec("set role authenticated");
    await assert.rejects(db.query(`select * from public.compass_event_plans where id='${sharedId}'`));
    await db.exec("reset role");
  } finally { await db.close(); }
});

test("calendar deduplicates shared IDs, CSV sums completed occurrences, and handoff is editable DOCX", () => {
  assert.equal(campusDay("2026-10-21T06:30:00Z"),"2026-10-20");
  const event = {id:sharedId,organizationId:org,ownerExperience:"oaca",createdBy:actor,title:"Campus & partner event",kind:"community",objective:"Connect students",audience:"Students",startsAt:"2026-10-20T17:00:00Z",endsAt:"2026-10-20T19:00:00Z",status:"published",details:{},recurrence:{}};
  const workspace = {events:[event],occurrences:[{id:"first",eventId:sharedId,startsAt:event.startsAt,endsAt:event.endsAt,status:"planned"},{id:"second",eventId:sharedId,startsAt:"2026-11-20T17:00:00Z",endsAt:"2026-11-20T19:00:00Z",status:"planned"}],facilitiesRequests:[],evaluations:[],handoffs:[],oacaOverlay:[{id:sharedId,title:event.title,startsAt:event.startsAt,endsAt:event.endsAt,location:"Summerlin"}],possibleDuplicates:[]};
  assert.deepEqual(combinedCalendar(workspace,true).map((item)=>item.occurrenceId),["first","second"]);
  const csv = eventCsv([event],[{eventId:sharedId,registrations:12,attendance:10,estimatedCost:50,actualCost:42},{eventId:sharedId,registrations:8,attendance:7,estimatedCost:40,actualCost:38}],[],"metrics");
  assert.match(csv,/"20","17","90","80"/);
  const handoff = {id:"handoff",eventId:sharedId,version:2,status:"complete",successorEmail:null,document:{roleDuties:"Plan & coordinate",eventHistory:"Two events",metrics:"17 attended",analytics:"Growing attendance",openDecisions:"Room",nextActions:"Confirm inventory"}};
  const entries = unzipSync(handoffDocx(event,handoff));
  assert.ok(entries["word/document.xml"]);
  assert.match(strFromU8(entries["word/_rels/document.xml.rels"]),/Target="styles.xml"/);
  assert.match(strFromU8(entries["word/document.xml"]),/Plan &amp; coordinate/);
  assert.match(strFromU8(entries["word/document.xml"]),/Version 2/);
  assert.match(strFromU8(entries["word/document.xml"]),/w:pgSz w:w="12240" w:h="15840"/);
  assert.match(strFromU8(entries["word/document.xml"]),/w:pStyle w:val="Title"/);
});

test("a nonstaff membership cannot read or change shared events", async () => {
  let accessed = false;
  const services = {user:{id:actor},context:async()=>({activeOrganizationId:org}),service:async()=>{accessed=true;return [];}};
  const membership = {experienceKey:"oaca",roles:["student"],capabilities:[]};
  await assert.rejects(sharedEventRoute(new Request("https://compass.example/api/shared-events/workspace"),services,membership),{status:403});
  assert.equal(accessed,false);
});

test("Impact students receive only published calendar summaries and cannot request live coordination", async () => {
  const calls=[];
  const services={user:{id:actor},context:async()=>({}),service:async(path)=>{
    calls.push(path);
    if(path.startsWith("compass_event_plans?owner_experience=eq.genesis"))return [{id:sharedId,title:"Published Impact event",kind:"community",starts_at:"2026-10-20T17:00:00Z",ends_at:null}];
    if(path.startsWith("oaca_events?status=eq.published"))return [{id:eventId,title:"OACA event",starts_at:"2026-10-21T17:00:00Z",ends_at:null,location:"Summerlin"}];
    if(path.startsWith("compass_event_occurrences?"))return [{id:"first-date",event_id:sharedId,starts_at:"2026-10-20T17:00:00Z",ends_at:null,status:"planned"},{id:"second-date",event_id:sharedId,starts_at:"2026-11-20T17:00:00Z",ends_at:null,status:"planned"}];
    return [];
  }};
  const membership={experienceKey:"genesis",roles:["student"],capabilities:[]};
  const response=await sharedEventRoute(new Request("https://compass.example/api/shared-events/workspace"),services,membership);
  assert.equal(response.status,200);
  const workspace=await response.json();
  assert.deepEqual(workspace.events.map((event)=>event.title),["Published Impact event"]);
  assert.equal(combinedCalendar(workspace,false).length,2);
  assert.deepEqual(workspace.oacaOverlay.map((event)=>event.title),["OACA event"]);
  assert.equal(workspace.events[0].objective,"");
  assert.deepEqual(workspace.facilitiesRequests,[]);
  assert.deepEqual(workspace.evaluations,[]);
  assert.deepEqual(workspace.handoffs,[]);
  assert.equal(calls.some((path)=>path.includes("compass_event_evaluations")),false);
  await assert.rejects(sharedEventRoute(new Request("https://compass.example/api/shared-events/plan",{method:"POST",body:"{}"}),services,membership),{status:403});
});

test("OACA staff can export assigned events but cannot publish another organizer's event", async () => {
  const other = "10000000-0000-4000-8000-000000000105";
  const own = {id:sharedId,organization_id:org,owner_experience:"oaca",created_by:actor,title:"Own event",kind:"academic",objective:"Plan",audience:"Staff",starts_at:"2026-10-20T17:00:00Z",ends_at:null,status:"requested",details:{},recurrence:{},oaca_event_id:null,genesis_event_id:null};
  const unrelated = {...own,id:eventId,created_by:other,title:"Another event"};
  const calls=[];
  const services={user:{id:actor},context:async()=>({activeOrganizationId:org}),service:async(path,options)=>{
    calls.push([path,options?.method||"GET"]);
    if(path.startsWith("experience_role_assignments?"))return [{organization_id:org}];
    if(path.startsWith("compass_event_plans?id=eq."))return [unrelated];
    if(path.startsWith("compass_event_plans?owner_experience="))return [own,unrelated];
    return [];
  }};
  const membership={experienceKey:"oaca",roles:["advisor"],capabilities:[]};
  await assert.rejects(sharedEventRoute(new Request("https://compass.example/api/shared-events/publish",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({eventId})}),services,membership),{status:403});
  assert.equal(calls.some(([path,method])=>path.startsWith("oaca_events")&&method==="POST"),false);
  const csv=await sharedEventRoute(new Request("https://compass.example/api/shared-events/report?status=requested"),services,membership);
  assert.equal(csv.status,200);
  const report=await csv.text();
  assert.match(report,/Own event/);
  assert.doesNotMatch(report,/Another event/);
});

test("Impact liaison cannot skip mentor approval or a pending Facilities decision", async () => {
  const row={id:sharedId,organization_id:org,owner_experience:"genesis",created_by:actor,title:"Impact event",kind:"community",objective:"Plan",audience:"Community",starts_at:"2026-10-20T17:00:00Z",ends_at:null,status:"requested",details:{},recurrence:{}};
  const services={user:{id:actor},context:async()=>({}),service:async(path)=>{
    if(path.startsWith("genesis_organizations?"))return [{id:org}];
    if(path.startsWith("compass_event_plans?id=eq."))return [row];
    if(path.startsWith("compass_event_facilities_requests?"))return [{id:eventId}];
    return [];
  }};
  const membership={experienceKey:"genesis",roles:["community_liaison"],capabilities:[]};
  const request=()=>new Request("https://compass.example/api/shared-events/review",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({eventId:sharedId,reviewKind:"liaison",decision:"approved"})});
  await assert.rejects(sharedEventRoute(request(),services,membership),{status:409});
  row.status="mentor_approved";
  await assert.rejects(sharedEventRoute(request(),services,membership),{status:409});
});
