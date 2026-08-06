import React, { useState } from 'react';
import { 
  Users, 
  CheckCircle2, 
  Clock, 
  Send, 
  BarChart3, 
  ShieldAlert, 
  Download, 
  Search, 
  AlertCircle,
  Award
} from 'lucide-react';
import { Manual, Staff, ReadSignature, MasterOptions } from '../types';

interface DashboardViewProps {
  manuals: Manual[];
  staffList: Staff[];
  signatures: ReadSignature[];
  masterOptions?: MasterOptions;
  onRemindStaff: (staffName: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  manuals,
  staffList,
  signatures,
  masterOptions,
  onRemindStaff,
}) => {
  const [roleFilter, setRoleFilter] = useState<string>('all');

  const roleOptions = masterOptions?.roles || [
    '児童発達支援管理責任者',
    '児童指導員',
    '保育士',
    '送迎ドライバー',
    '看護師・医療スタッフ',
  ];

  // Total possible read slots = staff.length * manuals.length
  const totalSlots = staffList.length * manuals.length;
  const totalReadCount = staffList.reduce(
    (acc, staff) => acc + staff.readManualIds.length,
    0
  );
  const overallRate = totalSlots > 0 ? Math.round((totalReadCount / totalSlots) * 100) : 0;

  // Critical manuals overall read rate
  const criticalManuals = manuals.filter((m) => m.severity === 'critical');
  const totalCriticalSlots = staffList.length * criticalManuals.length;
  const criticalReadCount = staffList.reduce((acc, staff) => {
    return acc + criticalManuals.filter((m) => staff.readManualIds.includes(m.id)).length;
  }, 0);
  const criticalRate = totalCriticalSlots > 0 ? Math.round((criticalReadCount / totalCriticalSlots) * 100) : 0;

  const filteredStaff = roleFilter === 'all' 
    ? staffList 
    : staffList.filter((s) => s.role === roleFilter);

  const handlePrintExport = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Top Facility Summary KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Overall Completion Rate Card */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-center justify-between shadow-sm">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-gray-500">施設全体 マニュアル確認率</span>
            <div className="text-2xl sm:text-3xl font-extrabold text-blue-900">
              {overallRate}%
            </div>
            <p className="text-[11px] text-gray-500">
              全{totalSlots}件中 {totalReadCount}件確認済み
            </p>
          </div>
          <div className="w-14 h-14 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-800">
            <BarChart3 className="w-7 h-7" />
          </div>
        </div>

        {/* Emergency Manuals Rate Card */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-center justify-between shadow-sm">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-gray-500">緊急・最重要規程 確認率</span>
            <div className="text-2xl sm:text-3xl font-extrabold text-red-700">
              {criticalRate}%
            </div>
            <p className="text-[11px] text-gray-500">
              緊急マニュアル {criticalReadCount}/{totalCriticalSlots}件 完了
            </p>
          </div>
          <div className="w-14 h-14 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center text-red-700">
            <ShieldAlert className="w-7 h-7" />
          </div>
        </div>

        {/* Active Staff Count Card */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-center justify-between shadow-sm">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-gray-500">対象スタッフ人数</span>
            <div className="text-2xl sm:text-3xl font-extrabold text-gray-900">
              {staffList.length} <span className="text-sm font-normal text-gray-500">名</span>
            </div>
            <p className="text-[11px] text-gray-500">児発管・指導員・ドライバー・看護師</p>
          </div>
          <div className="w-14 h-14 rounded-xl bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-700">
            <Users className="w-7 h-7" />
          </div>
        </div>
      </div>

      {/* Staff Completion Breakdown Header */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 pb-4">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-gray-900 flex items-center gap-2">
              <Award className="w-5 h-5 text-blue-800" /> スタッフ別 マニュアル理解・確認進捗一覧
            </h2>
            <p className="text-xs text-gray-500">
              各スタッフの既読状況・完了パーセンテージおよび未確認項目のリマインド管理
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="bg-gray-50 border border-gray-300 text-gray-800 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-blue-600 font-medium cursor-pointer"
            >
              <option value="all">すべての職種</option>
              {roleOptions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>

            <button
              onClick={handlePrintExport}
              className="bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-300 text-xs font-semibold px-3 py-2 rounded-lg flex items-center space-x-1.5 transition-colors"
            >
              <Download className="w-4 h-4 text-blue-800" />
              <span>印刷・レポート出力</span>
            </button>
          </div>
        </div>

        {/* Staff Table / Cards */}
        <div className="space-y-3">
          {filteredStaff.map((staff) => {
            const readCount = staff.readManualIds.length;
            const percent = Math.round((readCount / manuals.length) * 100);
            const unreadManuals = manuals.filter((m) => !staff.readManualIds.includes(m.id));

            return (
              <div
                key={staff.id}
                className="bg-gray-50 border border-gray-200 rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                {/* Staff info */}
                <div className="flex items-center space-x-3 min-w-[200px]">
                  <img
                    src={staff.avatar}
                    alt={staff.name}
                    className="w-11 h-11 rounded-full object-cover border border-gray-300 shadow-sm"
                  />
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-gray-900 text-sm">{staff.name}</span>
                      <span className="text-[10px] bg-gray-200 text-gray-800 font-semibold px-2 py-0.5 rounded">
                        {staff.role}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500">ID: {staff.employeeCode} | 最終署名: {staff.lastReadAt || '未確認'}</p>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="flex-1 max-w-md">
                  <div className="flex justify-between items-center text-xs mb-1">
                    <span className="text-gray-600 font-medium">確認進捗</span>
                    <span className="font-bold text-blue-900">
                      {readCount} / {manuals.length} 件 ({percent}%)
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 rounded-full ${
                        percent === 100
                          ? 'bg-emerald-600'
                          : percent >= 70
                          ? 'bg-blue-600'
                          : 'bg-amber-500'
                      }`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>

                {/* Unread Alerts & Action */}
                <div className="flex items-center space-x-3 shrink-0 justify-between md:justify-end">
                  {unreadManuals.length > 0 ? (
                    <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg flex items-center space-x-1 font-semibold">
                      <Clock className="w-3.5 h-3.5 text-amber-600" />
                      <span>未読: {unreadManuals.length}件</span>
                    </div>
                  ) : (
                    <div className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg flex items-center space-x-1 font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>全マニュアル確認完了</span>
                    </div>
                  )}

                  {unreadManuals.length > 0 && (
                    <button
                      onClick={() => onRemindStaff(staff.name)}
                      className="bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center space-x-1"
                    >
                      <Send className="w-3.5 h-3.5 text-amber-700" />
                      <span>リマインド送信</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
