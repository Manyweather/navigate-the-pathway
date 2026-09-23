import type {OperationsService} from './pilot-operations-api';
type Email={id:string;leaseToken:string;operationId:string;recipient:string;category:string;deepLink:string;attempts:number};
export type EmailConfig={enabled?:string;endpoint?:string;key?:string;sender?:string;allowlist?:string;appUrl?:string};
const base64=(bytes:ArrayBuffer)=>btoa(String.fromCharCode(...new Uint8Array(bytes)));
export function logisticsEmail(category:string,link:string){
 const subjects:Record<string,string>={request_received:'Appointment request received',appointment_confirmation:'Appointment confirmed',registration_confirmation:'Event registration confirmed',waitlist_confirmation:'You are on the event waitlist',waitlist_promotion:'Your event place is confirmed',event_change:'Your Compass schedule changed',cancellation:'Compass cancellation notice',declined:'Appointment request declined',reminder:'Compass reminder'};
 return {subject:subjects[category]||'Compass activity update',plainText:`${subjects[category]||'There is an update in Compass'}.\nSign in to review details: ${link}\nRoseman University | Compass`};
}
export async function azureEmailRequest(config:Required<Pick<EmailConfig,'endpoint'|'key'>>,email:Email,sender:string,link:string){
 const url=new URL('/emails:send?api-version=2023-03-31',config.endpoint);
 if(url.protocol!=='https:'||!url.hostname.endsWith('.communication.azure.com'))throw new Error('Invalid Azure email endpoint.');
 const body=JSON.stringify({senderAddress:sender,recipients:{to:[{address:email.recipient}]},content:logisticsEmail(email.category,link)});
 const date=new Date().toUTCString(),hash=base64(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body)));
 const key=await crypto.subtle.importKey('raw',Uint8Array.from(atob(config.key),c=>c.charCodeAt(0)),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signature=base64(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`POST\n${url.pathname}${url.search}\n${date};${url.host};${hash}`)));
 return {url:url.href,options:{method:'POST',headers:{'content-type':'application/json','x-ms-date':date,'x-ms-content-sha256':hash,authorization:`HMAC-SHA256 SignedHeaders=x-ms-date;host;x-ms-content-sha256&Signature=${signature}`,'Operation-Id':email.operationId},body,signal:AbortSignal.timeout(20000)}};
}
export async function deliverPilotEmail(config:EmailConfig,service:OperationsService,send:typeof fetch=fetch){
 if(config.enabled!=='true'||!config.endpoint||!config.key||!config.sender||!config.appUrl||!config.allowlist)return;
 const app=new URL(config.appUrl);if(app.protocol!=='https:')throw new Error('A secure pilot URL is required.');
 const allowed=new Set(config.allowlist.split(',').map(s=>s.trim().toLowerCase()).filter(Boolean));
 for(let i=0;i<20;i++){
  const email=await service.rest<Email|null>('rpc/pilot_claim_email',{method:'POST',body:'{}'});if(!email)break;
  let status='failed',code='provider_unavailable';
  if(!allowed.has(email.recipient.toLowerCase())){status='suppressed';code='pilot_recipient_not_approved';}
  else try{
   const link=new URL('/app',app).href;
   const request=await azureEmailRequest({endpoint:config.endpoint,key:config.key},email,config.sender,link),response=await send(request.url,request.options);
   // 202 means accepted by Azure, not delivered to the mailbox. Delivery callbacks update the latter.
   if(response.status===202){status='sent';code='accepted_by_azure';}else code=`azure_${response.status}`;
  }catch{code='provider_timeout_or_error';}
  await service.rest('rpc/pilot_finish_email',{method:'POST',body:JSON.stringify({payload:{id:email.id,leaseToken:email.leaseToken,status,code}})});
 }
}
