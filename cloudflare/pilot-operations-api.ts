import {workspaceBody,workspaceJson,WorkspaceError,type WorkspaceServices} from './workspace-api';
import {sanitizedPage} from '../app/production/pilot-operations-model';

const reads=new Set(['tickets','ticket_detail','jobs','automations','health','venues']);
const writes=new Set(['ticket_create','ticket_reply','ticket_status','job_create','job_cancel','job_approve','job_continue','automation_save','telemetry']);
export async function pilotOperationsRoute(request:Request,services:WorkspaceServices):Promise<Response|null>{
 const url=new URL(request.url);if(!url.pathname.startsWith('/api/pilot/'))return null;
 const action=url.pathname.slice('/api/pilot/'.length);
 if(action==='student-view'){const payload=request.method==='GET'?Object.fromEntries(url.searchParams):await workspaceBody(request);const operation=String(payload.action||'');if(request.method==='GET'?!['list','read','access_directory'].includes(operation):request.method!=='POST'||operation!=='override')throw new WorkspaceError(405,'Method not allowed.');return workspaceJson(await services.rpc('pilot_student_view',{action:operation,payload}));}
 if(action==='reports'&&request.method==='GET')return workspaceJson(await services.rpc('pilot_reports',{export_requested:false}));
 if(action==='report_export'&&request.method==='POST')return workspaceJson(await services.rpc('pilot_reports',{export_requested:true}));
 if(request.method==='GET'&&!reads.has(action)||request.method==='POST'&&!writes.has(action)||!['GET','POST'].includes(request.method))throw new WorkspaceError(404,'Operation unavailable.');
 const payload=request.method==='GET'?Object.fromEntries(url.searchParams):await workspaceBody(request);
 if(action==='ticket_create')payload.pageContext=sanitizedPage(String(payload.pageContext||'/app'));
 return workspaceJson(await services.rpc('pilot_operations',{action,payload}));
}

export type OperationsService={rest<T>(path:string,options?:RequestInit):Promise<T>};
export async function workerRequest(request:Request,config:{token?:string;organizationId?:string},service:OperationsService){
 if(!config.token||!config.organizationId)throw new WorkspaceError(503,'Local worker is not paired.');
 const supplied=request.headers.get('authorization')?.replace(/^Bearer /,'')||'';
 const hash=async(s:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
 const a=await hash(supplied),b=await hash(config.token);let difference=0;for(let i=0;i<a.length;i++)difference|=a[i]^b[i];
 if(difference!==0)throw new WorkspaceError(401,'Worker authentication failed.');
 const payload=await workspaceBody(request),action=String(payload.action||'');
 if(!['claim','heartbeat','result','schedules','automation_result'].includes(action))throw new WorkspaceError(400,'Unknown worker action.');
 return workspaceJson(await service.rest('rpc/pilot_worker_action',{method:'POST',body:JSON.stringify({org:config.organizationId,action,payload})}));
}
