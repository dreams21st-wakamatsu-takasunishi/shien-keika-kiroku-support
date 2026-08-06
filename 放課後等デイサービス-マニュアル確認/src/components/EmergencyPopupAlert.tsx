import React, { useState } from 'react';
import { 
  Siren, 
  MapPin, 
  CheckCircle2, 
  PhoneCall, 
  Users, 
  Clock, 
  AlertOctagon, 
  X, 
  ShieldAlert, 
  ArrowRight,
  Check
} from 'lucide-react';
import { EmergencyAlert, Staff, FacilityConfig } from '../types';
import { SOS_PATTERNS } from '../utils/notification';

interface EmergencyPopupAlertProps {
  activeAlert: EmergencyAlert | null;
  currentStaff: Staff;
  staffList: Staff[];
  facilityConfig: FacilityConfig;
  onAcknowledgeSOS: (alertId: string, staffId: string) => void;
  onResolveSOS: (alertId: string, resolvedByStaffName: string) => void;
  onOpenFullEmergencyGuide: () => void;
}

export const EmergencyPopupAlert: React.FC<EmergencyPopupAlertProps> = ({
  activeAlert,
  currentStaff,
  staffList,
  facilityConfig,
  onAcknowledgeSOS,
  onResolveSOS,
  onOpenFullEmergencyGuide,
}) => {
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [showResolveConfirm, setShowResolveConfirm] = useState<boolean>(false);

  if (!activeAlert || activeAlert.status !== 'active') {
    return null;
  }

  const patternDetail = SOS_PATTERNS[activeAlert.pattern] || SOS_PATTERNS.other;
  const isAcknowledgedByMe = activeAlert.readByStaffIds.includes(currentStaff.id);
  const ackCount = activeAlert.readByStaffIds.length;

  const handleAck = () => {
    onAcknowledgeSOS(activeAlert.id, currentStaff.id);
  };

  const handleResolve = () => {
    onResolveSOS(activeAlert.id, currentStaff.name);
    setShowResolveConfirm(false);
  };

  if (isMinimized) {
    return (
      <div className="fixed bottom-4 right-4 z-50 bg-red-700 text-white p-3 rounded-2xl shadow-2xl border-2 border-yellow-300 flex items-center space-x-3 animate-pulse">
        <Siren className="w-6 h-6 text-yellow-300 animate-bounce" />
        <div className="text-xs font-bold">
          <div className="text-yellow-200 text-[10px]">🚨 緊急SOS発報中 ({activeAlert.patternLabel})</div>
          <div>{activeAlert.location} - {activeAlert.senderStaffName}</div>
        </div>
        <button
          onClick={() => setIsMinimized(false)}
          className="bg-white text-red-900 font-extrabold text-xs px-2.5 py-1 rounded-lg hover:bg-yellow-100 cursor-pointer"
        >
          全画面確認
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
      <div className="bg-white border-4 border-red-600 rounded-3xl w-full max-w-3xl shadow-2xl text-gray-900 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Banner Header */}
        <div className="bg-gradient-to-r from-red-700 via-red-800 to-rose-900 p-4 sm:p-5 text-white flex items-center justify-between border-b-4 border-yellow-400">
          <div className="flex items-center space-x-3.5">
            <div className="w-12 h-12 rounded-2xl bg-red-950 border-2 border-yellow-300 flex items-center justify-center shadow-lg animate-bounce shrink-0">
              <Siren className="w-7 h-7 text-yellow-300" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="bg-yellow-400 text-red-950 text-xs font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                  全職員一斉緊急SOS
                </span>
                <span className="text-xs text-red-100 font-mono">
                  {activeAlert.createdAt} 発信
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white mt-1 flex items-center gap-2">
                <span>{patternDetail.icon}</span>
                <span>【{activeAlert.patternLabel}】</span>
              </h2>
            </div>
          </div>

          <button
            onClick={() => setIsMinimized(true)}
            className="text-xs bg-red-900/80 hover:bg-red-950 text-red-100 border border-red-500 px-3 py-1.5 rounded-xl font-bold transition-colors cursor-pointer"
          >
            最小化
          </button>
        </div>

        {/* SOS Body Content */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-4 text-gray-900 flex-1 bg-gradient-to-b from-red-50/50 to-white">
          {/* Key Facts Card */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Sender */}
            <div className="bg-white border border-red-200 rounded-2xl p-3.5 shadow-xs space-y-1">
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">発信者</span>
              <div className="font-extrabold text-base text-gray-900 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-ping" />
                <span>{activeAlert.senderStaffName}</span>
                <span className="text-xs font-normal text-gray-600">({activeAlert.senderRole})</span>
              </div>
            </div>

            {/* Location */}
            <div className="bg-white border border-red-200 rounded-2xl p-3.5 shadow-xs space-y-1">
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">発生場所</span>
              <div className="font-extrabold text-base text-red-700 flex items-center gap-1.5">
                <MapPin className="w-5 h-5 text-red-600 shrink-0" />
                <span className="truncate">{activeAlert.location}</span>
              </div>
            </div>
          </div>

          {/* Situation Memo */}
          {activeAlert.description && (
            <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 space-y-1">
              <span className="text-xs font-extrabold text-amber-900 flex items-center gap-1">
                <AlertOctagon className="w-4 h-4 text-amber-600" /> 現場からの補足メッセージ:
              </span>
              <p className="text-sm font-bold text-amber-950 leading-relaxed">
                {activeAlert.description}
              </p>
            </div>
          )}

          {/* Pattern-Specific Initial Action Guide */}
          <div className="bg-red-600 text-white rounded-2xl p-4 shadow-md space-y-3">
            <div className="flex items-center justify-between border-b border-red-500 pb-2">
              <span className="text-xs font-extrabold text-yellow-300 flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4" /> 【パターン別初動アクションガイド】
              </span>
              <button
                onClick={onOpenFullEmergencyGuide}
                className="text-[11px] bg-red-800 hover:bg-red-900 text-yellow-200 px-2.5 py-1 rounded-lg font-bold border border-red-400 transition-colors cursor-pointer"
              >
                詳細マニュアルを見る ➔
              </button>
            </div>

            <p className="text-xs sm:text-sm font-bold text-white leading-relaxed bg-red-800/80 p-3 rounded-xl border border-red-400">
              {patternDetail.summaryAction}
            </p>

            <div className="space-y-1 text-xs">
              <span className="font-bold text-red-200">優先実行手順:</span>
              <ol className="list-decimal list-inside space-y-1 font-semibold text-white/95">
                {patternDetail.steps.map((step, idx) => (
                  <li key={idx} className="leading-snug">{step}</li>
                ))}
              </ol>
            </div>
          </div>

          {/* Emergency Dial Buttons */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
            <a
              href={`tel:${facilityConfig.firePhone.split('（')[0]}`}
              className="bg-red-700 hover:bg-red-800 text-white font-extrabold py-2.5 px-3 rounded-xl shadow-sm text-center flex items-center justify-center gap-1.5 transition-colors"
            >
              <PhoneCall className="w-4 h-4" />
              <span>救急 119番</span>
            </a>

            <a
              href={`tel:${facilityConfig.policePhone.split('（')[0]}`}
              className="bg-blue-900 hover:bg-blue-800 text-white font-extrabold py-2.5 px-3 rounded-xl shadow-sm text-center flex items-center justify-center gap-1.5 transition-colors"
            >
              <PhoneCall className="w-4 h-4" />
              <span>警察 110番</span>
            </a>

            <a
              href={`tel:${facilityConfig.mainPhone}`}
              className="col-span-2 sm:col-span-1 bg-gray-100 hover:bg-gray-200 text-gray-900 font-extrabold py-2.5 px-3 rounded-xl border border-gray-300 text-center flex items-center justify-center gap-1.5 transition-colors"
            >
              <PhoneCall className="w-4 h-4 text-blue-800" />
              <span>施設本部通報</span>
            </a>
          </div>

          {/* Confirmation & Staff Response Tracker */}
          <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-gray-800">
              <span className="flex items-center gap-1.5">
                <Users className="w-4 h-4 text-blue-800" />
                登録職員の確認・駆けつけ状況
              </span>
              <span className="text-blue-900 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                {ackCount} / {staffList.length}名 確認済み
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {staffList.map((s) => {
                const isAck = activeAlert.readByStaffIds.includes(s.id);
                return (
                  <span
                    key={s.id}
                    className={`text-[11px] px-2.5 py-1 rounded-lg border font-semibold flex items-center gap-1 ${
                      isAck
                        ? 'bg-emerald-50 text-emerald-900 border-emerald-300 font-bold'
                        : 'bg-gray-100 text-gray-500 border-gray-200'
                    }`}
                  >
                    {isAck ? <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> : <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
                    <span>{s.name}</span>
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="bg-gray-100 p-4 sm:p-5 border-t border-gray-200 flex flex-wrap items-center justify-between gap-3">
          {/* Resolve Dialog Toggle */}
          {!showResolveConfirm ? (
            <button
              onClick={() => setShowResolveConfirm(true)}
              className="bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs font-bold px-4 py-2.5 rounded-xl transition-colors cursor-pointer"
            >
              SOS解除・安全確認完了
            </button>
          ) : (
            <div className="flex items-center space-x-2 bg-amber-100 border border-amber-300 p-1.5 rounded-xl">
              <span className="text-xs font-bold text-amber-950 px-2">本当にSOSを解除しますか？</span>
              <button
                onClick={handleResolve}
                className="bg-red-700 hover:bg-red-800 text-white font-bold text-xs px-3 py-1.5 rounded-lg cursor-pointer"
              >
                はい、解除する
              </button>
              <button
                onClick={() => setShowResolveConfirm(false)}
                className="bg-gray-200 text-gray-800 font-bold text-xs px-2.5 py-1.5 rounded-lg cursor-pointer"
              >
                いいえ
              </button>
            </div>
          )}

          {/* Current Staff Acknowledge Button */}
          {!isAcknowledgedByMe ? (
            <button
              onClick={handleAck}
              className="bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-black text-sm px-6 py-3 rounded-xl shadow-lg transition-all flex items-center space-x-2 border border-emerald-500 cursor-pointer animate-pulse"
            >
              <CheckCircle2 className="w-5 h-5" />
              <span>【了解・現場急行中】確認ボタンを押す</span>
            </button>
          ) : (
            <div className="flex items-center space-x-2 text-emerald-800 font-bold bg-emerald-100 border border-emerald-300 px-4 py-2.5 rounded-xl text-xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>あなたの確認（了解）は送信済みです</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
