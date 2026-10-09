import React, { useEffect, useId, useState } from 'react';
import { ArrowLeft, ClipboardCopy, Download, LoaderCircle, Plus, RefreshCw, Save } from 'lucide-react';
import type { CalendarEvent, ChildProfile, UserProfile } from '../types';
import { getLocalDateString } from '../utils/weekdays';
import { createMeetingCase, listMeetingCases, listMeetingEditors, logMeetingExport, updateMeetingCase } from './meetingService';
import { buildTiroContext, buildTiroSheet, downloadTiroSheet } from './tiroExport';
import { emptyMeetingContent, type MeetingAgenda, type MeetingCase, type MeetingParticipant, type MeetingTerm, type MeetingType } from './types';

type Step = '準備・Tiroへ渡す' | '会議中';
const steps: Step[] = ['準備・Tiroへ渡す', '会議中'];
const inputClass = 'mt-1 min-h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900';
const primaryButton = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButton = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50';
const panelClass = 'min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5';

function errorText(error: unknown) {
  const detail = error && typeof error === 'object' ? error as { code?: string; message?: string } : null;
  const message = detail?.message || (error instanceof Error ? error.message : String(error));
  if (message.includes('MEETING_CONFLICT')) return '別の変更が保存されています。再読み込みして内容を確認してください。';
  if (message.includes('MEETING_CHILDREN_LOCKED')) return 'この会議には以前の支援経過が保存されているため、対象児童は変更できません。';
  if (message.includes('MEETING_CHILDREN_INVALID')) return '対象児童を確認してください。同じ児童の重複や無効な児童は登録できません。';
  if (message.includes('row-level security policy') && message.includes('meeting_cases')) return '会議案件を作成できません。ログインアカウントと事業所・端末の登録状態を管理者に確認してください。（権限エラー 42501）';
  if (message.includes('PERSONAL_TRANSPORT_ONLY')) return '個人端末では会議内容を登録できません。事業所共有端末で操作してください。';
  if (message.includes('meeting_cases')) return '会議支援の保存先を確認できません。管理者にデータベース更新状況を確認してください。';
  return message;
}

function Field({ label, value, onChange, multiline = false, type = 'text' }: {
  label: string; value: string; onChange: (value: string) => void; multiline?: boolean; type?: string;
}) {
  const id = useId();
  return <div className="min-w-0"><label htmlFor={id} className="block text-sm font-bold text-slate-700">{label}</label>
    {multiline
      ? <textarea id={id} className={`${inputClass} min-h-24 leading-relaxed`} value={value} onChange={(event) => onChange(event.target.value)} />
      : <input id={id} className={inputClass} type={type} value={value} onChange={(event) => onChange(event.target.value)} />}
  </div>;
}

function sameCase(left: MeetingCase, right: MeetingCase) {
  return left.title === right.title && left.meetingDate === right.meetingDate
    && left.meetingType === right.meetingType && left.status === right.status
    && JSON.stringify(left.content) === JSON.stringify(right.content)
    && JSON.stringify(left.editorUserIds) === JSON.stringify(right.editorUserIds)
    && JSON.stringify(left.childIds) === JSON.stringify(right.childIds);
}

// Keep the existing stored status for compatibility; no transcript workflow remains in the UI.
function statusLabel(status: MeetingCase['status']) {
  return status === '文字起こし待ち' ? '会議終了' : status;
}

