import React, { useEffect, useRef, useState } from 'react';
import { Maximize2, RefreshCw, X } from 'lucide-react';

export function StaffQrReadability({ imageUrl, seconds, displayName, loading, receipt, error, statusError, onRenew }: {
  imageUrl: string;
  seconds: number;
  displayName: string;
  loading: boolean;
  receipt: string;
  error: string;
  statusError: string;
  onRenew: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const openButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const visible = !loading && !!imageUrl && seconds > 0 && !receipt;
  const close = () => { setExpanded(false); openButton.current?.focus(); };
  useEffect(() => {
    if (!expanded) return;
    closeButton.current?.focus();
  }, [expanded]);

  return <>
    {visible && <>
      <img src={imageUrl} alt="ログイン・出退勤用の本人用QR" className="mx-auto my-3 aspect-square w-full max-w-[min(48dvh,400px)] bg-white" />
      <button ref={openButton} type="button" onClick={() => setExpanded(true)} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-sky-700 bg-sky-50 px-3 text-sm font-black text-sky-900"><Maximize2 className="h-5 w-5" />読み取り用表示（QRを大きく）</button>
      <details className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-left text-sm text-slate-700"><summary className="cursor-pointer font-bold">読み取れないとき：明るさ・距離・反射を調整</summary><ul className="mt-2 list-disc space-y-1 pl-5"><li>画面が暗い場合は、スマホの明るさを少し上げます。</li><li>白い部分がまぶしく、QRがぼやける場合は、明るさを少し下げます。最大にする必要はありません。</li><li>画面への照明の映り込みを避け、少し傾けます。</li><li>QR全体と白い余白が映るよう、端末を少し離し、ゆっくり前後に調整します。</li></ul><p className="mt-2 text-xs">この画面は端末の明るさ設定を変更しません。</p></details>
    </>}
    {expanded && <div role="dialog" aria-modal="true" aria-label="本人用QRの読み取り用表示" onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
      if (event.key === 'Tab') {
        // Keep keyboard focus inside this overlay, including while the QR refreshes.
        const container = event.currentTarget as HTMLDivElement;
        const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
        const first = buttons[0], last = buttons.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }} className="fixed inset-0 z-[185] flex flex-col gap-2 overflow-hidden bg-white px-3 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-[max(.75rem,env(safe-area-inset-top))] text-slate-950">
      <header className="flex shrink-0 items-center justify-between gap-3"><div className="min-w-0"><h3 className="text-base font-black">読み取り用表示</h3><p className="break-words text-sm font-bold">{displayName}</p></div><button ref={closeButton} type="button" onClick={close} aria-label="通常表示へ戻る" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-slate-400"><X className="h-6 w-6" /></button></header>
      <div className="relative min-h-0 flex-1">
        {visible ? <img src={imageUrl} alt="大きく表示した本人用QR" className="absolute inset-0 h-full w-full bg-white object-contain" /> : <div className="grid h-full place-items-center overflow-y-auto p-3 text-center text-sm font-bold">
          {loading ? <p role="status"><RefreshCw className="mx-auto mb-2 h-8 w-8 animate-spin" />新しいQRを準備しています…</p> : receipt ? <p role="status" className="text-emerald-800">{receipt}</p> : error ? <p role="alert" className="text-rose-800">{error}</p> : <p role="status">有効期限切れ、または安全のためQRを非表示にしました。新しいQRを表示してください。</p>}
        </div>}
      </div>
      <footer className="max-h-[40dvh] shrink-0 space-y-2 overflow-y-auto text-center text-xs leading-relaxed">
        {visible && <p className="font-bold">あと{seconds}秒有効・自動更新 ／ 1回限り</p>}
        {statusError && <p role="alert" className="text-amber-800">{statusError}</p>}
        <p>暗ければ明るさを上げ、白飛びしていれば下げます。<br />反射を避け、QR全体と白い余白が映る距離に調整してください。</p>
        {!visible && !loading && <button type="button" onClick={onRenew} className="min-h-11 w-full rounded-xl bg-sky-700 px-3 text-sm font-black text-white">新しいQRを表示</button>}
      </footer>
    </div>}
  </>;
}
