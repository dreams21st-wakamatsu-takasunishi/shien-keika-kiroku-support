import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Package, Plus, Printer, Trash2 } from 'lucide-react';
import { EditorActionBar } from './EditorActionBar';
import { facilityError, listFacilityDocuments, listSupplies, listSupplyMovements, moveSupply, saveFacilityDocument, saveSupply } from '../services/facilityWorkService';
import { copyFacilityDocument, emptyFacilityDocument, emptySupply, facilityDocumentText, inspectionCounts, needsRestock, restoreFacilityDocument, type FacilityContent, type FacilityDocument, type FacilityKind, type InspectionResult, type SupplyItem, type SupplyMovement } from '../utils/facilityWork';

const field = 'mt-1 w-full min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-950';
const button = 'min-h-11 rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold disabled:opacity-40';
type Props = { organizationId: string; userId: string; onDirtyChange: (dirty: boolean) => void };
export function FacilityWorkspace(props: Props) {
  const [tab, setTab] = useState<'inspection' | 'supplies' | 'newsletter'>('inspection');
  const [dirty, setDirty] = useState(false);
  const notifyDirty = useCallback((value: boolean) => { setDirty(value); props.onDirtyChange(value); }, [props.onDirtyChange]);
  return <section className="facility-workspace space-y-4 pb-6" aria-label="施設業務">
    <header className="facility-no-print rounded-2xl border border-teal-200 bg-white p-4"><h1 className="text-xl font-black">施設業務</h1><p className="mt-1 text-sm text-slate-600">点検・備品・おたよりをまとめて管理</p></header>
    <div className="facility-no-print grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="施設業務の種類">{([['inspection', '日常点検'], ['supplies', '備品・補充'], ['newsletter', 'おたより']] as const).map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} className={`${button} border-0 px-1 ${tab === id ? 'bg-teal-700 text-white' : 'bg-transparent'}`} onClick={() => { if (tab === id || (dirty && !window.confirm('未保存の入力をこのタブに残して切り替えますか？職員に共有する場合は先に保存してください。'))) return; setTab(id); }}>{label}</button>)}</div>
    {tab === 'supplies' ? <SupplyWorkspace {...props} onDirtyChange={notifyDirty} /> : <div key={tab}><DocumentWorkspace {...props} kind={tab} onDirtyChange={notifyDirty} /></div>}
  </section>;
}
function useScopedDraft<T>(key: string, create: () => T, restore: (raw: string | null) => T | null, onDirtyChange: (dirty: boolean) => void) {
  const [restored] = useState(() => { try { return restore(sessionStorage.getItem(key)); } catch { return null; } });
  const [value, setValue] = useState<T>(restored || create);
  const [dirty, setDirty] = useState(Boolean(restored));
  const [storageError, setStorageError] = useState(false);
  useEffect(() => { onDirtyChange(dirty); return () => onDirtyChange(false); }, [dirty, onDirtyChange]);
  useEffect(() => { try { if (dirty) sessionStorage.setItem(key, JSON.stringify(value)); else sessionStorage.removeItem(key); } catch { setStorageError(true); } }, [key, value, dirty]);
  useEffect(() => { const warn = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [dirty]);
  return { value, setValue, dirty, setDirty, storageError, restored: Boolean(restored) };
}
function Feedback({ error, message, storageError }: { error: string; message: string; storageError: boolean }) { return <>
  {storageError && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm">未保存の入力をこのブラウザに保持できません。閉じる前に保存してください。</p>}
  {error && <p role="alert" className="whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
  {message && <p role="status" className="rounded-xl bg-teal-50 p-3 text-sm text-teal-900">{message}</p>}
</>; }
function DocumentWorkspace({ organizationId, userId, onDirtyChange, kind }: Props & { kind: FacilityKind }) {
  const draft = useScopedDraft(`d-support-facility-draft-v1:${organizationId}:${userId}:${kind}`, () => emptyFacilityDocument(kind), (raw) => restoreFacilityDocument(raw, kind), onDirtyChange);
  const doc = draft.value;
  const [list, setList] = useState<FacilityDocument[]>([]);
  const [error, setError] = useState(''); const [message, setMessage] = useState(draft.restored ? 'このタブに残っていた未保存の入力を復元しました。' : '');
  const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState(''); const [filter, setFilter] = useState('記録'); const [libraryOpen, setLibraryOpen] = useState(false); const [preview, setPreview] = useState(false);
  const [editingItems, setEditingItems] = useState(false);
  const title = kind === 'inspection' ? '日常点検' : '保護者向けおたより';
  const load = useCallback(async () => { setLoading(true); try { setList(await listFacilityDocuments(organizationId, kind)); } catch (e) { setError(facilityError(e)); } finally { setLoading(false); } }, [organizationId, kind]);
  useEffect(() => { void load(); }, [load]);
  const update = (patch: Partial<FacilityDocument>) => { draft.setValue((d) => ({ ...d, ...patch })); draft.setDirty(true); setMessage(''); };
  const content = (patch: Partial<FacilityContent>) => update({ content: { ...doc.content, ...patch } });
  const choose = (next: FacilityDocument) => { if (busy || (draft.dirty && !window.confirm('未保存の入力を置き換えますか？'))) return; draft.setValue(structuredClone(next)); draft.setDirty(!next.id); setError(''); setMessage(''); setPreview(false); setLibraryOpen(false); setEditingItems(false); };
  const save = async () => { setBusy(true); setError(''); setMessage(''); try { const saved = await saveFacilityDocument(doc, organizationId); draft.setValue(saved); draft.setDirty(false); setList((l) => [saved, ...l.filter((d) => d.id !== saved.id)]); setMessage(organizationId === 'local' ? 'このブラウザに保存しました（試用モード）。' : '事業所へ保存しました。'); } catch (e) { setError(facilityError(e)); } finally { setBusy(false); } };
  const counts = inspectionCounts(doc);
  const filtered = useMemo(() => list.filter((d) => (filter === 'ひな形' ? d.isTemplate : !d.isTemplate && (filter === '保管' ? d.status === '保管' : d.status !== '保管')) && `${d.title} ${d.date} ${d.content.author}`.normalize('NFKC').includes(query.normalize('NFKC'))), [list, filter, query]);
  const text = facilityDocumentText(doc);
  return <>
    <div className="facility-no-print grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4"><button className={`${button} w-full lg:hidden`} aria-expanded={libraryOpen} onClick={() => setLibraryOpen(!libraryOpen)}>新規作成・保存済みを{libraryOpen ? '収納' : '開く'}</button><div className={`${libraryOpen ? 'block' : 'hidden'} space-y-3 lg:block`}>
        <button className={`${button} w-full text-teal-800`} disabled={busy} onClick={() => choose(emptyFacilityDocument(kind))}><Plus className="mr-1 inline h-4 w-4" />{kind === 'inspection' ? '今日の点検を作成' : '新しいおたより'}</button>
        {kind === 'newsletter' && <button className={`${button} w-full`} disabled={busy} onClick={() => { const next = emptyFacilityDocument(kind); next.content.greeting = '保護者の皆様\nいつも事業所の活動にご協力いただき、ありがとうございます。'; next.content.body = '【今月の活動】\n実施した活動や子どもたちの様子を、個人が特定されない範囲で記入してください。'; next.content.upcoming = '【来月の予定】\n日時・内容を記入してください。'; choose(next); }}>文例から作成</button>}
        <div className="flex items-center justify-between border-t pt-3"><b>保存した{kind === 'inspection' ? '点検' : 'おたより'}</b><button className="text-xs font-bold text-teal-700" disabled={loading} onClick={() => void load()}>一覧を更新</button></div>
        <label className="block text-sm font-bold">表示<select className={field} value={filter} onChange={(e) => setFilter(e.target.value)}><option>記録</option><option>ひな形</option><option>保管</option></select></label>
        <label className="block text-sm font-bold">検索<input className={field} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="名称・日付・作成者" /></label>
        <p className="text-xs text-slate-500">{loading ? '読み込み中…' : `${filtered.length}件（最新500件から検索）`}</p>
        <div className="max-h-72 space-y-2 overflow-y-auto lg:max-h-[600px]">{filtered.map((d) => { const c = inspectionCounts(d); return <div key={d.id} className={`rounded-xl border p-3 ${doc.id === d.id ? 'border-teal-400 bg-teal-50' : 'border-slate-200'}`}><button className="w-full text-left" disabled={busy} onClick={() => choose(d)}><b className="block break-words">{d.title}</b><span className="mt-1 block text-xs text-slate-600">{d.isTemplate ? 'ひな形' : d.date} · {d.status}</span>{kind === 'inspection' && c.outstanding > 0 && <span className="mt-1 block text-xs font-bold text-red-700">要対応 {c.outstanding}件</span>}</button><button className="mt-2 text-xs font-bold text-teal-700" disabled={busy} onClick={() => choose(copyFacilityDocument(d))}>複製して新しく作成</button></div>; })}</div>
      </div></aside>
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap justify-between gap-2 rounded-xl bg-teal-50 p-3 text-sm"><b>{draft.dirty ? '未保存の変更があります' : doc.id ? '保存済み' : '新しく作成できます'}</b>{kind === 'inspection' && <span>確認 {counts.checked}/{counts.total}件 · 対応残り {counts.outstanding}件</span>}</div>
        <p className="text-xs text-slate-600">未保存の入力はこのタブに保持します。共有は保存後です。{kind === 'inspection' ? '点検項目は編集可能な例です。事業所の運用に合わせて追加・修正してください。' : '配信は行いません。児童の氏名・写真・個別記録は自動で取り込みません。配布前に内容と共有範囲を確認してください。'}</p>
        <Feedback error={error} message={message} storageError={draft.storageError} />
        <fieldset disabled={busy} className="min-w-0 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"><legend className="sr-only">{title}の編集</legend>
          <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-bold">名称（必須）<input className={field} maxLength={160} value={doc.title} onChange={(e) => update({ title: e.target.value })} /></label>{!doc.isTemplate && <label className="text-sm font-bold">{kind === 'inspection' ? '点検日' : '発行日'}（必須）<input className={field} type="date" value={doc.date} onChange={(e) => update({ date: e.target.value })} /></label>}<label className="text-sm font-bold">{kind === 'inspection' ? '確認者' : '作成者'}<input className={field} maxLength={160} value={doc.content.author} onChange={(e) => content({ author: e.target.value })} /></label><label className="text-sm font-bold">状態<select className={field} value={doc.status} onChange={(e) => update({ status: e.target.value as FacilityDocument['status'] })}><option>下書き</option><option value="完了">{kind === 'inspection' ? '確認完了' : '作成完了'}</option><option>保管</option></select></label></div>
          {kind === 'inspection' ? <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
              <h3 className="font-black">点検チェック <span className="text-sm font-normal text-slate-600">{counts.checked}/{counts.total}件確認</span></h3>
              <button className={button} type="button" aria-pressed={editingItems} onClick={() => setEditingItems(!editingItems)}>{editingItems ? '項目編集を終了' : '点検項目を編集'}</button>
            </div>
            {doc.content.items.map((item, index) => <div key={item.id} className={`space-y-2 rounded-xl border p-3 ${item.result === '要対応' && !item.resolved ? 'border-red-300 bg-red-50' : item.result ? 'border-teal-200 bg-teal-50' : 'border-amber-200 bg-amber-50'}`}>
              {editingItems ? <div className="flex items-center gap-2"><label className="min-w-0 flex-1 text-sm font-bold">点検項目 {index + 1}<input className={field} aria-label={`点検項目${index + 1}`} maxLength={200} value={item.label} onChange={(e) => content({ items: doc.content.items.map((i) => i.id === item.id ? { ...i, label: e.target.value } : i) })} /></label><button className={button} aria-label={`点検項目${index + 1}を削除`} onClick={() => content({ items: doc.content.items.filter((i) => i.id !== item.id) })}><Trash2 className="h-4 w-4" /></button></div> : <p className="break-words text-sm font-bold text-slate-900"><span className="mr-2 text-slate-500">{index + 1}.</span>{item.label || '名称未設定（点検項目を編集してください）'}</p>}
              <div className="flex flex-wrap gap-2" role="group" aria-label={`点検項目${index + 1}の結果`}>{(['問題なし', '要対応', '対象外'] as const).map((result) => <button key={result} aria-pressed={item.result === result} className={`${button} ${item.result === result ? result === '要対応' ? 'bg-red-700 text-white' : 'bg-teal-700 text-white' : 'bg-white text-slate-700'}`} onClick={() => content({ items: doc.content.items.map((i) => i.id === item.id ? { ...i, result, resolved: false } : i) })}>{result}</button>)}{item.result && <button className="min-h-11 px-2 text-xs text-slate-600" onClick={() => content({ items: doc.content.items.map((i) => i.id === item.id ? { ...i, result: '' as InspectionResult, resolved: false } : i) })}>未確認に戻す</button>}</div>
              <div key={`${doc.id}:${item.id}`}><InspectionMemo required={item.result === '要対応'} value={item.note} onChange={(note) => content({ items: doc.content.items.map((i) => i.id === item.id ? { ...i, note } : i) })} /></div>
              {item.result === '要対応' && <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" className="h-5 w-5 accent-teal-700" checked={item.resolved} onChange={(e) => content({ items: doc.content.items.map((i) => i.id === item.id ? { ...i, resolved: e.target.checked } : i) })} />対応済み（未チェックは対応残りとして表示）</label>}
            </div>)}
            <button className={button} disabled={doc.content.items.length >= 80} onClick={() => { content({ items: [...doc.content.items, { id: crypto.randomUUID(), label: '', result: '', note: '', resolved: false }] }); setEditingItems(true); }}><Plus className="mr-1 inline h-4 w-4" />点検項目を追加</button>
            <LongText label="全体メモ・職員への連絡" value={doc.content.notes} onChange={(notes) => content({ notes })} />
          </> : ([['greeting', 'あいさつ'], ['body', '本文・活動の紹介'], ['upcoming', '今後の予定'], ['belongings', '持ち物・お願い'], ['contact', 'お問い合わせ先']] as const).map(([key, label]) => <div key={key}><LongText label={label} value={doc.content[key]} onChange={(value) => content({ [key]: value })} /></div>)}
        </fieldset>
        <EditorActionBar busy={busy} preview={preview} onPreview={() => setPreview(!preview)} onSave={() => void save()} secondary={[{ label: 'ひな形として再利用', onClick: () => choose(copyFacilityDocument(doc, true)) }]} />
        {preview && <div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="mb-4 flex flex-wrap justify-end gap-2"><button className={button} onClick={() => void navigator.clipboard.writeText(text).then(() => setMessage('文章をコピーしました。')).catch(() => setError('コピーできませんでした。ブラウザの権限を確認してください。'))}><Copy className="mr-1 inline h-4 w-4" />文章コピー</button><button className={button} onClick={() => window.print()}><Printer className="mr-1 inline h-4 w-4" />印刷・PDF保存</button></div><DocumentPaper doc={doc} /></div>}
      </div>
    </div>
    <article className="facility-print-only">{draft.dirty && <p className="text-xs">未保存の入力内容／印刷時点の案</p>}<DocumentPaper doc={doc} /></article>
  </>;
}
function InspectionMemo({ required, value, onChange }: { required: boolean; value: string; onChange: (value: string) => void }) {
  const [expanded, setExpanded] = useState(Boolean(value));
  return required || expanded || value ? <label className="block text-sm font-bold">{required ? '対応メモ（必須）' : 'メモ（任意）'}<input className={field} maxLength={2000} value={value} onFocus={() => setExpanded(true)} onChange={(event) => onChange(event.target.value)} /></label>
    : <button type="button" className="min-h-11 text-xs font-bold text-slate-600" onClick={() => setExpanded(true)}>メモを追加（任意）</button>;
}
function LongText({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) { return <label className="block text-sm font-bold">{label}<textarea className={`${field} min-h-28 font-normal leading-relaxed`} maxLength={10000} value={value} onChange={(e) => onChange(e.target.value)} /></label>; }
function DocumentPaper({ doc }: { doc: FacilityDocument }) {
  if (doc.kind === 'inspection') return <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">{facilityDocumentText(doc)}</pre>;
  return <div className="newsletter-paper mx-auto max-w-3xl space-y-5 break-words p-2 text-slate-950 sm:p-6"><h2 className="border-b-2 border-teal-600 pb-4 text-center text-2xl font-black">{doc.title}</h2><p className="text-right text-sm">{doc.date}</p>{([['greeting', ''], ['body', ''], ['upcoming', '今後の予定'], ['belongings', '持ち物・お願い'], ['contact', 'お問い合わせ']] as const).map(([key, label]) => doc.content[key] && <section key={key} className="space-y-2">{label && <h3 className="border-l-4 border-teal-600 pl-3 font-bold">{label}</h3>}<p className="whitespace-pre-wrap text-sm leading-7">{doc.content[key]}</p></section>)}</div>;
}

type SupplyDraft = { item: SupplyItem; metaDirty: boolean; movement: { kind: SupplyMovement['kind']; amount: string; note: string; requestId: string } };
const blankMovement = (): SupplyDraft['movement'] => ({ kind: '入庫', amount: '', note: '', requestId: crypto.randomUUID() });
function restoreSupply(raw: string | null): SupplyDraft | null { try { if (!raw || raw.length > 20000) return null; const d = JSON.parse(raw); if (!d.item || !d.movement || typeof d.metaDirty !== 'boolean') return null; for (const k of ['id', 'organizationId', 'name', 'category', 'unit', 'location', 'note', 'updatedAt']) if (typeof d.item[k] !== 'string') return null; if (![d.item.quantity, d.item.threshold, d.item.revision].every(Number.isSafeInteger) || typeof d.item.requested !== 'boolean' || typeof d.item.archived !== 'boolean') return null; if (!['入庫', '使用', '調整'].includes(d.movement.kind) || !['amount', 'note', 'requestId'].every((k) => typeof d.movement[k] === 'string')) return null; return d; } catch { return null; } }
function SupplyWorkspace({ organizationId, userId, onDirtyChange }: Props) {
  const draft = useScopedDraft(`d-support-facility-draft-v1:${organizationId}:${userId}:supplies`, () => ({ item: emptySupply(), metaDirty: false, movement: blankMovement() }), restoreSupply, onDirtyChange);
  const { item, movement, metaDirty } = draft.value;
  const [settingsOpen, setSettingsOpen] = useState(metaDirty || !item.id);
  const editorRef = useRef<HTMLDivElement>(null);
  const [selectionSerial, setSelectionSerial] = useState(0);
  useEffect(() => {
    if (!selectionSerial || !window.matchMedia('(max-width: 1279px)').matches) return;
    editorRef.current?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }, [selectionSerial]);
  const [list, setList] = useState<SupplyItem[]>([]); const [history, setHistory] = useState<SupplyMovement[]>([]);
  const [query, setQuery] = useState(''); const [filter, setFilter] = useState('使用中'); const [editing, setEditing] = useState(draft.restored); const [error, setError] = useState(''); const [message, setMessage] = useState(draft.restored ? '未保存の入力を復元しました。' : ''); const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true); const [historyLoading, setHistoryLoading] = useState(false);
  const load = useCallback(async () => { setLoading(true); try { setList(await listSupplies(organizationId)); } catch (e) { setError(facilityError(e)); } finally { setLoading(false); } }, [organizationId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { let active = true; setHistory([]); if (item.id) { setHistoryLoading(true); void listSupplyMovements(organizationId, item.id).then((data) => { if (active) setHistory(data); }).catch((e) => { if (active) setError(facilityError(e)); }).finally(() => { if (active) setHistoryLoading(false); }); } return () => { active = false; }; }, [organizationId, item.id, item.revision]);
  const update = (patch: Partial<SupplyItem>) => { draft.setValue((d) => ({ ...d, item: { ...d.item, ...patch }, metaDirty: true })); draft.setDirty(true); setMessage(''); };
  const changeMovement = (patch: Partial<SupplyDraft['movement']>) => { const next = { ...movement, ...patch, requestId: crypto.randomUUID() }; draft.setValue((d) => ({ ...d, movement: next })); draft.setDirty(metaDirty || Boolean(next.amount || next.note)); setMessage(''); };
  const choose = (next: SupplyItem) => { if (busy || (draft.dirty && !window.confirm('未保存の備品設定・入出庫の入力を置き換えますか？'))) return; draft.setValue({ item: structuredClone(next), metaDirty: !next.id, movement: blankMovement() }); draft.setDirty(!next.id); setEditing(true); setSettingsOpen(!next.id); setSelectionSerial((serial) => serial + 1); setError(''); setMessage(''); };
  const save = async () => { setBusy(true); setError(''); setMessage(''); try { const saved = await saveSupply(item, organizationId); draft.setValue((d) => ({ ...d, item: saved, metaDirty: false })); draft.setDirty(Boolean(movement.amount || movement.note)); setList((l) => [saved, ...l.filter((i) => i.id !== saved.id)]); setMessage('備品の設定を保存しました。数量は「入出庫・数量調整」で登録してください。'); } catch (e) { setError(facilityError(e)); } finally { setBusy(false); } };
  const move = async () => { if (metaDirty) { setError('先に備品の設定を保存してください。'); return; } setBusy(true); setError(''); setMessage(''); try { const amount = movement.amount.trim() ? Number(movement.amount) : 0; const delta = movement.kind === '使用' ? -Math.abs(amount) : amount; await moveSupply(organizationId, item.id, item.revision, movement.requestId, movement.kind, delta, movement.note); const refreshed = await listSupplies(organizationId); const saved = refreshed.find((i) => i.id === item.id); if (!saved) throw new Error('変更後の備品を取得できませんでした。一覧を更新してください。'); setList(refreshed); draft.setValue({ item: saved, metaDirty: false, movement: blankMovement() }); draft.setDirty(false); setMessage('数量を更新し、履歴を保存しました。'); } catch (e) { setError(facilityError(e)); } finally { setBusy(false); } };
  const filtered = list.filter((i) => (filter === '保管' ? i.archived : !i.archived && (filter === '補充が必要' ? needsRestock(i) || i.requested : true)) && `${i.name} ${i.category} ${i.location}`.normalize('NFKC').includes(query.normalize('NFKC')));
  return <div className="facility-no-print space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-teal-200 bg-white p-4"><div><h2 className="flex items-center gap-2 font-black"><Package className="h-5 w-5 text-teal-700" />備品・消耗品の補充管理</h2><p className="mt-1 text-sm text-slate-600">補充目安以下 {list.filter(needsRestock).length}件 · 補充依頼 {list.filter((i) => !i.archived && i.requested).length}件</p></div><button className={button} disabled={busy} onClick={() => choose(emptySupply())}><Plus className="mr-1 inline h-4 w-4" />備品を登録</button></div>
    <Feedback error={error} message={message} storageError={draft.storageError} />
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,440px)]">
      <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4"><div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]"><label className="col-span-2 min-w-0 text-sm font-bold sm:col-span-1">品名・分類・保管場所で検索<input className={field} value={query} onChange={(e) => setQuery(e.target.value)} /></label><label className="text-sm font-bold">表示<select className={field} value={filter} onChange={(e) => setFilter(e.target.value)}><option>使用中</option><option>補充が必要</option><option>保管</option></select></label><button className={button} disabled={loading || busy} onClick={() => void load()}>一覧を更新</button></div><p className="mb-2 text-xs text-slate-500">{loading ? '読み込み中…' : `${filtered.length}件（最大1,000件）`} · 数量は整数で管理します。</p>
        <div className="space-y-2">{filtered.map((i) => <button key={i.id} disabled={busy} className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border p-3 text-left ${item.id === i.id && editing ? 'border-teal-500' : 'border-slate-200'} ${needsRestock(i) ? 'bg-amber-50' : 'bg-white'}`} onClick={() => choose(i)}><div className="min-w-0"><b className="block break-words">{i.name}</b><span className="block text-xs text-slate-600">{i.category} · {i.location || '保管場所未設定'}</span><span className="mt-1 block text-xs font-bold text-amber-800">{i.requested ? '補充依頼あり' : needsRestock(i) ? '補充目安以下' : i.archived ? '保管中' : '在庫あり'}</span></div><div className="text-right"><b className="text-lg">{i.quantity}<span className="ml-1 text-xs">{i.unit}</span></b><span className="block text-xs text-slate-500">補充目安 {i.threshold}{i.unit}</span><span className="text-xs font-bold text-teal-700">編集・入出庫</span></div></button>)}</div>
      </div>
      {editing ? <div ref={editorRef} className="min-w-0 scroll-mt-20 space-y-3">
      <p className="rounded-xl bg-teal-50 p-3 text-sm font-bold">{draft.dirty ? '未保存の入力があります' : '保存済み'} · {item.name || '新しい備品'}</p>
      {item.id && !item.archived && <fieldset disabled={busy} className="space-y-3 rounded-2xl border border-sky-200 bg-white p-4"><legend className="sr-only">入出庫・数量調整</legend><h3 className="font-black">入出庫・数量調整 <span className="text-teal-700">現在 {item.quantity}{item.unit}</span></h3>{metaDirty && <p className="text-xs text-amber-800">備品の設定を保存後に数量を変更できます。</p>}<label className="block text-sm font-bold">区分<select className={field} value={movement.kind} onChange={(e) => changeMovement({ kind: e.target.value as SupplyMovement['kind'], amount: '' })}><option>入庫</option><option>使用</option><option>調整</option></select></label><label className="block text-sm font-bold">{movement.kind === '調整' ? '増減数量（減らす場合はマイナス）' : movement.kind === '使用' ? '使用する数量（正の整数）' : '入庫する数量（正の整数）'}<input className={field} type="number" step={1} min={movement.kind === '調整' ? -1000000 : 1} max={1000000} value={movement.amount} onChange={(e) => changeMovement({ amount: e.target.value })} /></label><label className="block text-sm font-bold">理由・メモ（必須）<input className={field} maxLength={1000} value={movement.note} onChange={(e) => changeMovement({ note: e.target.value })} placeholder="例：工作で3個使用・購入分の入庫" /></label><button className="min-h-12 w-full rounded-xl bg-sky-800 font-black text-white disabled:opacity-40" disabled={metaDirty} onClick={() => void move()}>{busy ? '処理中…' : '数量を変更して履歴に保存'}</button></fieldset>}
      <details open={settingsOpen} onToggle={(event) => setSettingsOpen(event.currentTarget.open)} className="rounded-2xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer font-black">備品の設定・補充依頼{metaDirty && <span className="ml-2 text-xs text-amber-800">未保存</span>}</summary><fieldset disabled={busy} className="mt-3 space-y-3"><legend className="sr-only">備品の設定</legend>
        {([['name', '品名（必須）', 160], ['category', '分類', 80], ['unit', '数量の単位（個・袋・箱など）', 20], ['location', '保管場所', 160]] as const).map(([key, label, maxLength]) => <label key={key} className="block text-sm font-bold">{label}<input className={field} maxLength={maxLength} value={item[key]} onChange={(e) => update({ [key]: e.target.value })} /></label>)}
        <label className="block text-sm font-bold">補充目安（この数量以下で強調）<input type="number" className={field} min={0} max={1000000} step={1} value={item.threshold} onChange={(e) => update({ threshold: e.target.value ? Number(e.target.value) : 0 })} /></label><label className="block text-sm font-bold">メモ<textarea className={field} value={item.note} maxLength={2000} onChange={(e) => update({ note: e.target.value })} /></label>
        <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" className="h-5 w-5 accent-teal-700" checked={item.requested} onChange={(e) => update({ requested: e.target.checked })} />補充を依頼する</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-teal-700" checked={item.archived} onChange={(e) => update({ archived: e.target.checked })} />使用しない備品として保管（履歴は残す）</label>
        <button className="min-h-12 w-full rounded-xl bg-teal-700 font-black text-white disabled:opacity-40" disabled={!metaDirty} onClick={() => void save()}>{busy ? '保存中…' : '備品の設定を保存'}</button>
      </fieldset></details>
      {item.id && <details className="rounded-xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer font-bold">入出庫履歴（最新100件）</summary>{historyLoading ? <p className="mt-2 text-sm">読み込み中…</p> : <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">{history.length === 0 && <p className="text-sm text-slate-500">履歴はありません。</p>}{history.map((m) => <div key={m.id} className="border-b pb-2 text-sm"><b>{m.kind} {m.delta > 0 ? '+' : ''}{m.delta}{item.unit} → {m.quantityAfter}{item.unit}</b><p className="break-words">{m.note}</p><time className="text-xs text-slate-500">{new Date(m.createdAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</time></div>)}</div>}</details>}
      </div> : <div className="rounded-2xl border border-dashed border-teal-300 bg-teal-50 p-6 text-sm text-teal-900">備品を選択すると、設定・補充依頼・入出庫の操作がここに表示されます。</div>}
    </div>
  </div>;
}
