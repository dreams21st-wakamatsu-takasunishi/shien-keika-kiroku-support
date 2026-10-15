import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
test('user switch preserves current editors on logout failure and uses only local-session logout',()=>{
 const source=read('src/hooks/useAuth.ts').split('const signOut = async () => {')[1].split('const signInWithAttendanceQr')[0];
 assert.match(source,/signOut\(\{ scope: 'local' \}\)/);assert.doesNotMatch(source,/setLoading\(true\)/);assert.match(source,/return \{error:signOutError\}/);
});
test('switching saves the current draft with revision and identity guards, without finalizing records',()=>{
 const source=read('src/components/RecordForm.tsx').split('prepareUserSwitchRef.current=async()=>{')[1].split('return()=>{prepareUserSwitchRef.current=null;};')[0];
 for(const marker of ['writeLocalDraft(payload)','await draftWrites.idle()','saveRecordDraft(','expectedRevision:remoteRevision.current','recorderId:wizard.recorderId','draftWriteBlocked','isSaving','pendingCompletion'])assert.ok(source.includes(marker),marker);
 assert.doesNotMatch(source,/onSaveRecords\(|deleteRecordDraft\(/);
});
test('header switch resets in-memory account UI and opens a fresh login, without changing device registration',()=>{
 const app=read('src/App.tsx').split('onSwitchUser={remoteMode?async()=>{')[1].split('}:undefined}')[0];
 for(const marker of ['dirtyAreas:','prepare:prepareUserSwitchRef.current','signOut:auth.signOut','setActiveRecorder(null)','setCurrentRecord(null)','setRecordDrafts([])','window.location.reload()'])assert.ok(app.includes(marker),marker);
 assert.doesNotMatch(app,/localStorage\.clear|remove.*device|setSession\(/);
});
