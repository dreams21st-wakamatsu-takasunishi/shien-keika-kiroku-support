import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {getWizardQuestions} from '../src/utils/wizardQuestions.ts';
const read=path=>readFileSync(path,'utf8');
const migration=read('supabase/migrations/202610270003_retire_external_ai.sql');
test('external AI code, clients, settings and export helpers are removed rather than merely hidden',()=>{
 for(const path of ['supabase/functions/home-assistant/index.ts','supabase/functions/polish-record/index.ts','supabase/functions/_shared/externalAiPrivacy.ts','src/utils/aiHelper.ts','src/services/homeAssistantService.ts','src/services/externalAiPrivacy.ts','src/components/AISettingsEditor.tsx','src/components/ExternalAiPolicySettings.tsx','src/meeting/tiroExport.ts'])assert.equal(existsSync(path),false,path);
 for(const file of ['src/components/HomeScreen.tsx','src/components/SettingsHub.tsx','src/App.tsx','src/utils/navigation.ts'])assert.doesNotMatch(read(file),/HomeAssistantPanel|onAssistantExecuted|AISettingsEditor|aiWritingSettings|id: 'assistant'/,file);
 assert.doesNotMatch(read('scripts/deploy-facility-choice-login.mjs'),/'home-assistant'|'polish-record'/);
});
test('runtime source has no external generative AI endpoints or keys',()=>{
 function walk(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){const path=dir+'/'+entry.name;if(entry.isDirectory())walk(path);else if(/\.(ts|tsx|js|mjs)$/.test(entry.name)&&!entry.name.includes('.test.'))assert.doesNotMatch(read(path),/generativelanguage\.googleapis\.com|api\.openai\.com|api\.anthropic\.com|GEMINI_API_KEY|new GoogleGenAI|AI業務アシスタント|AI文章設定|確認して外部AI送信を許可|外部AIへ送る内容の確認|ABC分析を要約する|Tiroへ渡す情報/,path);}}
 walk('src');walk('supabase/functions');
});
test('legacy AI activation is permanently rejected and legacy storage is retained',()=>{
 assert.equal((migration.match(/EXTERNAL_AI_RETIRED/g)||[]).length,2);
 assert.match(migration,/from public,anon,authenticated,service_role/);
 assert.match(migration,/update public.external_ai_policies set enabled=false/);
 for(const table of ['organization_ai_settings','ai_generation_logs','assistant_actions','meeting_export_events'])assert.ok(migration.includes('public.'+table));
 assert.doesNotMatch(migration,/drop\s+table|truncate\s+(?:table\s+)?public|delete\s+from|update\s+public\.(?:support_records|record_drafts|meeting_cases|attendance_records)/i);
});
test('manual ABC and meeting fields keep old content without external transfer controls',()=>{
 const form=read('src/components/RecordForm.tsx'),meeting=read('src/meeting/MeetingWorkspace.tsx');
 assert.match(form,/updateABC\(currentStep.sectionId!, 'summary', event.target.value\)/);assert.doesNotMatch(form,/summarizeABCWithAI|summarizingSectionId|ABC分析を要約する/);
 assert.match(meeting,/content: \{ \.\.\.current\.content, \.\.\.patch \}/);assert.match(meeting,/revision: base.revision/);
 assert.doesNotMatch(meeting,/navigator.clipboard|downloadTiroSheet|logMeetingExport|Tiroへ渡す|録音状態/);
 assert.match(meeting,/会議中/);assert.match(meeting,/今すぐ保存/);
});
test('manuals and workspace no longer load AI settings or expose retired help',()=>{
 assert.doesNotMatch(read('src/components/RolePermissionManager.tsx'),/AI文章設定|記録・AI設定/);
 assert.doesNotMatch(read('src/services/dataService.ts'),/from\('organization_ai_settings'\)|saveAiWritingSettings|mapAiWritingSettings/);
 assert.doesNotMatch(read('src/services/workspaceLoadPlan.ts'),/organization_ai_settings|aiWritingSettings/);
 const chapters=JSON.parse(read('docs/manuals/sections.json'));assert.ok(!chapters.some(s=>s.id==='assistant'));
 assert.ok(chapters.find(s=>s.id==='meeting').steps.some(s=>s.includes('手入力')));
});
test('legacy question wording cannot revive removed AI instructions or mutate stored templates',()=>{
 const template={wizardQuestions:{abcSummary:{title:'旧AI案内',help:'旧操作'},attendance:{title:'出欠を確認'}}};const before=JSON.stringify(template);
 const questions=getWizardQuestions(template);assert.match(questions.abcSummary.title,/手入力/);assert.match(questions.abcSummary.help,/行いません/);assert.equal(questions.attendance.title,'出欠を確認');assert.equal(JSON.stringify(template),before);
});
