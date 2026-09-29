import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ClipboardCopy, Download, LoaderCircle, Plus, RefreshCw, Save } from 'lucide-react';
import type { CalendarEvent, ChildProfile, UserProfile } from '../types';
import { getLocalDateString } from '../utils/weekdays';
import { generatePDFFromElement } from '../utils/pdfGenerator';
import { addMeetingTranscript, createMeetingCase, getMeetingProgress, listMeetingCases, listMeetingEditors, listMeetingTranscripts, logMeetingExport, saveMeetingProgress, updateMeetingCase } from './meetingService';
import { buildTiroContext, buildTiroSheet, composeMeetingProgress, downloadTiroSheet } from './tiroExport';
import { emptyMeetingContent, type MeetingAgenda, type MeetingCase, type MeetingParticipant, type MeetingProgressRecord, type MeetingTerm, type MeetingTranscript, type MeetingType } from './types';

type Step = '準備' | 'Tiroへ渡す' | '会議中' | '文字起こし' | '結果確認' | '支援経過';
const steps: Step[] = ['準備', 'Tiroへ渡す', '会議中', '文字起こし', '結果確認', '支援経過'];
const inputClass = 'mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900';
const areaClass = `${inputClass} min-h-24 leading-relaxed`;
const primaryButton = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButton = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-50';

function errorText(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('MEETING_CONFLICT') || message.includes('TRANSCRIPT_CONFLICT')) return '別の変更が保存されています。再読み込みして内容を確認してください。';
  if (message.includes('meeting_cases') || message.includes('meeting_transcripts') || message.includes('meeting_progress_records')) return '会議支援の保存先を確認できません。管理者にデータベース更新状況を確認してください。';
  return message;
}

function Field({ label, value, onChange, multiline = false, type = 'text', placeholder }: {
  label: string; value: string; onChange: (value: string) => void; multiline?: boolean; type?: string; placeholder?: string;
}) {
  return <label className="block text-sm font-bold text-slate-700">{label}
    {multiline
      ? <textarea className={areaClass} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
      : <input className={inputClass} type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />}
  </label>;
}

function sameCase(left: MeetingCase, right: MeetingCase) {
  return left.title === right.title && left.meetingDate === right.meetingDate
    && left.meetingType === right.meetingType && left.status === right.status
    && JSON.stringify(left.content) === JSON.stringify(right.content)
    && JSON.stringify(left.editorUserIds) === JSON.stringify(right.editorUserIds);
}

