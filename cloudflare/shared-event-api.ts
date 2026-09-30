import type { AuthorizationContext } from "../app/production/types";
import type { ExperienceMembership } from "../app/production/platform-model";
import { campusDay, eventCsv, type SharedEventPlan, type SharedEventWorkspace } from "../app/production/shared-event-model";
import { WorkspaceError, workspaceBody, workspaceJson, type WorkspaceServices } from "./workspace-api";

type Services = WorkspaceServices & { context(): Promise<AuthorizationContext> };
type Row = Record<string, unknown>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const text = (value: unknown, max: number) => String(value ?? "").trim().slice(0,max);
const date = (value: unknown) => { const parsed = new Date(String(value ?? "")); if (!Number.isFinite(parsed.getTime())) throw new WorkspaceError(400,"Enter a valid event date."); return parsed.toISOString(); };
const isStaff = (membership: ExperienceMembership) => membership.roles.some((role) => ["staff","faculty","advisor","administrator","community_liaison","creator","mentor"].includes(role));
const isAdmin = (membership: ExperienceMembership) => membership.roles.some((role) => ["administrator","creator"].includes(role));
const mayPlan = (membership: ExperienceMembership) => membership.experienceKey === "oaca" ? isStaff(membership) : membership.roles.some((role) => ["administrator","community_liaison","creator"].includes(role));
const headers = { "content-type":"application/json", prefer:"return=representation" };
async function audit(services: Services, event: string, id: string, metadata: Row = {}) {
  await services.service("audit_events", { method:"POST", headers:{ "content-type":"application/json", prefer:"return=minimal" }, body:JSON.stringify({ actor_id:services.user.id, event_type:event, subject_type:"compass_event", subject_id:id, metadata }) });
}
async function rows(services: Services, path: string) { return services.service<Row[]>(path); }
async function one(services: Services, path: string) { return (await rows(services,path))[0] || null; }
function requireId(value: unknown) { if (!uuid.test(String(value ?? ""))) throw new WorkspaceError(400,"Choose an event."); return String(value); }
function plan(row: Row): SharedEventPlan {
  return { id:String(row.id), organizationId:String(row.organization_id), ownerExperience:row.owner_experience as "oaca"|"genesis", createdBy:String(row.created_by), title:String(row.title), kind:String(row.kind), objective:String(row.objective), audience:String(row.audience), startsAt:row.starts_at as string|null, endsAt:row.ends_at as string|null, status:row.status as SharedEventPlan["status"], details:(row.details || {}) as SharedEventPlan["details"], recurrence:(row.recurrence || {}) as SharedEventPlan["recurrence"], oacaEventId:row.oaca_event_id as string|null, genesisEventId:row.genesis_event_id as string|null };
}
async function allowedOrganizations(services: Services, membership: ExperienceMembership, context: AuthorizationContext) {
  if (membership.experienceKey === "genesis") {
    if (mayPlan(membership)) {
      const organizations = await rows(services,"genesis_organizations?select=id&archived_at=is.null");
      return organizations.map((item) => String(item.id));
    }
    if (membership.roles.includes("mentor")) {
      const assignments=await rows(services,`genesis_organization_memberships?user_id=eq.${services.user.id}&role=eq.mentor&status=eq.approved&select=organization_id`);
      return [...new Set(assignments.map((item)=>String(item.organization_id)).filter((id)=>uuid.test(id)))];
    }
    return [];
  }
  if (membership.experienceKey === "facilities") return [];
  const grants = await rows(services,`experience_role_assignments?user_id=eq.${services.user.id}&experience_key=eq.oaca&revoked_at=is.null&select=organization_id`);
  const all = [...new Set(grants.map((item) => String(item.organization_id)).filter((id) => uuid.test(id)))];
  return context.activeOrganizationId && all.includes(context.activeOrganizationId) ? [context.activeOrganizationId] : all;
}
async function visiblePlan(services: Services, membership: ExperienceMembership, id: string, allowed: string[]) {
  const found = await one(services,`compass_event_plans?id=eq.${id}&select=*`);
  if (!found || !allowed.includes(String(found.organization_id)) || found.owner_experience !== membership.experienceKey) throw new WorkspaceError(404,"Event not found in this workspace.");
  return found;
}
function occurrenceRows(eventId: string, input: unknown, existing: Row[]) {
  if (!Array.isArray(input) || input.length < 1 || input.length > 24) throw new WorkspaceError(400,"Add one to 24 event dates.");
  const result = input.map((item) => {
    if (!item || typeof item !== "object") throw new WorkspaceError(400,"Check each event date.");
    const source = item as Row; const start = date(source.startsAt); const end = source.endsAt ? date(source.endsAt) : null;
    if (end && end <= start) throw new WorkspaceError(400,"An event must end after it starts.");
    return { event_id:eventId, starts_at:start, ends_at:end, status:"planned" };
  });
  if (new Set(result.map((item) => item.starts_at)).size !== result.length) throw new WorkspaceError(400,"Each event date must be unique.");
  if (existing.some((item) => !result.some((next) => next.starts_at === item.starts_at))) throw new WorkspaceError(409,"Existing dates with coordination history cannot be removed here.");
  return result;
}
function overlayDates(row: Row, id: string, source: "oaca"|"genesis", occurrences: Row[]) {
  const dates=occurrences.filter((item)=>String(item.event_id)===id && item.status!=="cancelled");
  return (dates.length?dates:[{id:null,starts_at:row.starts_at,ends_at:row.ends_at}]).filter((item)=>item.starts_at).map((item)=>({id,occurrenceId:item.id?String(item.id):null,title:String(row.title),startsAt:String(item.starts_at),endsAt:item.ends_at as string|null,location:row.location as string|null,source}));
}
async function workspace(services: Services, membership: ExperienceMembership, allowed: string[]): Promise<SharedEventWorkspace> {
  if (membership.experienceKey === "facilities") {
    const facilities = await rows(services,"compass_event_facilities_requests?status=eq.pending&select=*");
    return { events:[], occurrences:[], facilitiesRequests:facilities.map(facilitiesRequest), evaluations:[], handoffs:[], oacaOverlay:[], possibleDuplicates:[] };
  }
  if (!allowed.length) {
    if (membership.experienceKey!=="genesis") return { events:[], occurrences:[], facilitiesRequests:[], evaluations:[], handoffs:[], oacaOverlay:[], possibleDuplicates:[] };
    const [impactPublic,oacaPublic]=await Promise.all([
      rows(services,"compass_event_plans?owner_experience=eq.genesis&status=eq.published&select=id,title,kind,starts_at,ends_at&limit=300"),
      rows(services,"oaca_events?status=eq.published&public_catalog=eq.true&select=id,title,starts_at,ends_at,location&limit=300")]);
    const oacaIds=oacaPublic.map((item)=>String(item.id));
    const links=oacaIds.length?await rows(services,`compass_event_plans?oaca_event_id=in.(${oacaIds.join(",")})&select=id,oaca_event_id`):[];
    const linked=new Map(links.map((item)=>[item.oaca_event_id,item.id]));
    const planIds=[...new Set([...impactPublic.map((item)=>String(item.id)),...links.map((item)=>String(item.id))])];
    const dates=planIds.length?await rows(services,`compass_event_occurrences?event_id=in.(${planIds.join(",")})&select=id,event_id,starts_at,ends_at,status`):[];
    return {events:impactPublic.map((item)=>({id:String(item.id),organizationId:"",ownerExperience:"genesis",createdBy:"",title:String(item.title),kind:String(item.kind),objective:"",audience:"",startsAt:item.starts_at as string|null,endsAt:item.ends_at as string|null,status:"published" as const,details:{},recurrence:{}})),occurrences:dates.filter((item)=>impactPublic.some((event)=>event.id===item.event_id)).map((item)=>({id:String(item.id),eventId:String(item.event_id),startsAt:String(item.starts_at),endsAt:item.ends_at as string|null,status:String(item.status)})),facilitiesRequests:[],evaluations:[],handoffs:[],oacaOverlay:oacaPublic.flatMap((item)=>overlayDates(item,String(linked.get(item.id)||item.id),"oaca",dates)),possibleDuplicates:[]};
  }
  const source = membership.experienceKey;
  const eventRows = await rows(services,`compass_event_plans?owner_experience=eq.${source}&organization_id=in.(${allowed.join(",")})&select=*&order=starts_at.desc.nullslast&limit=500`);
  const ids = eventRows.map((item) => String(item.id));
  const [occurrences,facilities,evaluations,handoffs] = ids.length ? await Promise.all([
    rows(services,`compass_event_occurrences?event_id=in.(${ids.join(",")})&select=*&order=starts_at.asc`),
    rows(services,`compass_event_facilities_requests?event_id=in.(${ids.join(",")})&select=*&order=created_at.desc`),
    rows(services,`compass_event_evaluations?event_id=in.(${ids.join(",")})&select=*`),
    rows(services,`compass_event_handoffs?event_id=in.(${ids.join(",")})&select=*&order=version.desc`),
  ]) : [[],[],[],[]];
  const publicOaca = source === "genesis" ? await rows(services,"oaca_events?status=eq.published&public_catalog=eq.true&select=id,title,starts_at,ends_at,location&order=starts_at.asc&limit=300") : [];
  const oacaIds = publicOaca.map((item) => String(item.id));
  const oacaLinks = oacaIds.length ? await rows(services,`compass_event_plans?oaca_event_id=in.(${oacaIds.join(",")})&select=id,oaca_event_id`) : [];
  const linkBySource = new Map(oacaLinks.map((item) => [item.oaca_event_id,item.id]));
  const publications = source === "oaca" ? await rows(services,"compass_event_publications?target_experience=eq.oaca&select=event_id&limit=300") : [];
  const publishedIds = publications.map((item)=>String(item.event_id));
  const sharedImpact = publishedIds.length ? await rows(services,`compass_event_plans?id=in.(${publishedIds.join(",")})&owner_experience=eq.genesis&status=eq.published&select=id,title,starts_at,ends_at,details`) : [];
  const crossIds=[...new Set([...oacaLinks.map((item)=>String(item.id)),...sharedImpact.map((item)=>String(item.id))])];
  const crossDates=crossIds.length?await rows(services,`compass_event_occurrences?event_id=in.(${crossIds.join(",")})&select=id,event_id,starts_at,ends_at,status`):[];
  const crossOverlay:SharedEventWorkspace["oacaOverlay"]=[...publicOaca.flatMap((row)=>overlayDates(row,String(linkBySource.get(row.id)||row.id),"oaca",crossDates)),
    ...sharedImpact.flatMap((row)=>overlayDates({...row,location:String((row.details as Row)?.location||"")},String(row.id),"genesis",crossDates))];
  const scoped = eventRows.map(plan);
  const candidates: SharedEventWorkspace["possibleDuplicates"] = [];
  for (let index=0;index<scoped.length;index++) for (let other=index+1;other<scoped.length;other++) {
    const a=scoped[index], b=scoped[other];
    if (a.startsAt && b.startsAt && a.startsAt.slice(0,10)===b.startsAt.slice(0,10) && a.title.toLowerCase()===b.title.toLowerCase()) candidates.push({firstId:a.id,secondId:b.id,reason:"Same title and date; review before linking."});
  }
  for (const item of scoped) for (const other of crossOverlay) if (item.id!==other.id && item.startsAt && campusDay(item.startsAt)===campusDay(other.startsAt) && item.title.toLowerCase()===other.title.toLowerCase()) candidates.push({firstId:item.id,secondId:other.id,reason:"Same title and campus date across workspaces; review before linking."});
  return { events:scoped,
    occurrences:occurrences.map((row) => ({id:String(row.id),eventId:String(row.event_id),startsAt:String(row.starts_at),endsAt:row.ends_at as string|null,status:String(row.status)})),
    facilitiesRequests:facilities.map(facilitiesRequest),
    evaluations:evaluations.map((row) => ({eventId:String(row.event_id),occurrenceId:String(row.occurrence_id),registrations:Number(row.registrations),attendance:Number(row.attendance),estimatedCost:Number(row.estimated_cost),actualCost:Number(row.actual_cost),goalsMet:String(row.goals_met),partnerFeedback:String(row.partner_feedback),coordination:String(row.coordination),keepNextTime:String(row.keep_next_time),changeNextTime:String(row.change_next_time),purchaseNeeds:String(row.purchase_needs),completedAt:String(row.completed_at)})),
    handoffs:handoffs.map((row) => ({id:String(row.id),eventId:String(row.event_id),version:Number(row.version),status:row.status as "draft"|"complete"|"offered"|"accepted",document:row.document as SharedEventWorkspace["handoffs"][number]["document"],successorEmail:row.successor_email as string|null,createdAt:String(row.created_at)})),
    oacaOverlay:crossOverlay,
    possibleDuplicates:candidates.slice(0,100) };
}
function facilitiesRequest(row: Row) { return {id:String(row.id),eventId:String(row.event_id),occurrenceId:row.occurrence_id as string|null,requestKind:row.request_kind as "room"|"setup"|"inventory",itemKey:row.item_key as string|null,quantity:row.quantity as number|null,description:String(row.description),status:row.status as "pending"|"confirmed"|"declined"|"cancelled",decisionNote:row.decision_note as string|null}; }