export function MeetingWorkspace({ organizationId, currentUser, childrenList, calendarEvents, canReview, onDirtyChange }: {
  organizationId?: string;
  currentUser?: UserProfile | null;
  childrenList: ChildProfile[];
  calendarEvents: CalendarEvent[];
  canReview: boolean;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [cases, setCases] = useState<MeetingCase[]>([]);
  const [selected, setSelected] = useState<MeetingCase | null>(null);
  const [saved, setSaved] = useState<MeetingCase | null>(null);
  const [step, setStep] = useState<Step>('準備・Tiroへ渡す');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [message, setMessage] = useState('');
  const [newChildIds, setNewChildIds] = useState<string[]>([]);
  const [newDate, setNewDate] = useState(getLocalDateString());
  const [newTitle, setNewTitle] = useState('担当者会議');
  const [newType, setNewType] = useState<MeetingType>('担当者会議');
  const [newCalendarId, setNewCalendarId] = useState('');
  const [showSheet, setShowSheet] = useState(false);
  const [search, setSearch] = useState('');
  const [staffUsers, setStaffUsers] = useState<Array<{ id: string; name: string }>>([]);
  const hasUnsavedChanges = Boolean(selected && saved && !sameCase(selected, saved));

  async function reloadList() {
    if (!organizationId) return;
    setLoading(true);
    try { setCases(await listMeetingCases(organizationId)); setSaveError(''); }
    catch (error) { setSaveError(errorText(error)); }
    finally { setLoading(false); }
  }
  useEffect(() => { void reloadList(); }, [organizationId]);
  useEffect(() => {
    if (!organizationId) return;
    void listMeetingEditors(organizationId).then(setStaffUsers).catch(() => setStaffUsers([]));
  }, [organizationId]);

  function openCase(meeting: MeetingCase) {
    if (saving || exporting || hasUnsavedChanges && !window.confirm('保存前の変更があります。会議を切り替えますか？')) return;
    setSelected(meeting); setSaved(meeting); setStep('準備・Tiroへ渡す');
    setSaveError(''); setMessage(''); setShowSheet(false);
  }

  async function persistCase(draft: MeetingCase, base: MeetingCase) {
    setSaving(true);
    try {
      const updated = await updateMeetingCase({ ...draft, revision: base.revision });
      setSaved(updated);
      setSelected((current) => current?.id === updated.id ? { ...current, revision: updated.revision } : current);
      setCases((current) => current.map((item) => item.id === updated.id ? updated : item));
      setSaveError('');
    } catch (error) { setSaveError(errorText(error)); }
    finally { setSaving(false); }
  }
  // Preserve edits made while an earlier optimistic save is in flight.
  useEffect(() => {
    if (!selected || !saved || sameCase(selected, saved) || saving || saveError) return;
    const timer = window.setTimeout(() => { void persistCase(selected, saved); }, 850);
    return () => window.clearTimeout(timer);
  }, [selected, saved, saving, saveError]);
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasUnsavedChanges]);
  useEffect(() => { onDirtyChange?.(hasUnsavedChanges); }, [hasUnsavedChanges, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  const meetingChildren = childrenList.filter((item) => selected?.childIds.includes(item.id));
  const contextText = selected ? buildTiroContext(selected, meetingChildren) : '';
  const sheetText = selected ? buildTiroSheet(selected, meetingChildren) : '';
  const visibleCases = cases.filter((item) => {
    const childNames = childrenList.filter((candidate) => item.childIds.includes(candidate.id)).map((item) => item.name).join(' ');
    return `${item.title} ${childNames} ${item.meetingDate}`.includes(search.trim());
  });
  const relatedEvents = calendarEvents.filter((item) => ['会議', '保護者面談'].includes(item.eventType));
  const isOwner = selected?.createdBy === currentUser?.id;
  const exportReady = Boolean(selected?.content.recordingExplainedAt && saved && !hasUnsavedChanges && !saving && !exporting && !saveError);

  function editCase(patch: Partial<MeetingCase>) { setSaveError(''); setSelected((current) => current ? { ...current, ...patch } : current); }
  function editContent(patch: Partial<MeetingCase['content']>) {
    setSaveError('');
    // Preserve historical outcome/childWishes and any other stored content, even though their screens are retired.
    setSelected((current) => current ? { ...current, content: { ...current.content, ...patch } } : current);
  }
  function editAgenda(id: string, patch: Partial<MeetingAgenda>) {
    if (!selected) return;
    editContent({ agenda: selected.content.agenda.map((item) => item.id === id ? { ...item, ...patch, updatedAt: new Date().toISOString(), updatedBy: currentUser?.displayName } : item) });
  }
  function editParticipant(id: string, patch: Partial<MeetingParticipant>) {
    if (!selected) return;
    editContent({ participants: selected.content.participants.map((item) => item.id === id ? { ...item, ...patch } : item) });
  }
  function editTerm(id: string, patch: Partial<MeetingTerm>) {
    if (!selected) return;
    editContent({ terms: selected.content.terms.map((item) => item.id === id ? { ...item, ...patch } : item) });
  }
  async function createCase() {
    if (!organizationId || !newChildIds.length || !newTitle.trim() || !newDate) { setSaveError('児童・会議名・日付を入力してください。'); return; }
    setLoading(true); setSaveError('');
    try {
      const created = await createMeetingCase({ organizationId, childIds: newChildIds, title: newTitle.trim(), meetingType: newType,
        meetingDate: newDate, calendarEventId: newCalendarId || undefined, content: emptyMeetingContent() });
      setCases((current) => [created, ...current]); openCase(created);
    } catch (error) { setSaveError(errorText(error)); }
    finally { setLoading(false); }
  }
  async function reloadCurrent() {
    if (!selected) { await reloadList(); return; }
    if (saving || exporting || hasUnsavedChanges && !window.confirm('保存前の変更を破棄して再読み込みしますか？')) return;
    setLoading(true);
    try {
      const updatedCases = await listMeetingCases(selected.organizationId);
      const current = updatedCases.find((item) => item.id === selected.id);
      setCases(updatedCases);
      if (!current) { setSaveError('この会議を表示できません。会議一覧へ戻って権限や登録状態を確認してください。'); return; }
      setSelected(current); setSaved(current); setSaveError('');
    } catch (error) { setSaveError(errorText(error)); }
    finally { setLoading(false); }
  }
  async function exportInfo(kind: 'copy' | 'download') {
    if (!selected || !exportReady) return;
    setExporting(true);
    try {
      await logMeetingExport(selected.organizationId, selected.id, kind === 'download' ? 'sheet_download' : showSheet ? 'sheet_copy' : 'context_copy');
      if (kind === 'copy') {
        await navigator.clipboard.writeText(showSheet ? sheetText : contextText);
        setMessage('コピーしました。Tiroの文脈入力または参照資料へ貼り付けてください。');
      } else {
        downloadTiroSheet(sheetText, selected.meetingDate);
        setMessage('事前情報シートを保存しました。Tiroへ登録する内容を確認してください。');
      }
    } catch (error) { setSaveError(errorText(error)); }
    finally { setExporting(false); }
  }

  if (!organizationId || !currentUser) return <section className={panelClass}>会議支援はログインした運用環境で利用できます。</section>;
  return <section className="mx-auto max-w-7xl space-y-4 pb-16">
    {organizationId === 'local' && <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-900">試用モード：会議内容はこの画面を再読み込みすると消えます。実際の児童情報は入力しないでください。</p>}
    <header className={panelClass}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs font-bold text-teal-700">会議の準備・進行</p><h1 className="text-xl font-black text-slate-900">会議支援</h1><p className="mt-1 text-sm text-slate-600">事前情報をまとめてTiroへ渡し、会議中の確認事項を記録します。</p></div>
        {selected && <button className={secondaryButton} disabled={saving || exporting || loading} onClick={() => { if (hasUnsavedChanges && !window.confirm('保存前の変更があります。戻りますか？')) return; setSelected(null); setSaved(null); setMessage(''); void reloadList(); }}><ArrowLeft className="h-4 w-4" />会議一覧へ</button>}
      </div>
    </header>
    {saveError && <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm font-bold text-red-900">{saveError}<button className="ml-2 underline disabled:opacity-50" disabled={saving || exporting || loading} onClick={() => void reloadCurrent()}>再読み込み</button></div>}
    {message && <div role="status" className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900">{message}</div>}
    {!selected ? <>
      <div className={panelClass}>
        <h2 className="text-lg font-black text-slate-900">新しい会議を準備</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <fieldset className="min-w-0 rounded-xl border border-slate-200 p-3"><legend className="text-sm font-bold text-slate-700">対象児童（複数選択可）</legend><div className="max-h-44 space-y-1 overflow-y-auto">{childrenList.map((item) => <label key={item.id} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm"><input type="checkbox" checked={newChildIds.includes(item.id)} onChange={(event) => setNewChildIds((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} />{item.name}</label>)}</div><p className="mt-2 text-xs text-slate-500">選択順の1人目が代表児童になります。{newChildIds.length}名選択中</p></fieldset>
          <label className="min-w-0 text-sm font-bold text-slate-700">関連するカレンダー予定（任意）<select className={inputClass} value={newCalendarId} onChange={(event) => { const id = event.target.value; setNewCalendarId(id); const found = relatedEvents.find((item) => item.id === id); if (found) { setNewDate(found.date); setNewTitle(found.title); setNewChildIds(found.childIds.filter((childId) => childrenList.some((child) => child.id === childId))); setNewType(found.eventType === '保護者面談' ? '保護者面談' : '担当者会議'); } }}><option value="">予定を選ばない</option>{relatedEvents.map((item) => <option key={item.id} value={item.id}>{item.date} {item.title}</option>)}</select></label>
          <Field label="会議名" value={newTitle} onChange={setNewTitle} /><Field label="日付" value={newDate} onChange={setNewDate} type="date" />
          <label className="text-sm font-bold text-slate-700">種類<select className={inputClass} value={newType} onChange={(event) => setNewType(event.target.value as MeetingType)}>{(['担当者会議', '保護者面談', 'ケース会議', 'その他'] as MeetingType[]).map((item) => <option key={item}>{item}</option>)}</select></label>
        </div>
        <button className={`${primaryButton} mt-4`} disabled={loading} onClick={() => void createCase()}><Plus className="h-4 w-4" />会議案件を作成</button>
      </div>
      <div className={panelClass}><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-black">会議一覧</h2><button className={secondaryButton} disabled={loading} onClick={() => void reloadList()}><RefreshCw className="h-4 w-4" />更新</button></div>
        <input className={`${inputClass} mt-4`} aria-label="会議を検索" placeholder="児童名・会議名・日付で検索" value={search} onChange={(event) => setSearch(event.target.value)} />
        <div className="mt-3 space-y-2">{loading && <p className="text-sm text-slate-500">読み込み中…</p>}{!loading && visibleCases.length === 0 && <p className="text-sm text-slate-500">表示できる会議はありません。</p>}{visibleCases.map((item) => <button key={item.id} disabled={loading} className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 p-4 text-left hover:border-teal-400" onClick={() => openCase(item)}><span className="min-w-0 break-words"><span className="font-bold text-slate-900">{item.title}</span><span className="mt-1 block text-xs text-slate-600">{item.meetingDate}／{childrenList.filter((child) => item.childIds.includes(child.id)).map((child) => child.name).join('・') || '児童'}／{item.meetingType}</span></span><span className="shrink-0 rounded-full bg-teal-50 px-3 py-1 text-xs font-bold text-teal-800">{statusLabel(item.status)}</span></button>)}</div>
      </div>
    </> : <>
      <div className={panelClass}><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><h2 className="break-words font-black text-slate-900">{selected.title}</h2><p className="mt-1 break-words text-sm text-slate-600">{meetingChildren.map((item) => item.name).join('・') || '児童'}／{selected.meetingDate}／{statusLabel(selected.status)}</p></div><div className="flex shrink-0 flex-wrap items-center gap-3 text-xs font-bold text-slate-600"><span role="status">{saving ? <span className="inline-flex items-center gap-1"><LoaderCircle className="h-4 w-4 animate-spin" />保存中</span> : hasUnsavedChanges ? '未保存' : '保存済み'}</span><button className="underline disabled:opacity-50" disabled={saving || exporting || loading} onClick={() => void reloadCurrent()}>再読み込み</button>{hasUnsavedChanges && saved && <button className={secondaryButton} disabled={saving} onClick={() => void persistCase(selected, saved)}><Save className="h-4 w-4" />今すぐ保存</button>}</div></div>
        <nav className="mt-4 grid grid-cols-2 gap-2" aria-label="会議の手順">{steps.map((item) => <button key={item} aria-pressed={step === item} className={`min-h-11 rounded-xl px-3 py-2 text-sm font-bold ${step === item ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-700'}`} onClick={() => { setStep(item); setMessage(''); }}>{item}</button>)}</nav>
      </div>
      {step === '準備・Tiroへ渡す' && <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4 xl:col-start-1 xl:row-start-1">
          <section className={panelClass}><h3 className="text-lg font-black">会議の基本情報</h3><div className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="会議名" value={selected.title} onChange={(value) => editCase({ title: value })} /><Field label="日付" value={selected.meetingDate} onChange={(value) => editCase({ meetingDate: value })} type="date" /><Field label="目的" value={selected.content.purpose} onChange={(value) => editContent({ purpose: value })} multiline /><Field label="場所" value={selected.content.location} onChange={(value) => editContent({ location: value })} /></div>
            <details className="mt-4 rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer text-sm font-bold">対象児童・{meetingChildren.length}名</summary><p className="mt-2 text-xs text-slate-600">代表児童は変更できません。以前の支援経過がある会議では、保存時に対象児童の変更が制限されます。</p><div className="mt-2 grid max-h-44 gap-2 overflow-y-auto sm:grid-cols-2">{childrenList.map((item) => <label key={item.id} className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={item.id === selected.childId} checked={selected.childIds.includes(item.id)} onChange={(event) => editCase({ childIds: event.target.checked ? [...selected.childIds, item.id] : selected.childIds.filter((id) => id !== item.id) })} />{item.name}</label>)}</div></details>
          </section>
          <section className={panelClass}><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-lg font-black">議題と確認事項</h3><button className={secondaryButton} onClick={() => editContent({ agenda: [...selected.content.agenda, { id: crypto.randomUUID(), title: '', question: '', status: '未確認', memo: '', decision: '', owner: '', dueDate: '' }] })}><Plus className="h-4 w-4" />議題を追加</button></div><p className="mt-2 text-xs text-slate-600">会議で確認したい内容を先にまとめます。</p><div className="mt-3 space-y-3">{selected.content.agenda.length === 0 && <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">議題はまだありません。</p>}{selected.content.agenda.map((agenda, index) => <div key={agenda.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-bold text-teal-700">議題 {index + 1}</p><div className="mt-2 grid gap-2 sm:grid-cols-2"><Field label="議題" value={agenda.title} onChange={(value) => editAgenda(agenda.id, { title: value })} /><Field label="確認したいこと" value={agenda.question} onChange={(value) => editAgenda(agenda.id, { question: value })} /></div><button className="mt-2 text-xs font-bold text-red-700 underline" onClick={() => editContent({ agenda: selected.content.agenda.filter((item) => item.id !== agenda.id) })}>議題を削除</button></div>)}</div></section>
          <details className={panelClass}><summary className="cursor-pointer font-bold">出席予定者・{selected.content.participants.length}名</summary><button className={`${secondaryButton} mt-3`} onClick={() => editContent({ participants: [...selected.content.participants, { id: crypto.randomUUID(), name: '', reading: '', organization: '', role: '', calledAs: '', attended: false }] })}><Plus className="h-4 w-4" />出席予定者を追加</button><div className="mt-3 space-y-3">{selected.content.participants.map((person) => <div key={person.id} className="rounded-xl border border-slate-200 p-3"><div className="grid gap-2 sm:grid-cols-2"><Field label="氏名" value={person.name} onChange={(value) => editParticipant(person.id, { name: value })} /><Field label="読み" value={person.reading} onChange={(value) => editParticipant(person.id, { reading: value })} /><Field label="所属" value={person.organization} onChange={(value) => editParticipant(person.id, { organization: value })} /><Field label="役割・関係" value={person.role} onChange={(value) => editParticipant(person.id, { role: value })} /><Field label="呼ばれ方" value={person.calledAs} onChange={(value) => editParticipant(person.id, { calledAs: value })} /></div><button className="mt-2 text-xs font-bold text-red-700 underline" onClick={() => editContent({ participants: selected.content.participants.filter((item) => item.id !== person.id) })}>出席予定者を削除</button></div>)}</div></details>
          <details className={panelClass}><summary className="cursor-pointer font-bold">固有名詞・専門用語・{selected.content.terms.length}件</summary><button className={`${secondaryButton} mt-3`} onClick={() => editContent({ terms: [...selected.content.terms, { id: crypto.randomUUID(), spelling: '', reading: '', hint: '', includeInTiro: true }] })}><Plus className="h-4 w-4" />用語を追加</button><div className="mt-3 space-y-3">{selected.content.terms.map((term) => <div key={term.id} className="rounded-xl border border-slate-200 p-3"><div className="grid gap-2 sm:grid-cols-2"><Field label="正しい表記" value={term.spelling} onChange={(value) => editTerm(term.id, { spelling: value })} /><Field label="読み" value={term.reading} onChange={(value) => editTerm(term.id, { reading: value })} /><Field label="誤変換・補足" value={term.hint} onChange={(value) => editTerm(term.id, { hint: value })} /></div><label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={term.includeInTiro} onChange={(event) => editTerm(term.id, { includeInTiro: event.target.checked })} />Tiro向け資料に含める</label><button className="mt-2 text-xs font-bold text-red-700 underline" onClick={() => editContent({ terms: selected.content.terms.filter((item) => item.id !== term.id) })}>用語を削除</button></div>)}</div></details>
          {(isOwner || canReview) && staffUsers.length > 0 && <details className={panelClass}><summary className="cursor-pointer font-bold">閲覧・編集する職員の設定</summary><p className="mt-2 text-xs text-slate-600">指定した職員は会議内容を閲覧・編集できます。作成者は引き続き利用できます。</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{staffUsers.filter((staff) => staff.id !== selected.createdBy).map((staff) => <label key={staff.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selected.editorUserIds.includes(staff.id)} onChange={(event) => editCase({ editorUserIds: event.target.checked ? [...selected.editorUserIds, staff.id] : selected.editorUserIds.filter((id) => id !== staff.id) })} />{staff.name}</label>)}</div></details>}
        </div>
        <aside aria-label="Tiroへ渡す情報" className={`${panelClass} xl:sticky xl:top-24 xl:col-start-2 xl:row-start-1`}><p className="text-xs font-bold text-teal-700">準備した内容をそのまま利用</p><h3 className="mt-1 text-lg font-black">Tiroへ渡す</h3><p className="mt-2 text-sm text-slate-600">必要な情報だけを確認してコピーします。自動送信は行いません。</p>
          <label className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900"><input type="checkbox" className="mt-1" checked={Boolean(selected.content.recordingExplainedAt)} onChange={(event) => editContent({ recordingExplainedAt: event.target.checked ? new Date().toISOString() : undefined, recordingExplainedBy: event.target.checked ? currentUser.displayName : undefined })} />録音とTiroへの情報提供について、出席者への説明・同意を確認した</label><p className="mt-2 text-xs text-slate-500">確認者：{selected.content.recordingExplainedBy || '未確認'}</p>
          <fieldset className="mt-4"><legend className="text-sm font-bold text-slate-700">コピーする内容</legend><div className="mt-2 grid grid-cols-2 gap-2">{[[false, '短い文脈'], [true, '事前情報シート']].map(([sheet, label]) => <label key={String(label)} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border p-2 text-xs font-bold ${showSheet === sheet ? 'border-teal-600 bg-teal-50 text-teal-900' : 'border-slate-200 text-slate-600'}`}><input type="radio" name="tiro-output" checked={showSheet === sheet} onChange={() => setShowSheet(Boolean(sheet))} />{label}</label>)}</div></fieldset>
          <details className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3" open><summary className="cursor-pointer text-sm font-bold">渡す文章を確認</summary><pre aria-label="Tiro向け文章プレビュー" className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap break-words font-sans text-xs leading-6 xl:max-h-32">{showSheet ? sheetText : contextText}</pre></details>
          <div className="mt-4 grid gap-2"><button className={primaryButton} disabled={!exportReady} onClick={() => void exportInfo('copy')}><ClipboardCopy className="h-4 w-4" />{exporting ? '処理中…' : '文章をコピー'}</button><button className={secondaryButton} disabled={!exportReady} onClick={() => void exportInfo('download')}><Download className="h-4 w-4" />事前シートを保存</button></div>
          <p className="mt-2 text-xs text-slate-600">{!selected.content.recordingExplainedAt ? '説明・同意を確認するとコピーできます。' : saving || hasUnsavedChanges ? '変更の保存が完了するとコピーできます。' : saveError ? '保存・出力エラーを確認してください。' : '録音・文字起こしはTiroで行います。'}</p>
        </aside>
      </div>}
      {step === '会議中' && <div className="space-y-4">
        <section className={panelClass}><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-black">会議の進行</h3><div className="flex flex-wrap gap-2"><button className={secondaryButton} onClick={() => editCase({ status: '開催中' })}>会議中にする</button><button className={secondaryButton} onClick={() => editCase({ status: '文字起こし待ち' })}>会議終了にする</button></div></div><label className="mt-3 flex items-center gap-3 rounded-xl bg-slate-50 p-3 text-sm font-bold"><input type="checkbox" checked={selected.content.recordingChecked} onChange={(event) => editContent({ recordingChecked: event.target.checked })} />Tiroの録音状態を実際に確認した</label>
          {selected.content.participants.length > 0 && <fieldset className="mt-4"><legend className="font-bold">実際の出席者</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{selected.content.participants.map((person) => <label key={person.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={person.attended} onChange={(event) => editParticipant(person.id, { attended: event.target.checked })} />{person.name || '氏名未入力'}{person.role ? `（${person.role}）` : ''}</label>)}</div></fieldset>}
        </section>
        {selected.content.agenda.length === 0 && <p className={panelClass}>「準備・Tiroへ渡す」で議題を追加してください。</p>}
        {selected.content.agenda.map((agenda, index) => <section key={agenda.id} className={panelClass}><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-bold text-teal-700">議題 {index + 1}</p><h4 className="break-words font-black">{agenda.title || '名称未入力'}</h4><p className="text-sm text-slate-600">確認：{agenda.question || '未入力'}</p></div><label className="text-xs font-bold text-slate-600">確認状況<select className={inputClass} value={agenda.status} onChange={(event) => editAgenda(agenda.id, { status: event.target.value as MeetingAgenda['status'] })}><option>未確認</option><option>確認済み</option><option>保留</option></select></label></div><div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="発言の要点・メモ" value={agenda.memo} onChange={(value) => editAgenda(agenda.id, { memo: value })} multiline /><Field label="決定事項／未決事項" value={agenda.decision} onChange={(value) => editAgenda(agenda.id, { decision: value })} multiline /><Field label="担当者" value={agenda.owner} onChange={(value) => editAgenda(agenda.id, { owner: value })} /><Field label="期限" value={agenda.dueDate} onChange={(value) => editAgenda(agenda.id, { dueDate: value })} type="date" /></div><p className="mt-2 text-xs text-slate-500">最終入力：{agenda.updatedAt ? new Date(agenda.updatedAt).toLocaleString('ja-JP') : '未入力'}</p></section>)}
      </div>}
    </>}
  </section>;
}