export function MeetingWorkspace({ organizationId, currentUser, childrenList, calendarEvents, canReview, initialMeetingId, onDirtyChange }: {
  organizationId?: string;
  currentUser?: UserProfile | null;
  childrenList: ChildProfile[];
  calendarEvents: CalendarEvent[];
  canReview: boolean;
  initialMeetingId?: string;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const focusedMeetingId = useRef<string | null>(null);
  const [cases, setCases] = useState<MeetingCase[]>([]);
  const [selected, setSelected] = useState<MeetingCase | null>(null);
  const [saved, setSaved] = useState<MeetingCase | null>(null);
  const [step, setStep] = useState<Step>('準備');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [message, setMessage] = useState('');
  const [newChildId, setNewChildId] = useState('');
  const [newDate, setNewDate] = useState(getLocalDateString());
  const [newTitle, setNewTitle] = useState('担当者会議');
  const [newType, setNewType] = useState<MeetingType>('担当者会議');
  const [newCalendarId, setNewCalendarId] = useState('');
  const [transcripts, setTranscripts] = useState<MeetingTranscript[]>([]);
  const [importText, setImportText] = useState('');
  const [importName, setImportName] = useState('');
  const [importKind, setImportKind] = useState<MeetingTranscript['sourceKind']>('スクリプト');
  const [correctedText, setCorrectedText] = useState('');
  const [progress, setProgress] = useState<MeetingProgressRecord | null>(null);
  const [progressDraft, setProgressDraft] = useState('');
  const [reviewComment, setReviewComment] = useState('');
  const [showSheet, setShowSheet] = useState(false);
  const [search, setSearch] = useState('');
  const [staffUsers, setStaffUsers] = useState<Array<{ id: string; name: string }>>([]);
  const hasUnsavedChanges = Boolean(selected && (
    (saved && !sameCase(selected, saved))
    || progressDraft !== (progress?.body || '')
    || importText.trim()
    || (transcripts[0] && correctedText.trim() !== (transcripts[0].correctedText || transcripts[0].rawText).trim())
    || (progress?.approvalStatus === '未確認' && reviewComment !== (progress.reviewComment || ''))
  ));

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

  async function openCase(meeting: MeetingCase) {
    if (!organizationId) return;
    if (hasUnsavedChanges && !window.confirm('保存前の変更があります。会議を切り替えますか？')) return;
    setLoading(true);
    setSaveError('');
    setMessage('');
    try {
      const [loadedTranscripts, loadedProgress] = await Promise.all([
        listMeetingTranscripts(organizationId, meeting.id), getMeetingProgress(organizationId, meeting.id),
      ]);
      setSelected(meeting); setSaved(meeting); setStep('準備');
      setTranscripts(loadedTranscripts); setProgress(loadedProgress);
      setProgressDraft(loadedProgress?.body || ''); setReviewComment(loadedProgress?.reviewComment || '');
      setImportText(''); setCorrectedText(loadedTranscripts[0]?.correctedText || loadedTranscripts[0]?.rawText || '');
    } catch (error) { setSaveError(errorText(error)); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (!initialMeetingId || focusedMeetingId.current === initialMeetingId) return;
    const target = cases.find((item) => item.id === initialMeetingId);
    if (!target) return;
    focusedMeetingId.current = initialMeetingId;
    void openCase(target).then(() => setStep('支援経過'));
  }, [cases, initialMeetingId]);

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

  // Debounced optimistic save. A newer edit remains in selected and is saved in the next pass.
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

  const child = childrenList.find((item) => item.id === selected?.childId);
  const contextText = selected && child ? buildTiroContext(selected, child) : '';
  const sheetText = selected && child ? buildTiroSheet(selected, child) : '';
  const visibleCases = cases.filter((item) => {
    const childName = childrenList.find((candidate) => candidate.id === item.childId)?.name || '';
    return `${item.title} ${childName} ${item.meetingDate}`.includes(search.trim());
  });
  const relatedEvents = calendarEvents.filter((item) => ['会議', '保護者面談'].includes(item.eventType));
  const latestTranscript = transcripts[0];
  const isOwner = selected?.createdBy === currentUser?.id;
  const canEditProgress = !progress || progress.createdBy === currentUser?.id;

  function editCase(patch: Partial<MeetingCase>) { setSaveError(''); setSelected((current) => current ? { ...current, ...patch } : current); }
  function editContent(patch: Partial<MeetingCase['content']>) {
    setSaveError('');
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
    if (!organizationId || !newChildId || !newTitle.trim() || !newDate) { setSaveError('児童・会議名・日付を入力してください。'); return; }
    setLoading(true); setSaveError('');
    try {
      const created = await createMeetingCase({
        organizationId, childId: newChildId, title: newTitle.trim(), meetingType: newType,
        meetingDate: newDate, calendarEventId: newCalendarId || undefined, content: emptyMeetingContent(),
      });
      setCases((current) => [created, ...current]);
      await openCase(created);
    } catch (error) { setSaveError(errorText(error)); }
    finally { setLoading(false); }
  }

  async function reloadCurrent() {
    if (!selected) return;
    if (hasUnsavedChanges && !window.confirm('保存前の変更を破棄して再読み込みしますか？')) return;
    setSaveError('');
    try {
      const updatedCases = await listMeetingCases(selected.organizationId);
      setCases(updatedCases);
      const current = updatedCases.find((item) => item.id === selected.id);
      if (current) { setSelected(current); setSaved(current); }
      const [updatedTranscripts, updatedProgress] = await Promise.all([
        listMeetingTranscripts(selected.organizationId, selected.id), getMeetingProgress(selected.organizationId, selected.id),
      ]);
      setTranscripts(updatedTranscripts); setProgress(updatedProgress);
      setProgressDraft(updatedProgress?.body || '');
      setReviewComment(updatedProgress?.reviewComment || '');
      setCorrectedText(updatedTranscripts[0]?.correctedText || updatedTranscripts[0]?.rawText || '');
      setImportText('');
    } catch (error) { setSaveError(errorText(error)); }
  }

  async function copyContext() {
    if (!selected) return;
    try {
      await logMeetingExport(selected.organizationId, selected.id, showSheet ? 'sheet_copy' : 'context_copy');
      await navigator.clipboard.writeText(showSheet ? sheetText : contextText);
      setMessage('コピーしました。Tiroの文脈入力または参照資料へ貼り付けてください。');
    } catch (error) { setSaveError(errorText(error)); }
  }

  async function downloadSheet() {
    if (!selected) return;
    try {
      await logMeetingExport(selected.organizationId, selected.id, 'sheet_download');
      downloadTiroSheet(sheetText, selected.meetingDate);
      setMessage('事前情報シートを保存しました。Tiroへ登録する内容を確認してください。');
    } catch (error) { setSaveError(errorText(error)); }
  }

  async function importTranscript() {
    if (!selected || !importText.trim()) { setSaveError('文字起こしを貼り付けてください。'); return; }
    if (importText.length > 200000) { setSaveError('文字起こしが長すぎます。20万字以内に分けてください。'); return; }
    if (transcripts.some((item) => item.rawText === importText.trim())) { setSaveError('同じ原文はすでに取り込まれています。'); return; }
    setLoading(true); setSaveError('');
    try {
      const imported = await addMeetingTranscript({ organizationId: selected.organizationId, meetingId: selected.id,
        version: (transcripts[0]?.version || 0) + 1, sourceKind: importKind,
        sourceName: importName, rawText: importText.trim() });
      setTranscripts((current) => [imported, ...current]);
      setCorrectedText(imported.rawText); setImportText(''); setImportName('');
      editCase({ status: '照合中' }); setMessage('原文を保存しました。誤変換を確認してください。');
    } catch (error) { setSaveError(errorText(error)); }
    finally { setLoading(false); }
  }

  async function saveCorrection() {
    if (!selected || !latestTranscript || !correctedText.trim()) return;
    setLoading(true); setSaveError('');
    try {
      const corrected = await addMeetingTranscript({ organizationId: selected.organizationId, meetingId: selected.id,
        version: latestTranscript.version + 1, sourceKind: latestTranscript.sourceKind,
        sourceName: latestTranscript.sourceName, rawText: latestTranscript.rawText,
        correctedText: correctedText.trim() });
      setTranscripts((current) => [corrected, ...current]);
      setMessage('修正版を新しい版として保存しました。原文は保持されています。');
    } catch (error) { setSaveError(errorText(error)); }
    finally { setLoading(false); }
  }

  async function saveProgress(status: MeetingProgressRecord['approvalStatus'], comment = reviewComment) {
    if (!selected || !currentUser) return;
    if (!progressDraft.trim()) { setSaveError('支援経過の本文を入力してください。'); return; }
    setLoading(true); setSaveError('');
    try {
      const savedProgress = await saveMeetingProgress(selected.organizationId, {
        id: progress?.id || '', meetingId: selected.id, childId: selected.childId,
        recordDate: selected.meetingDate, body: progressDraft.trim(), approvalStatus: status,
        reviewComment: comment, createdBy: progress?.createdBy || currentUser.id,
        revision: progress?.revision || 0, updatedAt: progress?.updatedAt || '',
      });
      setProgress(savedProgress); setProgressDraft(savedProgress.body); setReviewComment(savedProgress.reviewComment || '');
      setMessage(status === '確認済み' ? '支援経過記録を確認済みにしました。' : '支援経過記録を保存しました。');
    } catch (error) { setSaveError(errorText(error)); }
    finally { setLoading(false); }
  }

  if (!organizationId || !currentUser) return <section className="rounded-2xl bg-white p-6 text-slate-700">会議支援はログインした運用環境で利用できます。</section>;

  return <section className="mx-auto max-w-5xl space-y-5 pb-24">
    {organizationId === 'local' && <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-900">試用モード：会議内容はこの画面を再読み込みすると消えます。実際の児童情報は入力しないでください。</p>}
    <header className="rounded-2xl bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs font-bold text-teal-700">Tiro文字起こし支援</p><h1 className="text-xl font-black text-slate-900">会議支援</h1>
          <p className="mt-1 text-sm text-slate-600">準備から会議後の支援経過まで、児童ごとに管理します。</p></div>
        {selected && <button className={secondaryButton} onClick={() => { if (hasUnsavedChanges && !window.confirm('保存前の変更があります。戻りますか？')) return; setSelected(null); setSaved(null); void reloadList(); }}><ArrowLeft className="h-4 w-4" />会議一覧へ</button>}
      </div>
    </header>
    {saveError && <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm font-bold text-red-900">{saveError} <button className="ml-2 underline" onClick={() => void reloadCurrent()}>再読み込み</button></div>}
    {message && <div role="status" className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900">{message}</div>}
    {!selected ? <>
      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-lg font-black text-slate-900">新しい会議を準備</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="text-sm font-bold text-slate-700">対象児童<select className={inputClass} value={newChildId} onChange={(event) => setNewChildId(event.target.value)}><option value="">選択してください</option>{childrenList.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="text-sm font-bold text-slate-700">関連するカレンダー予定（任意）<select className={inputClass} value={newCalendarId} onChange={(event) => { const id = event.target.value; setNewCalendarId(id); const found = relatedEvents.find((item) => item.id === id); if (found) { setNewDate(found.date); setNewTitle(found.title); if (found.childIds.length === 1) setNewChildId(found.childIds[0]); setNewType(found.eventType === '保護者面談' ? '保護者面談' : '担当者会議'); } }}><option value="">予定を選ばない</option>{relatedEvents.map((item) => <option key={item.id} value={item.id}>{item.date} {item.title}</option>)}</select></label>
          <Field label="会議名" value={newTitle} onChange={setNewTitle} />
          <Field label="日付" value={newDate} onChange={setNewDate} type="date" />
          <label className="text-sm font-bold text-slate-700">種類<select className={inputClass} value={newType} onChange={(event) => setNewType(event.target.value as MeetingType)}>{(['担当者会議', '保護者面談', 'ケース会議', 'その他'] as MeetingType[]).map((item) => <option key={item}>{item}</option>)}</select></label>
        </div>
        <button className={`${primaryButton} mt-4`} disabled={loading} onClick={() => void createCase()}><Plus className="h-4 w-4" />会議案件を作成</button>
      </div>
      <div className="rounded-2xl bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-black">会議一覧</h2><button className={secondaryButton} onClick={() => void reloadList()}><RefreshCw className="h-4 w-4" />更新</button></div>
        <input className={`${inputClass} mt-4`} aria-label="会議を検索" placeholder="児童名・会議名・日付で検索" value={search} onChange={(event) => setSearch(event.target.value)} />
        <div className="mt-3 space-y-2">{loading && <p className="text-sm text-slate-500">読み込み中…</p>}{!loading && visibleCases.length === 0 && <p className="text-sm text-slate-500">表示できる会議はありません。</p>}{visibleCases.map((item) => <button key={item.id} className="flex w-full items-center justify-between rounded-xl border border-slate-200 p-4 text-left hover:border-teal-400" onClick={() => void openCase(item)}><span><span className="font-bold text-slate-900">{item.title}</span><span className="mt-1 block text-xs text-slate-600">{item.meetingDate}／{childrenList.find((childItem) => childItem.id === item.childId)?.name || '児童'}／{item.meetingType}</span></span><span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-bold text-teal-800">{item.status}</span></button>)}</div>
      </div>
    </> : <>
      <div className="rounded-2xl bg-white p-4 shadow-sm"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-black text-slate-900">{child?.name || '児童'}／{selected.title}</h2><p className="text-xs text-slate-600">{selected.meetingDate}・{selected.status}</p></div><div className="flex flex-wrap items-center gap-3 text-xs font-bold text-slate-600">{saving ? <><LoaderCircle className="h-4 w-4 animate-spin" />保存中</> : saved && sameCase(selected, saved) ? '保存済み' : '未保存'}<button className="underline" onClick={() => void reloadCurrent()}>再読み込み</button>{saved && !sameCase(selected, saved) && <button className={secondaryButton} disabled={saving} onClick={() => void persistCase(selected, saved)}><Save className="h-4 w-4" />今すぐ保存</button>}</div></div>
        <nav className="mt-4 flex gap-2 overflow-x-auto pb-1" aria-label="会議の手順">{steps.map((item) => <button key={item} className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${step === item ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-700'}`} onClick={() => { setStep(item); setMessage(''); }}>{item}</button>)}</nav>
      </div>

      {step === '準備' && <div className="space-y-4 rounded-2xl bg-white p-5 shadow-sm"><h3 className="text-lg font-black">事前情報と議題</h3><div className="grid gap-3 md:grid-cols-2"><Field label="会議名" value={selected.title} onChange={(value) => editCase({ title: value })} /><Field label="日付" value={selected.meetingDate} onChange={(value) => editCase({ meetingDate: value })} type="date" /><Field label="目的" value={selected.content.purpose} onChange={(value) => editContent({ purpose: value })} multiline /><Field label="場所" value={selected.content.location} onChange={(value) => editContent({ location: value })} /></div>
        {(isOwner || canReview) && staffUsers.length > 0 && <div className="rounded-xl border border-slate-200 p-3"><h4 className="font-black">この会議を扱う職員</h4><p className="mt-1 text-xs text-slate-600">指定した職員は会議内容を閲覧・編集できます。</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{staffUsers.filter((staff) => staff.id !== selected.createdBy).map((staff) => <label key={staff.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selected.editorUserIds.includes(staff.id)} onChange={(event) => editCase({ editorUserIds: event.target.checked ? [...selected.editorUserIds, staff.id] : selected.editorUserIds.filter((id) => id !== staff.id) })} />{staff.name}</label>)}</div></div>}
        <div><div className="flex items-center justify-between"><h4 className="font-black">出席予定者</h4><button className={secondaryButton} onClick={() => editContent({ participants: [...selected.content.participants, { id: crypto.randomUUID(), name: '', reading: '', organization: '', role: '', calledAs: '', attended: false }] })}><Plus className="h-4 w-4" />追加</button></div><div className="mt-2 space-y-3">{selected.content.participants.map((person) => <div key={person.id} className="rounded-xl border border-slate-200 p-3"><div className="grid gap-2 md:grid-cols-2"><Field label="氏名" value={person.name} onChange={(value) => editParticipant(person.id, { name: value })} /><Field label="読み" value={person.reading} onChange={(value) => editParticipant(person.id, { reading: value })} /><Field label="所属" value={person.organization} onChange={(value) => editParticipant(person.id, { organization: value })} /><Field label="役割・関係" value={person.role} onChange={(value) => editParticipant(person.id, { role: value })} /><Field label="呼ばれ方" value={person.calledAs} onChange={(value) => editParticipant(person.id, { calledAs: value })} /></div><button className="mt-2 text-xs font-bold text-red-700 underline" onClick={() => editContent({ participants: selected.content.participants.filter((item) => item.id !== person.id) })}>削除</button></div>)}</div></div>
        <div><div className="flex items-center justify-between"><h4 className="font-black">固有名詞・専門用語</h4><button className={secondaryButton} onClick={() => editContent({ terms: [...selected.content.terms, { id: crypto.randomUUID(), spelling: '', reading: '', hint: '', includeInTiro: true }] })}><Plus className="h-4 w-4" />追加</button></div><div className="mt-2 space-y-3">{selected.content.terms.map((term) => <div key={term.id} className="rounded-xl border border-slate-200 p-3"><div className="grid gap-2 md:grid-cols-3"><Field label="正しい表記" value={term.spelling} onChange={(value) => editTerm(term.id, { spelling: value })} /><Field label="読み" value={term.reading} onChange={(value) => editTerm(term.id, { reading: value })} /><Field label="誤変換・補足" value={term.hint} onChange={(value) => editTerm(term.id, { hint: value })} /></div><label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={term.includeInTiro} onChange={(event) => editTerm(term.id, { includeInTiro: event.target.checked })} />Tiro向け資料に含める</label><button className="mt-2 text-xs font-bold text-red-700 underline" onClick={() => editContent({ terms: selected.content.terms.filter((item) => item.id !== term.id) })}>削除</button></div>)}</div></div>
        <div><div className="flex items-center justify-between"><h4 className="font-black">議題と確認事項</h4><button className={secondaryButton} onClick={() => editContent({ agenda: [...selected.content.agenda, { id: crypto.randomUUID(), title: '', question: '', status: '未確認', memo: '', decision: '', owner: '', dueDate: '' }] })}><Plus className="h-4 w-4" />追加</button></div><div className="mt-2 space-y-3">{selected.content.agenda.map((agenda, index) => <div key={agenda.id} className="rounded-xl border border-slate-200 p-3"><p className="text-xs font-bold text-teal-700">議題 {index + 1}</p><div className="grid gap-2 md:grid-cols-2"><Field label="議題" value={agenda.title} onChange={(value) => editAgenda(agenda.id, { title: value })} /><Field label="確認したいこと" value={agenda.question} onChange={(value) => editAgenda(agenda.id, { question: value })} /></div><button className="mt-2 text-xs font-bold text-red-700 underline" onClick={() => editContent({ agenda: selected.content.agenda.filter((item) => item.id !== agenda.id) })}>削除</button></div>)}</div></div>
      </div>}

      {step === 'Tiroへ渡す' && <div className="space-y-4 rounded-2xl bg-white p-5 shadow-sm"><h3 className="text-lg font-black">Tiro向け情報を確認</h3><p className="text-sm text-slate-600">Tiroには必要な情報だけを渡します。下の文章を確認してからコピーしてください。</p><label className="flex items-start gap-3 rounded-xl bg-amber-50 p-4 text-sm font-bold text-amber-900"><input type="checkbox" className="mt-1" checked={Boolean(selected.content.recordingExplainedAt)} onChange={(event) => editContent({ recordingExplainedAt: event.target.checked ? new Date().toISOString() : undefined, recordingExplainedBy: event.target.checked ? currentUser.displayName : undefined })} />録音とTiroへの情報提供について、出席者への説明・同意を確認した</label><p className="text-xs text-slate-500">確認者：{selected.content.recordingExplainedBy || '未確認'}</p><div className="flex gap-2"><button className={showSheet ? secondaryButton : primaryButton} onClick={() => setShowSheet(false)}>短い文脈</button><button className={showSheet ? primaryButton : secondaryButton} onClick={() => setShowSheet(true)}>事前情報シート</button></div><pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed">{showSheet ? sheetText : contextText}</pre><div className="flex flex-wrap gap-2"><button className={primaryButton} disabled={!selected.content.recordingExplainedAt || !saved || !sameCase(selected, saved) || saving} onClick={() => void copyContext()}><ClipboardCopy className="h-4 w-4" />文章をコピー</button><button className={secondaryButton} disabled={!selected.content.recordingExplainedAt || !saved || !sameCase(selected, saved) || saving} onClick={() => void downloadSheet()}><Download className="h-4 w-4" />事前シートを保存</button></div><p className="text-xs text-slate-600">録音・文字起こしはTiroで開始します。このアプリは録音状態を取得しません。</p></div>}

      {step === '会議中' && selected.content.participants.length > 0 && <div className="rounded-2xl bg-white p-5 shadow-sm">
        <h3 className="font-black">実際の出席者</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">{selected.content.participants.map((person) => <label key={person.id} className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={person.attended} onChange={(event) => editParticipant(person.id, { attended: event.target.checked })} />{person.name || '氏名未入力'}{person.role ? `（${person.role}）` : ''}
        </label>)}</div>
      </div>}
      {step === '会議中' && <div className="space-y-4 rounded-2xl bg-white p-5 shadow-sm"><h3 className="text-lg font-black">会議の進行</h3><label className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 text-sm font-bold"><input type="checkbox" checked={selected.content.recordingChecked} onChange={(event) => editContent({ recordingChecked: event.target.checked })} />Tiroの録音状態を実際に確認した</label><div className="flex flex-wrap gap-2"><button className={secondaryButton} onClick={() => editCase({ status: '開催中' })}>会議中にする</button><button className={secondaryButton} onClick={() => editCase({ status: '文字起こし待ち' })}>会議終了・文字起こし待ち</button></div>{selected.content.agenda.length === 0 && <p className="text-sm text-slate-600">準備画面で議題を追加してください。</p>}{selected.content.agenda.map((agenda, index) => <div key={agenda.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-bold text-teal-700">議題 {index + 1}</p><h4 className="font-black">{agenda.title || '名称未入力'}</h4><p className="text-sm text-slate-600">確認：{agenda.question || '未入力'}</p></div><select className={inputClass} value={agenda.status} onChange={(event) => editAgenda(agenda.id, { status: event.target.value as MeetingAgenda['status'] })}><option>未確認</option><option>確認済み</option><option>保留</option></select></div><div className="mt-3 grid gap-3 md:grid-cols-2"><Field label="発言の要点・メモ" value={agenda.memo} onChange={(value) => editAgenda(agenda.id, { memo: value })} multiline /><Field label="決定事項／未決事項" value={agenda.decision} onChange={(value) => editAgenda(agenda.id, { decision: value })} multiline /><Field label="担当者" value={agenda.owner} onChange={(value) => editAgenda(agenda.id, { owner: value })} /><Field label="期限" value={agenda.dueDate} onChange={(value) => editAgenda(agenda.id, { dueDate: value })} type="date" /></div><p className="mt-2 text-xs text-slate-500">最終入力：{agenda.updatedAt ? new Date(agenda.updatedAt).toLocaleString('ja-JP') : '未入力'}</p></div>)}</div>}

      {step === '文字起こし' && <div className="space-y-4 rounded-2xl bg-white p-5 shadow-sm"><h3 className="text-lg font-black">Tiroの文字起こしを取り込む</h3><p className="text-sm text-slate-600">Tiroの「スクリプト」を貼り付けます。要約だけの場合は種類を変更してください。取り込んだ原文は上書きしません。</p><label className="block text-sm font-bold">種類<select className={inputClass} value={importKind} onChange={(event) => setImportKind(event.target.value as MeetingTranscript['sourceKind'])}><option>スクリプト</option><option>要約のみ</option></select></label><label className="block text-sm font-bold">テキストファイルを選ぶ<input className={inputClass} type="file" accept=".txt,text/plain" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 500000) { setSaveError('ファイルが大きすぎます。'); return; } void file.text().then((text) => { setImportText(text.replace(/^\uFEFF/, '')); setImportName(file.name); }); }} /></label><Field label="原文" value={importText} onChange={setImportText} multiline placeholder="ここにTiroのスクリプトを貼り付け" /><button className={primaryButton} disabled={loading || !importText.trim()} onClick={() => void importTranscript()}><Save className="h-4 w-4" />原文を取り込む</button>{latestTranscript && <div className="border-t border-slate-200 pt-4"><h4 className="font-black">保存済み：第{latestTranscript.version}版（{latestTranscript.sourceKind}）</h4><p className="text-xs text-slate-600">{latestTranscript.importedAt}／{latestTranscript.sourceName || '貼り付け'}</p><details className="mt-3 rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer font-bold">取込時の原文を見る</summary><pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap text-sm">{latestTranscript.rawText}</pre></details><div className="mt-3"><Field label="誤変換を修正した文章" value={correctedText} onChange={setCorrectedText} multiline /></div><button className={`${secondaryButton} mt-3`} disabled={loading || !correctedText.trim() || correctedText.trim() === (latestTranscript.correctedText || latestTranscript.rawText).trim()} onClick={() => void saveCorrection()}>修正版を新しい版として保存</button></div>}</div>}

      {step === '文字起こし' && transcripts.length > 1 && <details className="rounded-2xl bg-white p-5 shadow-sm">
        <summary className="cursor-pointer font-bold">以前の文字起こし版を見る</summary>
        <div className="mt-3 space-y-3">{transcripts.slice(1).map((item) => <div key={item.id} className="rounded-xl border border-slate-200 p-3">
          <p className="text-sm font-bold">第{item.version}版・{item.sourceKind}</p>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-sm">{item.correctedText || item.rawText}</pre>
        </div>)}</div>
      </details>}
      {step === '結果確認' && <div className="space-y-4 rounded-2xl bg-white p-5 shadow-sm"><h3 className="text-lg font-black">会議結果を確認</h3><p className="text-sm text-slate-600">文字起こしや会議中メモと照合し、発言者の意向と職員の整理を分けて記入します。</p>{latestTranscript && <details className="rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer text-sm font-bold">文字起こし第{latestTranscript.version}版を参照</summary><pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap text-sm">{latestTranscript.correctedText || latestTranscript.rawText}</pre></details>}<div className="grid gap-3 md:grid-cols-2">{([
        ['childWish', '本人の意向'], ['familyWish', '保護者の意向'], ['reports', '関係機関からの報告'],
        ['agreements', '合意した内容'], ['pending', '未決・要確認'], ['nextActions', '次の対応'],
      ] as const).map(([key, label]) => <div key={key}><Field label={label} value={selected.content.outcome[key]} multiline onChange={(value) => editContent({ outcome: { ...selected.content.outcome, [key]: value } })} /></div>)}</div><button className={primaryButton} disabled={saving || !Object.values(selected.content.outcome).some((value) => typeof value === 'string' && value.trim())} onClick={() => editCase({ status: '結果確認済み' })}>会議結果を確認済みにする</button></div>}

      {step === '支援経過' && <div className="space-y-4 rounded-2xl bg-white p-5 shadow-sm"><h3 className="text-lg font-black">会議由来の支援経過記録</h3><p className="text-sm text-slate-600">日々の利用記録とは別に保存します。会議で確認していない出欠やサービス提供時間は含めません。</p><p className="rounded-xl bg-slate-50 p-3 text-sm font-bold">状態：{progress?.approvalStatus || '未作成'}</p>{canEditProgress && (!progress || ['下書き', '要修正'].includes(progress.approvalStatus)) && <><button className={secondaryButton} onClick={() => { if (progressDraft.trim() && !window.confirm('現在の本文を会議結果で置き換えますか？')) return; setProgressDraft(composeMeetingProgress(selected)); }}>会議結果から下書きを作る</button><Field label="支援経過の本文" value={progressDraft} onChange={setProgressDraft} multiline /><div className="flex flex-wrap gap-2"><button className={secondaryButton} disabled={loading || !progressDraft.trim()} onClick={() => void saveProgress('下書き')}>下書き保存</button><button className={primaryButton} disabled={loading || !progressDraft.trim() || selected.status !== '結果確認済み' || !saved || !sameCase(selected, saved) || saving} onClick={() => void saveProgress('未確認')}>確認へ提出</button></div></>}{progress && <><div id="meeting-progress-pdf-target" className="rounded-xl border border-slate-200 bg-white p-5 text-slate-900"><p className="text-xs">{progress.recordDate}　{child?.name || '児童'}　会議由来</p><h4 className="mt-2 text-lg font-bold">支援経過記録</h4><pre className="mt-4 whitespace-pre-wrap font-sans text-sm leading-7">{progress.body}</pre><p className="mt-5 text-xs">確認状態：{progress.approvalStatus}</p></div><button className={secondaryButton} onClick={() => void generatePDFFromElement('meeting-progress-pdf-target', `${progress.recordDate}_会議由来_支援経過記録.pdf`).catch((error) => setSaveError(errorText(error)))}><Download className="h-4 w-4" />PDF保存</button></>}{progress?.reviewComment && <p className="rounded-xl bg-amber-50 p-3 text-sm">差戻し・確認コメント：{progress.reviewComment}</p>}{progress?.approvalStatus === '未確認' && canReview && <><Field label="確認コメント" value={reviewComment} onChange={setReviewComment} multiline /><div className="flex flex-wrap gap-2"><button className={secondaryButton} disabled={loading || !reviewComment.trim()} onClick={() => void saveProgress('要修正')}>修正を依頼</button><button className={primaryButton} disabled={loading} onClick={() => void saveProgress('確認済み')}>確認済みにする</button></div></>}</div>}
    </>}
  </section>;
}
