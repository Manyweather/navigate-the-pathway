export const ticketStatuses = ["new", "reviewing", "planned", "in_progress", "waiting", "resolved", "closed"] as const;
export type TicketStatus = typeof ticketStatuses[number];
export type SupportTicket = { id: string; requester_id: string; workspace: string; kind: string; subject: string; description: string; impact: string; page_context: string; status: TicketStatus; created_at: string; updated_at: string };
export type TicketReply = { id: string; ticket_id: string; author_id: string; body: string; internal: boolean; created_at: string };
export type DevelopmentJob = { id: string; ticket_id: string; instruction: string; status: string; revision: string | null; approved_revision: string | null; result: { summary?: string; diff?: string; tests?: string; checksPassed?: boolean; previewUrl?: string; files?: Array<{path:string;content:string}> }; created_at: string; updated_at: string };
export type AutomationSchedule = { id: string; cadence: string; local_time: string; timezone: string; enabled: boolean; last_period: string | null };
export type AutomationRun = { id: string; schedule_id: string; period: string; status: string; findings: string[]; created_at: string };
export type ReportRow = { id:string; kind:"visit"|"event"; studentId:string|null; studentName:string; providerId:string|null; providerName:string; service:string; topic:string; campus:string; location:string; startsAt:string; status:string; attendance:string|null; scheduledMinutes:number; reportedMinutes:number|null; source:string; occurrenceId:string|null };
export type ReportFilter = { from:string; to:string; student:string; provider:string; service:string; topic:string; status:string; campus:string; location:string };
export const emptyReportFilter:ReportFilter={from:"",to:"",student:"",provider:"",service:"",topic:"",status:"",campus:"",location:""};
export function campusDate(value:string, timezone="America/Los_Angeles") {
  if(!Number.isFinite(Date.parse(value)))return "";
  return new Intl.DateTimeFormat("en-CA",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(value));
}
export function filterReport(rows:ReportRow[],filter:ReportFilter) {
  return rows.filter(row=>{const day=campusDate(row.startsAt);return (!filter.from||day>=filter.from)&&(!filter.to||day<=filter.to)&&(!filter.student||row.studentId===filter.student)&&(!filter.provider||row.providerId===filter.provider)&&(!filter.service||row.service===filter.service)&&(!filter.topic||row.topic===filter.topic)&&(!filter.status||row.status===filter.status)&&(!filter.campus||row.campus===filter.campus)&&(!filter.location||row.location===filter.location);});
}
export function reportMetrics(rows:ReportRow[],offeredMinutes:number|null=null) {
  const visits=rows.filter(r=>r.kind==="visit"), events=rows.filter(r=>r.kind==="event");
  const completed=rows.filter(r=>r.status==="completed"||r.attendance==="present");
  const repeats=new Map<string,number>();for(const r of completed)if(r.studentId)repeats.set(r.studentId,(repeats.get(r.studentId)||0)+1);
  const booked=visits.filter(r=>["confirmed","completed","no_show","accepted"].includes(r.status)).reduce((n,r)=>n+r.scheduledMinutes,0);
  const reported=visits.filter(r=>r.reportedMinutes!==null);
  return {visits:visits.length,uniqueStudents:new Set(rows.map(r=>r.studentId).filter(Boolean)).size,scheduledMinutes:visits.reduce((n,r)=>n+r.scheduledMinutes,0),reportedMinutes:reported.length?reported.reduce((n,r)=>n+(r.reportedMinutes||0),0):null,missingReported:visits.length-reported.length,eventOccurrences:new Set(events.map(r=>r.occurrenceId)).size,registrations:events.filter(r=>r.studentId&&r.status!=="cancelled").length,attended:events.filter(r=>r.attendance==="present").length,cancelled:rows.filter(r=>r.status==="cancelled").length,noShows:visits.filter(r=>r.status==="no_show").length,repeatParticipants:[...repeats.values()].filter(n=>n>1).length,utilization:offeredMinutes&&offeredMinutes>0?booked/offeredMinutes:null};
}
export function reportCsv(rows:ReportRow[]) {
  const keys:Array<keyof ReportRow>=["kind","id","studentName","providerName","service","topic","campus","location","startsAt","status","attendance","scheduledMinutes","reportedMinutes","source"];
  const cell=(v:unknown)=>{let s=v==null?"":String(v);if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
  return [keys.join(","),...rows.map(row=>keys.map(k=>cell(row[k])).join(","))].join("\r\n");
}
export function sanitizedPage(path:string) {
  const page=path.split(/[?#]/)[0];
  return /^\/app(?:\/[a-z-]+)*$/.test(page)?page:"/app";
}
export const automationDefaults:AutomationSchedule[]=[
  {id:"daily",cadence:"daily",local_time:"07:00",timezone:"America/Los_Angeles",enabled:true,last_period:null},
  {id:"weekly",cadence:"weekly",local_time:"08:00",timezone:"America/Los_Angeles",enabled:true,last_period:null},
  {id:"monthly",cadence:"monthly",local_time:"09:00",timezone:"America/Los_Angeles",enabled:true,last_period:null},
  {id:"annual",cadence:"annual",local_time:"09:00",timezone:"America/Los_Angeles",enabled:true,last_period:null},
];
/** Periods are local-calendar keys; a reconnect coalesces all missed runs into the latest due period. */
export function duePeriod(schedule:AutomationSchedule,now=new Date()):string|null {
  if(!schedule.enabled)return null;
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:schedule.timezone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(now);
  const p=Object.fromEntries(parts.map(v=>[v.type,v.value]));
  const d=new Date(`${p.year}-${p.month}-${p.day}T12:00:00Z`);
  if(`${p.hour}:${p.minute}`<schedule.local_time)d.setUTCDate(d.getUTCDate()-1);
  if(schedule.cadence==="weekly")d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);
  if(schedule.cadence==="monthly")d.setUTCDate(1);
  if(schedule.cadence==="annual"){if(d.getUTCMonth()<8)d.setUTCFullYear(d.getUTCFullYear()-1);d.setUTCMonth(8,1);}
  const key=d.toISOString().slice(0,10);return key===schedule.last_period?null:key;
}
