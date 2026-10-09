import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SupportRecord, ApprovalStatus } from '../types';
import { Search, FileText, Clock, Eye, Edit, Copy, Trash2, Download, Wrench, SlidersHorizontal, X, CalendarRange, LoaderCircle, ChevronDown } from 'lucide-react';
import { downloadRecordsCsv } from '../utils/recordCsv';
import { getLocalDateString } from '../utils/weekdays';
import { MonthlyRecordsPDFDocument } from './MonthlyRecordsPDFDocument';
import { generatePagedPDFFromElement } from '../utils/pdfGenerator';

interface RecordListProps {
  records: SupportRecord[];
  initialSearchTerm?: string;
  onSelectRecord: (record: SupportRecord) => void;
  onEditRecord: (record: SupportRecord) => void;
  onCorrectRecord?: (record: SupportRecord) => void;
  onDuplicateRecord: (record: SupportRecord) => void;
  onDeleteRecord: (recordId: string) => void;
  canDeleteRecords?: boolean;
  onNewRecord: () => void;
}

interface StoredRecordListState {
  savedOn: string;
  searchTerm: string;
  statusFilter: string;
  templateFilter: string;
  dateMode: 'day' | 'range';
  selectedDate: string;
  dateFrom: string;
  dateTo: string;
  filtersOpen: boolean;
  monthlyPdfOpen: boolean;
  pdfChildId: string;
  pdfMonth: string;
  scrollY: number;
  sortRules: RecordSortRule[];
}

type RecordSortField = 'date' | 'child' | 'attendance' | 'summary' | 'recorder' | 'status';
interface RecordSortRule { field: RecordSortField; direction: 'asc' | 'desc' }

const RECORD_LIST_STATE_KEY = 'support-record-list-view-v1';

function readStoredState(today: string): StoredRecordListState {
  const fallback: StoredRecordListState = {
    savedOn: today,
    searchTerm: '', statusFilter: 'all', templateFilter: 'all', dateMode: 'day',
    selectedDate: today, dateFrom: today, dateTo: today, filtersOpen: false,
    monthlyPdfOpen: false, pdfChildId: '', pdfMonth: today.slice(0, 7), scrollY: 0,
    sortRules: [{ field: 'date', direction: 'desc' }],
  };
  try {
    const saved = JSON.parse(sessionStorage.getItem(RECORD_LIST_STATE_KEY) || '{}') as Partial<StoredRecordListState>;
    if (saved.savedOn !== today) {
      sessionStorage.removeItem(RECORD_LIST_STATE_KEY);
      return fallback;
    }
    return { ...fallback, ...saved };
  } catch {
    return fallback;
  }
}

