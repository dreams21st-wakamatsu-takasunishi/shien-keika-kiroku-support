import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync,unlinkSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
export function contentSql(statement,root=process.cwd()){
 mkdirSync('output',{recursive:true});const path=resolve('output',`content-rollback-${randomUUID()}.sql`);
 if(!/^begin;/i.test(statement)||!statement.includes('rollback;'))throw Error('Only rollback checks allowed');
 try{
  writeFileSync(path,statement);
  const command=`& npx.cmd supabase db query --linked --file '${path.replaceAll("'","''")}'`;
  const r=spawnSync('powershell.exe',['-NoProfile','-Command',command],{cwd:root,encoding:'utf8',timeout:120000,maxBuffer:4194304});
  if(r.status!==0)throw Error('Rollback-only content SQL failed: '+r.stderr.slice(-5000));
  return JSON.parse(r.stdout);
 }finally{unlinkSync(path);}
}
