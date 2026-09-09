import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeftRight, ShieldCheck, X } from 'lucide-react';
import type { SupportRecord } from '../types';
import type { RecordOverwritePair } from '../services/recordSaveWorkflow';
import { generateRecordSummary } from '../utils/textGenerator';
import { UNIFIED_RECORD_FIELD_LABELS } from '../utils/unifiedRecordSummary';

function details(record: SupportRecord) {
  return Object.entries(record.sectionAnswers).filter(([id]) => !id.startsWith('__')).map(([id, section]) => {
    const template = record.templateSectionsSnapshot?.find((item) => item.id === id);
    const answers = Object.entries(section.answers || {}).map(([fieldId, answer]) => {
      const label = template?.fields.find((field) => field.id === fieldId)?.label || UNIFIED_RECORD_FIELD_LABELS[fieldId] || fieldId;
      const extra = [answer.homeworkDetails, answer.nestedDetails].filter(Boolean)
        .map((item) => JSON.stringify(item, null, 2)).join('\n');
      return `${label}：${answer.value || '—'}${answer.note ? `\n補足：${answer.note}` : ''}${extra ? `\n${extra}` : ''}`;
    });
    const abc = section.abcAnalysis;
    return [section.sectionTitle || template?.title || id, section.subTitleValue, ...answers,
      section.detailText, abc?.inputMode === 'free' ? abc.freeText : [
        abc?.antecedent && `きっかけ：${abc.antecedent}`, abc?.behavior && `行動：${abc.behavior}`,
        abc?.consequence && `結果：${abc.consequence}`, abc?.summary,
      ].filter(Boolean).join('\n')].filter(Boolean).join('\n');
  }).join('\n\n');
}

function comparisonRows(record: SupportRecord) {
  return [
    ['記録日', record.date],
    ['記録者', record.recorderName],
    ['出欠', [record.attendance, record.attendanceNote].filter(Boolean).join(' / ')],
    ['表情', [record.expressions.join('、'), record.expressionNote].filter(Boolean).join(' / ')],
    ['おやつ', [record.snack, record.snackNote].filter(Boolean).join(' / ')],
    ['利用・送迎', [record.serviceStartTime, record.serviceEndTime, record.transportation].filter(Boolean).join(' / ')],
    ['記録本文', generateRecordSummary(record)],
    ['入力項目の詳細', details(record)],
    ['確認状況', [record.approvalStatus, record.jihatsukanComment, record.reviewedBy,
      ...(record.reviewIssues || []).map((issue) => `${issue.resolved ? '対応済み' : '未対応'}：${issue.comment}`),
    ].filter(Boolean).join('\n')],
  ];
}

