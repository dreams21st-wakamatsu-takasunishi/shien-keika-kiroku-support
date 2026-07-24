import React, { useState } from 'react';
import { SupportRecord, ApprovalStatus } from '../types';
import { Search, Filter, Calendar, FileText, CheckCircle2, AlertCircle, Clock, Eye, Edit, Copy, Trash2, Download } from 'lucide-react';

interface RecordListProps {
  records: SupportRecord[];
  initialSearchTerm?: string;
  onSelectRecord: (record: SupportRecord) => void;
  onEditRecord: (record: SupportRecord) => void;
  onDuplicateRecord: (record: SupportRecord) => void;
  onDeleteRecord: (recordId: string) => void;
  onNewRecord: () => void;
}

export const RecordList: React.FC<RecordListProps> = ({
  records,
  initialSearchTerm,
  onSelectRecord,
  onEditRecord,
  onDuplicateRecord,
  onDeleteRecord,
  onNewRecord,
}) => {
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm || '');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [templateFilter, setTemplateFilter] = useState<string>('all');

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

    return matchesSearch && matchesStatus && matchesTemplate;
  });

  const unapprovedCount = records.filter((r) => r.approvalStatus === '未確認').length;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Top Header & Quick Stats */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-slate-900">支援経過記録 データベース</h2>
            {unapprovedCount > 0 && (
              <span className="bg-amber-100 text-amber-800 border border-amber-300 text-xs font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> 児発管確認待ち {unapprovedCount}件
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            過去の支援経過記録の閲覧・再編集・児発管フィードバック確認・PDF出力が行えます
          </p>
        </div>

        <button
          onClick={onNewRecord}
          className="bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold px-4 py-2.5 rounded-lg shadow-xs transition-all flex items-center gap-2"
        >
          新規記録を入力する
        </button>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
          <div className="overflow-x-auto">
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
                        <button
                          onClick={() => onDuplicateRecord(r)}
                          className="p-1.5 hover:bg-slate-200 text-teal-700 rounded-md"
                          title="本日の記録として再利用"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm('この記録を削除してもよろしいですか？')) {
                              onDeleteRecord(r.id);
                            }
                          }}
                          className="p-1.5 hover:bg-rose-100 text-rose-600 rounded-md"
                          title="削除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
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
