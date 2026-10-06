import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpenCheck, ChevronDown, Copy, Plus, Printer, Search, Trash2 } from 'lucide-react';
import { EditorActionBar } from './EditorActionBar';
import { ActivityPlanSheet } from './ActivityPlanSheet';
import { listActivityPlans, saveActivityPlan } from '../services/activityPlanService';
import { activityDuration, activityKinds, activityStatuses, activityTemplates, activityText, activityTimeline, copyActivity, emptyActivity, restoreActivityDraft, validateActivity, type ActivityContent, type ActivityPlan } from '../utils/activityPlans';

const field = 'mt-1 w-full min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-950 focus:border-teal-500';
const button = 'min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 disabled:opacity-40';
const editorSteps = [
  {id:'基本情報',description:'活動名・ねらい・対象を決める'},
  {id:'活動の流れ',description:'順番・所要時間・支援を組み立てる'},
  {id:'準備・安全',description:'準備物・役割・安全を確認する'},
  {id:'振り返り',description:'実施後の気づきを次回につなげる'},
] as const;
type EditorStep = typeof editorSteps[number]['id'];
type Props = { organizationId: string; userId: string; onDirtyChange: (dirty: boolean) => void; onOpenTrafficCost: () => void; onOpenCalendar: () => void };
export function ActivityPlanWorkspace({ organizationId, userId, onDirtyChange, onOpenTrafficCost, onOpenCalendar }: Props) {
  const storageKey = `d-support-activity-draft-v1:${organizationId}:${userId}`;
  const [restored] = useState(() => { try { return restoreActivityDraft(sessionStorage.getItem(storageKey)); } catch { return null; } });
  const [plan, setPlan] = useState<ActivityPlan>(restored || emptyActivity);
  const [dirty, setDirty] = useState(Boolean(restored));
  const [list, setList] = useState<ActivityPlan[]>([]);
  const [tab, setTab] = useState<EditorStep>('基本情報');
  const panelRef = useRef<HTMLDivElement>(null);
  const stepIndex = editorSteps.findIndex((step) => step.id === tab);
  const goStep = (next: EditorStep) => {
    setTab(next);
    requestAnimationFrame(() => {
      panelRef.current?.focus({preventScroll:true});
      panelRef.current?.scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
    });
  };
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('活動案');
  const [error, setError] = useState('');
  const [message, setMessage] = useState(restored ? 'このタブに残っていた未保存の入力を復元しました。' : '');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setList(await listActivityPlans(organizationId)); }
    catch (e) { setError(describeError(e)); }
    finally { setLoading(false); }
  }, [organizationId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { onDirtyChange(dirty); return () => onDirtyChange(false); }, [dirty, onDirtyChange]);
  useEffect(() => {
    try { if (dirty) sessionStorage.setItem(storageKey, JSON.stringify(plan)); else sessionStorage.removeItem(storageKey); }
    catch { setStorageError(true); }
  }, [plan, dirty, storageKey]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const update = (patch: Partial<ActivityPlan>) => { setPlan((p) => ({ ...p, ...patch })); setDirty(true); setMessage(''); };
  const content = (patch: Partial<ActivityContent>) => update({ content: { ...plan.content, ...patch } });
  const choose = (p: ActivityPlan) => {
    if (busy || (dirty && !window.confirm('未保存の入力を置き換えますか？保存する場合はキャンセルしてください。'))) return;
    setPlan(structuredClone(p)); setDirty(!p.id || p.id.startsWith('builtin-')); setTab('基本情報'); setError(''); setMessage(''); setPreview(false); setLibraryOpen(false);
  };
  const create = (template?: ActivityPlan) => { const p = template ? copyActivity(template) : emptyActivity(); if (template) p.title = template.title.replace(/（ひな形）$/, ''); choose(p); };
  const save = async () => {
    const errors = validateActivity(plan);
    if (errors.length) { setError(errors.join('\n')); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const saved = await saveActivityPlan(plan, organizationId);
      setPlan(saved); setList((prev) => [saved, ...prev.filter((p) => p.id !== saved.id)]); setDirty(false);
      setMessage(organizationId === 'local' ? 'このブラウザに保存しました（試用モード）。' : '事業所の活動・指導案として保存しました。');
    } catch (e) { setError(describeError(e)); }
    finally { setBusy(false); }
  };
  const filtered = useMemo(() => list.filter((p) => (filter === 'ひな形' ? p.isTemplate : !p.isTemplate && (filter === '保管' ? p.status === '保管' : p.status !== '保管')) && `${p.title} ${p.date} ${p.kind} ${p.content.leader}`.normalize('NFKC').toLowerCase().includes(query.normalize('NFKC').toLowerCase())), [list, filter, query]);
  const times = activityTimeline(plan);
  const completed = plan.content.preparations.filter((p) => p.done).length;
  const text = activityText(plan);
  return <section className="activity-workspace space-y-4 pb-6" aria-label="活動・指導案">
    <header className="activity-no-print flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-teal-200 bg-white p-4 sm:p-5">
      <div><h1 className="flex items-center gap-2 text-xl font-black"><BookOpenCheck className="h-6 w-6 text-teal-600" />活動・指導案</h1><p className="mt-1 text-sm text-slate-600">ひな形を選んで入力 → 準備を確認 → 実施後の振り返り。表の整形は不要です。</p></div>
      <div className="flex flex-wrap gap-2"><button className={button} onClick={onOpenCalendar}>業務カレンダーを開く</button><button className={button} onClick={onOpenTrafficCost}>交通費を計算</button></div>
    </header>
    <div className="activity-no-print space-y-4">
      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4" aria-label="作成する案を選ぶ">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-black">作成する案を選ぶ</h2><p className="mt-1 text-xs text-slate-600">空白から入力、ひな形を利用、保存した案を再編集できます。</p></div><button className={`${button} text-teal-800`} aria-expanded={libraryOpen} aria-controls="activity-plan-library" onClick={() => setLibraryOpen(!libraryOpen)}>保存した案を{libraryOpen ? '収納' : '開く'}<ChevronDown className={`ml-1 inline h-4 w-4 ${libraryOpen?'rotate-180':''}`}/></button></div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"><button className={`${button} text-teal-800`} disabled={busy} onClick={() => create()}><Plus className="mr-1 inline h-4 w-4" />空白から作成</button>{activityTemplates.map((p) => <button key={p.id} disabled={busy} className={`${button} bg-teal-50`} onClick={() => create(p)}>{p.kind}のひな形</button>)}</div>
        <div id="activity-plan-library" hidden={!libraryOpen} className="space-y-3 border-t border-slate-200 pt-3">
        <div className="flex items-center justify-between"><h3 className="font-black">保存した案</h3><button className="min-h-11 text-sm font-bold text-teal-700" onClick={() => void load()} disabled={loading}>一覧を更新</button></div>
        <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]"><label className="block text-sm font-bold">表示<select value={filter} onChange={(e) => setFilter(e.target.value)} className={field}><option>活動案</option><option>ひな形</option><option>保管</option></select></label>
        <label className="block text-sm font-bold"><Search className="mr-1 inline h-4 w-4" />案を検索<input type="search" className={field} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="活動名・日付・担当" /></label></div>
        {loading ? <p className="text-sm">読み込み中…</p> : <p className="text-xs text-slate-500">{filtered.length}件表示（最新500件から検索）</p>}
        <div className="grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">{filtered.map((p) => <div key={p.id} className={`rounded-xl border p-3 ${plan.id === p.id ? 'border-teal-400 bg-teal-50' : 'border-slate-200'}`}>
          <button className="w-full text-left" disabled={busy} onClick={() => choose(p)}><span className="block break-words font-bold">{p.title}</span><span className="mt-1 block text-xs text-slate-600">{p.isTemplate ? 'ひな形' : p.date} · {p.kind} · {p.status}</span></button>
          <button className="mt-2 text-xs font-bold text-teal-700" disabled={busy} onClick={() => create(p)}>複製して新しい案を作る</button>
        </div>)}</div>
        </div>
      </section>
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-teal-50 p-3 text-sm"><b>{dirty ? '未保存の変更があります' : plan.id ? '保存済み' : '新しい案・入力を開始できます'}</b><span>計{activityDuration(plan)}分 · 準備{completed}/{plan.content.preparations.length}件</span></div>
        <p className="text-xs text-slate-600">未保存の入力はこのタブに保持します。職員への共有は「保存」後です。個別支援計画・支援経過記録は自動で変更しません。</p>
        {storageError && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm">このブラウザでは未保存の入力を保持できません。画面を閉じる前に保存してください。</p>}
        {error && <p role="alert" className="whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {message && <p role="status" className="rounded-xl bg-teal-50 p-3 text-sm text-teal-900">{message}</p>}
        <fieldset disabled={busy} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <legend className="sr-only">活動案の編集</legend>
          <div role="tablist" aria-label="指導案の作成手順" className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-2 sm:grid-cols-4">{editorSteps.map((step,index) => <button key={step.id} id={`activity-step-${index}`} aria-controls={`activity-panel-${index}`} type="button" role="tab" aria-selected={tab===step.id} tabIndex={tab===step.id?0:-1} className={`flex min-h-16 items-center gap-2 rounded-xl border px-3 py-2 text-left ${tab===step.id?'border-teal-700 bg-teal-700 text-white':'border-slate-200 bg-white text-slate-600'}`} onClick={() => setTab(step.id)} onKeyDown={event=>{let next=index;if(event.key==='ArrowRight')next=(index+1)%editorSteps.length;else if(event.key==='ArrowLeft')next=(index+editorSteps.length-1)%editorSteps.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=editorSteps.length-1;else return;event.preventDefault();setTab(editorSteps[next].id);document.getElementById(`activity-step-${next}`)?.focus();}}><span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-black ${tab===step.id?'bg-white text-teal-800':'bg-slate-100 text-slate-600'}`}>{index+1}</span><span className="text-sm font-bold">{step.id}</span></button>)}</div>
          <div ref={panelRef} tabIndex={-1} className="scroll-mt-28 outline-none">
          <div className="mb-4 border-b border-slate-200 pb-3"><p className="text-xs font-bold text-teal-700">手順 {stepIndex+1} / {editorSteps.length}{plan.title&&` · ${plan.title}`}</p><h2 className="mt-1 text-lg font-black">{tab}</h2><p className="mt-1 text-sm text-slate-600">{editorSteps[stepIndex].description}</p></div>
          {tab === '基本情報' && <div className="space-y-4" role="tabpanel" id="activity-panel-0" aria-labelledby="activity-step-0">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-bold">活動名（必須）<input value={plan.title} maxLength={160} onChange={(e) => update({ title: e.target.value })} className={field} placeholder="例：秋の工作・公園での運動" /></label>
            <label className="text-sm font-bold">種類<select className={field} value={plan.kind} onChange={(e) => update({ kind: e.target.value as ActivityPlan['kind'] })}>{activityKinds.map((k) => <option key={k}>{k}</option>)}</select></label>
            {!plan.isTemplate && <label className="text-sm font-bold">実施日（必須）<input type="date" className={field} value={plan.date} onChange={(e) => update({ date: e.target.value })} /></label>}
            <label className="text-sm font-bold">状態<select className={field} value={plan.status} onChange={(e) => update({ status: e.target.value as ActivityPlan['status'] })}>{activityStatuses.map((s) => <option key={s}>{s}</option>)}</select></label>
          </div>
            <h3 className="border-t border-slate-200 pt-4 text-sm font-black text-slate-800">ねらいと内容</h3>
            <TextArea label="活動のねらい" value={plan.content.goal} onChange={(goal) => content({ goal })} placeholder="どんな経験や力につなげたいか" />
            <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-bold">支援項目<input className={field} value={plan.content.supportItem || ''} maxLength={160} placeholder="未入力の場合は活動の種類を表示" onChange={(e) => content({ supportItem: e.target.value })} /></label><label className="text-sm font-bold">内容（概要）<input className={field} value={plan.content.summary || ''} maxLength={2000} placeholder="企画の概要" onChange={(e) => content({ summary: e.target.value })} /></label></div>
            <h3 className="border-t border-slate-200 pt-4 text-sm font-black text-slate-800">実施条件・担当</h3>
            <div className="grid gap-3 sm:grid-cols-2">{([['target','対象・人数','例：小学部 8名'],['location','活動場所','例：教室・近隣公園'],['leader','主担当','担当職員名']] as const).map(([key,label,placeholder]) => <label key={key} className="text-sm font-bold">{label}<input className={field} value={plan.content[key]} maxLength={160} placeholder={placeholder} onChange={(e) => content({ [key]: e.target.value })} /></label>)}<label className="text-sm font-bold">開始時刻<input className={field} type="time" value={plan.content.startTime} onChange={(e) => content({ startTime: e.target.value })} /></label></div>
            <div className="grid gap-3 sm:grid-cols-3">{([['staffCount','職員人数（名）',1000],['childCount','児童人数（名）',1000],['travelMinutes','往復時間（分）',1440]] as const).map(([key,label,max]) => <label key={key} className="text-sm font-bold">{label}<input className={field} type="number" min={0} max={max} step={1} value={plan.content[key] || ''} onChange={(e) => content({ [key]: e.target.value })} /></label>)}</div>
          </div>}
          {tab === '活動の流れ' && <div className="space-y-4" role="tabpanel" id="activity-panel-1" aria-labelledby="activity-step-1">
            <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2"><label className="text-sm font-bold">開始時刻<input className={field} type="time" value={plan.content.startTime} onChange={(e) => content({startTime:e.target.value})}/></label><div className="self-center text-sm text-slate-600">開始時刻と所要時間から、各段階の時刻を自動表示します。</div></div>
            <h2 className="font-black">活動の流れ <span className="text-sm text-teal-700">計{activityDuration(plan)}分</span></h2>
            {plan.content.steps.map((s, i) => <div key={s.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 flex items-center justify-between gap-2"><b className="text-sm">{i + 1}. {times[i]}</b><div className="flex gap-1"><button className={button} disabled={!i} aria-label={`${i + 1}番目の流れを上へ`} onClick={() => { const steps = [...plan.content.steps]; [steps[i - 1], steps[i]] = [steps[i], steps[i - 1]]; content({ steps }); }}>上へ</button><button className={button} aria-label={`${i + 1}番目の流れを削除`} onClick={() => content({ steps: plan.content.steps.filter((x) => x.id !== s.id) })}><Trash2 className="h-4 w-4" /></button></div></div>
              <label className="mb-2 block text-sm font-bold">段階<input className={field} value={s.stage || ''} maxLength={100} placeholder="例：導入・展開・まとめ" onChange={(e) => content({ steps: plan.content.steps.map((x) => x.id === s.id ? { ...x, stage: e.target.value } : x) })} /></label>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_110px]"><label className="text-sm font-bold">内容<input className={field} aria-label={`${i + 1}番目の活動内容`} value={s.title} maxLength={200} onChange={(e) => content({ steps: plan.content.steps.map((x) => x.id === s.id ? { ...x, title: e.target.value } : x) })} /></label><label className="text-sm font-bold">所要時間（分）<input className={field} type="number" min={1} max={600} value={s.minutes || ''} onChange={(e) => content({ steps: plan.content.steps.map((x) => x.id === s.id ? { ...x, minutes: Number(e.target.value) } : x) })} /></label></div>
              <label className="mt-2 block text-sm font-bold">支援・声かけ・配慮<input className={field} value={s.support} maxLength={2000} onChange={(e) => content({ steps: plan.content.steps.map((x) => x.id === s.id ? { ...x, support: e.target.value } : x) })} /></label>
            </div>)}
            <button className={button} disabled={plan.content.steps.length >= 40} onClick={() => content({ steps: [...plan.content.steps, { id: crypto.randomUUID(), title: '', minutes: 10, support: '' }] })}><Plus className="mr-1 inline h-4 w-4" />流れを追加</button>
          </div>}
          {tab === '準備・安全' && <div className="space-y-4" role="tabpanel" id="activity-panel-2" aria-labelledby="activity-step-2">
            <h2 className="font-black">準備チェック <span className="text-sm text-teal-700">{completed}/{plan.content.preparations.length}件</span></h2>
            {plan.content.preparations.map((p, i) => <div key={p.id} className={`rounded-xl border p-3 ${p.done ? 'border-teal-300 bg-teal-50' : 'border-slate-200'}`}>
              <div className="mb-2 flex justify-between"><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" className="h-5 w-5 accent-teal-600" checked={p.done} onChange={(e) => content({ preparations: plan.content.preparations.map((x) => x.id === p.id ? { ...x, done: e.target.checked } : x) })} />{i + 1}. 準備済み</label><button className={button} aria-label={`${i + 1}番目の準備物を削除`} onClick={() => content({ preparations: plan.content.preparations.filter((x) => x.id !== p.id) })}><Trash2 className="h-4 w-4" /></button></div>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">{([['name','準備物・確認事項',200],['quantity','数量',100],['owner','担当',160]] as const).map(([key,label,maxLength]) => <label key={key} className="text-sm font-bold">{label}<input className={field} value={p[key]} maxLength={maxLength} onChange={(e) => content({ preparations: plan.content.preparations.map((x) => x.id === p.id ? { ...x, [key]: e.target.value } : x) })} /></label>)}</div>
            </div>)}
            <button className={button} disabled={plan.content.preparations.length >= 80} onClick={() => content({ preparations: [...plan.content.preparations, { id: crypto.randomUUID(), name: '', quantity: '', owner: '', done: false }] })}><Plus className="mr-1 inline h-4 w-4" />準備物・確認事項を追加</button>
            <TextArea label="職員の役割分担" value={plan.content.roles} onChange={(roles) => content({ roles })} placeholder="進行、見守り、個別対応、写真、片付けなど" />
            <TextArea label="参加しやすくする配慮" value={plan.content.considerations} onChange={(considerations) => content({ considerations })} placeholder="手順の見える化、休憩場所、難易度調整など" />
            <TextArea label="安全確認・緊急時の対応" value={plan.content.safety} onChange={(safety) => content({ safety })} placeholder="活動に応じて確認・追記してください。ひな形だけで安全確認が完了するものではありません。" />
          </div>}
          {tab === '振り返り' && <div className="space-y-4" role="tabpanel" id="activity-panel-3" aria-labelledby="activity-step-3"><TextArea label="実施後の振り返り" value={plan.content.reflection} onChange={(reflection) => content({ reflection })} placeholder="実施した内容、参加の様子、うまくいった工夫、課題" /><TextArea label="次回に活かすこと" value={plan.content.nextTime} onChange={(nextTime) => content({ nextTime })} placeholder="次回変更する手順、準備物、支援の工夫" /><p className="text-sm text-slate-600">ここに入力した内容は活動全体の振り返りです。児童ごとの支援経過記録は、実際の観察を確認して別途記録してください。</p></div>}
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4"><button type="button" className={button} disabled={stepIndex===0} onClick={()=>goStep(editorSteps[stepIndex-1].id)}><ArrowLeft className="mr-1 inline h-4 w-4"/>前の手順</button>{stepIndex<editorSteps.length-1?<button type="button" className="min-h-12 rounded-xl bg-teal-700 px-4 text-sm font-black text-white" onClick={()=>goStep(editorSteps[stepIndex+1].id)}>次へ：{editorSteps[stepIndex+1].id}<ArrowRight className="ml-1 inline h-4 w-4"/></button>:<button type="button" className={button} onClick={()=>setPreview(true)}>全体をプレビューで確認</button>}</div>
        </fieldset>
        <EditorActionBar busy={busy} preview={preview} onPreview={() => setPreview(!preview)} onSave={() => void save()} secondary={[
          { label: '別の案として複製', onClick: () => choose(copyActivity(plan)) },
          { label: 'ひな形として再利用', onClick: () => choose(copyActivity(plan, true)) },
        ]} />
        {preview && <div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex flex-wrap justify-end gap-2"><button className={button} onClick={() => void navigator.clipboard.writeText(text).then(() => setMessage('指導案の文章をコピーしました。')).catch(() => setError('コピーできませんでした。ブラウザの権限を確認してください。'))}><Copy className="mr-1 inline h-4 w-4" />文章コピー</button><button className={button} onClick={() => window.print()}><Printer className="mr-1 inline h-4 w-4" />印刷・PDF保存</button></div><p className="my-3 text-xs text-slate-600">原本に合わせた表形式です。A4縦で印刷します。長い内容や補足事項は続きのページに表示されます。</p><div className="overflow-x-auto"><ActivityPlanSheet plan={plan} dirty={dirty} /></div></div>}
      </div>
    </div>
    <article className="activity-print-only"><ActivityPlanSheet plan={plan} dirty={dirty} /></article>
  </section>;
}
function TextArea({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) { return <label className="block text-sm font-bold">{label}<textarea aria-label={label} className={`${field} min-h-28 resize-y font-normal leading-relaxed`} value={value} maxLength={10000} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} /></label>; }
function describeError(e: unknown) {
  const message = e instanceof Error ? e.message : (e as { message?: string })?.message || '操作を完了できませんでした。';
  if (/activity_plans.*schema|Could not find.*activity_plans|relation.*activity_plans.*does not exist/i.test(message)) return '活動・指導案の保存先が未設定です。管理者によるデータベース更新が必要です。入力は残っています。';
  if (/row-level security|permission denied/i.test(message)) return '事業所・ログイン権限・共有端末の登録状態を確認してください。入力は残っています。';
  return message;
}
