import React, { useState } from 'react';
import { PencilLine, Plus, Save, Trash2, X } from 'lucide-react';
import type { StaffShiftTemplate, StaffShiftTemplateTarget } from '../types';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

interface FormState {
  id?: string;
  name: string;
  targetEmploymentType: StaffShiftTemplateTarget;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  weekdays: number[];
  note: string;
}

export function StaffShiftTemplateSettings({ templates, onSave, onDelete }: {
  templates: StaffShiftTemplate[];
  onSave: (template: StaffShiftTemplate) => Promise<void> | void;
  onDelete: (templateId: string) => Promise<void> | void;
}) {
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const save = async () => {
    if (!form?.name.trim()) return setMessage('テンプレート名を入力してください。');
    if (form.startTime >= form.endTime) return setMessage('終了時刻は開始時刻より後にしてください。');
    if (form.weekdays.length === 0) return setMessage('勤務曜日を選択してください。');
    const now = new Date().toISOString();
    setBusy(true);
    try {
      await onSave({ ...form, id: form.id || crypto.randomUUID(), name: form.name.trim(), note: form.note.trim() || undefined, weekdays: [...form.weekdays].sort(), active: true, createdAt: now, updatedAt: now });
      setForm(null);
      setMessage('勤務テンプレートを保存しました。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存できませんでした。');
    } finally { setBusy(false); }
  };
  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex items-start justify-between gap-3"><div><h3 className="font-black text-slate-950">勤務テンプレート</h3><p className="mt-1 text-xs text-slate-500">管理者が共通勤務パターンを作成し、月間シフト管理で日・月単位に反映します。</p></div><button type="button" onClick={() => setForm(emptyForm())} className="flex min-h-10 items-center gap-1 rounded-xl bg-indigo-600 px-3 text-xs font-black text-white"><Plus className="h-4 w-4" />追加</button></div>
    <div className="mt-4 space-y-2">{templates.map((template) => <div key={template.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 px-3 py-2"><span className="min-w-0 flex-1"><strong className="block text-sm text-slate-900">{template.name}</strong><span className="text-[10px] text-slate-500">{template.startTime}〜{template.endTime}／休憩{template.breakMinutes}分／{template.weekdays.map((day) => WEEKDAYS[day]).join('')}</span></span><button type="button" aria-label={`${template.name}を編集`} onClick={() => setForm({ ...template, note: template.note || '' })} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-300 text-indigo-700"><PencilLine className="h-4 w-4" /></button><button type="button" aria-label={`${template.name}を削除`} onClick={() => window.confirm(`${template.name}を削除しますか？`) && void onDelete(template.id)} className="grid h-9 w-9 place-items-center rounded-lg border border-rose-200 text-rose-700"><Trash2 className="h-4 w-4" /></button></div>)}{templates.length === 0 && <p className="rounded-xl bg-slate-50 p-4 text-center text-xs text-slate-500">勤務テンプレートは未登録です。</p>}</div>
    {message && <p className="mt-3 rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700">{message}</p>}
    {form && <div className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-950/60 p-3"><div className="w-full max-w-lg rounded-2xl bg-white p-4 shadow-2xl"><div className="flex items-center justify-between"><h3 className="font-black">勤務テンプレート</h3><button type="button" onClick={() => setForm(null)} className="grid h-9 w-9 place-items-center rounded-full bg-slate-100"><X className="h-4 w-4" /></button></div><div className="mt-4 space-y-3"><label className="block text-xs font-bold">名称<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3" /></label><label className="block text-xs font-bold">対象<select value={form.targetEmploymentType} onChange={(event) => setForm({ ...form, targetEmploymentType: event.target.value as StaffShiftTemplateTarget })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3"><option value="all">全職員</option><option value="full_time">正職</option><option value="part_time">パート</option></select></label><div className="grid grid-cols-3 gap-2"><label className="text-xs font-bold">開始<input type="time" value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border px-2" /></label><label className="text-xs font-bold">終了<input type="time" value={form.endTime} onChange={(event) => setForm({ ...form, endTime: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border px-2" /></label><label className="text-xs font-bold">休憩<input type="number" min="0" max="600" value={form.breakMinutes} onChange={(event) => setForm({ ...form, breakMinutes: Number(event.target.value) })} className="mt-1 min-h-11 w-full rounded-xl border px-2" /></label></div><div><p className="text-xs font-bold">勤務曜日</p><div className="mt-1 flex gap-1">{WEEKDAYS.map((day, index) => <button key={day} type="button" onClick={() => setForm({ ...form, weekdays: form.weekdays.includes(index) ? form.weekdays.filter((value) => value !== index) : [...form.weekdays, index] })} className={`h-10 flex-1 rounded-lg border text-xs font-black ${form.weekdays.includes(index) ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300'}`}>{day}</button>)}</div></div><label className="block text-xs font-bold">備考<textarea value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} className="mt-1 min-h-20 w-full rounded-xl border p-3" /></label><button type="button" disabled={busy} onClick={() => void save()} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 font-black text-white disabled:opacity-50"><Save className="h-4 w-4" />保存</button></div></div></div>}
  </section>;
}

function emptyForm(): FormState { return { name: '', targetEmploymentType: 'all', startTime: '09:00', endTime: '18:00', breakMinutes: 60, weekdays: [1, 2, 3, 4, 5], note: '' }; }
