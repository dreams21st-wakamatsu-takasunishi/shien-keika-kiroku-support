import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Eye, FileText, Plus, Printer, Save, Trash2 } from 'lucide-react';
import type { ChildProfile, UserProfile } from '../types';
import { VISIT_REPORT_PAGE_SIZE, visitingReportApi, type VisitingReportApi } from '../services/visitingSupportReportService';
import { hasVisitActivity, MAX_VISIT_ACTIVITIES, newVisitActivity, newVisitReport, sortedVisitActivityEntries,
  validateVisitReport, visitingReportChildren, visitReportPrintDate,
  type VisitActivity, type VisitReport, type VisitReportContent, type VisitReportSummary } from '../utils/visitingSupportReport';
import './visitingReport.css';

const fieldClass = 'min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-950';
const actionClass = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 disabled:opacity-50';
const primaryClass = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-teal-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-50';
const sectionClass = 'space-y-3 rounded-xl border border-slate-200 bg-white p-3 sm:p-4';
const DATE_LIMITS = { min: '1900-01-01', max: '2100-12-31' };

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid min-w-0 gap-1 text-sm font-bold text-slate-700"><span>{label}</span>{children}</label>;
}
function ReportSheet({ report, onEdit }: { report: VisitReport; onEdit?: (target: string) => void }) {
  const { content } = report;
  const rows = sortedVisitActivityEntries(content.timeline);
  const fieldLink = (target: string, label: string, value: ReactNode) =>
    onEdit ? <button type="button" className="visiting-preview-link" aria-label={`${label}を編集`} title={`${label}を編集`}
      onClick={() => onEdit(target)}>{value || '—'}</button> : value || '—';
  return (
    <article className="visiting-report-sheet">
      <p>（様式４）</p>
      <h3>報告書（保育所等訪問支援）</h3>
      <div className="visiting-report-author">
        <div>作成日：{fieldLink('report-date','作成日',visitReportPrintDate(report.report_date))}</div>
        <div>作成者：{fieldLink('author','作成者',report.author)}</div>
      </div>
      <table className="visiting-report-details" aria-label="報告書の基本情報">
        <colgroup><col style={{width:'16%'}}/><col style={{width:'25%'}}/><col style={{width:'10%'}}/><col style={{width:'14%'}}/><col style={{width:'10%'}}/><col style={{width:'25%'}}/></colgroup>
        <tbody>
          <tr><th>利用者氏名</th><td>{fieldLink('child','対象児童',content.childName)}</td><th>性別</th><td>{fieldLink('sex','性別',content.sex)}</td><th>所属</th><td>{fieldLink('affiliation','所属',content.affiliation)}</td></tr>
          <tr><th>訪問日</th><td>{fieldLink('visit-date','訪問日',visitReportPrintDate(report.visit_date))}</td><th>訪問先</th><td colSpan={3}>{fieldLink('destination','訪問先',report.destination)}</td></tr>
        </tbody>
      </table>
      <table className="visiting-report-timeline" aria-label="訪問時の活動記録">
        <colgroup><col style={{width:'12%'}}/><col style={{width:'29%'}}/><col style={{width:'29%'}}/><col style={{width:'30%'}}/></colgroup>
        <thead><tr><th scope="col">時間</th><th scope="col">訪問時の活動内容</th><th scope="col">子どもの様子</th><th scope="col">気付いたこと等</th></tr></thead>
        <tbody>{rows.length ? rows.map(({row, index}) => <tr key={index}>
          <td className="text-center">{fieldLink(`row-${index}-startTime`,`活動${index+1}の開始時刻`,row.startTime)}
            {row.endTime && <> ～<br />{fieldLink(`row-${index}-endTime`,`活動${index+1}の終了時刻`,row.endTime)}</>}</td>
          <td>{fieldLink(`row-${index}-activity`,`活動${index+1}の活動内容`,row.activity)}</td>
          <td>{fieldLink(`row-${index}-observation`,`活動${index+1}の子どもの様子`,row.observation)}</td>
          <td>{fieldLink(`row-${index}-notes`,`活動${index+1}の気付いたこと`,row.notes)}</td>
        </tr>) : onEdit && <tr><td colSpan={4}>{fieldLink('row-0-activity','訪問時の活動内容','活動内容を入力するとここに表示されます。')}</td></tr>}</tbody>
      </table>
      <div className="visiting-report-outcome">
        <h4>【まとめ】</h4><p>{fieldLink('summary','まとめ',content.summary)}</p>
        <h4>【今後の支援】</h4><p>{fieldLink('next-support','今後の支援',content.nextSupport)}</p>
      </div>
    </article>
  );
}

