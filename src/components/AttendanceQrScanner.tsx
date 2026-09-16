import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, RefreshCw, X } from 'lucide-react';
import { parseAttendanceQrToken } from '../utils/attendanceQr';

export function AttendanceQrScanner({ action, onClose, onScanned }: {
  action: '出勤' | '退勤' | 'ログイン';
  onClose: () => void;
  onScanned: (token: string) => Promise<void>;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onScannedRef = useRef(onScanned);
  const processingRef = useRef(false);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  onScannedRef.current = onScanned;
  const login = action === 'ログイン';

  useEffect(() => {
    let active = true;
    let controls: { stop: () => void } | undefined;
    const video = videoRef.current;
    processingRef.current = false;
    setProcessing(false);
    setError('');
    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('この端末ではカメラを利用できません。ブラウザーとカメラ権限を確認してください。');
        const { BrowserQRCodeReader } = await import('@zxing/browser');
        if (!active || !video) return;
        const reader = new BrowserQRCodeReader();
        const started = await reader.decodeFromConstraints(
          { audio: false, video: { facingMode: { ideal: 'environment' } } }, video,
          (result) => {
            if (!active || !result || processingRef.current) return;
            const token = parseAttendanceQrToken(result.getText());
            if (!token) {
              setError('玄関用ではないQRコードです。玄関端末に表示中のQRコードを読み取ってください。');
              return;
            }
            // One request per scan; a rejected scan requires an explicit retry.
            processingRef.current = true;
            setProcessing(true);
            setError('');
            void Promise.resolve().then(() => onScannedRef.current(token)).catch((cause) => {
              if (!active) return;
              setProcessing(false);
              setError(cause instanceof Error ? cause.message : '読み取り後の処理に失敗しました。再試行してください。');
            });
          },
        );
        if (!active) started.stop();
        else controls = started;
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'カメラを起動できませんでした。');
      }
    };
    void start();
    return () => {
      active = false;
      controls?.stop();
      const stream = video?.srcObject;
      if (typeof MediaStream !== 'undefined' && stream instanceof MediaStream) stream.getTracks().forEach((track) => track.stop());
    };
  }, [retryKey]);

  return (
    <div className="fixed inset-0 z-[190] flex flex-col bg-slate-950 text-white" role="dialog" aria-modal="true" aria-label={`${action}用QRコードを読み取る`}>
      <header className="flex items-center justify-between gap-3 px-4 pb-3 pt-[max(.75rem,env(safe-area-inset-top))]">
        <div><p className="text-xs font-black text-sky-300">{login ? '承認済み個人端末でログイン' : `${action}として打刻`}</p><h2 className="text-lg font-black">玄関端末のQRコードを枠内へ</h2></div>
        <button type="button" disabled={processing} onClick={onClose} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-slate-700 disabled:opacity-40" aria-label="カメラを閉じる"><X className="h-6 w-6" /></button>
      </header>
      {login && <p className="px-4 pb-3 text-xs leading-relaxed text-slate-300">この端末に登録された職員としてログインします。出退勤の打刻は行いません。</p>}
      <main className="relative min-h-0 flex-1 overflow-hidden bg-black">
        <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-slate-950/25"><div className="aspect-square w-[min(72vw,420px)] rounded-3xl border-4 border-white shadow-[0_0_0_999px_rgba(2,6,23,.38)]" /></div>
        {processing && <div role="status" className="absolute inset-x-4 bottom-5 rounded-xl bg-sky-700 p-3 text-center text-sm font-black"><RefreshCw className="mr-2 inline h-5 w-5 animate-spin" />{login ? 'ログインしています…' : `${action}を記録しています…`}</div>}
        {error && <div role="alert" className="absolute inset-x-4 bottom-5 rounded-xl bg-rose-800 p-4 text-center text-sm font-black">
          <p><AlertTriangle className="mr-1 inline h-5 w-5" />{error}</p>
          <button type="button" onClick={() => setRetryKey((key) => key + 1)} className="mt-3 min-h-11 rounded-lg border border-white/70 px-4">もう一度読み取る</button>
        </div>}
      </main>
    </div>
  );
}