export async function sharedEventRoute(request: Request, services: Services, membership: ExperienceMembership): Promise<Response> {
  const url = new URL(request.url); const context = await services.context();
  if (membership.experienceKey === "genesis" && membership.roles.includes("student") && request.method === "GET" && url.pathname === "/api/shared-events/workspace") {
    return workspaceJson(await workspace(services,membership,[]));
  }
  if (!isStaff(membership)) throw new WorkspaceError(403,"Staff event access is required.");
  const allowed = await allowedOrganizations(services,membership,context);
  if (request.method === "GET" && url.pathname === "/api/shared-events/workspace") return workspaceJson(await workspace(services,membership,allowed));
  if (request.method === "GET" && url.pathname === "/api/shared-events/report") {
    if (membership.experienceKey === "facilities") throw new WorkspaceError(403,"Open event reports from an event workspace.");
    const data=await workspace(services,membership,allowed);
    const admin=isAdmin(membership) || (membership.experienceKey==="genesis" && membership.roles.includes("community_liaison"));
    const hostIds=data.events.filter((item)=>item.oacaEventId).map((item)=>item.oacaEventId as string);
    const hosts=hostIds.length ? await rows(services,`oaca_event_hosts?event_id=in.(${hostIds.join(",")})&user_id=eq.${services.user.id}&select=event_id`) : [];
    const assigned=new Set(hosts.map((item)=>String(item.event_id)));
    const from=url.searchParams.get("from")||""; const to=url.searchParams.get("to")||""; const kind=(url.searchParams.get("kind")||"").toLowerCase(); const name=(url.searchParams.get("name")||"").toLowerCase(); const status=(url.searchParams.get("status")||"").toLowerCase();
    const events=data.events.filter((item)=>(admin || item.createdBy===services.user.id || Boolean(item.oacaEventId && assigned.has(item.oacaEventId))) && (!from || campusDay(item.startsAt)>=from) && (!to || campusDay(item.startsAt)<=to) && (!kind || item.kind.toLowerCase()===kind) && (!name || item.title.toLowerCase().includes(name)) && (!status || item.status===status));
    const category=url.searchParams.get("data");if (category && !["all","metrics","facilities"].includes(category)) throw new WorkspaceError(400,"Choose a report category.");
    await audit(services,"compass_event_report_export","00000000-0000-0000-0000-000000000000",{count:events.length,experience:membership.experienceKey,category:category||"all"});
    return new Response(eventCsv(events,data.evaluations,data.facilitiesRequests,(category||"all") as "all"|"metrics"|"facilities"),{headers:{"content-type":"text/csv; charset=utf-8","content-disposition":"attachment; filename=compass-events.csv","cache-control":"no-store"}});
  }
  if (request.method !== "POST") throw new WorkspaceError(404,"Event action not found.");
  const body=await workspaceBody(request);
  if (url.pathname === "/api/shared-events/plan") {
    if (!mayPlan(membership)) throw new WorkspaceError(403,"This role cannot plan events.");
    const id=body.eventId ? requireId(body.eventId) : crypto.randomUUID();
    const existing=body.eventId ? await visiblePlan(services,membership,id,allowed) : null;
    const publishedEdit=existing?.status==="published" && membership.experienceKey==="oaca";
    if (existing && !["draft","requested"].includes(String(existing.status)) && !publishedEdit) throw new WorkspaceError(409,"Published event details use the event change workflow.");
    const organizationId=existing ? String(existing.organization_id) : membership.experienceKey==="oaca" ? (context.activeOrganizationId || allowed[0]) : String(body.organizationId||"");
    if (!allowed.includes(organizationId)) throw new WorkspaceError(403,"Choose an organization within your assignment.");
    const title=text(body.title,240); if (title.length<3) throw new WorkspaceError(400,"Enter an event title.");
    const details=(body.details && typeof body.details==="object" && !Array.isArray(body.details) ? body.details : {}) as Row;
    const facilities=Array.isArray(details.facilities) ? details.facilities.slice(0,20).map((item) => {
      const entry=item as Row; const kind=String(entry.kind);
      if (!["room","setup","inventory"].includes(kind)) throw new WorkspaceError(400,"Choose a valid Facilities need.");
      const quantity=entry.quantity ? Number(entry.quantity) : null;
      if (quantity !== null && (!Number.isInteger(quantity)||quantity<1||quantity>10000)) throw new WorkspaceError(400,"Check the inventory quantity.");
      return {kind,description:text(entry.description,1000),itemKey:text(entry.itemKey,100)||null,quantity};
    }) : [];
    const safeDetails={partner:text(details.partner,500),accessibility:text(details.accessibility,4000),staffing:text(details.staffing,4000),communications:text(details.communications,4000),estimatedCost:Math.max(0,Math.min(1_000_000,Number(details.estimatedCost)||0)),evaluationMeasures:text(details.evaluationMeasures,4000),location:text(details.location,500),modality:text(details.modality,30),roleDuties:text(details.roleDuties,4000),facilities,inventoryTemplate:facilities.filter((item)=>item.kind==="inventory")};
    const startsAt=body.startsAt ? date(body.startsAt) : null; const endsAt=body.endsAt ? date(body.endsAt) : null;
    if (endsAt && startsAt && endsAt<=startsAt) throw new WorkspaceError(400,"The end must follow the start.");
    const data={id,organization_id:organizationId,owner_experience:membership.experienceKey,created_by:existing?.created_by||services.user.id,title,kind:text(body.kind,80)||"community",objective:text(body.objective,4000),audience:text(body.audience,1000),starts_at:startsAt,ends_at:endsAt,details:safeDetails,recurrence:{label:text((body.recurrence as Row)?.label,120)},status:existing?.status||"draft",updated_at:new Date().toISOString()};
    const old=await rows(services,`compass_event_occurrences?event_id=eq.${id}&select=id,starts_at`);
    const dates=occurrenceRows(id,body.occurrences ?? (startsAt ? [{startsAt,endsAt}] : []),old);
    if (publishedEdit && (title!==existing?.title || data.kind!==existing.kind || data.objective!==existing.objective || data.audience!==existing.audience || new Date(startsAt||0).getTime()!==new Date(String(existing.starts_at||0)).getTime() || new Date(endsAt||0).getTime()!==new Date(String(existing.ends_at||0)).getTime() || dates.length!==old.length || safeDetails.location!==String(((existing.details||{}) as Row).location||"") || JSON.stringify(safeDetails.facilities)!==JSON.stringify((((existing.details||{}) as Row).facilities||[])))) throw new WorkspaceError(409,"Published title, audience, date, location, and Facilities needs require an event change review.");
    if (!publishedEdit && existing?.oaca_event_id) await services.service(`oaca_events?id=eq.${existing.oaca_event_id}`,{method:"PATCH",headers:{...headers,prefer:"return=minimal"},body:JSON.stringify({title,description:data.objective,starts_at:startsAt,ends_at:endsAt,location:safeDetails.location,category:data.kind})});
    if (!publishedEdit && existing?.genesis_event_id) await services.service(`genesis_events?id=eq.${existing.genesis_event_id}`,{method:"PATCH",headers:{...headers,prefer:"return=minimal"},body:JSON.stringify({title,objective:data.objective,audience:data.audience,starts_at:startsAt,ends_at:endsAt,venue:safeDetails.location})});
    const saved=await services.service<Row[]>(`compass_event_plans?on_conflict=id`,{method:"POST",headers:{...headers,prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify(data)});
    for (const item of dates.filter((item)=>!old.some((prior)=>prior.starts_at===item.starts_at))) await services.service("compass_event_occurrences?on_conflict=event_id,starts_at",{method:"POST",headers:{...headers,prefer:"resolution=ignore-duplicates,return=minimal"},body:JSON.stringify(item)});
    await audit(services,publishedEdit?"compass_event_coordination_updated":existing?"compass_event_plan_updated":"compass_event_plan_created",id,{experience:membership.experienceKey});
    return workspaceJson(plan(saved[0]||data),existing?200:201);
  }
  if (url.pathname === "/api/shared-events/facilities/decide") {
    if (membership.experienceKey!=="facilities" || !membership.roles.some((role)=>["administrator","staff","creator"].includes(role))) throw new WorkspaceError(403,"Facilities staff authorization required.");
    const id=requireId(body.requestId); const decision=String(body.decision);
    if (!["confirmed","declined"].includes(decision)) throw new WorkspaceError(400,"Choose a Facilities decision.");
    const current=await one(services,`compass_event_facilities_requests?id=eq.${id}&select=*`);
    if (!current || current.status!=="pending") throw new WorkspaceError(409,"This request is no longer pending.");
    await services.service(`compass_event_facilities_requests?id=eq.${id}`,{method:"PATCH",headers:{...headers,prefer:"return=minimal"},body:JSON.stringify({status:decision,decided_by:services.user.id,decision_note:text(body.note,2000),decided_at:new Date().toISOString()})});
    await audit(services,"compass_facilities_request_decided",String(current.event_id),{requestId:id,decision});
    return workspaceJson({id,status:decision});
  }
  if (membership.experienceKey==="facilities") throw new WorkspaceError(403,"Open the event workspace for this action.");
  const id=requireId(body.eventId); const event=await visiblePlan(services,membership,id,allowed); const admin=isAdmin(membership); const creator=event.created_by===services.user.id;
  if (url.pathname === "/api/shared-events/submit") {
    if (!mayPlan(membership) || !creator || event.status!=="draft") throw new WorkspaceError(409,"Only the organizer can submit a draft.");
    const dates=await rows(services,`compass_event_occurrences?event_id=eq.${id}&select=id`);
    if (!dates.length || !text(event.objective,4000) || !text(event.audience,1000)) throw new WorkspaceError(400,"Add dates, purpose, and audience before submitting.");
    const needs=Array.isArray((event.details as Row)?.facilities) ? (event.details as Row).facilities as Row[] : [];
    for (const occurrence of dates) for (const [index,need] of needs.entries()) await services.service("compass_event_facilities_requests?on_conflict=occurrence_id,request_kind,item_key",{method:"POST",headers:{...headers,prefer:"resolution=ignore-duplicates,return=minimal"},body:JSON.stringify({event_id:id,occurrence_id:occurrence.id,request_kind:need.kind,item_key:need.itemKey||`${need.kind}-${index}`,quantity:need.quantity||null,description:need.description||"",requested_by:services.user.id})});
    await services.service(`compass_event_plans?id=eq.${id}`,{method:"PATCH",headers:{...headers,prefer:"return=minimal"},body:JSON.stringify({status:"requested",updated_at:new Date().toISOString()})});
    await audit(services,"compass_event_requested",id,{facilitiesNeeds:needs.length});
    return workspaceJson({id,status:"requested"});
  }
  if (url.pathname === "/api/shared-events/review") {
    if (membership.experienceKey!=="genesis" || !membership.roles.some((role)=>["administrator","community_liaison","mentor","creator"].includes(role))) throw new WorkspaceError(403,"Impact reviewer access required.");
    const kind=String(body.reviewKind), decision=String(body.decision);
    if (!["mentor","liaison"].includes(kind) || !["approved","changes_requested"].includes(decision)) throw new WorkspaceError(400,"Choose a review decision.");
    if (kind==="mentor" && !membership.roles.some((role)=>["mentor","administrator","creator"].includes(role))) throw new WorkspaceError(403,"Mentor review required.");
    if (kind==="liaison" && !membership.roles.some((role)=>["community_liaison","administrator","creator"].includes(role))) throw new WorkspaceError(403,"Liaison review required.");
    if (kind==="mentor" && event.status!=="requested") throw new WorkspaceError(409,"Submit the event before mentor review.");
    if (kind==="liaison" && event.status!=="mentor_approved") throw new WorkspaceError(409,"Mentor review must finish first.");
    if (kind==="liaison" && decision==="approved" && (await rows(services,`compass_event_facilities_requests?event_id=eq.${id}&status=neq.confirmed&select=id&limit=1`)).length) throw new WorkspaceError(409,"Facilities needs must be confirmed before publication.");
    await services.service("compass_event_reviews?on_conflict=event_id,review_kind",{method:"POST",headers:{...headers,prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({event_id:id,review_kind:kind,decision,reviewer_id:services.user.id,note:text(body.note,4000),reviewed_at:new Date().toISOString()})});
    const status=decision==="changes_requested"?"draft":kind==="mentor"?"mentor_approved":"published";
    await services.service(`compass_event_plans?id=eq.${id}`,{method:"PATCH",headers:{...headers,prefer:"return=minimal"},body:JSON.stringify({status,published_at:status==="published"?new Date().toISOString():null})});
    if (status==="published") await services.service("compass_event_publications?on_conflict=event_id,target_experience",{method:"POST",headers:{...headers,prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({event_id:id,target_experience:"oaca",approved_by:services.user.id})});
    await audit(services,"compass_impact_event_reviewed",id,{kind,decision}); return workspaceJson({id,status});
  }
  if (url.pathname === "/api/shared-events/publish") {
    if (membership.experienceKey!=="oaca" || (!creator&&!admin) || event.status!=="requested") throw new WorkspaceError(403,"Only the OACA event creator or Administrator may publish this request.");
    const unconfirmed=await rows(services,`compass_event_facilities_requests?event_id=eq.${id}&status=neq.confirmed&select=id&limit=1`);
    if (unconfirmed.length) throw new WorkspaceError(409,"Facilities requests must be confirmed before publication.");
    const publishedAt=new Date().toISOString();
    if (!event.oaca_event_id) {
      if (!event.starts_at) throw new WorkspaceError(400,"Set an event date before publication.");
      await services.service("oaca_events",{method:"POST",headers:{...headers,prefer:"return=minimal"},body:JSON.stringify({organization_id:event.organization_id,compass_event_id:id,created_by:event.created_by,title:event.title,description:event.objective,starts_at:event.starts_at,ends_at:event.ends_at,modality:["in_person","teams","hybrid"].includes(String((event.details as Row)?.modality))?(event.details as Row).modality:"in_person",location:(event.details as Row)?.location||"Summerlin · pending verification",audience_spec:{includeAllStudents:false},public_catalog:true,category:event.kind,status:"published",published_at:publishedAt})});
    } else await services.service(`oaca_events?id=eq.${event.oaca_event_id}`,{method:"PATCH",headers:{...headers,prefer:"return=minimal"},body:JSON.stringify({status:"published",published_at:publishedAt})});
    await services.service(`compass_event_plans?id=eq.${id}`,{method:"PATCH",headers:{...headers,prefer:"return=minimal"},body:JSON.stringify({status:"published",published_at:publishedAt})});
    await audit(services,"compass_oaca_event_published",id); return workspaceJson({id,status:"published"});
  }
  if (url.pathname === "/api/shared-events/evaluation") {
    if (!creator) throw new WorkspaceError(403,"The event organizer completes this evaluation.");
    const occurrenceId=requireId(body.occurrenceId); const occurrence=await one(services,`compass_event_occurrences?id=eq.${occurrenceId}&event_id=eq.${id}&select=id`);
    if (!occurrence) throw new WorkspaceError(404,"Event date not found.");
    const registrations=Number(body.registrations), attendance=Number(body.attendance), estimated=Number(body.estimatedCost), actual=Number(body.actualCost);
    if (![registrations,attendance,estimated,actual].every((value)=>Number.isFinite(value)&&value>=0) || !Number.isInteger(registrations)||!Number.isInteger(attendance)) throw new WorkspaceError(400,"Enter nonnegative attendance and cost values.");
    const values={goals_met:text(body.goalsMet,4000),partner_feedback:text(body.partnerFeedback,4000),coordination:text(body.coordination,4000),keep_next_time:text(body.keepNextTime,4000),change_next_time:text(body.changeNextTime,4000),purchase_needs:text(body.purchaseNeeds,4000)};
    if (Object.values(values).slice(0,5).some((value)=>!value)) throw new WorkspaceError(400,"Complete goals, partner feedback, coordination, and next-time lessons.");
    await services.service("compass_event_evaluations?on_conflict=occurrence_id",{method:"POST",headers:{...headers,prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({event_id:id,occurrence_id:occurrenceId,completed_by:services.user.id,registrations,attendance,estimated_cost:estimated,actual_cost:actual,...values})});
    await audit(services,"compass_event_evaluated",id,{occurrenceId}); return workspaceJson({id,occurrenceId,status:"complete"});
  }
  if (url.pathname === "/api/shared-events/handoff") {
    if (!creator) throw new WorkspaceError(403,"The event organizer prepares this handoff.");
    const document=(body.document||{}) as Row;
    const fields=["roleDuties","eventHistory","metrics","analytics","openDecisions","nextActions"] as const;
    const safe=Object.fromEntries(fields.map((field)=>[field,text(document[field],6000)]));
    if (fields.some((field)=>!safe[field])) throw new WorkspaceError(400,"Complete all handoff sections before saving the document.");
    const previous=await rows(services,`compass_event_handoffs?event_id=eq.${id}&select=version&order=version.desc&limit=1`);
    const version=Number(previous[0]?.version||0)+1;
    const saved=await services.service<Row[]>("compass_event_handoffs",{method:"POST",headers,body:JSON.stringify({event_id:id,version,authored_by:services.user.id,document:safe,status:"complete",completed_at:new Date().toISOString()})});
    await audit(services,"compass_event_handoff_completed",id,{version}); return workspaceJson({id:saved[0].id,version,status:"complete"});
  }
  if (url.pathname === "/api/shared-events/handoff/offer") {
    if (!creator) throw new WorkspaceError(403,"The event organizer offers this handoff.");
    const handoffId=requireId(body.handoffId); const target=await one(services,`compass_event_handoffs?id=eq.${handoffId}&event_id=eq.${id}&select=id,status`);
    if (!target || target.status!=="complete") throw new WorkspaceError(409,"Complete the handoff document before entering a successor email.");
    const email=text(body.successorEmail,320).toLowerCase(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new WorkspaceError(400,"Enter a valid successor email.");
    await services.service(`compass_event_handoffs?id=eq.${handoffId}`,{method:"PATCH",headers:{...headers,prefer:"return=minimal"},body:JSON.stringify({status:"offered",successor_email:email,offered_at:new Date().toISOString()})});
    await audit(services,"compass_event_handoff_offered",id,{handoffId}); return workspaceJson({id:handoffId,status:"offered"});
  }
  throw new WorkspaceError(404,"Event action not found.");
}
