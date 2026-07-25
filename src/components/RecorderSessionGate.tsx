import React, { useState } from 'react';
import { KeyRound, LoaderCircle, ShieldCheck, UserRound } from 'lucide-react';
import type { RecorderProfile } from '../types';
import { verifyRecorderPin } from '../services/dataService';

interface RecorderSessionGateProps {
  organizationId: string;
  organizationName?: string;
  recorderProfiles: RecorderProfile[];
  onUnlock: (recorder: RecorderProfile) => void;
}

export const RecorderSessionGate: React.FC<RecorderSessionGateProps> = ({
  organizationId,
  organizationName,
  recorderProfiles,
  onUnlock,
}) => {
  const [selectedId, setSelectedId] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const selected = recorderProfiles.find((profile) => profile.id === selectedId);

  const unlock = async () => {
    if (!selected) return;
    if (selected.pinConfigured && !/^\d{4,8}$/.test(pin)) {
      setError('4～8桁のPINを入力してください。');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const verified = await verifyRecorderPin(organizationId, selected.id, pin);
      if (!verified) {
        setError('PINが正しくありません。もう一度確認してください。');
        setPin('');
        return;
      }
      onUnlock(selected);
    } catch (verificationError) {
      setError(verificationError instanceof Error ? verificationError.message : '本人確認ができませんでした。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-8 sm:py-14">
      <section className="mx-auto max-w-xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">
        <div className="bg-gradient-to-br from-slate-950 to-teal-950 px-6 py-7 text-white sm:px-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-500 text-slate-950">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <p className="mt-5 text-xs font-bold text-teal-300">{organizationName || '事業所'}</p>
          <h1 className="mt-1 text-2xl font-black">操作する指導員を選択</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">
            記録者と操作履歴を正しく残すため、最初にご本人を選択してください。
          </p>
        </div>

        <div className="space-y-5 p-6 sm:p-8">
          {recorderProfiles.length === 0 ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-relaxed text-amber-900">
              記録者名簿が未登録です。管理者または児発管のアカウントで、設定から指導員を登録してください。
            </div>
          ) : (
            <>
              <label className="block">
                <span className="mb-2 block text-sm font-black text-slate-800">指導員名</span>
                <select
                  value={selectedId}
                  onChange={(event) => {
                    setSelectedId(event.target.value);
                    setPin('');
                    setError('');
                  }}
                  className="min-h-14 w-full rounded-2xl border-2 border-slate-300 bg-white px-4 text-base font-bold focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
                >
                  <option value="">ご自身の名前を選択してください</option>
                  {recorderProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.displayName}{profile.pinConfigured ? '' : '（PIN未設定）'}
                    </option>
                  ))}
                </select>
              </label>

              {selected?.pinConfigured ? (
                <label className="block">
                  <span className="mb-2 flex items-center gap-2 text-sm font-black text-slate-800">
                    <KeyRound className="h-4 w-4 text-teal-700" />個人PIN
                  </span>
                  <input
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    value={pin}
                    onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 8))}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void unlock();
                    }}
                    placeholder="4～8桁"
                    className="min-h-14 w-full rounded-2xl border-2 border-slate-300 px-4 text-center text-2xl font-black tracking-[0.35em] focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
                  />
                </label>
              ) : selected ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
                  この指導員にはPINが未設定です。利用はできますが、管理者画面からPINを設定してください。
                </p>
              ) : null}

              {error && (
                <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-800">
                  {error}
                </p>
              )}

              <button
                type="button"
                disabled={!selected || busy}
                onClick={() => void unlock()}
                className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-teal-600 px-5 text-base font-black text-white shadow-sm hover:bg-teal-500 disabled:bg-slate-300"
              >
                {busy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <UserRound className="h-5 w-5" />}
                {busy ? '確認中...' : 'この指導員として開始'}
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
};
