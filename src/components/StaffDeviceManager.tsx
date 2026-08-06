import React, { useEffect, useState } from 'react';
import { Clock3, Laptop, LockKeyhole, RefreshCw, Save, ShieldCheck, ShieldX, Smartphone } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { UserProfile } from '../types';

interface DevicePolicy {
  deviceApprovalEnabled: boolean;
  personalAccessTimeEnabled: boolean;
  personalAccessStart: string;
  personalAccessEnd: string;
  personalAccessDays: number[];
  defaultPersonalFieldMode: boolean;
  sharedStaffLoginAllowed: boolean;
}

interface StaffDeviceRow {
  id: string;
  recorder_profile_id: string;
  label: string;
  platform: string | null;
  device_kind: 'managed' | 'personal';
  status: 'pending' | 'approved' | 'revoked';
  field_mode_only: boolean;
  requested_at: string;
  approved_at: string | null;
  revoked_at: string | null;
  last_seen_at: string | null;
  recorder_profiles: { display_name: string } | { display_name: string }[] | null;
}

const weekdays = [
  { value: 1, label: '月' },
  { value: 2, label: '火' },
  { value: 3, label: '水' },
  { value: 4, label: '木' },
  { value: 5, label: '金' },
  { value: 6, label: '土' },
  { value: 7, label: '日' },
];

const defaultPolicy: DevicePolicy = {
  deviceApprovalEnabled: false,
  personalAccessTimeEnabled: false,
  personalAccessStart: '07:00',
  personalAccessEnd: '22:00',
  personalAccessDays: [1, 2, 3, 4, 5, 6, 7],
  defaultPersonalFieldMode: true,
  sharedStaffLoginAllowed: true,
};

const recorderName = (row: StaffDeviceRow) => {
  const profile = Array.isArray(row.recorder_profiles) ? row.recorder_profiles[0] : row.recorder_profiles;
  return profile?.display_name || '職員名不明';
};

