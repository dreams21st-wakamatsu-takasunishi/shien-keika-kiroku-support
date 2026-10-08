import React, { useEffect, useRef, useState } from 'react';
import { LoaderCircle, RefreshCw } from 'lucide-react';
import type { LessonLink } from '../learning/contracts';
import type { LessonProgress, ProgressStage } from '../learning/progress';
import { loadLessonProgress } from '../services/lessonLearningService';

const statuses: Record<ProgressStage['status'], string> = { cleared: '到達済み', current: '次の練習', pending: '未到達', unknown: '未確認' };
const dateTime = (value: string) => new Date(value).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export function LessonProgressPanel({ link }: { link: LessonLink }) {
  const [progress, setProgress] = useState<LessonProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const version = useRef(0);
  const load = async () => {
    const request = ++version.current;
    setProgress(null); setError(''); setBusy(true);
    try {
      const result = await loadLessonProgress(link);
      if (version.current === request) setProgress(result);
    } catch (error) {
      if (version.current === request) setError(error instanceof Error ? error.message : '進捗を取得できませんでした。');
    } finally { if (version.current === request) setBusy(false); }
  };
  useEffect(() => { void load(); return () => { version.current++; }; }, [link.id, link.revision]);
  return <div className="min-w-0 space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-slate-600">{progress ? `取得日時: ${dateTime(progress.fetchedAt)}` : busy ? '児童別進捗を読み込み中...' : '進捗は未取得です。'}</p>
      <button type="button" disabled={busy} onClick={() => void load()} className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:opacity-50">
        {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}進捗を再取得
      </button>
    </div>
    {error && <p role="alert" className="border-l-4 border-rose-500 bg-rose-50 px-3 py-3 text-sm text-rose-900">{error}</p>}
    {progress && <>
      <p role="status" className="border-l-4 border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-950">保存済みの到達状況です。履歴は直近30件までで、全期間の実施を保証しません。記録なしは未実施とは限りません。</p>
      <section aria-label="分野別の進捗" className="divide-y divide-slate-200 border-y border-slate-200">
        {progress.courses.map(course => <details key={course.id} className="py-3">
          <summary className="cursor-pointer text-sm font-bold text-slate-950">
            <span>{course.title}</span><span className="ml-3 text-teal-800">{course.completed === null ? '未確認' : `${course.completed} / ${course.total}`}</span>
            {course.next && <span className="mt-1 block pl-4 text-xs font-normal text-slate-700">次の練習: {course.next.title}</span>}
          </summary>
          {course.completed !== null && <progress aria-label={`${course.title}の到達数`} value={course.completed} max={course.total} className="mt-3 h-2 w-full accent-teal-700" />}
          <div className="mt-3 max-h-80 overflow-auto">
            <table className="w-full min-w-[420px] border-collapse text-left text-sm">
              <thead className="sticky top-0 border-b border-slate-300 bg-slate-50"><tr><th className="p-2">ステージ</th><th className="p-2">保存済み状態</th><th className="p-2">最短時間</th></tr></thead>
              <tbody>{course.stages.map(stage => <tr key={stage.id} className="border-b border-slate-100"><td className="max-w-sm break-words p-2">{stage.title}</td><td className={`whitespace-nowrap p-2 ${stage.status === 'current' ? 'font-bold text-teal-800' : 'text-slate-600'}`}>{statuses[stage.status]}</td><td className="whitespace-nowrap p-2 tabular-nums">{stage.bestSeconds === null ? '記録なし' : `${stage.bestSeconds.toFixed(1)}秒`}</td></tr>)}</tbody>
            </table>
          </div>
        </details>)}
      </section>
      <section aria-label="苦手キー" className="space-y-2">
        <h4 className="text-sm font-bold text-slate-950">入力ミスの多いキー</h4>
        {progress.weakKeys.length ? <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">{progress.weakKeys.map(row => <li key={row.key} className="flex items-center gap-2"><kbd className="flex h-8 w-8 items-center justify-center rounded border border-slate-300 bg-white font-mono font-bold">{row.key}</kbd><span className="text-slate-600">{row.count}回</span></li>)}</ul> : <p className="text-sm text-slate-600">取得できたキー別記録はありません。</p>}
      </section>
      <section aria-label="保存されているログイン設定" className="space-y-2 border-y border-slate-200 py-4">
        <h4 className="text-sm font-bold text-slate-950">学習アカウントの保存設定</h4>
        <dl className="grid gap-2 text-sm sm:grid-cols-[170px_minmax(0,1fr)]"><dt className="text-slate-600">児童番号</dt><dd>{progress.account.loginNumber || '未登録'}</dd><dt className="text-slate-600">Auth連携IDの保存</dt><dd>{progress.account.authIdSaved ? 'あり' : 'なし'}</dd><dt className="text-slate-600">合言葉の発行日時</dt><dd>{progress.account.passcodeIssuedAt ? dateTime(progress.account.passcodeIssuedAt) : '記録なし'}</dd><dt className="text-slate-600">ログイン可否</dt><dd>未検証</dd></dl>
        <p className="text-xs text-slate-600">Auth認証・合言葉の有効性は未検証です。メールアドレス・合言葉は表示しません。</p>
      </section>
      <section aria-label="直近の取り組み" className="space-y-2">
        <h4 className="text-sm font-bold text-slate-950">直近の取り組み</h4>
        {progress.recentEvents.length ? <ol className="divide-y divide-slate-200">{progress.recentEvents.map(event => <li key={event.id} className="grid gap-1 py-3 text-sm sm:grid-cols-[110px_minmax(0,1fr)]"><time className="text-slate-600" dateTime={event.at}>{dateTime(event.at)}</time><div className="min-w-0 break-words"><p className="font-bold text-slate-950">{event.title}</p><p className="text-slate-700">{event.detail}</p><p className="text-slate-600">{event.amount}</p></div></li>)}</ol> : <p className="text-sm text-slate-600">取得できた取り組み履歴はありません。</p>}
      </section>
    </>}
  </div>;
}
