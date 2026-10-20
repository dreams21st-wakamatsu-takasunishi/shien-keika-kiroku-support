import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LessonReviewNotice } from '../../src/components/LessonReviewNotice';
import '../../src/index.css';
const model = { mode: 'success', calls: 0, delay: 0, count: 2, opened: false };
Object.assign(window, { __wordNoticeFixture: model });
const nativeFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
  if (url.origin === location.origin) return nativeFetch(input, init);
  if (!url.pathname.endsWith('/functions/v1/lesson-learning')) throw Error('Fixture blocks external requests');
  model.calls++;
  const mode = model.mode;
  if (model.delay) await new Promise(resolve => setTimeout(resolve, model.delay));
  if (mode === 'network') throw new TypeError('Synthetic network failure');
  const status = Number(mode) || 200;
  const body = mode === 'malformed' ? { requests: null, canReviewWord: false } : status !== 200
    ? { error: '試験用：学習連携を確認してください。' }
    : { requests: Array.from({ length: model.count }, () => ({ status: 'pending' })), canReviewWord: true };
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
};
function Fixture() {
  const [scope, setScope] = useState('fake-user-a'), [enabled, setEnabled] = useState(true);
  return <main className="min-h-screen bg-slate-50 p-4"><h1>Word通知の動作確認（架空データ）</h1>
    <div className="my-4 flex gap-3"><button onClick={() => setScope(scope === 'fake-user-a' ? 'fake-user-b' : 'fake-user-a')}>職員を切替</button><button onClick={() => setEnabled(!enabled)}>利用可否を切替</button></div>
    <label className="mb-4 block">確認する通知の状態 <select className="rounded border bg-white p-2" defaultValue="success" onChange={event => { model.mode = event.target.value; window.dispatchEvent(new Event('d-support-word-reviews-updated')); }}><option value="success">取得成功</option><option value="401">ログイン期限切れ</option><option value="403">権限エラー</option><option value="503">サーバーエラー</option><option value="network">通信エラー</option></select></label>
    <LessonReviewNotice enabled={enabled} scopeKey={scope} onOpen={() => { model.opened = true; }} />
    <p>記録入力欄（通知の失敗で消えないことを確認）</p><textarea aria-label="架空の入力欄" className="h-24 w-full border bg-white" />
  </main>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Fixture /></React.StrictMode>);
