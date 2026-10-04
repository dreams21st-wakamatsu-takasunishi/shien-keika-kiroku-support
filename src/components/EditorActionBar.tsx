import { ChevronDown, Eye, Save } from 'lucide-react';

interface Props {
  busy: boolean;
  preview: boolean;
  onPreview: () => void;
  onSave: () => void;
  secondary: { label: string; onClick: () => void }[];
}

/** Keep the two everyday actions visible, without crowding mobile editors. */
export function EditorActionBar({ busy, preview, onPreview, onSave, secondary }: Props) {
  return <div className="sticky bottom-2 z-20 flex items-center gap-2 rounded-2xl border border-teal-200 bg-white p-2 shadow-lg sm:p-3" aria-label="編集中の内容の操作">
    <button type="button" disabled={busy} onClick={onPreview} aria-expanded={preview} aria-label={preview ? 'プレビューを収納' : 'プレビュー・印刷'} className="flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl border border-slate-300 px-2 text-xs font-bold text-slate-700 disabled:opacity-40 sm:px-3 sm:text-sm"><Eye className="hidden h-4 w-4 shrink-0 sm:block" /><span className="truncate"><span className="sm:hidden">{preview ? '収納' : 'プレビュー'}</span><span className="hidden sm:inline">{preview ? 'プレビューを収納' : 'プレビュー・印刷'}</span></span></button>
    <details className="relative shrink-0" onKeyDown={(event) => { if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); } }}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-xl border border-slate-300 px-2 text-xs font-bold text-slate-700 sm:px-3 sm:text-sm">その他<ChevronDown className="h-4 w-4" /></summary>
      <div className="absolute bottom-full left-0 mb-2 w-56 max-w-[70vw] rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
        {secondary.map((action) => <button key={action.label} type="button" disabled={busy} className="min-h-11 w-full rounded-lg px-3 py-2 text-left text-sm font-bold text-slate-700 hover:bg-teal-50 disabled:opacity-40" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); action.onClick(); }}>{action.label}</button>)}
      </div>
    </details>
    <button type="button" disabled={busy} onClick={onSave} className="ml-auto flex min-h-12 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-teal-700 px-3 text-sm font-black text-white disabled:opacity-40 sm:px-6"><Save className="h-5 w-5" />{busy ? '保存中…' : '保存'}</button>
  </div>;
}
