import React from 'react';
import { createRoot } from 'react-dom/client';
import { RecordForm } from '../../src/components/RecordForm';
import { UNIFIED_TEMPLATE } from '../../src/data/unifiedTemplate';
import { getCurrentDraftCycleKey } from '../../src/utils/draftExpiry';
import { getLocalDateString } from '../../src/utils/weekdays';
import '../../src/index.css';

// Fictional children/storage and intercepted fetch only. No Auth or production access.
const organizationId = '22222222-2222-4222-8222-222222222222', userId = '11111111-1111-4111-8111-111111111111';
const date = getLocalDateString(), draftKey = 'tablet-layout-fixture';
const children = Array.from({ length: 10 }, (_, i) => ({ id: `tablet-${i + 1}`, name: `架空児童${String(i + 1).padStart(2, '0')}`, grade: '小学3年生', regularDays: ['月', '火', '水', '木', '金'], transportProgram: i < 5 ? '小学部' : 'キャリアズ' }));
const model = { requests: [] as string[], formTopScrolls: 0, latestDraft: null as any };
let remoteDraft: any = null;
Object.assign(window, { __recordTabletFixture: model });
const nativeScroll = Element.prototype.scrollIntoView;
Element.prototype.scrollIntoView = function(options) { if (this.id === 'record-wizard') model.formTopScrolls++; nativeScroll.call(this, options); };
const nativeFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
  if (url.origin === location.origin) return nativeFetch(input, init);
  model.requests.push(url.pathname);
  let value: unknown;
  if (url.pathname.endsWith('/lesson-learning')) value = { links: [], configured: true, canManageLinks: false };
  else if (url.pathname.endsWith('/record_drafts')) value = remoteDraft;
  else if (url.pathname.endsWith('/save_record_draft_guarded')) {
    const body = JSON.parse(String(init?.body));
    model.latestDraft = body.p_payload;
    remoteDraft = { payload: body.p_payload, revision: (remoteDraft?.revision || 0) + 1, updated_at: new Date().toISOString(), device_id: body.p_device_id };
    value = [{ new_revision: remoteDraft.revision, saved_at: remoteDraft.updated_at }];
  }
  else throw Error('Synthetic fixture blocks unexpected external operation');
  return new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
const payload = { version: 12, draftCycleKey: getCurrentDraftCycleKey(), selectedTemplateId: UNIFIED_TEMPLATE.id, date,
  selectedChildIds: children.map(c => c.id), activeChildId: children[0].id, currentStepIndex: 2, recorderId: '', recorderName: '架空職員',
  childTemplateIds: Object.fromEntries(children.map(c => [c.id, UNIFIED_TEMPLATE.id])), childStepIds: Object.fromEntries(children.map(c => [c.id, 'attendance'])),
  childDrafts: Object.fromEntries(children.map(c => [c.id, { recordId: `record-${c.id}`, templateId: UNIFIED_TEMPLATE.id, attendance: '出席', attendanceNote: `${c.name}の保持メモ`, expressions: [], expressionNote: '', snack: '', snackNote: '', sectionAnswers: {}, recordModules: [], skippedQuestionIds: [] }])) };
localStorage.setItem(`support-record-draft-v2:${organizationId}:${userId}:${draftKey}`, JSON.stringify(payload));
createRoot(document.getElementById('root')!).render(<React.StrictMode><main className="min-h-screen bg-slate-50 p-3 text-slate-950"><p className="mx-auto mb-3 max-w-4xl text-xs text-slate-500">タブレット表示の確認用・すべて架空データです。実際の記録は変更しません。</p><RecordForm organizationId={organizationId} userId={userId} userDisplayName="架空職員" draftKey={draftKey} templates={[UNIFIED_TEMPLATE]} childrenList={children as any} recorderProfiles={[]} lessonImportEnabled onManageOwnDrafts={async () => {}} onSaveRecords={async () => { throw Error('Synthetic fixture never saves records'); }} /></main></React.StrictMode>);
