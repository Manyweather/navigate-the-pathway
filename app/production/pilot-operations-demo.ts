import {automationDefaults,ticketStatuses,sanitizedPage,type SupportTicket,type TicketReply,type DevelopmentJob,type AutomationSchedule} from './pilot-operations-model';
import type {AuthorizationContext} from './types';
type State={tickets:SupportTicket[];replies:TicketReply[];jobs:DevelopmentJob[];schedules:AutomationSchedule[]};
const key='compass.pilot-operations.demo.v1';
export function demoOperations(path:string,method:string,body:Record<string,unknown>,context:AuthorizationContext){
 const parsed=new URL(path,'https://example.invalid');const action=parsed.pathname.split('/').pop();const payload=method==='GET'?Object.fromEntries(parsed.searchParams):body;
 let state:State={tickets:[],replies:[],jobs:[],schedules:automationDefaults.map(s=>({...s}))};
 try{state={...state,...JSON.parse(localStorage.getItem(key)||'{}')};}catch{/* A damaged demo store must not affect live records. */}
 const creator=context.principalType==='creator',now=new Date().toISOString();
 const save=()=>localStorage.setItem(key,JSON.stringify(state));
 if(!['tickets','ticket_create','ticket_detail','ticket_reply','venues','telemetry'].includes(action||'')&&!creator)throw new Error('Creator permission required.');
 if(action==='tickets')return state.tickets.filter(t=>creator||t.requester_id===context.userId).sort((a,b)=>b.updated_at.localeCompare(a.updated_at)).slice(Number(payload.offset||0),Number(payload.offset||0)+50);
 if(action==='ticket_create'){
  const t:SupportTicket={id:crypto.randomUUID(),requester_id:context.userId,workspace:String(payload.workspace),kind:String(payload.kind),subject:String(payload.subject).trim(),description:String(payload.description).trim(),impact:String(payload.impact),page_context:sanitizedPage(String(payload.pageContext)),status:'new',created_at:now,updated_at:now};
  if(!t.subject||!t.description)throw new Error('Enter a subject and description.');state.tickets.unshift(t);save();return t;
 }
 if(['ticket_detail','ticket_reply','ticket_status','job_create'].includes(action||'')){
  const t=state.tickets.find(t=>t.id===payload.ticketId&&(creator||t.requester_id===context.userId));if(!t)throw new Error('Ticket unavailable.');
  if(action==='ticket_reply'){if(payload.internal&&!creator)throw new Error('Creator permission required.');if(!String(payload.body||'').trim())throw new Error('Enter a reply.');state.replies.push({id:crypto.randomUUID(),ticket_id:t.id,author_id:context.userId,body:String(payload.body),internal:!!payload.internal,created_at:now});t.updated_at=now;save();}
  if(action==='ticket_status'){if(!ticketStatuses.includes(payload.status as SupportTicket['status']))throw new Error('Invalid status.');t.status=payload.status as SupportTicket['status'];t.updated_at=now;save();}
  if(action==='job_create'){throw new Error('Development runs require the authenticated staff pilot and a paired worker. Demo tickets never execute code.');}
  return {ticket:t,replies:state.replies.filter(r=>r.ticket_id===t.id&&(creator||!r.internal))};
 }
 if(action==='jobs')return state.jobs;
 if(action==='health')return {worker:null,samples:[],email:{},demo:true};
 if(action==='automations')return {schedules:state.schedules,runs:[]};
 if(action==='automation_save'){const s=state.schedules.find(s=>s.id===payload.id);if(s){s.enabled=!!payload.enabled;s.local_time=String(payload.localTime);}save();return {ok:true};}
 if(action==='telemetry')return {ok:true};
 throw new Error('This operation needs the authenticated pilot.');
}