function messageFor(error: unknown, fallback: string) {
  const code = typeof error === 'object' && error && 'code' in error ? error.code : '';
  if (code === '42501') return '権限がありません。管理者・児発管のアカウントと事業所端末の設定を確認してください。';
  if (code === '42P01' || code === 'PGRST202' || code === 'PGRST205') return '報告書の保存先がまだ設定されていません。管理者にご確認ください。';
  if (code === '40001') return '別の画面で更新されています。今回の入力は残っています。保存済みの内容を確認するには一覧から開き直してください。';
  return fallback;
}

export function VisitingReportWorkspace({ user, childrenList, onDirtyChange, api = visitingReportApi }: {
  user: Pick<UserProfile, 'organizationId' | 'displayName'> & Partial<Pick<UserProfile, 'role'>>;
  childrenList: ChildProfile[];
  onDirtyChange: (dirty: boolean) => void;
  api?: VisitingReportApi;
}) {
  const eligible = visitingReportChildren(childrenList);
  const [selectedId, setSelectedId] = useState(eligible.length === 1 ? eligible[0].id : '');
  const child = eligible.find(item => item.id === selectedId);
  const childId = child?.id ?? '';
  const [page, setPage] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [list, setList] = useState<VisitReportSummary[]>([]);
  const [listError, setListError] = useState('');
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState(false);
  const [saving, setSaving] = useState(false);
  const [report, setReport] = useState<VisitReport | null>(null);
  const [baseline, setBaseline] = useState<VisitReport | null>(null);
  const [mobilePreview, setMobilePreview] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const detailRequest = useRef<AbortController | null>(null);
  const workspace = useRef<HTMLElement | null>(null);
  const previewHeading = useRef<HTMLHeadingElement | null>(null);
  const editorScroll = useRef(0);
  const [focusTarget, setFocusTarget] = useState('');
  const dirty = report !== baseline;

  useEffect(() => {
    onDirtyChange(dirty);
    if (!dirty) return;
    const onUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => {
    detailRequest.current?.abort();
    onDirtyChange(false);
  }, [onDirtyChange]);
  useEffect(() => {
    if (!focusTarget || mobilePreview) return;
    const field = workspace.current?.querySelector<HTMLElement>(`[data-visit-field="${focusTarget}"]`);
    if (field) {
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      field.focus({ preventScroll: true });
      field.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'instant' : 'smooth' });
    }
    setFocusTarget('');
  }, [focusTarget, mobilePreview]);
  useEffect(() => {
    setList([]);
    setListError('');
    if (!childId) { setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true);
    api.list(user.organizationId, childId, page * VISIT_REPORT_PAGE_SIZE, controller.signal)
      .then(data => { if (!controller.signal.aborted) setList(data); })
      .catch(err => { if (!controller.signal.aborted) setListError(messageFor(err, '保存済みの報告書を読み込めませんでした。')); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [api, childId, page, refresh, user.organizationId]);

  function reset(next: VisitReport | null) {
    setReport(next);
    setBaseline(next);
    setMobilePreview(false);
    setError('');
    setNotice('');
  }
  function safeToLeave() {
    return !saving && !opening && (!dirty || window.confirm('未保存の変更を破棄して移動しますか？'));
  }
  function chooseChild(id: string) {
    if (!safeToLeave()) return;
    setSelectedId(id);
    setPage(0);
    setList([]);
    setListError('');
    reset(null);
  }
  async function openSaved(id: string) {
    if (!safeToLeave()) return;
    const controller = new AbortController();
    detailRequest.current = controller;
    setOpening(true);
    setError('');
    try {
      const next = await api.get(user.organizationId, childId, id, controller.signal);
      if (!controller.signal.aborted) reset(next);
    } catch (err) {
      if (!controller.signal.aborted) setError(messageFor(err, '報告書を開けませんでした。もう一度お試しください。'));
    } finally {
      if (!controller.signal.aborted) setOpening(false);
    }
  }
  function createReport() {
    if (!child || !safeToLeave()) return;
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format();
    reset(newVisitReport(child, user.displayName, today, crypto.randomUUID()));
  }
  function update(value: Partial<VisitReport>) {
    setReport(previous => previous && ({ ...previous, ...value }));
    setNotice('');
    setError('');
  }
  function updateContent<K extends keyof VisitReportContent>(key: K, value: VisitReportContent[K]) {
    if (report) update({ content: { ...report.content, [key]: value } });
  }
  function editActivity(index: number, key: keyof VisitActivity, value: string) {
    if (report) updateContent('timeline', report.content.timeline.map((row, i) => i === index ? { ...row, [key]: value } : row));
  }
  function removeActivity(index: number) {
    if (!report || (hasVisitActivity(report.content.timeline[index]) && !window.confirm('この活動の入力を削除しますか？'))) return;
    const next = report.content.timeline.filter((_, i) => i !== index);
    updateContent('timeline', next.length ? next : [newVisitActivity()]);
  }
  function togglePreview() {
    if (!mobilePreview) editorScroll.current = window.scrollY;
    setMobilePreview(!mobilePreview);
    requestAnimationFrame(() => {
      if (mobilePreview) window.scrollTo(0, editorScroll.current);
      else previewHeading.current?.scrollIntoView({ block: 'start' });
    });
  }
  function jumpToEditor(target: string) {
    if (saving || opening) return;
    setMobilePreview(false);
    setFocusTarget(target);
  }
  async function save() {
    if (!report || !child || report.child_id !== child.id || saving || opening) return;
    const invalid = validateVisitReport(report);
    if (invalid) { setError(invalid); return; }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const next = await api.save(report);
      setReport(next); setBaseline(next);
      setNotice('報告書を保存しました。');
      setPage(0); setRefresh(previous => previous + 1);
    } catch (err) {
      setError(messageFor(err, '保存できませんでした。入力は残っています。接続状況を確認して再度お試しください。'));
    } finally {
      setSaving(false);
    }
  }
  const activeReport = report?.child_id === childId ? report : null;
  const validForPrint = activeReport ? !validateVisitReport(activeReport) : false;

  return <section ref={workspace} className="space-y-4 text-slate-950" aria-labelledby="visiting-report-heading">
    <div className={sectionClass}>
      <h2 id="visiting-report-heading" className="flex items-center gap-2 text-lg font-black"><FileText size={20}/> 訪問支援報告書</h2>
      <p className="text-sm text-slate-600">保育所等訪問支援の報告書を児童ごとに作成します。入力した内容は見本の様式で確認・印刷できます。</p>
      {user.role && user.role !== 'manager' && user.role !== 'admin' && <p className="text-xs text-slate-600">この画面の保存済み一覧には、自分が作成した報告書が表示されます。</p>}
      {eligible.length ? <div className="flex flex-wrap items-end gap-2">
        <div className="w-full max-w-md flex-1 basis-48"><Field label="対象児童">
          <select className={fieldClass} data-visit-field="child" value={childId} onChange={event => chooseChild(event.target.value)} disabled={saving || opening}>
            <option value="">対象児童を選択</option>
            {eligible.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </Field></div>
        <button type="button" className={primaryClass} disabled={!child || saving || opening} onClick={createReport}><Plus size={16}/> 新しい報告書</button>
      </div> : <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">訪問支援を利用する児童が登録されていません。児童情報でサービスを設定してください。</p>}
      {child && <details className="rounded-lg border border-slate-200 p-3" open={!activeReport || undefined}>
        <summary className="cursor-pointer text-sm font-bold">保存済みの報告書</summary>
        {loading && <p className="mt-2 text-sm text-slate-600" role="status">読み込み中…</p>}
        {listError && <div className="mt-2"><p role="alert" className="text-sm text-red-800">{listError}</p><button type="button" className={actionClass} onClick={() => setRefresh(previous => previous + 1)}>再読み込み</button></div>}
        {!loading && !listError && !list.length && <p className="mt-2 text-sm text-slate-600">{page ? 'このページに報告書はありません。' : '保存済みの報告書はありません。'}</p>}
        {list.length > 0 && <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{list.map(item => <li key={item.id}>
          <button type="button" className={`${actionClass} w-full flex-wrap justify-start text-left`} disabled={saving || opening} onClick={() => void openSaved(item.id)}>
            <span>{item.visit_date}</span><span className="min-w-0 break-words">{item.destination}</span><span className="text-xs text-slate-600">作成：{item.author}</span>
          </button>
        </li>)}</ul>}
        {(page > 0 || list.length === VISIT_REPORT_PAGE_SIZE) && <div className="mt-2 flex gap-2">
          <button type="button" className={actionClass} disabled={!page || loading} onClick={() => setPage(value => value - 1)}>前の25件</button>
          <button type="button" className={actionClass} disabled={list.length < VISIT_REPORT_PAGE_SIZE || loading} onClick={() => setPage(value => value + 1)}>次の25件</button>
        </div>}
      </details>}
      {opening && <p role="status" className="text-sm text-slate-600">報告書を開いています…</p>}
      {!activeReport && error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    </div>
    {activeReport && <>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className={`${sectionClass} min-w-0 xl:sticky xl:top-24 ${mobilePreview ? '' : 'hidden xl:block'}`} aria-label="報告書プレビュー">
          <h3 ref={previewHeading} className="scroll-mt-24 font-black">プレビュー</h3>
          <p className="text-xs text-slate-600">帳票の項目を押すと、対応する入力欄へ移動します。</p>
          <div className="overflow-auto xl:max-h-[65vh]" tabIndex={0} aria-label="帳票の表示領域"><ReportSheet report={activeReport} onEdit={jumpToEditor}/></div>
        </section>
        <div className={`${mobilePreview ? 'hidden xl:block' : ''}`}>
          <fieldset disabled={saving || opening} className="min-w-0 space-y-3">
            <section className={sectionClass}>
              <h3 className="font-black">基本情報</h3>
              <p className="text-sm">利用者氏名：{activeReport.content.childName}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="訪問日（必須）"><input data-visit-field="visit-date" className={fieldClass} type="date" {...DATE_LIMITS} value={activeReport.visit_date} onChange={event => update({visit_date: event.target.value})}/></Field>
                <Field label="作成日（必須）"><input data-visit-field="report-date" className={fieldClass} type="date" {...DATE_LIMITS} value={activeReport.report_date} onChange={event => update({report_date: event.target.value})}/></Field>
                <Field label="作成者（必須）"><input data-visit-field="author" className={fieldClass} maxLength={120} value={activeReport.author} onChange={event => update({author: event.target.value})}/></Field>
                <Field label="訪問先（必須）"><input data-visit-field="destination" className={fieldClass} maxLength={160} value={activeReport.destination} onChange={event => update({destination: event.target.value})}/></Field>
                <Field label="性別"><input data-visit-field="sex" className={fieldClass} maxLength={40} value={activeReport.content.sex} onChange={event => updateContent('sex', event.target.value)}/></Field>
                <Field label="所属（クラス）"><input data-visit-field="affiliation" className={fieldClass} maxLength={160} value={activeReport.content.affiliation} onChange={event => updateContent('affiliation', event.target.value)}/></Field>
              </div>
            </section>
            <section className={sectionClass}>
              <h3 className="font-black">訪問時の記録</h3>
              <p className="text-sm text-slate-600">開始時刻順で帳票に表示します。時刻を一点だけ記録する場合は、終了時刻を空欄にします。</p>
              {activeReport.content.timeline.map((row, index) => <fieldset key={index} className="grid min-w-0 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <legend className="px-1 text-sm font-bold">活動 {index + 1}</legend>
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2">
                  <Field label="開始時刻"><input data-visit-field={`row-${index}-startTime`} className={fieldClass} type="time" value={row.startTime} onChange={event => editActivity(index,'startTime',event.target.value)}/></Field>
                  <Field label="終了時刻"><input data-visit-field={`row-${index}-endTime`} className={fieldClass} type="time" value={row.endTime} onChange={event => editActivity(index,'endTime',event.target.value)}/></Field>
                  <button type="button" className={actionClass} aria-label={`活動 ${index + 1} の行を削除`} onClick={() => removeActivity(index)}><Trash2 size={16}/></button>
                </div>
                {([['activity','訪問時の活動内容'],['observation','子どもの様子'],['notes','気付いたこと等']] as const).map(([key,label]) =>
                  <div key={key}><Field label={label}><textarea data-visit-field={`row-${index}-${key}`} className={`${fieldClass} resize-y`} rows={3} maxLength={4000} value={row[key]} onChange={event => editActivity(index,key,event.target.value)}/></Field></div>)}
              </fieldset>)}
              <button type="button" className={actionClass} disabled={activeReport.content.timeline.length >= MAX_VISIT_ACTIVITIES}
                onClick={() => updateContent('timeline', [...activeReport.content.timeline, newVisitActivity()])}><Plus size={16}/> 活動の行を追加</button>
            </section>
            <section className={sectionClass}>
              <h3 className="font-black">まとめ・今後の支援</h3>
              <Field label="まとめ"><textarea data-visit-field="summary" className={`${fieldClass} resize-y`} rows={4} maxLength={4000} value={activeReport.content.summary} onChange={event => updateContent('summary',event.target.value)}/></Field>
              <Field label="今後の支援"><textarea data-visit-field="next-support" className={`${fieldClass} resize-y`} rows={4} maxLength={4000} value={activeReport.content.nextSupport} onChange={event => updateContent('nextSupport',event.target.value)}/></Field>
            </section>
          </fieldset>
        </div>
      </div>
      <div className="sticky bottom-0 z-10 rounded-xl border border-slate-200 bg-white p-2 shadow-md sm:p-3">
        {error && <p role="alert" className="mb-2 text-sm font-bold text-red-800">{error}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <p className="basis-full text-sm font-bold text-slate-700 sm:mr-auto sm:basis-auto" role="status">
            {saving ? '保存中…' : notice || (dirty ? '未保存の変更があります' : activeReport.revision ? '保存済み' : '新規の報告書')}
          </p>
          {dirty && <button type="button" className={actionClass} disabled={saving || opening} onClick={() => { if (safeToLeave()) reset(baseline); }}>入力を戻す</button>}
          <button type="button" className={`${actionClass} xl:hidden`} onClick={togglePreview}><Eye size={16}/>{mobilePreview ? '入力に戻る' : 'プレビュー'}</button>
          <button type="button" className={actionClass} disabled={!validForPrint || saving || opening} onClick={() => window.print()}><Printer size={16}/> 印刷・PDF</button>
          <button type="button" className={primaryClass} disabled={saving || opening || (!dirty && activeReport.revision > 0)} onClick={() => void save()}><Save size={16}/> 報告書を保存</button>
        </div>
      </div>
      {validForPrint && createPortal(<div className="visiting-report-print" aria-hidden="true">
        {/* Scope the page-size override to when this report is open, after existing app-wide print rules. */}
        <style>{'@media print { @page { size: A4 landscape; margin: 11mm; } }'}</style>
        <ReportSheet report={activeReport}/>
      </div>, document.body)}
    </>}
  </section>;
}
