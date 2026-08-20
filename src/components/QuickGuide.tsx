import React, { useState } from 'react';
import { CheckCircle2, ChevronDown, CircleHelp, X } from 'lucide-react';

export interface QuickGuideContent {
  title: string;
  summary: string;
  steps: string[];
  tips?: string[];
}

export function QuickGuide({ content, compact = false }: { content: QuickGuideContent; compact?: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 font-black text-teal-800 hover:bg-teal-100 ${compact ? 'min-h-9 px-2 text-[10px]' : 'min-h-10 px-3 text-xs'}`}
        aria-haspopup="dialog"
      >
        <CircleHelp className="h-4 w-4" />
        <span className={compact ? 'hidden sm:inline' : ''}>操作ガイド</span>
      </button>

      {open && (
        <aside
          role="dialog"
          aria-modal="false"
          aria-label={`${content.title}の操作ガイド`}
          className="ui-panel-enter fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-3 z-[120] max-h-[min(76dvh,42rem)] w-[calc(100%-1.5rem)] max-w-md overflow-hidden rounded-2xl border-2 border-teal-300 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.3)] sm:right-5"
        >
          <header className="flex items-start gap-3 border-b border-slate-200 bg-gradient-to-r from-teal-50 to-white p-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal-700 text-white"><CircleHelp className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-teal-700">見ながら操作できます</p>
              <h2 className="mt-0.5 text-base font-black text-slate-950">{content.title}</h2>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-500 hover:bg-white" aria-label="操作ガイドを閉じる"><X className="h-5 w-5" /></button>
          </header>
          <div className="ui-scrollbar max-h-[calc(min(76dvh,42rem)-5rem)] overflow-y-auto p-4">
            <p className="rounded-xl bg-slate-50 p-3 text-xs font-bold leading-relaxed text-slate-700">{content.summary}</p>
            <ol className="mt-4 space-y-3">
              {content.steps.map((step, index) => (
                <li key={`${index}-${step}`} className="flex items-start gap-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-teal-700 text-xs font-black text-white">{index + 1}</span>
                  <span className="pt-1 text-sm font-bold leading-relaxed text-slate-800">{step}</span>
                </li>
              ))}
            </ol>
            {content.tips && content.tips.length > 0 && (
              <details className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
                <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-black text-slate-800">迷ったときの確認ポイント<ChevronDown className="h-4 w-4" /></summary>
                <ul className="mt-3 space-y-2">
                  {content.tips.map((tip) => <li key={tip} className="flex items-start gap-2 text-xs leading-relaxed text-slate-600"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" />{tip}</li>)}
                </ul>
              </details>
            )}
          </div>
        </aside>
      )}
    </>
  );
}
