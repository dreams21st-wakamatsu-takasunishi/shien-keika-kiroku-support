import React, { useState } from 'react';
import {
  FileText,
  Users,
  Settings,
  History,
  PlusCircle,
  ShieldCheck,
  LogOut,
  House,
  Menu,
  X,
  ChevronRight,
} from 'lucide-react';
import { UserProfile } from '../types';

export type ActiveTab = 'home' | 'form' | 'records' | 'children' | 'plans' | 'templates' | 'team';

interface HeaderProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  unapprovedCount: number;
  onNewRecord: () => void;
  currentUser?: UserProfile | null;
  onSignOut?: () => void;
}

const navigationItems = [
  { tab: 'home' as const, label: 'ホーム', desktopLabel: 'ホーム', icon: House },
  { tab: 'form' as const, label: '記録', desktopLabel: '記録作成', icon: PlusCircle },
  { tab: 'records' as const, label: '一覧', desktopLabel: '記録一覧・確認', icon: History },
  { tab: 'children' as const, label: '児童', desktopLabel: '児童名簿', icon: Users },
  { tab: 'templates' as const, label: '設定', desktopLabel: '設定', icon: Settings, managerOnly: true },
  { tab: 'team' as const, label: '職員', desktopLabel: '職員', icon: ShieldCheck, managerOnly: true },
];

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  unapprovedCount,
  onNewRecord,
  currentUser,
  onSignOut,
}) => {
  const [managementOpen, setManagementOpen] = useState(false);
  const visibleItems = navigationItems.filter(
    (item) => !item.managerOnly || !currentUser || currentUser.role !== 'staff'
  );
  const primaryMobileItems = visibleItems.filter((item) => !item.managerOnly);
  const managementItems = visibleItems.filter((item) => item.managerOnly);

  const openTab = (tab: ActiveTab) => {
    if (tab === 'form') onNewRecord();
    setActiveTab(tab);
    setManagementOpen(false);
  };

  return (
    <>
      <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-30 shadow-md">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 md:h-16 gap-3">
            <button type="button" onClick={() => openTab('home')} className="flex items-center gap-2.5 min-w-0 text-left" aria-label="ホームへ移動">
              <div className="w-9 h-9 md:w-10 md:h-10 shrink-0 rounded-lg bg-teal-600 flex items-center justify-center shadow-sm">
                <FileText className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h1 className="text-sm md:text-base font-bold tracking-tight truncate">
                  支援経過記録 サポート
                </h1>
                <p className="hidden lg:block text-xs text-slate-400">
                  チェック式入力 → 文章自動生成 → A4 PDF出力
                </p>
                {currentUser && (
                  <p className="md:hidden text-[10px] text-slate-400 truncate">
                    {currentUser.displayName}・{currentUser.role === 'admin' ? '管理者' : currentUser.role === 'manager' ? '児発管' : '職員'}
                  </p>
                )}
              </div>
            </button>

            <nav className="desktop-top-navigation items-center space-x-1" aria-label="主要画面">
              {visibleItems.map((item) => {
                const Icon = item.icon;
                const selected = activeTab === item.tab;
                return (
                  <button
                    key={item.tab}
                    type="button"
                    onClick={() => openTab(item.tab)}
                    aria-current={selected ? 'page' : undefined}
                    className={`relative flex items-center gap-2 px-3 py-2 rounded-md text-xs font-semibold transition-colors ${
                      selected
                        ? 'bg-teal-600 text-white shadow-sm'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {item.desktopLabel}
                    {item.tab === 'records' && unapprovedCount > 0 && (
                      <span className="bg-amber-500 text-slate-950 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                        {unapprovedCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            <div className="flex items-center gap-1.5 shrink-0">
              {currentUser && (
                <span className="hidden xl:inline-flex rounded-full border border-slate-700 bg-slate-800 px-3 py-1.5 text-[11px] font-bold text-slate-300">
                  {currentUser.displayName}・{currentUser.role === 'admin' ? '管理者' : currentUser.role === 'manager' ? '児発管' : '職員'}
                </span>
              )}
              {onSignOut && (
                <button
                  type="button"
                  onClick={onSignOut}
                  className="min-w-11 min-h-11 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg"
                  aria-label="ログアウト"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <nav className="mobile-bottom-navigation fixed inset-x-0 bottom-0 z-40 bg-slate-950/98 border-t border-slate-800 shadow-2xl pb-[env(safe-area-inset-bottom)]" aria-label="主要画面">
        <div className="flex items-stretch justify-around min-h-16">
          {primaryMobileItems.map((item) => {
            const Icon = item.icon;
            const selected = activeTab === item.tab;
            return (
              <button
                key={item.tab}
                type="button"
                onClick={() => openTab(item.tab)}
                aria-current={selected ? 'page' : undefined}
                className={`relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-[10px] font-bold ${
                  selected ? 'text-teal-300 bg-slate-900' : 'text-slate-400 active:bg-slate-900'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="truncate w-full text-center">{item.label}</span>
                {item.tab === 'records' && unapprovedCount > 0 && (
                  <span className="absolute top-1.5 left-1/2 ml-2 rounded-full bg-amber-500 text-slate-950 text-[9px] min-w-4 h-4 px-1 flex items-center justify-center">
                    {unapprovedCount}
                  </span>
                )}
              </button>
            );
          })}
          {managementItems.length > 0 && (
            <button
              type="button"
              onClick={() => setManagementOpen(true)}
              aria-expanded={managementOpen}
              className={`relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-[10px] font-bold ${
                managementItems.some((item) => item.tab === activeTab)
                  ? 'bg-slate-900 text-teal-300'
                  : 'text-slate-400 active:bg-slate-900'
              }`}
            >
              <Menu className="h-5 w-5" />
              <span>管理</span>
            </button>
          )}
        </div>
      </nav>

      {managementOpen && (
        <div className="mobile-bottom-navigation fixed inset-0 z-50" role="presentation">
          <button
            type="button"
            aria-label="管理メニューを閉じる"
            onClick={() => setManagementOpen(false)}
            className="absolute inset-0 h-full w-full bg-slate-950/55 backdrop-blur-[2px]"
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-label="管理メニュー"
            className="absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-slate-200 bg-white px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 shadow-2xl"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-300" />
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-teal-700">管理メニュー</p>
                <h2 className="mt-1 text-lg font-black text-slate-950">設定・職員管理</h2>
              </div>
              <button
                type="button"
                onClick={() => setManagementOpen(false)}
                aria-label="閉じる"
                className="grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
              {managementItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.tab}
                    type="button"
                    onClick={() => openTab(item.tab)}
                    className="flex min-h-16 w-full items-center gap-3 border-b border-slate-100 px-4 text-left last:border-b-0 active:bg-slate-50"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <strong className="block text-sm text-slate-900">{item.desktopLabel}</strong>
                      <span className="mt-0.5 block text-[10px] text-slate-500">
                        {item.tab === 'templates' ? 'AI文章と記録フォーマット' : 'ログイン職員と記録者'}
                      </span>
                    </span>
                    <ChevronRight className="h-5 w-5 text-slate-300" />
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </>
  );
};
