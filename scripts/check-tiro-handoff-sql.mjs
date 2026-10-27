// Run the real meeting migrations in an isolated in-memory PostgreSQL database.
import {readFileSync} from 'node:fs';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';import assert from 'node:assert/strict';import ts from 'typescript';
const args=process.argv.slice(2);if(!args.includes('--pglite'))throw Error('--pglite required');
const {PGlite}=await import(pathToFileURL(resolve(args[args.indexOf('--pglite')+1])).href);const file=resolve('supabase/tests/tiro_meeting_workflow_test.ts');
let source=readFileSync(file,'utf8').replace(/^import .*;\r?\n/gm,'').replaceAll('import.meta.url','sourceUrl');let pending;
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
new Function('PGlite','assert','Deno','sourceUrl',code)(PGlite,assert,{readTextFile:async url=>readFileSync(url,'utf8'),test:(_name,run)=>pending=run()},pathToFileURL(file).href);
await pending;console.log(JSON.stringify({passed:true,realMeetingRls:true,manualExportRestored:true,outsiderAndPersonalDenied:true,historyPreserved:true,productionWrites:0}));
