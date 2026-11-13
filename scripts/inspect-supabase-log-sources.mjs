// Aggregate-only Management API query. Supply the token through the environment; do not print it.
import {supportRef,lessonRef} from './lesson-operation-client.mjs';
const token=process.env.SUPABASE_ACCESS_TOKEN;
if(!token)throw Error('A Supabase Management API credential with analytics:read is required');
const day=process.argv[2];
if(!/^\d{4}-\d{2}-\d{2}$/.test(day||''))throw Error('Provide a date in Japan time');
const start=Date.parse(day+'T00:00:00+09:00');
if(!Number.isFinite(start))throw Error('Invalid date');
const end=start+86400000;
const aggregate=`select source, count() as events, sum(length(event_message)) as message_bytes
from logs group by source order by message_bytes desc limit 20`;
for(const [project,ref] of [['support',supportRef],['lesson',lessonRef]]){
 const url=new URL('https://api.supabase.com/v1/projects/'+ref+'/analytics/endpoints/logs');
 url.search=new URLSearchParams({sql:aggregate,iso_timestamp_start:new Date(start).toISOString(),iso_timestamp_end:new Date(end).toISOString()});
 const response=await fetch(url,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(25000)});
 const json=await response.json().catch(()=>null);
 if(!response.ok||!Array.isArray(json?.result)||json.error){
  console.log(JSON.stringify({project,day,httpStatus:response.status,querySucceeded:false}));
  process.exitCode=1;
  continue;
 }
 const rows=json.result.map(({source,events,message_bytes})=>({
   source:typeof source==='string'&&/^[a-z_]{1,35}$/.test(source)?source:'other',
   events:Number(events),messageBytes:Number(message_bytes),
 })).filter(row=>Number.isFinite(row.events)&&Number.isFinite(row.messageBytes));
 console.log(JSON.stringify({project,day,querySucceeded:true,rows,doesNotIncludeMetadata:true}));
}
