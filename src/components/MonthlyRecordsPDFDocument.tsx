import React from 'react';
import type { SupportRecord } from '../types';
import { PDFDocument } from './PDFDocument';

export function MonthlyRecordsPDFDocument({
  id,
  records,
  childName,
  month,
}: {
  id: string;
  records: SupportRecord[];
  childName: string;
  month: string;
}) {
  return (
    <div id={id} className="fixed left-[-12000px] top-0 w-[800px] bg-white" aria-hidden="true">
      <section data-pdf-page className="flex min-h-[1120px] w-[800px] flex-col bg-white p-14 text-slate-950">
        <p className="text-sm font-black tracking-[0.2em] text-teal-700">支援経過記録・月間出力</p>
        <h1 className="mt-8 border-b-4 border-slate-950 pb-5 text-4xl font-black">{childName}</h1>
        <dl className="mt-10 grid grid-cols-[9rem_1fr] gap-y-5 text-lg">
          <dt className="font-black text-slate-500">対象月</dt><dd className="font-black">{month.replace('-', '年')}月</dd>
          <dt className="font-black text-slate-500">記録件数</dt><dd className="font-black">{records.length}件</dd>
          <dt className="font-black text-slate-500">出力日時</dt><dd className="font-black">{new Intl.DateTimeFormat('ja-JP', { dateStyle: 'long', timeStyle: 'short' }).format(new Date())}</dd>
        </dl>
        <div className="mt-12 rounded-2xl border-2 border-slate-300 p-6">
          <h2 className="text-lg font-black">収録日</h2>
          <div className="mt-4 grid grid-cols-4 gap-3 text-sm font-bold">
            {records.map((record) => <span key={record.id} className="rounded-lg bg-slate-100 px-3 py-2 text-center">{record.date.slice(5).replace('-', '/')}</span>)}
          </div>
        </div>
        <p className="mt-auto border-t border-slate-300 pt-4 text-xs leading-relaxed text-slate-500">本書類には個人情報が含まれます。事業所の管理規程に従って保管してください。</p>
      </section>
      {records.map((record) => (
        <section key={record.id} data-pdf-page className="w-[800px] bg-white">
          <PDFDocument record={record} id={`monthly-pdf-record-${record.id}`} />
        </section>
      ))}
    </div>
  );
}
