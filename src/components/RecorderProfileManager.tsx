import React, { useEffect, useState } from 'react';
import { Copy, Edit3, IdCard, KeyRound, Save, ShieldCheck, Trash2, UserRoundPlus, UsersRound, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { setRecorderPin } from '../services/dataService';
import { RecorderProfile, UserProfile } from '../types';

interface RecorderRow {
  id: string;
  display_name: string;
  active: boolean;
  pin_configured: boolean;
  employee_code: string | null;
  job_title: string | null;
  employment_type: 'full_time' | 'part_time';
  contracted_weekly_hours: number | null;
  individual_login_enabled: boolean;
  created_at: string;
}

const toRecorderProfile = (row: RecorderRow): RecorderProfile => ({
  id: row.id,
  displayName: row.display_name,
  active: row.active,
  pinConfigured: row.pin_configured,
  employeeCode: row.employee_code || undefined,
  jobTitle: row.job_title || undefined,
  employmentType: row.employment_type === 'part_time' ? 'part_time' : 'full_time',
  contractedWeeklyHours: row.contracted_weekly_hours === null ? undefined : Number(row.contracted_weekly_hours),
  individualLoginEnabled: row.individual_login_enabled,
  createdAt: row.created_at,
});

async function functionErrorMessage(error: unknown) {
  const typed = error as { message?: string; context?: Response };
  if (typed.context) {
    try {
      const payload = await typed.context.clone().json() as { error?: string };
      if (payload.error) return payload.error;
    } catch {
      // Use the SDK message when the response is not JSON.
    }
  }
  return typed.message || '処理に失敗しました。';
}

export const RecorderProfileManager: React.FC<{ currentUser: UserProfile }> = ({ currentUser }) => {
  const [recorders, setRecorders] = useState<RecorderProfile[]>([]);
  const [organizationCode, setOrganizationCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newEmployeeCode, setNewEmployeeCode] = useState('');
  const [newJobTitle, setNewJobTitle] = useState('');
  const [newEmploymentType, setNewEmploymentType] = useState<'full_time' | 'part_time'>('full_time');
  const [newContractedWeeklyHours, setNewContractedWeeklyHours] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingEmployeeCode, setEditingEmployeeCode] = useState('');
  const [editingJobTitle, setEditingJobTitle] = useState('');
  const [editingEmploymentType, setEditingEmploymentType] = useState<'full_time' | 'part_time'>('full_time');
  const [editingContractedWeeklyHours, setEditingContractedWeeklyHours] = useState('');
  const [pinEditingId, setPinEditingId] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [pinConfirmation, setPinConfirmation] = useState('');
  const [loginEditingId, setLoginEditingId] = useState<string | null>(null);
  const [loginEmployeeCode, setLoginEmployeeCode] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginPasswordConfirmation, setLoginPasswordConfirmation] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = async () => {
    if (!supabase) return;
    setLoading(true);
    const [recordersResult, organizationResult] = await Promise.all([
      supabase
        .from('recorder_profiles')
        .select('id, display_name, active, pin_configured, employee_code, job_title, employment_type, contracted_weekly_hours, individual_login_enabled, created_at')
        .eq('organization_id', currentUser.organizationId)
        .eq('active', true),
      supabase
        .from('organizations')
        .select('staff_login_code')
        .eq('id', currentUser.organizationId)
        .maybeSingle(),
    ]);
    const { data, error } = recordersResult;
    if (error) {
      setMessage(error.message);
    } else {
      const mapped = ((data || []) as RecorderRow[])
        .map(toRecorderProfile)
        .sort((left, right) => left.displayName.localeCompare(right.displayName, 'ja'));
      setRecorders(mapped);
    }
    if (!organizationResult.error) setOrganizationCode(organizationResult.data?.staff_login_code || '');
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
    // The organization cannot change during a mounted authenticated session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.organizationId]);

  const addRecorder = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase || !newName.trim()) return;
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.from('recorder_profiles').insert({
      organization_id: currentUser.organizationId,
      display_name: newName.trim(),
      employee_code: newEmployeeCode.trim() || null,
      job_title: newJobTitle.trim() || null,
      ...(currentUser.role === 'admin' ? {
        employment_type: newEmploymentType,
        contracted_weekly_hours: newContractedWeeklyHours ? Number(newContractedWeeklyHours) : null,
      } : {}),
      created_by: currentUser.id,
    });
    if (error) {
      setMessage(error.code === '23505' ? '同じ氏名または職員IDがすでに登録されています。' : error.message);
    } else {
      setNewName('');
      setNewEmployeeCode('');
      setNewJobTitle('');
      setNewEmploymentType('full_time');
      setNewContractedWeeklyHours('');
      setMessage('記録者を登録しました。');
      await refresh();
    }
    setBusy(false);
  };

  const saveRecorder = async () => {
    if (!supabase || !editingId || !editingName.trim()) return;
    setBusy(true);
    setMessage(null);
    const { error } = await supabase
      .from('recorder_profiles')
      .update({
        display_name: editingName.trim(),
        employee_code: editingEmployeeCode.trim() || null,
        job_title: editingJobTitle.trim() || null,
        ...(currentUser.role === 'admin' ? {
          employment_type: editingEmploymentType,
          contracted_weekly_hours: editingContractedWeeklyHours ? Number(editingContractedWeeklyHours) : null,
        } : {}),
      })
      .eq('organization_id', currentUser.organizationId)
      .eq('id', editingId);
    if (error) {
      setMessage(error.code === '23505' ? '同じ氏名または職員IDがすでに登録されています。' : error.message);
    } else {
      setEditingId(null);
      setMessage('記録者名を更新しました。過去の記録に保存された氏名は変更されません。');
      await refresh();
    }
    setBusy(false);
  };

  const configureIndividualLogin = async (recorder: RecorderProfile) => {
    if (!supabase) return;
    if (!/^[A-Za-z0-9._-]{3,32}$/.test(loginEmployeeCode)) {
      setMessage('職員IDは半角英数字・ピリオド・ハイフン・下線の3～32文字で入力してください。');
      return;
    }
    if (loginPassword.length < 10 || loginPassword.length > 72) {
      setMessage('パスワードは10～72文字で入力してください。');
      return;
    }
    if (loginPassword !== loginPasswordConfirmation) {
      setMessage('確認用パスワードが一致しません。');
      return;
    }
    setBusy(true);
    setMessage(null);
    const { data, error } = await supabase.functions.invoke('manage-recorder-login', {
      body: {
        action: 'configure',
        recorderProfileId: recorder.id,
        employeeCode: loginEmployeeCode,
        password: loginPassword,
      },
    });
    if (error) {
      setMessage(`職員IDログインを設定できませんでした: ${await functionErrorMessage(error)}`);
    } else {
      if (data?.organizationCode) setOrganizationCode(data.organizationCode);
      setLoginEditingId(null);
      setLoginPassword('');
      setLoginPasswordConfirmation('');
      setMessage(`${recorder.displayName}さんの職員IDログインを設定しました。事業所コードと職員IDを本人へ安全に伝えてください。`);
      await refresh();
    }
    setBusy(false);
  };

  const disableIndividualLogin = async (recorder: RecorderProfile) => {
    if (!supabase || !window.confirm(`${recorder.displayName}さんの職員IDログインを停止しますか？`)) return;
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.functions.invoke('manage-recorder-login', {
      body: { action: 'disable', recorderProfileId: recorder.id },
    });
    if (error) setMessage(`職員IDログインを停止できませんでした: ${await functionErrorMessage(error)}`);
    else {
      setLoginEditingId(null);
      setMessage(`${recorder.displayName}さんの職員IDログインを停止しました。`);
      await refresh();
    }
    setBusy(false);
  };

  const archiveRecorder = async (recorder: RecorderProfile) => {
    if (!supabase) return;
    const confirmed = window.confirm(
      `${recorder.displayName}さんを記録者の選択肢から外しますか？過去の記録者名は保持されます。`
    );
    if (!confirmed) return;
    setBusy(true);
    setMessage(null);
    if (recorder.individualLoginEnabled) {
      const { error: disableError } = await supabase.functions.invoke('manage-recorder-login', {
        body: { action: 'disable', recorderProfileId: recorder.id },
      });
      if (disableError) {
        setMessage(`職員IDログインを停止できなかったため、名簿から外していません: ${await functionErrorMessage(disableError)}`);
        setBusy(false);
        return;
      }
    }
    const { error } = await supabase
      .from('recorder_profiles')
      .update({ active: false })
      .eq('organization_id', currentUser.organizationId)
      .eq('id', recorder.id);
    if (error) {
      setMessage(error.message);
    } else {
      setMessage('記録者を名簿から外しました。');
      await refresh();
    }
    setBusy(false);
  };

  const savePin = async (recorder: RecorderProfile) => {
    if (!/^\d{4,8}$/.test(pin)) {
      setMessage('PINは4～8桁の数字で入力してください。');
      return;
    }
    if (pin !== pinConfirmation) {
      setMessage('確認用PINが一致しません。');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await setRecorderPin(currentUser.organizationId, recorder.id, pin);
      setPinEditingId(null);
      setPin('');
      setPinConfirmation('');
      setMessage(`${recorder.displayName}さんのPINを設定しました。`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'PINを設定できませんでした。');
    } finally {
      setBusy(false);
    }
  };

  const clearPin = async (recorder: RecorderProfile) => {
    if (!window.confirm(`${recorder.displayName}さんのPINを解除しますか？`)) return;
    setBusy(true);
    setMessage(null);
    try {
      await setRecorderPin(currentUser.organizationId, recorder.id, '');
      setMessage(`${recorder.displayName}さんのPINを解除しました。`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'PINを解除できませんでした。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-xl border border-teal-200 bg-white shadow-xs">
      <div className="border-b border-teal-100 bg-teal-50/70 p-5">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <UsersRound className="h-5 w-5 text-teal-700" />
          記録者名簿
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-600">
          実際に記録する職員名を管理します。従来の共有アカウント＋PINと、メールアドレス不要の職員IDログインを併用できます。
        </p>
        <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-teal-200 bg-white/80 p-2 text-[11px] leading-relaxed text-teal-900">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          共有アカウント利用時の取り違え防止のため、各指導員に4～8桁の個人PINを設定してください。
        </p>
        {organizationCode && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white/90 p-2 text-[11px]">
            <span className="font-bold text-slate-600">職員IDログイン用・事業所コード</span>
            <code className="rounded bg-slate-900 px-2 py-1 font-black tracking-widest text-white">{organizationCode}</code>
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(organizationCode)}
              className="flex min-h-8 items-center gap-1 rounded-lg border border-slate-300 px-2 font-bold text-slate-700"
            >
              <Copy className="h-3.5 w-3.5" />コピー
            </button>
          </div>
        )}
      </div>

      <form
        onSubmit={addRecorder}
        className={`grid gap-2 border-b border-slate-200 p-4 md:grid-cols-2 ${currentUser.role === 'admin' ? 'xl:grid-cols-6' : 'xl:grid-cols-4'}`}
      >
        <label>
          <span className="mb-1 block text-[11px] font-bold text-slate-600">指導員氏名</span>
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            required
            maxLength={100}
            placeholder="例：山田 太郎"
            className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-200"
          />
        </label>
        <label>
          <span className="mb-1 block text-[11px] font-bold text-slate-600">職員ID（任意）</span>
          <input
            value={newEmployeeCode}
            onChange={(event) => setNewEmployeeCode(event.target.value.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 32))}
            minLength={3}
            placeholder="例：staff001"
            className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-200"
          />
        </label>
        <label>
          <span className="mb-1 block text-[11px] font-bold text-slate-600">職種・役職（任意）</span>
          <input
            value={newJobTitle}
            onChange={(event) => setNewJobTitle(event.target.value.slice(0, 100))}
            placeholder="例：児童指導員"
            className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-200"
          />
        </label>
        {currentUser.role === 'admin' && (
          <>
            <label>
              <span className="mb-1 block text-[11px] font-bold text-slate-600">勤務区分</span>
              <select value={newEmploymentType} onChange={(event) => setNewEmploymentType(event.target.value as 'full_time' | 'part_time')} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
                <option value="full_time">正職</option>
                <option value="part_time">パート</option>
              </select>
            </label>
            <label>
              <span className="mb-1 block text-[11px] font-bold text-slate-600">週契約時間（任意）</span>
              <input type="number" min="0" max="80" step="0.25" value={newContractedWeeklyHours} onChange={(event) => setNewContractedWeeklyHours(event.target.value)} placeholder="例：20" className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" />
            </label>
          </>
        )}
        <button
          type="submit"
          disabled={busy || !newName.trim()}
          className="min-h-11 self-end rounded-lg bg-teal-600 px-4 text-xs font-bold text-white hover:bg-teal-500 disabled:bg-slate-400"
        >
          <span className="flex items-center justify-center gap-1.5">
            <UserRoundPlus className="h-4 w-4" />
            記録者を追加
          </span>
        </button>
      </form>

      {message && <p className="m-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">{message}</p>}

      {loading ? (
        <p className="p-6 text-xs text-slate-500">記録者名簿を読み込んでいます...</p>
      ) : recorders.length === 0 ? (
        <p className="p-6 text-center text-xs text-slate-500">
          記録者が未登録です。共有アカウントを利用する指導員を登録してください。
        </p>
      ) : (
        <div className="divide-y divide-slate-100">
          {recorders.map((recorder) => {
            const editing = editingId === recorder.id;
            const editingPin = pinEditingId === recorder.id;
            return (
              <div key={recorder.id} className="px-4 py-3">
                {editing ? (
                  <div
                    className={`grid gap-2 md:grid-cols-2 ${
                      currentUser.role === 'admin'
                        ? 'xl:grid-cols-[1.2fr_1fr_1fr_0.8fr_0.8fr_auto_auto]'
                        : 'xl:grid-cols-[1.2fr_1fr_1fr_auto_auto]'
                    } xl:items-center`}
                  >
                    <input
                      autoFocus
                      value={editingName}
                      onChange={(event) => setEditingName(event.target.value)}
                      maxLength={100}
                      aria-label="記録者氏名"
                      className="min-h-10 min-w-0 rounded-lg border border-slate-300 px-3 text-sm"
                    />
                    {currentUser.role === 'admin' && (
                      <>
                        <select value={editingEmploymentType} onChange={(event) => setEditingEmploymentType(event.target.value as 'full_time' | 'part_time')} aria-label="勤務区分" className="min-h-10 min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-sm">
                          <option value="full_time">正職</option>
                          <option value="part_time">パート</option>
                        </select>
                        <input type="number" min="0" max="80" step="0.25" value={editingContractedWeeklyHours} onChange={(event) => setEditingContractedWeeklyHours(event.target.value)} placeholder="週契約時間" aria-label="週契約時間" className="min-h-10 min-w-0 rounded-lg border border-slate-300 px-3 text-sm" />
                      </>
                    )}
                    <input
                      value={editingEmployeeCode}
                      onChange={(event) => setEditingEmployeeCode(event.target.value.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 32))}
                      placeholder="職員ID"
                      aria-label="職員ID"
                      className="min-h-10 min-w-0 rounded-lg border border-slate-300 px-3 text-sm"
                    />
                    <input
                      value={editingJobTitle}
                      onChange={(event) => setEditingJobTitle(event.target.value.slice(0, 100))}
                      placeholder="職種・役職"
                      aria-label="職種・役職"
                      className="min-h-10 min-w-0 rounded-lg border border-slate-300 px-3 text-sm"
                    />
                    <button
                      type="button"
                      disabled={busy || !editingName.trim()}
                      onClick={saveRecorder}
                      className="flex min-h-10 items-center gap-1 rounded-lg bg-teal-600 px-3 text-xs font-bold text-white disabled:bg-slate-400"
                    >
                      <Save className="h-3.5 w-3.5" />
                      保存
                    </button>
                    <button
                      type="button"
                      aria-label="編集を取り消す"
                      onClick={() => setEditingId(null)}
                      className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 text-slate-500"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-40 flex-1">
                      <strong className="block truncate text-sm text-slate-800">{recorder.displayName}</strong>
                      <span className="mt-0.5 block truncate text-[10px] text-slate-500">
                        {[recorder.jobTitle, recorder.employeeCode ? `ID: ${recorder.employeeCode}` : '職員ID未登録'].filter(Boolean).join('・')}
                      </span>
                    </span>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${recorder.employmentType === 'part_time' ? 'bg-violet-100 text-violet-800' : 'bg-emerald-100 text-emerald-800'}`}>
                      {recorder.employmentType === 'part_time' ? 'パート' : '正職'}{recorder.contractedWeeklyHours !== undefined ? `・週${recorder.contractedWeeklyHours}h` : ''}
                    </span>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                      recorder.pinConfigured
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}>
                      {recorder.pinConfigured ? 'PIN設定済み' : 'PIN未設定'}
                    </span>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${recorder.individualLoginEnabled ? 'bg-sky-100 text-sky-800' : 'bg-slate-100 text-slate-600'}`}>
                      {recorder.individualLoginEnabled ? '職員IDログイン有効' : '職員ID未発行'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setLoginEditingId(loginEditingId === recorder.id ? null : recorder.id);
                        setLoginEmployeeCode(recorder.employeeCode || '');
                        setLoginPassword('');
                        setLoginPasswordConfirmation('');
                        setPinEditingId(null);
                        setMessage(null);
                      }}
                      className="flex min-h-10 items-center gap-1 rounded-lg px-2.5 text-xs font-bold text-sky-700 hover:bg-sky-50"
                    >
                      <IdCard className="h-3.5 w-3.5" />
                      {recorder.individualLoginEnabled ? 'ログイン設定' : '職員IDを発行'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPinEditingId(editingPin ? null : recorder.id);
                        setPin('');
                        setPinConfirmation('');
                        setLoginEditingId(null);
                        setMessage(null);
                      }}
                      className="flex min-h-10 items-center gap-1 rounded-lg px-2.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50"
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                      {recorder.pinConfigured ? 'PIN変更' : 'PIN設定'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(recorder.id);
                        setEditingName(recorder.displayName);
                        setEditingEmployeeCode(recorder.employeeCode || '');
                        setEditingJobTitle(recorder.jobTitle || '');
                        setEditingEmploymentType(recorder.employmentType || 'full_time');
                        setEditingContractedWeeklyHours(recorder.contractedWeeklyHours === undefined ? '' : String(recorder.contractedWeeklyHours));
                        setMessage(null);
                      }}
                      className="flex min-h-10 items-center gap-1 rounded-lg px-2.5 text-xs font-bold text-teal-700 hover:bg-teal-50"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      編集
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => archiveRecorder(recorder)}
                      className="flex min-h-10 items-center gap-1 rounded-lg px-2.5 text-xs font-bold text-rose-700 hover:bg-rose-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      名簿から外す
                    </button>
                  </div>
                )}

                {loginEditingId === recorder.id && !editing && (
                  <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-bold text-sky-950">{recorder.displayName}さんの職員IDログイン</p>
                        <p className="mt-1 text-[10px] leading-relaxed text-sky-800">
                          個人メールは不要です。事業所コード・職員ID・パスワードで本人専用のログインになります。
                        </p>
                      </div>
                      {recorder.individualLoginEnabled && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void disableIndividualLogin(recorder)}
                          className="min-h-9 rounded-lg border border-rose-200 bg-white px-3 text-[11px] font-bold text-rose-700"
                        >
                          ログインを停止
                        </button>
                      )}
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      <label>
                        <span className="mb-1 block text-[10px] font-bold text-sky-900">職員ID</span>
                        <input
                          value={loginEmployeeCode}
                          onChange={(event) => setLoginEmployeeCode(event.target.value.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 32))}
                          placeholder="staff001"
                          autoComplete="off"
                          className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
                        />
                      </label>
                      <label>
                        <span className="mb-1 block text-[10px] font-bold text-sky-900">{recorder.individualLoginEnabled ? '新しいパスワード' : '初期パスワード'}</span>
                        <input
                          type="password"
                          value={loginPassword}
                          onChange={(event) => setLoginPassword(event.target.value.slice(0, 72))}
                          minLength={10}
                          autoComplete="new-password"
                          placeholder="10文字以上"
                          className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
                        />
                      </label>
                      <label>
                        <span className="mb-1 block text-[10px] font-bold text-sky-900">確認用パスワード</span>
                        <input
                          type="password"
                          value={loginPasswordConfirmation}
                          onChange={(event) => setLoginPasswordConfirmation(event.target.value.slice(0, 72))}
                          minLength={10}
                          autoComplete="new-password"
                          placeholder="もう一度入力"
                          className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
                        />
                      </label>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[10px] text-slate-600">パスワードは画面に再表示されません。安全な方法で本人に伝えてください。</p>
                      <button
                        type="button"
                        disabled={busy || !loginEmployeeCode || !loginPassword || !loginPasswordConfirmation}
                        onClick={() => void configureIndividualLogin(recorder)}
                        className="min-h-11 rounded-lg bg-sky-700 px-4 text-xs font-bold text-white disabled:bg-slate-400"
                      >
                        {recorder.individualLoginEnabled ? '職員IDとパスワードを更新' : '職員IDログインを発行'}
                      </button>
                    </div>
                  </div>
                )}

                {editingPin && !editing && (
                  <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3">
                    <p className="text-xs font-bold text-indigo-950">
                      {recorder.displayName}さんの新しいPIN
                    </p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                      <input
                        type="password"
                        inputMode="numeric"
                        autoComplete="new-password"
                        value={pin}
                        onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 8))}
                        placeholder="4～8桁"
                        aria-label="新しいPIN"
                        className="min-h-11 rounded-lg border border-slate-300 px-3 text-center text-base font-bold tracking-widest"
                      />
                      <input
                        type="password"
                        inputMode="numeric"
                        autoComplete="new-password"
                        value={pinConfirmation}
                        onChange={(event) => setPinConfirmation(event.target.value.replace(/\D/g, '').slice(0, 8))}
                        placeholder="確認のため再入力"
                        aria-label="確認用PIN"
                        className="min-h-11 rounded-lg border border-slate-300 px-3 text-center text-base font-bold tracking-widest"
                      />
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void savePin(recorder)}
                        className="min-h-11 rounded-lg bg-indigo-600 px-4 text-xs font-bold text-white disabled:bg-slate-400"
                      >
                        PINを保存
                      </button>
                    </div>
                    {recorder.pinConfigured && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void clearPin(recorder)}
                        className="mt-2 min-h-10 text-xs font-bold text-rose-700 underline"
                      >
                        PINを解除する
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