const formatDateTime = (value: string | null) => value
  ? new Intl.DateTimeFormat('ja-JP', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
  : '—';

export const StaffDeviceManager: React.FC<{ currentUser: UserProfile }> = ({ currentUser }) => {
  const [policy, setPolicy] = useState<DevicePolicy>(defaultPolicy);
  const [devices, setDevices] = useState<StaffDeviceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const refresh = async () => {
    if (!supabase) return;
    setLoading(true);
    const [organizationResult, devicesResult] = await Promise.all([
      supabase
        .from('organizations')
        .select('device_approval_enabled, personal_access_time_enabled, personal_access_start, personal_access_end, personal_access_days, default_personal_field_mode, shared_staff_login_allowed')
        .eq('id', currentUser.organizationId)
        .single(),
      supabase
        .from('staff_devices')
        .select('id, recorder_profile_id, label, platform, device_kind, status, field_mode_only, requested_at, approved_at, revoked_at, last_seen_at, recorder_profiles(display_name)')
        .eq('organization_id', currentUser.organizationId)
        .order('requested_at', { ascending: false }),
    ]);
    if (organizationResult.error) {
      setMessage(organizationResult.error.message);
    } else {
      const row = organizationResult.data;
      setPolicy({
        deviceApprovalEnabled: row.device_approval_enabled,
        personalAccessTimeEnabled: row.personal_access_time_enabled,
        personalAccessStart: String(row.personal_access_start || '07:00').slice(0, 5),
        personalAccessEnd: String(row.personal_access_end || '22:00').slice(0, 5),
        personalAccessDays: Array.isArray(row.personal_access_days) ? row.personal_access_days : [1, 2, 3, 4, 5, 6, 7],
        defaultPersonalFieldMode: row.default_personal_field_mode,
        sharedStaffLoginAllowed: row.shared_staff_login_allowed,
      });
    }
    if (devicesResult.error) setMessage(devicesResult.error.message);
    else setDevices((devicesResult.data || []) as unknown as StaffDeviceRow[]);
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.organizationId]);

  const savePolicy = async () => {
    if (!supabase) return;
    if (policy.deviceApprovalEnabled && !window.confirm(
      '端末承認を有効にすると、未登録の職員ID端末は承認されるまでログインできません。共有アカウントは別設定です。続けますか？'
    )) return;
    setBusy(true);
    setMessage('');
    const { error } = await supabase.rpc('update_staff_device_policy', {
      p_device_approval_enabled: policy.deviceApprovalEnabled,
      p_personal_access_time_enabled: policy.personalAccessTimeEnabled,
      p_personal_access_start: policy.personalAccessStart,
      p_personal_access_end: policy.personalAccessEnd,
      p_personal_access_days: policy.personalAccessDays,
      p_default_personal_field_mode: policy.defaultPersonalFieldMode,
      p_shared_staff_login_allowed: policy.sharedStaffLoginAllowed,
    });
    setMessage(error ? `端末利用設定を保存できませんでした: ${error.message}` : '端末利用設定を保存しました。');
    setBusy(false);
    if (!error) await refresh();
  };

  const reviewDevice = async (
    device: StaffDeviceRow,
    action: 'approve' | 'revoke',
    fieldModeOnly = device.field_mode_only,
    deviceKind = device.device_kind,
  ) => {
    if (!supabase) return;
    if (action === 'revoke' && !window.confirm(`${recorderName(device)}さんの「${device.label}」を利用停止にしますか？`)) return;
    setBusy(true);
    setMessage('');
    const { error } = await supabase.rpc('review_staff_device', {
      p_device_id: device.id,
      p_action: action,
      p_field_mode_only: fieldModeOnly,
      p_device_kind: deviceKind,
    });
    setMessage(error
      ? `端末状態を更新できませんでした: ${error.message}`
      : action === 'approve' ? '端末を承認しました。' : '端末の利用許可を取り消しました。');
    setBusy(false);
    if (!error) await refresh();
  };

  const pendingCount = devices.filter((device) => device.status === 'pending').length;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-black text-slate-900">
              <ShieldCheck className="h-5 w-5 text-teal-700" />端末利用ポリシー
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              個人端末の承認、利用時間、表示範囲を管理します。初期状態では既存運用を維持するため承認制は無効です。
            </p>
          </div>
          <button type="button" onClick={() => void refresh()} className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 text-slate-600" aria-label="再読み込み">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <PolicyToggle
            title="新しい端末を承認制にする"
            description="職員IDで初めて使う端末を、管理者・児発管の承認待ちにします。"
            checked={policy.deviceApprovalEnabled}
            onChange={(checked) => setPolicy((current) => ({ ...current, deviceApprovalEnabled: checked }))}
          />
          <PolicyToggle
            title="共有の指導員ログインを許可"
            description="全職員への職員ID発行が終わるまでは有効のままにしてください。"
            checked={policy.sharedStaffLoginAllowed}
            onChange={(checked) => setPolicy((current) => ({ ...current, sharedStaffLoginAllowed: checked }))}
          />
          <PolicyToggle
            title="個人端末は現場モードを初期値にする"
            description="記録作成とホームだけを表示し、名簿・全記録・設定画面を隠します。"
            checked={policy.defaultPersonalFieldMode}
            onChange={(checked) => setPolicy((current) => ({ ...current, defaultPersonalFieldMode: checked }))}
          />
          <PolicyToggle
            title="個人端末の利用時間を制限"
            description="承認済みでも設定時間外はログインを止め、表示中なら自動ログアウトします。"
            checked={policy.personalAccessTimeEnabled}
            onChange={(checked) => setPolicy((current) => ({ ...current, personalAccessTimeEnabled: checked }))}
          />
        </div>

        {policy.personalAccessTimeEnabled && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <div className="flex flex-wrap items-center gap-3">
              <Clock3 className="h-5 w-5 text-amber-700" />
              <label className="text-xs font-bold text-slate-700">開始
                <input type="time" value={policy.personalAccessStart} onChange={(event) => setPolicy((current) => ({ ...current, personalAccessStart: event.target.value }))} className="ml-2 min-h-10 rounded-lg border border-slate-300 bg-white px-2" />
              </label>
              <label className="text-xs font-bold text-slate-700">終了
                <input type="time" value={policy.personalAccessEnd} onChange={(event) => setPolicy((current) => ({ ...current, personalAccessEnd: event.target.value }))} className="ml-2 min-h-10 rounded-lg border border-slate-300 bg-white px-2" />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5" aria-label="利用可能曜日">
              {weekdays.map((day) => {
                const selected = policy.personalAccessDays.includes(day.value);
                return (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => setPolicy((current) => ({
                      ...current,
                      personalAccessDays: selected
                        ? current.personalAccessDays.filter((value) => value !== day.value)
                        : [...current.personalAccessDays, day.value].sort(),
                    }))}
                    className={`grid h-10 w-10 place-items-center rounded-lg border text-xs font-black ${selected ? 'border-amber-600 bg-amber-600 text-white' : 'border-slate-300 bg-white text-slate-500'}`}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] leading-relaxed text-slate-500">
            共有ログイン停止は、全指導員の職員IDログイン確認後に行ってください。
          </p>
          <button type="button" disabled={busy || policy.personalAccessDays.length === 0} onClick={() => void savePolicy()} className="flex min-h-11 items-center gap-2 rounded-lg bg-teal-700 px-4 text-xs font-black text-white disabled:bg-slate-400">
            <Save className="h-4 w-4" />設定を保存
          </button>
        </div>
      </section>

      {message && <p role="status" className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700">{message}</p>}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-4">
          <div>
            <h3 className="text-sm font-black text-slate-900">登録端末</h3>
            <p className="mt-1 text-[11px] text-slate-500">承認待ち {pendingCount}件・全{devices.length}件</p>
          </div>
          {pendingCount > 0 && <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-900">承認待ちあり</span>}
        </div>

        {loading ? (
          <p className="p-6 text-xs text-slate-500">端末一覧を読み込んでいます...</p>
        ) : devices.length === 0 ? (
          <p className="p-6 text-center text-xs leading-relaxed text-slate-500">職員IDでログインすると、使用端末がここに登録されます。</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {devices.map((device) => (
              <div key={device.id} className="grid gap-3 p-4 lg:grid-cols-[1.3fr_1fr_auto] lg:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {device.device_kind === 'managed' ? <Laptop className="h-5 w-5 text-indigo-700" /> : <Smartphone className="h-5 w-5 text-teal-700" />}
                    <strong className="text-sm text-slate-900">{recorderName(device)}</strong>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-black ${
                      device.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : device.status === 'pending' ? 'bg-amber-100 text-amber-900' : 'bg-rose-100 text-rose-800'
                    }`}>
                      {device.status === 'approved' ? '承認済み' : device.status === 'pending' ? '承認待ち' : '利用停止'}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs font-bold text-slate-700">{device.label}</p>
                  <p className="mt-1 text-[10px] text-slate-500">申請 {formatDateTime(device.requested_at)}・最終確認 {formatDateTime(device.last_seen_at)}</p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <label className="font-bold text-slate-600">端末区分
                    <select
                      value={device.device_kind}
                      disabled={busy || device.status !== 'approved'}
                      onChange={(event) => void reviewDevice(device, 'approve', device.field_mode_only, event.target.value as StaffDeviceRow['device_kind'])}
                      className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2"
                    >
                      <option value="personal">個人端末</option>
                      <option value="managed">事業所端末</option>
                    </select>
                  </label>
                  <label className="font-bold text-slate-600">表示範囲
                    <select
                      value={device.field_mode_only ? 'field' : 'full'}
                      disabled={busy || device.status !== 'approved'}
                      onChange={(event) => void reviewDevice(device, 'approve', event.target.value === 'field', device.device_kind)}
                      className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2"
                    >
                      <option value="field">現場モード</option>
                      <option value="full">全機能</option>
                    </select>
                  </label>
                </div>

                <div className="flex flex-wrap justify-end gap-2">
                  {device.status !== 'approved' && (
                    <button type="button" disabled={busy} onClick={() => void reviewDevice(device, 'approve')} className="flex min-h-10 items-center gap-1 rounded-lg bg-teal-700 px-3 text-xs font-black text-white disabled:bg-slate-400">
                      <ShieldCheck className="h-4 w-4" />承認
                    </button>
                  )}
                  {device.status !== 'revoked' && (
                    <button type="button" disabled={busy} onClick={() => void reviewDevice(device, 'revoke')} className="flex min-h-10 items-center gap-1 rounded-lg border border-rose-200 px-3 text-xs font-black text-rose-700 disabled:text-slate-400">
                      <ShieldX className="h-4 w-4" />停止
                    </button>
                  )}
                  {device.status === 'revoked' && (
                    <button type="button" disabled={busy} onClick={() => void reviewDevice(device, 'approve')} className="flex min-h-10 items-center gap-1 rounded-lg border border-teal-200 px-3 text-xs font-black text-teal-700">
                      <LockKeyhole className="h-4 w-4" />再承認
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

const PolicyToggle: React.FC<{
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}> = ({ title, description, checked, onChange }) => (
  <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${checked ? 'border-teal-300 bg-teal-50' : 'border-slate-200 bg-slate-50'}`}>
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-1 h-5 w-5 rounded border-slate-300 text-teal-700" />
    <span>
      <strong className="block text-xs text-slate-900">{title}</strong>
      <span className="mt-1 block text-[10px] leading-relaxed text-slate-600">{description}</span>
    </span>
  </label>
);
