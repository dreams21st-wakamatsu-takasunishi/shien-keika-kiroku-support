import React from 'react';
import { 
  BookOpen, 
  BarChart3, 
  AlertTriangle, 
  Bot, 
  ShieldAlert, 
  Building2, 
  UserCheck, 
  HelpCircle,
  MessageSquareHeart,
  Siren,
  Bell,
  History
} from 'lucide-react';
import { Staff, FacilityConfig } from '../types';

interface NavbarProps {
  activeTab: 'manuals' | 'support-guide' | 'dashboard' | 'incidents' | 'ai-consult';
  setActiveTab: (tab: 'manuals' | 'support-guide' | 'dashboard' | 'incidents' | 'ai-consult') => void;
  staffList: Staff[];
  currentStaff: Staff;
  setCurrentStaff: (staff: Staff) => void;
  facilityConfig: FacilityConfig;
  onOpenEmergency: () => void;
  onOpenBroadcastSOS: () => void;
  onOpenSOSHistory: () => void;
  onOpenSetup: () => void;
  unreadCountForCurrentStaff: number;
  activeAlertCount: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  staffList,
  currentStaff,
  setCurrentStaff,
  facilityConfig,
  onOpenEmergency,
  onOpenBroadcastSOS,
  onOpenSOSHistory,
  onOpenSetup,
  unreadCountForCurrentStaff,
  activeAlertCount,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-blue-900 text-white shadow-md border-b-4 border-blue-700">
      {/* Top Banner with Facility Title and Action Triggers */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex flex-wrap items-center justify-between gap-3">
        {/* Left Branding */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-blue-800 border border-blue-600 flex items-center justify-center text-blue-200 font-bold shadow-inner">
            <Building2 className="w-5 h-5 text-blue-100" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-white">
                {facilityConfig.facilityName}
              </h1>
              <span className="bg-blue-800 text-blue-200 border border-blue-600 text-[11px] font-medium px-2.5 py-0.5 rounded-full hidden sm:inline-block">
                放課後等デイサービス 業務マニュアル
              </span>
            </div>
            <p className="text-xs text-blue-200/80 hidden sm:block">
              安全管理・緊急時対応マニュアル確認 ＆ 全職員一斉SOS通知
            </p>
          </div>
        </div>

        {/* Right Controls: Staff Switcher & SOS */}
        <div className="flex items-center space-x-2 sm:space-x-2.5">
          {/* Current Staff Switcher */}
          <div className="flex items-center bg-blue-950/80 border border-blue-700/80 rounded-lg px-2 py-1">
            <UserCheck className="w-3.5 h-3.5 text-blue-300 mr-1.5 shrink-0" />
            <div className="text-xs">
              <div className="text-[9px] text-blue-300/80 leading-none mb-0.5">操作スタッフ</div>
              <select
                value={currentStaff.id}
                onChange={(e) => {
                  const selected = staffList.find((s) => s.id === e.target.value);
                  if (selected) setCurrentStaff(selected);
                }}
                className="bg-transparent text-white font-semibold focus:outline-none cursor-pointer text-xs"
              >
                {staffList.map((s) => (
                  <option key={s.id} value={s.id} className="bg-blue-900 text-white">
                    {s.name} ({s.role})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Setup / Requirements Q&A Trigger */}
          <button
            onClick={onOpenSetup}
            className="flex items-center space-x-1 bg-blue-800/80 hover:bg-blue-800 text-blue-100 border border-blue-600 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
            title="施設設定・要件確認"
          >
            <HelpCircle className="w-3.5 h-3.5 text-amber-300" />
            <span className="hidden lg:inline">設定</span>
          </button>

          {/* SOS History Button */}
          <button
            onClick={onOpenSOSHistory}
            className="flex items-center space-x-1 bg-blue-800 hover:bg-blue-700 text-white text-xs font-bold px-2.5 py-1.5 rounded-lg transition-colors border border-blue-600 cursor-pointer"
            title="SOS配信履歴ログ"
          >
            <History className="w-3.5 h-3.5 text-yellow-300" />
            <span className="hidden sm:inline">SOS履歴</span>
          </button>

          {/* Emergency Guide Overlay Modal Trigger */}
          <button
            onClick={onOpenEmergency}
            className="hidden md:flex items-center space-x-1 bg-red-950/70 hover:bg-red-900 text-red-100 border border-red-700 text-xs font-bold px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
            title="緊急時即時対応ガイド(マニュアル)"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
            <span>対応マニュアル</span>
          </button>

          {/* MAIN SOS BUTTON (Trigger Broadcast SOS Modal) */}
          <button
            onClick={onOpenBroadcastSOS}
            className={`flex items-center space-x-1.5 active:scale-95 text-white text-xs sm:text-sm font-black px-3.5 py-1.5 rounded-lg shadow-lg transition-all border cursor-pointer ${
              activeAlertCount > 0
                ? 'bg-red-600 border-yellow-300 animate-bounce ring-4 ring-red-500/50'
                : 'bg-red-600 hover:bg-red-700 border-red-400 animate-pulse'
            }`}
          >
            <Siren className="w-4 h-4 text-yellow-300 animate-spin" />
            <span>【緊急SOS発報】</span>
            {activeAlertCount > 0 && (
              <span className="bg-yellow-400 text-red-950 text-[10px] font-black px-1.5 py-0.2 rounded-full">
                {activeAlertCount}件進行中
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Bottom Main Tab Navigation */}
      <div className="bg-white border-t border-gray-200 text-gray-700 shadow-inner">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex space-x-1 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('manuals')}
            className={`flex items-center space-x-2 px-4 py-3 border-b-2 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'manuals'
                ? 'border-blue-800 text-blue-900 bg-blue-50/80'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            <BookOpen className="w-4 h-4 text-blue-800" />
            <span>マニュアル閲覧</span>
            {unreadCountForCurrentStaff > 0 && (
              <span className="bg-red-100 text-red-800 border border-red-200 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                未確認 {unreadCountForCurrentStaff}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('support-guide')}
            className={`flex items-center space-x-2 px-4 py-3 border-b-2 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'support-guide'
                ? 'border-blue-800 text-blue-900 bg-blue-50/80'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            <MessageSquareHeart className="w-4 h-4 text-pink-600" />
            <span>声掛け・支援方法一覧</span>
            <span className="bg-pink-100 text-pink-800 border border-pink-200 text-[10px] font-bold px-1.5 py-0.2 rounded">
              実践
            </span>
          </button>

          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center space-x-2 px-4 py-3 border-b-2 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'dashboard'
                ? 'border-blue-800 text-blue-900 bg-blue-50/80'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            <BarChart3 className="w-4 h-4 text-blue-800" />
            <span>スタッフ確認状況</span>
          </button>

          <button
            onClick={() => setActiveTab('incidents')}
            className={`flex items-center space-x-2 px-4 py-3 border-b-2 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'incidents'
                ? 'border-blue-800 text-blue-900 bg-blue-50/80'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span>ヒヤリハット記録</span>
          </button>

          <button
            onClick={() => setActiveTab('ai-consult')}
            className={`flex items-center space-x-2 px-4 py-3 border-b-2 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'ai-consult'
                ? 'border-blue-800 text-blue-900 bg-blue-50/80'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            <Bot className="w-4 h-4 text-blue-700" />
            <span>AIマニュアル相談</span>
            <span className="bg-blue-100 text-blue-800 text-[10px] px-1.5 py-0.2 rounded font-mono font-bold">
              Gemini
            </span>
          </button>
        </div>
      </div>
    </header>
  );
};
