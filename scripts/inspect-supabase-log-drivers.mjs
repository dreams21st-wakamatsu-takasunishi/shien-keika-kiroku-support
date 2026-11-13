// Read-only settings and aggregate database statistics. No message/SQL text is printed.
import {checkLinkedProjects,sql,lessonRoot} from './lesson-operation-client.mjs';
checkLinkedProjects();
for(const [project,root] of [['support',process.cwd()],['lesson',lessonRoot]]){
 const settings=sql("select name,setting from pg_settings where name in ('log_statement','log_duration','log_min_duration_statement','log_connections','log_disconnections','pgaudit.log') order by name;",root).rows;
 const feature=sql("select exists(select 1 from pg_extension where extname='pg_stat_statements') as enabled;",root).rows?.[0];
 const queries=feature?.enabled?sql(`select case
 when query ilike '%record_drafts%' then 'record_drafts'
 when query ilike '%support_records%' then 'support_records'
 when query ilike '%user_data%' then 'user_data'
 when query ilike '%morning_meeting%' then 'morning_meeting'
 when query ilike '%attendance_records%' then 'attendance_records'
 when query ilike '%transport_runs%' then 'transport_runs'
 else 'other' end as category,sum(calls) as calls,sum(rows) as rows
 from pg_stat_statements group by 1 order by calls desc;`,root).rows:null;
 console.log(JSON.stringify({project,settings,queries,notLogIngestBytes:true}));
}
