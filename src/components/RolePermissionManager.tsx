import React, { useMemo, useState } from 'react';
import { Save, ShieldCheck } from 'lucide-react';
import type { ConfigurableUserRole, OrganizationRolePermission, RolePermissionKey } from '../types';

const PERMISSIONS: Array<{ key: RolePermissionKey; label: string; description: string }> = [
  { key: 'review_records', label: '記録の確認・承認', description: '未確認記録の確認、要修正の登録を行えます。' },
  { key: 'manage_children', label: '児童情報の管理', description: '児童名簿、利用曜日、送迎先を編集できます。' },
  { key: 'manage_record_settings', label: '記録・AI設定', description: '質問テンプレートとAI文章設定を変更できます。' },
  { key: 'manage_shifts', label: '月間シフト・休日管理', description: '職員の勤務予定とパート職員の希望を確定できます。' },
  { key: 'manage_calendar', label: '業務カレンダー管理', description: '会議、外出、研修などの予定を登録できます。' },
  { key: 'manage_transport', label: '利用予定・送迎管理', description: '利用予定、送迎条件、配車内容を変更できます。' },
  { key: 'manage_communications', label: '共有・連絡の管理', description: 'お知らせ、朝礼テンプレートなどを管理できます。' },
];

const STAFF_BASELINE = [
  '担当児童の支援経過記録を作成・保存',
  '記録一覧と当日の記録状況を閲覧',
  '自分の出勤予定確認・打刻・修正申請',
  'パート職員はシフト希望を提出',
  '担当送迎の確認と運行状態の更新',
  'お知らせ・朝礼・申し送りの確認',
];

export function RolePermissionManager({ settings, onSave }: {
  settings: OrganizationRolePermission[];
  onSave: (setting: OrganizationRolePermission) => Promise<void> | void;
}) {
  const initial = useMemo(() => ({
    manager: settings.find((item) => item.role === 'manager')?.permissions || ['manage_shifts'],
    classroom_manager: settings.find((item) => item.role === 'classroom_manager')?.permissions || ['manage_shifts'],
  }), [settings]);
  const [draft, setDraft] = useState<Record<ConfigurableUserRole, RolePermissionKey[]>>(initial);
  const [busy, setBusy] = useState<ConfigurableUserRole | null>(null);
  const [message, setMessage] = useState('');

  const toggle = (role: ConfigurableUserRole, key: RolePermissionKey) => {
    if (key === 'manage_shifts') return;
    setDraft((current) => ({
      ...current,
      [role]: current[role].includes(key) ? current[role].filter((item) => item !== key) : [...current[role], key],
    }));
  };

  const save = async (role: ConfigurableUserRole) => {
    setBusy(role);
    setMessage('');
    try {
      await onSave({ role, permissions: Array.from(new Set([...draft[role], 'manage_shifts'])) });
      setMessage(`${role === 'manager' ? '児発管' : '教室長'}の権限を保存しました。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '権限を保存できませんでした。');
    } finally {
      setBusy(null);
    }
  };

  return <div className="space-y-4">
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="flex items-center gap-2 font-black text-slate-950"><ShieldCheck className="h-5 w-5 text-teal-700" />指導員の基本権限</h3>
      <p className="mt-1 text-xs text-slate-500">指導員に共通する権限は固定され、管理者設定で拡張されません。</p>
      <ul className="mt-3 grid gap-2 text-xs text-slate-700 sm:grid-cols-2">{STAFF_BASELINE.map((item) => <li key={item} className="rounded-xl bg-slate-50 px-3 py-2 font-bold">・{item}</li>)}</ul>
    </section>
    <div className="grid gap-4 lg:grid-cols-2">{(['manager', 'classroom_manager'] as const).map((role) => <section key={role} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3"><div><h3 className="font-black text-slate-950">{role === 'manager' ? '児発管' : '教室長'}</h3><p className="text-[11px] text-slate-500">月間シフト・休日管理は常に利用できます。</p></div><button type="button" disabled={busy !== null} onClick={() => void save(role)} className="flex min-h-10 items-center gap-1 rounded-xl bg-teal-700 px-3 text-xs font-black text-white disabled:opacity-50"><Save className="h-4 w-4" />保存</button></div>
      <div className="mt-3 space-y-2">{PERMISSIONS.map((permission) => {
        const fixed = permission.key === 'manage_shifts';
        const checked = fixed || draft[role].includes(permission.key);
        return <label key={permission.key} className={`flex items-start gap-3 rounded-xl border p-3 ${checked ? 'border-teal-300 bg-teal-50' : 'border-slate-200 bg-white'}`}><input type="checkbox" checked={checked} disabled={fixed} onChange={() => toggle(role, permission.key)} className="mt-0.5 h-4 w-4 accent-teal-700" /><span><strong className="block text-xs text-slate-900">{permission.label}{fixed ? '（必須）' : ''}</strong><span className="mt-0.5 block text-[10px] leading-relaxed text-slate-500">{permission.description}</span></span></label>;
      })}</div>
    </section>)}</div>
    {message && <p className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700">{message}</p>}
  </div>;
}
