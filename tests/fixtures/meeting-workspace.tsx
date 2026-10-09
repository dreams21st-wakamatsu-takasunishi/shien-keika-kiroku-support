import React from 'react';
import { createRoot } from 'react-dom/client';
import { MeetingWorkspace } from '../../src/meeting/MeetingWorkspace';
import { supabase } from '../../src/lib/supabase';
import { createMeetingCase, updateMeetingCase } from '../../src/meeting/meetingService';
import { emptyMeetingContent } from '../../src/meeting/types';
import type { ChildProfile, CalendarEvent, UserProfile } from '../../src/types';
import '../../src/index.css';

// Synthetic fixture. All remote fetches are intercepted before rendering; no real records or Auth are used.
const children = [
  { id: 'demo-child-a', name: '架空児童 あおい', kana: 'かくうじどう あおい', schoolName: '確認用小学校' },
  { id: 'demo-child-b', name: '架空児童 ひなた', kana: 'かくうじどう ひなた', schoolName: '確認用小学校' },
] as ChildProfile[];
const user = { id: 'local-demo', organizationId: supabase ? 'demo-organization' : 'local', displayName: '架空職員', role: 'admin' } as UserProfile;
const model = { rows: [] as any[], calls: [] as Array<{table: string; method: string}>, exports: [] as string[], dirty: false, failExport: false, failUpdate: false, saveDelay: 0, ready: false, conflict: async () => {} };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const nativeFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
  if (url.origin === location.origin) return nativeFetch(input, init);
  const table = url.pathname.split('/').at(-1)!;
  const method = init?.method || (input instanceof Request ? input.method : 'GET');
  model.calls.push({ table, method });
  if (table === 'profiles' && method === 'GET') return response([{ id: user.id, display_name: user.displayName }, { id: 'demo-editor', display_name: '確認用の共同職員' }]);
  if (table === 'meeting_export_events' && method === 'POST') {
    if (model.failExport) return response({ message: '出力履歴を保存できませんでした。', code: '42501' }, 403);
    model.exports.push(JSON.parse(String(init?.body)).output_kind); return response(null, 201);
  }
  if (table === 'meeting_cases') {
    if (method === 'GET') return response(structuredClone(model.rows));
    const payload = JSON.parse(String(init?.body));
    if (method === 'POST') {
      const row = { ...payload, id: crypto.randomUUID(), revision: 1, status: '準備中', editor_user_ids: [], created_by: user.id, updated_at: new Date().toISOString() };
      model.rows.unshift(row); return response(row, 201);
    }
    if (method === 'PATCH') {
      if (model.saveDelay) await new Promise(resolve => setTimeout(resolve, model.saveDelay));
      if (model.failUpdate) return response({ message: '保存できませんでした。', code: '42501' }, 403);
      const row = model.rows.find(item => `eq.${item.id}` === url.searchParams.get('id'));
      if (!row || `eq.${row.revision}` !== url.searchParams.get('revision')) return response(null);
      Object.assign(row, payload, { updated_at: new Date().toISOString() }); return response(structuredClone(row));
    }
  }
  return response({ message: 'Fixture blocks this external request.' }, 403);
};
(window as any).__meetingPreviewTest = model;
const content = emptyMeetingContent();
content.purpose = '学校と家庭での様子を共有し、今後の支援を確認する。';
content.participants = [{ id: 'participant-a', name: '架空の保護者', reading: 'かくうのほごしゃ', organization: '家庭', role: '保護者', calledAs: '', attended: false }];
content.terms = [{ id: 'term-a', spelling: '見通し支援', reading: 'みとおししえん', hint: '活動の順番を伝える', includeInTiro: true }];
content.agenda = [{ id: 'agenda-a', title: '活動の切り替え', question: '学校と家庭での様子を確認する', status: '未確認', memo: '', decision: '', owner: '', dueDate: '' }];
content.outcome.agreements = '以前に保存された合意（保持確認用）';
content.childWishes = { 'demo-child-a': '以前の本人の意向（保持確認用）' };
const seeded = await createMeetingCase({ organizationId: user.organizationId, childIds: children.map(item => item.id), title: '兄弟児の支援会議（確認用）', meetingType: 'ケース会議', meetingDate: '2026-10-09', content });
model.conflict = async () => {
  if (supabase) model.rows[0].revision++;
  else await updateMeetingCase({ ...seeded, title: '別職員による更新（確認用）' });
};
model.ready = true;
const calendar = [{ id: 'demo-calendar', title: '保護者面談（確認用）', date: '2026-10-15', eventType: '保護者面談', childIds: ['demo-child-a'] }] as CalendarEvent[];
createRoot(document.getElementById('root')!).render(<React.StrictMode><main className="min-h-screen bg-slate-50 p-3 text-slate-950 sm:p-6"><p className="mx-auto mb-4 max-w-7xl rounded-xl bg-amber-50 p-3 text-sm text-amber-900">変更確認用・すべて架空データです。本番の記録は変更しません。再読み込みで確認データはリセットされます。</p><MeetingWorkspace organizationId={user.organizationId} currentUser={user} childrenList={children} calendarEvents={calendar} canReview={new URLSearchParams(location.search).get('role') !== 'staff'} onDirtyChange={dirty => { model.dirty = dirty; }} /></main></React.StrictMode>);
