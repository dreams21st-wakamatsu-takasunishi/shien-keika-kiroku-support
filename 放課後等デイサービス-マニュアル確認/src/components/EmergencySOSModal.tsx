import React, { useState } from 'react';
import { 
  Siren, 
  X, 
  MapPin, 
  Send, 
  AlertTriangle, 
  Clock, 
  Bell, 
  Building
} from 'lucide-react';
import { Staff, EmergencySOSPattern, FacilityConfig } from '../types';
import { SOS_PATTERNS, requestNotificationPermission } from '../utils/notification';

interface EmergencySOSModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentStaff: Staff;
  staffList: Staff[];
  facilityConfig: FacilityConfig;
  onBroadcastSOS: (
    pattern: EmergencySOSPattern,
    location: string,
    description: string
  ) => void;
}

export const EmergencySOSModal: React.FC<EmergencySOSModalProps> = ({
  isOpen,
  onClose,
  currentStaff,
  staffList,
  facilityConfig,
  onBroadcastSOS,
}) => {
  const [selectedPattern, setSelectedPattern] = useState<EmergencySOSPattern>('runaway');
  const [location, setLocation] = useState<string>('1階 療育室');
  const [customLocation, setCustomLocation] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [notificationPermission, setNotificationPermission] = useState<string>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  );

  if (!isOpen) return null;

  const quickLocations = ['1階 療育室', '2階 訓練室', '玄関前・駐車場', '近隣公園', '送迎車内', 'トイレ前'];

  const handleSend = () => {
    const finalLocation = customLocation.trim() ? customLocation.trim() : location;
    onBroadcastSOS(selectedPattern, finalLocation, description);
    onClose();
  };

  const handleEnablePermission = async () => {
    const perm = await requestNotificationPermission();
    setNotificationPermission(perm);
  };

  const currentPatternDetail = SOS_PATTERNS[selectedPattern];

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white border-2 border-red-500 rounded-2xl w-full max-w-2xl shadow-2xl text-gray-900 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-red-700 px-5 py-4 border-b border-red-800 flex items-center justify-between text-white">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-red-900 border border-red-400 flex items-center justify-center shadow-md animate-bounce">
              <Siren className="w-6 h-6 text-yellow-300" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-extrabold text-white">
                  全職員一斉 緊急SOS発報
                </h2>
                <span className="bg-red-900 text-yellow-300 text-[11px] font-black px-2 py-0.5 rounded-full border border-red-500">
                  即時全員通知
                </span>
              </div>
              <p className="text-xs text-red-100">
                登録中の全職員 ({staffList.length}名) の画面・デバイスへポップアップ通知を一斉送信します
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-red-200 hover:text-white hover:bg-red-800 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Device Notification Status Banner */}
        {notificationPermission !== 'granted' && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center justify-between text-xs text-amber-900 font-medium">
            <div className="flex items-center space-x-2">
              <Bell className="w-4 h-4 text-amber-600 shrink-0" />
              <span>デスクトップ/スマホのポップアップ通知を有効にすると、画面外でもSOSが届きます</span>
            </div>
            <button
              onClick={handleEnablePermission}
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-3 py-1 rounded shadow-xs text-xs whitespace-nowrap cursor-pointer transition-colors"
            >
              通知許可を有効化
            </button>
          </div>
        )}

        <div className="p-5 overflow-y-auto space-y-5 text-sm text-gray-800 flex-1 bg-gray-50/50">
          {/* Sender Info */}
          <div className="bg-white border border-gray-200 rounded-xl p-3 flex items-center justify-between text-xs">
            <span className="text-gray-500 font-medium">発信担当スタッフ:</span>
            <div className="flex items-center space-x-2 font-bold text-gray-900">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>{currentStaff.name} ({currentStaff.role})</span>
            </div>
          </div>

          {/* Pattern Selection Grid */}
          <div>
            <label className="block text-xs font-bold text-gray-900 mb-2 flex items-center justify-between">
              <span>1. SOSの内容パターンを選択 <span className="text-red-600">*</span></span>
              <span className="text-[11px] font-normal text-gray-500">内容に応じた初期対応ガイドが自動付与されます</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {(Object.keys(SOS_PATTERNS) as EmergencySOSPattern[]).map((key) => {
                const item = SOS_PATTERNS[key];
                const isSelected = selectedPattern === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedPattern(key)}
                    className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                      isSelected
                        ? 'border-red-600 bg-red-50 text-red-950 ring-2 ring-red-500/30 shadow-md font-bold'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-red-300 hover:bg-red-50/30'
                    }`}
                  >
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="text-xl">{item.icon}</span>
                      <span className="text-xs font-bold leading-tight">{item.label}</span>
                    </div>
                    {isSelected && (
                      <span className="text-[10px] font-semibold text-red-600 flex items-center gap-1 mt-1">
                        <Siren className="w-3 h-3" /> 選択中
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Pattern Guidance Preview */}
          <div className="bg-red-50 border border-red-200 rounded-xl p-3.5 space-y-1.5 text-xs">
            <div className="flex items-center space-x-2 text-red-900 font-extrabold">
              <span className="text-base">{currentPatternDetail.icon}</span>
              <span>{currentPatternDetail.label} の一斉通知内容</span>
            </div>
            <p className="text-red-950 font-medium leading-relaxed bg-white/70 p-2 rounded border border-red-100">
              {currentPatternDetail.summaryAction}
            </p>
          </div>

          {/* Location Selection */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-gray-900 flex items-center space-x-1">
              <MapPin className="w-4 h-4 text-red-600" />
              <span>2. 発生場所を指定</span>
            </label>
            
            <div className="flex flex-wrap gap-1.5 mb-2">
              {quickLocations.map((loc) => (
                <button
                  key={loc}
                  type="button"
                  onClick={() => {
                    setLocation(loc);
                    setCustomLocation('');
                  }}
                  className={`text-xs px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                    location === loc && !customLocation
                      ? 'bg-blue-900 text-white font-bold border-blue-900 shadow-xs'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
                  }`}
                >
                  {loc}
                </button>
              ))}
            </div>

            <input
              type="text"
              placeholder="またはその他の場所を直接入力 (例: 送迎ルートB、近隣ファミマ前など)"
              value={customLocation}
              onChange={(e) => setCustomLocation(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-900 font-medium focus:outline-none focus:border-red-500"
            />
          </div>

          {/* Description Memo */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-gray-900">
              3. 現場の補足・状況メモ（任意）
            </label>
            <textarea
              rows={2}
              placeholder="例: たろう君がパニックで飛び出しました。近くの指導員は急行をお願いします！"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-xs text-gray-900 font-medium focus:outline-none focus:border-red-500"
            />
          </div>

          {/* Target Staff Notice */}
          <div className="bg-gray-100 border border-gray-200 rounded-xl p-3 flex items-center justify-between text-xs text-gray-700">
            <div className="flex items-center space-x-2">
              <Building className="w-4 h-4 text-blue-900 shrink-0" />
              <span>対象: {facilityConfig.facilityName} 登録全職員 ({staffList.map(s => s.name).join('・')})</span>
            </div>
            <span className="font-bold text-red-600 text-[11px]">即時発信</span>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="bg-gray-100 px-5 py-3.5 border-t border-gray-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-200 transition-colors cursor-pointer"
          >
            キャンセル
          </button>

          <button
            type="button"
            onClick={handleSend}
            className="bg-red-600 hover:bg-red-700 active:scale-98 text-white font-black text-xs sm:text-sm px-6 py-2.5 rounded-xl shadow-lg transition-all flex items-center space-x-2 border border-red-500 animate-pulse cursor-pointer"
          >
            <Send className="w-4 h-4" />
            <span>登録職員全員へ緊急SOSを一斉送信</span>
          </button>
        </div>
      </div>
    </div>
  );
};
