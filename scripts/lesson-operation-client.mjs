import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,unlinkSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
export const supportRef='cyqrxhknpboidvetdfgn',lessonRef='lmonjfdxtefsvgtdixid',orgId='44d7f8d4-3ee1-476c-b3a2-d4a8aae7ef4d',campusId='main';
export const lessonRoot=resolve('../Dレッスン5.0/d-lesson-v4');
export function checkLinkedProjects(){
  if(readFileSync('supabase/.temp/project-ref','utf8').trim()!==supportRef||readFileSync(resolve(lessonRoot,'supabase/.temp/project-ref'),'utf8').trim()!==lessonRef)throw Error('Linked project mismatch');
}
export function cli(args,root=process.cwd()){
  const quote=value=>`'${String(value).replaceAll("'","''")}'`;
  const result=spawnSync('powershell.exe',['-NoProfile','-Command',`& npx.cmd supabase ${args.map(quote).join(' ')}`],{cwd:root,encoding:'utf8',timeout:120000,maxBuffer:8388608});
  if(result.status!==0)throw Error(`Supabase ${args[0]} ${args[1]||''} failed; credential-bearing output withheld`);
  return result.stdout;
}
export function sql(statement,root=process.cwd()){
  mkdirSync('output',{recursive:true});const path=resolve('output',`lesson-operation-${randomUUID()}.sql`);
  try{writeFileSync(path,statement);return JSON.parse(cli(['db','query','--linked','--file',path],root));}finally{unlinkSync(path);}
}
export function clients(){
  checkLinkedProjects();
  const client=ref=>{const keys=JSON.parse(cli(['projects','api-keys','--project-ref',ref,'--reveal','-o','json']));
    const service=(Array.isArray(keys)?keys:keys.rows).find(row=>row.name==='service_role')?.api_key;
    if(!service)throw Error('Service key unavailable');return createClient(`https://${ref}.supabase.co`,service,{auth:{persistSession:false,autoRefreshToken:false}});};
  return {support:client(supportRef),lesson:client(lessonRef)};
}