export const RecordList: React.FC<RecordListProps> = ({
  records,
  initialSearchTerm,
  onSelectRecord,
  onEditRecord,
  onCorrectRecord,
  onDuplicateRecord,
  onDeleteRecord,
  canDeleteRecords = true,
  onNewRecord,
}) => {
  const today = getLocalDateString();
  const initialState = useRef(readStoredState(today));
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm || initialState.current.searchTerm);
  const [statusFilter, setStatusFilter] = useState<string>(initialState.current.statusFilter);
  const [templateFilter, setTemplateFilter] = useState<string>(initialState.current.templateFilter);
  const [dateMode, setDateMode] = useState<'day' | 'range'>(initialState.current.dateMode);
  const [selectedDate, setSelectedDate] = useState(initialState.current.selectedDate);
  const [dateFrom, setDateFrom] = useState(initialState.current.dateFrom);
  const [dateTo, setDateTo] = useState(initialState.current.dateTo);
  const [filtersOpen, setFiltersOpen] = useState(initialState.current.filtersOpen);
  const [monthlyPdfOpen, setMonthlyPdfOpen] = useState(initialState.current.monthlyPdfOpen);
  const [pdfChildId, setPdfChildId] = useState(initialState.current.pdfChildId);
  const [pdfMonth, setPdfMonth] = useState(initialState.current.pdfMonth);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [pdfError, setPdfError] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const [sortRules, setSortRules] = useState<RecordSortRule[]>(initialState.current.sortRules);

  const childOptions = useMemo(() => Array.from(new Map<string, string>(
    records.map((record) => [record.childId, record.childName] as const),
  ).entries()).map(([id, name]) => ({ id, name })).sort((left, right) => left.name.localeCompare(right.name, 'ja')), [records]);
  const monthlyPdfRecords = useMemo(() => records
    .filter((record) => record.childId === pdfChildId && record.date.startsWith(`${pdfMonth}-`))
    .sort((left, right) => left.date.localeCompare(right.date)), [pdfChildId, pdfMonth, records]);
  const pdfChildName = childOptions.find((child) => child.id === pdfChildId)?.name || '';
  const monthlyPdfTargetId = 'monthly-records-pdf-target';

  useEffect(() => {
    if (!initialSearchTerm) return;
    setSearchTerm(initialSearchTerm);
  }, [initialSearchTerm]);

  useEffect(() => {
    if (pdfChildId || childOptions.length === 0) return;
    setPdfChildId(childOptions[0].id);
  }, [childOptions, pdfChildId]);

  useEffect(() => {
    const state: StoredRecordListState = {
      savedOn: today,
      searchTerm, statusFilter, templateFilter, dateMode, selectedDate, dateFrom, dateTo,
      filtersOpen, monthlyPdfOpen, pdfChildId, pdfMonth, scrollY: initialState.current.scrollY, sortRules,
    };
    initialState.current = state;
    sessionStorage.setItem(RECORD_LIST_STATE_KEY, JSON.stringify(state));
  }, [dateFrom, dateMode, dateTo, filtersOpen, monthlyPdfOpen, pdfChildId, pdfMonth, searchTerm, selectedDate, sortRules, statusFilter, templateFilter, today]);

  useEffect(() => {
    const targetScroll = initialState.current.scrollY;
    if (targetScroll <= 0) return;
    const frame = window.requestAnimationFrame(() => window.scrollTo({ top: targetScroll, behavior: 'auto' }));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const rememberPosition = () => {
    initialState.current = { ...initialState.current, scrollY: window.scrollY };
    sessionStorage.setItem(RECORD_LIST_STATE_KEY, JSON.stringify(initialState.current));
  };

  const openRecord = (record: SupportRecord) => {
    rememberPosition();
    onSelectRecord(record);
  };

  const exportMonthlyPdf = async () => {
    if (!pdfChildId || monthlyPdfRecords.length === 0) return;
    setExportingPdf(true);
    setPdfError('');
    try {
      const safeName = pdfChildName.replace(/[\\/:*?"<>|]/g, '_');
      await generatePagedPDFFromElement(monthlyPdfTargetId, `${safeName}_${pdfMonth}_支援経過記録.pdf`);
    } catch (error) {
      setPdfError(error instanceof Error ? error.message : '月間PDFを作成できませんでした。');
    } finally {
      setExportingPdf(false);
    }
  };

  // Filter records
  const filteredRecords = records.filter((r) => {
    const matchesSearch =
      r.childName.includes(searchTerm) ||
      r.recorderName.includes(searchTerm) ||
      r.date.includes(searchTerm);

    const matchesStatus =
      statusFilter === 'all' || r.approvalStatus === statusFilter;

    const matchesTemplate =
      templateFilter === 'all' || r.templateType === templateFilter;
    const matchesDate = dateMode === 'day'
      ? r.date === selectedDate
      : (!dateFrom || r.date >= dateFrom) && (!dateTo || r.date <= dateTo);

    return matchesSearch && matchesStatus && matchesTemplate && matchesDate;
  });
  const summaryText = (record: SupportRecord) => record.sectionAnswers?.study?.detailText
    || record.sectionAnswers?.life?.detailText
    || record.synthesizedSummary
    || '';
  const sortValue = (record: SupportRecord, field: RecordSortField) => {
    if (field === 'date') return record.date;
    if (field === 'child') return record.childName;
    if (field === 'attendance') return `${record.attendance} ${record.expressions?.join('、') || ''}`;
    if (field === 'summary') return summaryText(record);
    if (field === 'recorder') return record.recorderName;
    return record.approvalStatus;
  };
  const displayedRecords = useMemo(() => [...filteredRecords].sort((left, right) => {
    for (const rule of sortRules) {
      const result = sortValue(left, rule.field).localeCompare(sortValue(right, rule.field), 'ja', { numeric: true });
      if (result !== 0) return rule.direction === 'asc' ? result : -result;
    }
    return left.id.localeCompare(right.id);
  }), [filteredRecords, sortRules]);
  const toggleSort = (field: RecordSortField) => setSortRules((current) => {
    const existing = current.find((rule) => rule.field === field);
    if (!existing) return [...current, { field, direction: 'asc' }];
    return current.map((rule) => rule.field === field
      ? { ...rule, direction: rule.direction === 'asc' ? 'desc' : 'asc' }
      : rule);
  });
  const sortLabel = (field: RecordSortField, direction: 'asc' | 'desc') => {
    if (field === 'date') return direction === 'asc' ? '古い日→新しい日' : '新しい日→古い日';
    if (field === 'child' || field === 'recorder') return direction === 'asc' ? 'あ→ん' : 'ん→あ';
    if (field === 'status') return direction === 'asc' ? '未確認から' : '確認済みから';
    return direction === 'asc' ? '文字順（先頭から）' : '文字順（末尾から）';
  };
  const copyDisplayedRecords = async () => {
    const text = displayedRecords.map((record) => [
      `${record.date}　${record.childName}`,
      `記録者：${record.recorderName}`,
      `出欠：${record.attendance}`,
      summaryText(record) || record.synthesizedSummary || '記録内容あり',
    ].join('\n')).join('\n\n----------------\n\n');
    await navigator.clipboard.writeText(text);
    setCopyMessage(`${displayedRecords.length}件をコピーしました。`);
  };

  const unapprovedCount = records.filter((r) => r.approvalStatus === '未確認').length;
  const activeFilterCount = [
    Boolean(searchTerm.trim()),
    statusFilter !== 'all',
    templateFilter !== 'all',
  ].filter(Boolean).length;
  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setTemplateFilter('all');
    setDateMode('day');
    setSelectedDate(today);
    setDateFrom(today);
    setDateTo(today);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="mx-auto max-w-[1600px] space-y-4">
      {/* Top Header & Quick Stats */}
      <div className="flex flex-col items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-black text-slate-900">記録一覧</h2>
            {unapprovedCount > 0 && (
              <span className="bg-amber-100 text-amber-800 border border-amber-300 text-xs font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> 児発管確認待ち {unapprovedCount}件
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            全{records.length}件・条件に一致 {filteredRecords.length}件
          </p>
        </div>

        <div className="grid w-full grid-cols-2 gap-2 md:flex md:w-auto">
          <button
            type="button"
            disabled={displayedRecords.length === 0}
            onClick={() => void copyDisplayedRecords()}
            className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 text-xs font-black text-indigo-800 disabled:opacity-40"
          >
            <Copy className="h-4 w-4" />期間分を一括コピー
          </button>
          <button
            type="button"
            disabled={filteredRecords.length === 0}
            onClick={() => downloadRecordsCsv(filteredRecords)}
            className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-xs font-bold text-slate-700 disabled:opacity-40 md:flex-none"
          >
            <Download className="h-4 w-4" />表示中をCSV出力
          </button>
          <button
            type="button"
            onClick={() => setMonthlyPdfOpen((current) => !current)}
            className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-teal-200 bg-teal-50 px-4 text-xs font-black text-teal-800 md:flex-none"
            aria-expanded={monthlyPdfOpen}
          >
            <CalendarRange className="h-4 w-4" />月間PDF<ChevronDown className={`h-3.5 w-3.5 transition-transform ${monthlyPdfOpen ? 'rotate-180' : ''}`} />
          </button>
          <button
            onClick={onNewRecord}
            className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 text-xs font-bold text-white shadow-xs transition-all hover:bg-teal-500 md:flex-none"
          >
            新規記録を入力する
          </button>
        </div>
      </div>
      {copyMessage && <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">{copyMessage}</p>}

      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm" aria-label="並べ替え優先順">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-black text-slate-500">並べ替え優先順</span>
          {sortRules.map((rule, index) => (
            <span key={rule.field} className="inline-flex min-h-8 items-center rounded-lg bg-slate-100 px-2 text-[10px] font-black text-slate-700">
              {index + 1}. {sortLabel(rule.field, rule.direction)}
            </span>
          ))}
          {sortRules.length > 1 && <button type="button" onClick={() => setSortRules([{ field: 'date', direction: 'desc' }])} className="min-h-8 rounded-lg px-2 text-[10px] font-black text-rose-700">優先順をリセット</button>}
        </div>
      </section>

      {monthlyPdfOpen && (
        <section className="ui-panel-enter rounded-2xl border border-teal-200 bg-white p-4 shadow-sm" aria-label="児童1か月分のPDF出力">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-black text-slate-950">児童1か月分を1つのPDFにまとめる</h3>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">表紙の後に、対象月の記録を日付順で収録します。</p>
            </div>
            <label className="text-xs font-black text-slate-600">児童
              <select value={pdfChildId} onChange={(event) => setPdfChildId(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm lg:w-56">
                <option value="">児童を選択</option>
                {childOptions.map((child) => <option key={child.id} value={child.id}>{child.name}</option>)}
              </select>
            </label>
            <label className="text-xs font-black text-slate-600">対象月
              <input type="month" value={pdfMonth} onChange={(event) => setPdfMonth(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm lg:w-44" />
            </label>
            <button type="button" disabled={exportingPdf || monthlyPdfRecords.length === 0} onClick={() => void exportMonthlyPdf()} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-teal-700 px-5 text-sm font-black text-white disabled:bg-slate-300">
              {exportingPdf ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {exportingPdf ? '作成中…' : `${monthlyPdfRecords.length}件をPDF出力`}
            </button>
          </div>
          {pdfError && <p className="mt-3 rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-800" role="alert">{pdfError}</p>}
          {pdfChildId && monthlyPdfRecords.length === 0 && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-900">選択した月の保存済み記録はありません。</p>}
        </section>
      )}

      {/* Search & Filter Bar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="mb-3 flex flex-col gap-2 rounded-xl bg-slate-50 p-2 sm:flex-row sm:items-center">
          <div className="grid grid-cols-2 rounded-lg bg-white p-1 shadow-sm sm:w-52">
            <button type="button" onClick={() => setDateMode('day')} className={`min-h-9 rounded-md px-3 text-xs font-black ${dateMode === 'day' ? 'bg-slate-900 text-white' : 'text-slate-500'}`}>1日表示</button>
            <button type="button" onClick={() => setDateMode('range')} className={`min-h-9 rounded-md px-3 text-xs font-black ${dateMode === 'range' ? 'bg-slate-900 text-white' : 'text-slate-500'}`}>期間表示</button>
          </div>
          {dateMode === 'day' ? (
            <label className="flex min-w-0 flex-1 items-center gap-2 text-xs font-black text-slate-600">
              対象日
              <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="min-h-10 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 font-bold sm:max-w-48" />
            </label>
          ) : (
            <div className="grid min-w-0 flex-1 grid-cols-[1fr_auto_1fr] items-center gap-2">
              <input aria-label="開始日" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="min-h-10 min-w-0 rounded-lg border border-slate-300 bg-white px-2 text-xs font-bold" />
              <span className="text-xs font-bold text-slate-400">〜</span>
              <input aria-label="終了日" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="min-h-10 min-w-0 rounded-lg border border-slate-300 bg-white px-2 text-xs font-bold" />
            </div>
          )}
          <span className="shrink-0 rounded-lg bg-teal-100 px-3 py-2 text-center text-xs font-black text-teal-800">{filteredRecords.length}件</span>
        </div>
        <button
          type="button"
          onClick={() => setFiltersOpen((current) => !current)}
          className="flex min-h-11 w-full items-center justify-between rounded-xl px-2 text-sm font-black text-slate-800 lg:hidden"
        >
          <span className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4 text-teal-700" />検索・絞り込み</span>
          <span className="flex items-center gap-2">
            {activeFilterCount > 0 && <span className="rounded-full bg-teal-600 px-2 py-0.5 text-[10px] text-white">{activeFilterCount}</span>}
            {filtersOpen ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
          </span>
        </button>
        <div className={`${filtersOpen ? 'block' : 'hidden'} space-y-3 border-t border-slate-100 pt-3 lg:block lg:border-0 lg:pt-0`}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {/* Search Box */}
          <div className="relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="児童名・指導員名・日付で検索..."
              className="w-full bg-slate-50 text-xs font-medium border border-slate-300 rounded-lg p-2 pl-8 focus:bg-white focus:ring-2 focus:ring-teal-500"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-50 text-xs font-medium border border-slate-300 rounded-lg p-2 focus:bg-white focus:ring-2 focus:ring-teal-500"
          >
            <option value="all">すべての確認ステータス</option>
            <option value="未確認">未確認 (確認待ち)</option>
            <option value="確認済み">確認済み (承認完了)</option>
            <option value="要修正">要修正</option>
          </select>

          {/* Template Filter */}
          <select
            value={templateFilter}
            onChange={(e) => setTemplateFilter(e.target.value)}
            className="bg-slate-50 text-xs font-medium border border-slate-300 rounded-lg p-2 focus:bg-white focus:ring-2 focus:ring-teal-500"
          >
            <option value="all">すべてのフォーマット</option>
            <option value="平日">平日記録</option>
            <option value="休日">休日記録</option>
            <option value="カスタム">カスタム記録</option>
          </select>
        </div>
          {activeFilterCount > 0 && (
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
              <p className="text-xs font-bold text-slate-600">{filteredRecords.length}件を表示</p>
              <button type="button" onClick={clearFilters} className="min-h-9 rounded-lg px-3 text-xs font-black text-rose-700 hover:bg-rose-50">条件を解除</button>
            </div>
          )}
        </div>
      </div>

      {/* Records Table / Cards */}
      {filteredRecords.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500 space-y-3">
          <FileText className="w-10 h-10 mx-auto text-slate-300" />
          <p className="text-sm font-semibold">条件に一致する支援経過記録が見つかりませんでした。</p>
          <button
            onClick={onNewRecord}
            className="text-xs text-teal-600 font-bold hover:underline"
          >
            新規記録を入力する
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
          <div className="divide-y divide-slate-100 lg:hidden">
            {displayedRecords.map((record) => {
              const life = record.sectionAnswers?.life;
              const study = record.sectionAnswers?.study;
              const summary = study?.detailText || life?.detailText || record.synthesizedSummary || '記録内容あり';
              return (
                <article key={record.id} className="p-4">
                  <button type="button" onClick={() => openRecord(record)} className="w-full text-left">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-base font-black text-slate-950">{record.childName}</p>
                        <p className="mt-0.5 text-[11px] font-bold text-slate-500">{record.date}・{record.templateName}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black ${
                        record.approvalStatus === '確認済み'
                          ? 'bg-emerald-100 text-emerald-800'
                          : record.approvalStatus === '要修正'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-800'
                      }`}>{record.approvalStatus}</span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-600">{summary}</p>
                    <p className="mt-2 text-[10px] text-slate-500">出欠：{record.attendance || '未回答'}・記録者：{record.recorderName}</p>
                  </button>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => openRecord(record)} className="flex min-h-10 items-center justify-center gap-1 rounded-lg bg-slate-900 text-xs font-black text-white"><Eye className="h-4 w-4" />確認</button>
                    {record.approvalStatus === '要修正' && onCorrectRecord ? (
                      <button type="button" onClick={() => onCorrectRecord(record)} className="flex min-h-10 items-center justify-center gap-1 rounded-lg bg-rose-600 text-xs font-black text-white"><Wrench className="h-4 w-4" />修正</button>
                    ) : (
                      <button type="button" onClick={() => onEditRecord(record)} className="flex min-h-10 items-center justify-center gap-1 rounded-lg border border-slate-300 text-xs font-black text-slate-700"><Edit className="h-4 w-4" />再編集</button>
                    )}
                    <button type="button" onClick={() => onDuplicateRecord(record)} className="flex min-h-10 items-center justify-center gap-1 rounded-lg border border-teal-200 text-xs font-black text-teal-700"><Copy className="h-4 w-4" />再利用</button>
                    {canDeleteRecords && (
                      <button type="button" onClick={() => {
                        if (confirm('この記録を削除してもよろしいですか？')) onDeleteRecord(record.id);
                      }} className="flex min-h-10 items-center justify-center gap-1 rounded-lg border border-rose-200 text-xs font-black text-rose-700"><Trash2 className="h-4 w-4" />削除</button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                  <SortableHeader field="date" label="日付" className="w-28" rules={sortRules} onClick={toggleSort} directionLabel={sortLabel} />
                  <SortableHeader field="child" label="児童名" className="w-32" rules={sortRules} onClick={toggleSort} directionLabel={sortLabel} />
                  <SortableHeader field="attendance" label="出欠・表情" className="w-24" rules={sortRules} onClick={toggleSort} directionLabel={sortLabel} />
                  <SortableHeader field="summary" label="学習・生活要約" rules={sortRules} onClick={toggleSort} directionLabel={sortLabel} />
                  <SortableHeader field="recorder" label="記録者" className="w-28" rules={sortRules} onClick={toggleSort} directionLabel={sortLabel} />
                  <SortableHeader field="status" label="児発管確認" className="w-28 text-center" rules={sortRules} onClick={toggleSort} directionLabel={sortLabel} />
                  <th className="p-3 w-40 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayedRecords.map((r) => {
                  const life = r.sectionAnswers?.['life'];
                  const study = r.sectionAnswers?.['study'];

                  return (
                    <tr
                      key={r.id}
                      className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                      onClick={() => openRecord(r)}
                    >
                      <td className="p-3 font-mono font-bold text-slate-800 whitespace-nowrap">
                        {r.date}
                        <span className="block text-[10px] text-slate-400 font-sans font-normal">
                          {r.templateId === 'template-unified' ? '統合記録' : r.templateType}
                        </span>
                      </td>

                      <td className="p-3 font-bold text-slate-900 whitespace-nowrap">
                        {r.childName}
                      </td>

                      <td className="p-3">
                        <div className="font-semibold text-slate-800">{r.attendance}</div>
                        <div className="text-[10px] text-slate-500">{r.expressions?.join('、') || '表情未回答'}</div>
                      </td>

                      <td className="p-3">
                        <p className="text-slate-700 line-clamp-2 leading-relaxed">
                          {study?.subTitleValue
                            ? `【学習: ${study.subTitleValue}】 `
                            : ''}
                          {study?.detailText || life?.detailText || '記録内容あり'}
                        </p>
                      </td>

                      <td className="p-3 font-medium text-slate-700 whitespace-nowrap">
                        {r.recorderName}
                      </td>

                      <td className="p-3 text-center whitespace-nowrap">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-block ${
                            r.approvalStatus === '確認済み'
                              ? 'bg-emerald-100 text-emerald-800'
                              : r.approvalStatus === '要修正'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {r.approvalStatus}
                        </span>
                      </td>

                      <td
                        className="p-3 text-right space-x-1 whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => openRecord(r)}
                          className="p-1.5 hover:bg-slate-200 text-slate-700 rounded-md"
                          title="プレビュー・PDF"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onEditRecord(r)}
                          className="p-1.5 hover:bg-slate-200 text-slate-700 rounded-md"
                          title="再編集"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        {r.approvalStatus === '要修正' && onCorrectRecord && (
                          <button
                            type="button"
                            onClick={() => onCorrectRecord(r)}
                            className="inline-flex min-h-8 items-center gap-1 rounded-md bg-rose-600 px-2 text-[11px] font-black text-white hover:bg-rose-500"
                            title="指摘箇所を修正"
                          >
                            <Wrench className="h-3.5 w-3.5" />修正
                          </button>
                        )}
                        <button
                          onClick={() => onDuplicateRecord(r)}
                          className="p-1.5 hover:bg-slate-200 text-teal-700 rounded-md"
                          title="本日の記録として再利用"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        {canDeleteRecords && <button
                          onClick={() => {
                            if (confirm('この記録を削除してもよろしいですか？')) {
                              onDeleteRecord(r.id);
                            }
                          }}
                          className="p-1.5 hover:bg-rose-100 text-rose-600 rounded-md"
                          title="削除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {pdfChildId && monthlyPdfRecords.length > 0 && (
        <MonthlyRecordsPDFDocument id={monthlyPdfTargetId} records={monthlyPdfRecords} childName={pdfChildName} month={pdfMonth} />
      )}
    </div>
  );
};

function SortableHeader({ field, label, className = '', rules, onClick, directionLabel }: {
  field: RecordSortField;
  label: string;
  className?: string;
  rules: RecordSortRule[];
  onClick: (field: RecordSortField) => void;
  directionLabel: (field: RecordSortField, direction: 'asc' | 'desc') => string;
}) {
  const index = rules.findIndex((rule) => rule.field === field);
  const rule = rules[index];
  return (
    <th className={`p-1.5 ${className}`}>
      <button type="button" onClick={() => onClick(field)} className="min-h-10 w-full rounded-lg px-1.5 text-left hover:bg-teal-50 hover:text-teal-900" title="選択順が並べ替えの優先順になります">
        <span className="block">{label}{index >= 0 ? ` ${index + 1}` : ''}</span>
        <span className="block text-[8px] font-black text-teal-700">{rule ? directionLabel(field, rule.direction) : '選択して並べ替え'}</span>
      </button>
    </th>
  );
}