export function RecordOverwriteDialog({ pairs, totalCount, onDecision }: {
  pairs: RecordOverwritePair[];
  totalCount: number;
  onDecision: (confirmed: boolean) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(0);
  const [acknowledged, setAcknowledged] = useState<string[]>([]);
  const pair = pairs[index];
  const before = comparisonRows(pair.existing);
  const after = comparisonRows(pair.proposed);
  const blocked = pairs.some((item) => item.existing.approvalStatus === '確認済み');
  const complete = pairs.every((item) => acknowledged.includes(item.existing.id));
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.showModal();
    return () => {
      document.body.style.overflow = overflow;
      dialog.current?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog ref={dialog} onCancel={(event) => { event.preventDefault(); onDecision(false); }}
      aria-labelledby="overwrite-title" className="fixed inset-0 m-auto h-[92dvh] max-h-[92dvh] w-[calc(100%_-_1rem)] max-w-6xl overflow-hidden rounded-2xl border-0 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/60">
      <div className="flex h-full min-h-0 flex-col">
        <header className="shrink-0 border-b border-slate-200 px-4 py-3 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <h2 id="overwrite-title" className="flex items-center gap-2 text-lg font-black"><ArrowLeftRight className="h-5 w-5 text-amber-700" />保存済み記録と比較</h2>
            <button type="button" aria-label="上書きせず閉じる" onClick={() => onDecision(false)} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100"><X className="h-5 w-5" /></button>
          </div>
          <p className="mt-1 text-sm text-slate-600">同じ児童・日付などの記録があります。変更箇所を黄色で表示しています。確定するまで保存しません。</p>
          {pairs.length > 1 && <nav aria-label="比較する児童" className="mt-3 flex flex-wrap gap-2">{pairs.map((item, i) => (
            <button type="button" key={item.existing.id} onClick={() => setIndex(i)} aria-pressed={index === i}
              className={`min-h-11 rounded-lg border px-3 text-sm font-bold ${index === i ? 'border-teal-600 bg-teal-50 text-teal-900' : 'border-slate-300'}`}>
              {acknowledged.includes(item.existing.id) ? '✓ ' : ''}{item.proposed.childName}
            </button>
          ))}</nav>}
          <div className="mt-2 flex gap-2 md:hidden">{['保存済みを見る', '保存予定を見る'].map((label, side) => <button key={label} type="button"
            className="min-h-11 flex-1 rounded-lg border border-slate-300 text-xs font-bold" onClick={() => dialog.current?.querySelector(`[data-comparison-side="${side}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{label}</button>)}</div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6" key={pair.existing.id}>
          <h3 className="mb-3 text-base font-black">{pair.proposed.childName} ・ {pair.proposed.date}</h3>
          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            {[before, after].map((rows, side) => <section key={side} data-comparison-side={side} aria-label={side === 0 ? '保存済みの記録' : 'これから保存する記録'} className="min-w-0 overflow-hidden rounded-xl border border-slate-200">
              <div className={`border-b p-3 ${side === 0 ? 'bg-slate-100' : 'bg-teal-50'}`}>
                <h4 className="font-black">{side === 0 ? '保存済みの記録' : 'これから保存する記録'}</h4>
                <p className="mt-1 text-xs text-slate-600">{side === 0 ? `最終更新：${new Date(pair.existing.updatedAt).toLocaleString('ja-JP')}` : '上書き後の内容・まだ保存されていません'}</p>
              </div>
              <dl className="divide-y divide-slate-200">{rows.map(([label, value], row) => <div key={label} className={`p-3 ${before[row][1] !== after[row][1] ? 'bg-amber-50' : ''}`}>
                <dt className="mb-1 text-xs font-black text-slate-600">{label}{before[row][1] !== after[row][1] && <span className="ml-2 text-amber-800">変更あり</span>}</dt>
                <dd className="whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]">{value || '—'}</dd>
              </div>)}</dl>
            </section>)}
          </div>
        </div>
        <footer className="shrink-0 space-y-3 border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
          {blocked ? <p role="alert" className="flex items-start gap-2 text-sm font-bold text-rose-800"><ShieldCheck className="h-5 w-5 shrink-0" />確認済みの記録は保護されています。児発管が「要修正」に変更してから保存してください。入力内容はこのまま残ります。</p>
            : <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-bold"><input type="checkbox" className="h-5 w-5 accent-teal-600"
                checked={acknowledged.includes(pair.existing.id)} onChange={(event) => setAcknowledged((previous) => event.target.checked ? [...previous, pair.existing.id] : previous.filter((id) => id !== pair.existing.id))} />
                {pair.proposed.childName}の変更内容を確認しました
              </label>}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-600">上書き {pairs.length}件{totalCount > pairs.length ? `・新規 ${totalCount - pairs.length}件` : ''} ／ 比較確認 {acknowledged.length}/{pairs.length}件</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => onDecision(false)} className="min-h-11 rounded-xl border border-slate-300 px-4 text-sm font-bold">上書きせず入力に戻る</button>
              <button type="button" disabled={!complete || blocked} onClick={() => onDecision(true)} className="min-h-11 rounded-xl bg-teal-700 px-5 text-sm font-black text-white disabled:bg-slate-200 disabled:text-slate-500">比較した内容で保存する</button>
            </div>
          </div>
        </footer>
      </div>
    </dialog>
  );
}
