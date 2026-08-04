import React, { useState } from 'react';
import { SupportRecord, ApprovalStatus } from '../types';
import { Search, FileText, Clock, Eye, Edit, Copy, Trash2, Download, Wrench, SlidersHorizontal, X } from 'lucide-react';
import { downloadRecordsCsv } from '../utils/recordCsv';
import { getLocalDateString } from '../utils/weekdays';

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
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm || '');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [templateFilter, setTemplateFilter] = useState<string>('all');
  const today = getLocalDateString();
  const [dateMode, setDateMode] = useState<'day' | 'range'>('day');
  const [selectedDate, setSelectedDate] = useState(today);
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [filtersOpen, setFiltersOpen] = useState(false);

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
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4">
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

        <div className="flex w-full gap-2 md:w-auto">
          <button
            type="button"
            disabled={filteredRecords.length === 0}
            onClick={() => downloadRecordsCsv(filteredRecords)}
            className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-xs font-bold text-slate-700 disabled:opacity-40 md:flex-none"
          >
            <Download className="h-4 w-4" />表示中をCSV出力
          </button>
          <button
            onClick={onNewRecord}
            className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 text-xs font-bold text-white shadow-xs transition-all hover:bg-teal-500 md:flex-none"
          >
            新規記録を入力する
          </button>
        </div>
      </div>

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
            {filteredRecords.map((record) => {
              const life = record.sectionAnswers?.life;
              const study = record.sectionAnswers?.study;
              const summary = study?.detailText || life?.detailText || record.synthesizedSummary || '記録内容あり';
              return (
                <article key={record.id} className="p-4">
                  <button type="button" onClick={() => onSelectRecord(record)} className="w-full text-left">
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
                    <button type="button" onClick={() => onSelectRecord(record)} className="flex min-h-10 items-center justify-center gap-1 rounded-lg bg-slate-900 text-xs font-black text-white"><Eye className="h-4 w-4" />確認</button>
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
                  <th className="p-3 w-28">日付</th>
                  <th className="p-3 w-32">児童名</th>
                  <th className="p-3 w-24">出欠・表情</th>
                  <th className="p-3">学習・生活要約</th>
                  <th className="p-3 w-28">記録者</th>
                  <th className="p-3 w-28 text-center">児発管確認</th>
                  <th className="p-3 w-40 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRecords.map((r) => {
                  const life = r.sectionAnswers?.['life'];
                  const study = r.sectionAnswers?.['study'];

                  return (
                    <tr
                      key={r.id}
                      className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                      onClick={() => onSelectRecord(r)}
                    >
                      <td className="p-3 font-mono font-bold text-slate-800 whitespace-nowrap">
                        {r.date}
                        <span className="block text-[10px] text-slate-400 font-sans font-normal">
                          {r.templateType}
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
                          onClick={() => onSelectRecord(r)}
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
    </div>
  );
};
