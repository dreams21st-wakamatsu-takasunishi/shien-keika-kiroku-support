import React from 'react';
import { 
  Siren, 
  X, 
  MapPin, 
  CheckCircle2, 
  Clock, 
  Users, 
  ShieldAlert, 
  AlertTriangle 
} from 'lucide-react';
import { EmergencyAlert, Staff } from '../types';
import { SOS_PATTERNS } from '../utils/notification';

interface EmergencyHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  alerts: EmergencyAlert[];
  staffList: Staff[];
  onResolveSOS: (alertId: string, resolvedByStaffName: string) => void;
}

export const EmergencyHistoryModal: React.FC<EmergencyHistoryModalProps> = ({
  isOpen,
  onClose,
  alerts,
  staffList,
  onResolveSOS,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-800 to-slate-900 px-5 py-4 text-white flex items-center justify-between border-b border-red-700">
          <div className="flex items-center space-x-2.5">
            <Siren className="w-5 h-5 text-yellow-300" />
            <h2 className="text-base sm:text-lg font-bold">緊急SOS一斉通知 配信・履歴ログ</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1 bg-gray-50">
          {alerts.length === 0 ? (
            <div className="text-center py-12 text-gray-500 space-y-2">
              <ShieldAlert className="w-12 h-12 text-gray-300 mx-auto" />
              <p className="text-sm font-medium">これまでに記録された緊急SOSはありません</p>
            </div>
          ) : (
            alerts.map((alert) => {
              const patternDetail = SOS_PATTERNS[alert.pattern] || SOS_PATTERNS.other;
              const isResolved = alert.status === 'resolved';

              return (
                <div
                  key={alert.id}
                  className={`bg-white rounded-xl p-4 border shadow-xs space-y-3 transition-all ${
                    isResolved
                      ? 'border-gray-200 text-gray-700'
                      : 'border-red-500 bg-red-50/20 ring-2 ring-red-500/20'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-2">
                    <div className="flex items-center space-x-2">
                      <span className="text-xl">{patternDetail.icon}</span>
                      <span className="font-extrabold text-sm text-gray-900">
                        【{alert.patternLabel}】
                      </span>
                      <span
                        className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                          isResolved
                            ? 'bg-gray-100 text-gray-600 border border-gray-300'
                            : 'bg-red-600 text-white animate-pulse'
                        }`}
                      >
                        {isResolved ? '解除・解決済み' : '🚨 発報中'}
                      </span>
                    </div>

                    <span className="text-xs text-gray-500 font-mono">
                      {alert.createdAt}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-gray-500">発信者:</span>{' '}
                      <span className="font-bold text-gray-800">{alert.senderStaffName} ({alert.senderRole})</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <MapPin className="w-3.5 h-3.5 text-red-600 shrink-0" />
                      <span className="text-gray-500">場所:</span>{' '}
                      <span className="font-bold text-gray-900">{alert.location}</span>
                    </div>
                  </div>

                  {alert.description && (
                    <p className="text-xs font-medium bg-gray-50 p-2 rounded border border-gray-200 text-gray-800">
                      メモ: {alert.description}
                    </p>
                  )}

                  {/* Staff Confirmation List */}
                  <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-200 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between text-gray-600 font-semibold">
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-blue-800" />
                        全登録職員の既読・確認状況
                      </span>
                      <span>
                        {alert.readByStaffIds.length} / {staffList.length}名 確認
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {staffList.map((s) => {
                        const isAck = alert.readByStaffIds.includes(s.id);
                        return (
                          <span
                            key={s.id}
                            className={`text-[10px] px-2 py-0.5 rounded border ${
                              isAck
                                ? 'bg-emerald-100 text-emerald-900 border-emerald-300 font-bold'
                                : 'bg-white text-gray-400 border-gray-200'
                            }`}
                          >
                            {isAck ? '✓ ' : '・'}{s.name}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  {isResolved && alert.resolvedAt && (
                    <div className="text-[11px] text-gray-500 flex items-center justify-between pt-1">
                      <span>対応完了・解除時間: {alert.resolvedAt}</span>
                      <span>解除担当: {alert.resolvedByStaffName || '管理者'}</span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="bg-gray-100 px-5 py-3 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="bg-gray-800 hover:bg-gray-900 text-white font-bold text-xs px-4 py-2 rounded-xl transition-colors cursor-pointer"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};
