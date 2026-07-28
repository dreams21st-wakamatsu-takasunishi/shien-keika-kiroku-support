import React from 'react';
import {
  FileText,
  Users,
  Settings,
  History,
  PlusCircle,
  ShieldCheck,
  LogOut,
  House,
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
  const visibleItems = navigationItems.filter(
    (item) => !item.managerOnly || !currentUser || currentUser.role !== 'staff'
  );

  const openTab = (tab: ActiveTab) => {
    if (tab === 'form') onNewRecord();
    setActiveTab(tab);
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

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => openTab('form')}
                className="md:hidden min-w-11 min-h-11 flex items-center justify-center rounded-lg bg-emerald-600 active:bg-emerald-500"
                aria-label="新規記録を入力"
              >
                <PlusCircle className="w-5 h-5" />
              </button>
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
          {visibleItems.map((item) => {
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
        </div>
      </nav>
    </>
  );
};
