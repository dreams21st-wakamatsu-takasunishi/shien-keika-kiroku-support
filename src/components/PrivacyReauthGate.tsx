import React, { useState } from 'react';
import { KeyRound, LoaderCircle, LogOut, ShieldCheck } from 'lucide-react';
import type { RecorderProfile } from '../types';
import { verifyRecorderPin } from '../services/dataService';

interface PrivacyReauthGateProps {
  organizationId: string;
  organizationName?: string;
  recorder?: RecorderProfile;
  onUnlock: (recorder: RecorderProfile) => void;
  onSignOut: () => Promise<void> | void;
}

export const PrivacyReauthGate: React.FC<PrivacyReauthGateProps> = ({
  organizationId,
  organizationName,
  recorder,
  onUnlock,
  onSignOut,
}) => {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const unlock = async () => {
    if (!recorder) {
      setError('ログイン中の職員情報を確認できません。ログアウトしてから、もう一度ログインしてください。');
      return;
    }
    if (!recorder.pinConfigured) {
      setError('個人端末を利用するには個人PINの設定が必要です。管理者または児発管へ設定を依頼してください。');
      return;
    }
    if (!/^\d{4,8}$/.test(pin)) {
      setError('4～8桁の個人PINを入力してください。');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const verified = await verifyRecorderPin(organizationId, recorder.id, pin);
      if (!verified) {
        setError('PINが正しくありません。もう一度確認してください。');
        setPin('');
        return;
      }
      onUnlock(recorder);
    } catch (verificationError) {
      setError(verificationError instanceof Error ? verificationError.message : '本人確認ができませんでした。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:py-14">
      <section className="mx-auto max-w-md overflow-hidden rounded-3xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="px-6 py-8 text-center sm:px-8">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-400 text-slate-950">
            <ShieldCheck className="h-9 w-9" />
          </span>
          <p className="mt-5 text-xs font-bold text-teal-300">{organizationName || '事業所'}・個人端末保護</p>
          <h1 className="mt-2 text-2xl font-black">本人確認が必要です</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-300">
            アプリを再表示したため、児童情報を表示する前に個人PINを入力してください。
          </p>
        </div>

        <div className="space-y-4 border-t border-slate-700 bg-white p-6 text-slate-900 sm:p-8">
          <div className="rounded-2xl bg-slate-100 p-4">
            <p className="text-[11px] font-bold text-slate-500">ログイン中の職員</p>
            <p className="mt-1 text-lg font-black">{recorder?.displayName || '職員情報を確認できません'}</p>
          </div>

          {recorder?.pinConfigured ? (
            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-sm font-black text-slate-800">
                <KeyRound className="h-4 w-4 text-teal-700" />個人PIN
              </span>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                autoFocus
                value={pin}
                onChange={(event) => {
                  setPin(event.target.value.replace(/\D/g, '').slice(0, 8));
                  setError('');
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void unlock();
                }}
                placeholder="4～8桁"
                className="min-h-14 w-full rounded-2xl border-2 border-slate-300 px-4 text-center text-2xl font-black tracking-[0.35em] focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
              />
            </label>
          ) : (
            <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-bold leading-relaxed text-amber-900">
              個人PINが未設定のため解除できません。管理者または児発管へ設定を依頼してください。
            </p>
          )}

          {error && (
            <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-800">
              {error}
            </p>
          )}

          <button
            type="button"
            disabled={!recorder?.pinConfigured || busy}
            onClick={() => void unlock()}
            className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-teal-600 px-5 text-base font-black text-white disabled:bg-slate-300"
          >
            {busy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <ShieldCheck className="h-5 w-5" />}
            {busy ? '確認中...' : '本人確認して再開'}
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => void onSignOut()}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-5 text-sm font-black text-slate-700"
          >
            <LogOut className="h-4 w-4" />ログアウト
          </button>
        </div>
      </section>
    </div>
  );
};
