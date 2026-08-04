import React, { useEffect, useState } from 'react';
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
  UserRoundCog,
} from 'lucide-react';
import type { RecorderProfile, UserProfile } from '../types';

export type ActiveTab = 'home' | 'form' | 'records' | 'children' | 'plans' | 'templates' | 'team';

interface HeaderProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  unapprovedCount: number;
  onNewRecord: () => void;
  currentUser?: UserProfile | null;
  activeRecorder?: RecorderProfile | null;
  onChangeRecorder?: () => void;
  onSignOut?: () => void;
}

const navigationItems = [
  { tab: 'home' as const, label: 'ホーム', description: '今日の状況と各機能', icon: House },
  { tab: 'form' as const, label: '記録作成', description: '支援経過記録を入力', icon: PlusCircle },
  { tab: 'records' as const, label: '記録一覧・確認', description: '記録の確認・修正・出力', icon: History },
  { tab: 'children' as const, label: '児童名簿', description: '児童情報と送迎先', icon: Users },
  { tab: 'templates' as const, label: '設定', description: 'AI文章と記録フォーマット', icon: Settings, managerOnly: true },
  { tab: 'team' as const, label: '職員', description: '職員・権限・記録者', icon: ShieldCheck, managerOnly: true },
];

const roleLabel = (role?: UserProfile['role']) =>
  role === 'admin' ? '管理者' : role === 'manager' ? '児発管' : '職員';

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  unapprovedCount,
  onNewRecord,
  currentUser,
  activeRecorder,
  onChangeRecorder,
  onSignOut,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const visibleItems = navigationItems.filter(
    (item) => !item.managerOnly || !currentUser || currentUser.role !== 'staff'
  );
  const currentItem = navigationItems.find((item) => item.tab === activeTab);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [menuOpen]);

  const openTab = (tab: ActiveTab) => {
    if (tab === 'form') onNewRecord();
    setActiveTab(tab);
    setMenuOpen(false);
  };

  return (
    <>
      <header className="app-safe-top sticky top-0 z-30 border-b border-slate-800 bg-slate-950 text-white shadow-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-2 sm:h-16 sm:px-5">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="画面メニューを開く"
            aria-expanded={menuOpen}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-slate-200 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <Menu className="h-6 w-6" />
          </button>

          <button type="button" onClick={() => openTab('home')} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-label="ホームへ移動">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-teal-600 shadow-sm"><FileText className="h-5 w-5" /></span>
            <span className="min-w-0">
              <strong className="block truncate text-sm font-black sm:text-base">支援経過記録 サポート</strong>
              <span className="block truncate text-[10px] font-bold text-teal-300 sm:text-[11px]">{currentItem?.label || 'ホーム'}</span>
            </span>
          </button>

          <button
            type="button"
            onClick={activeRecorder && onChangeRecorder ? onChangeRecorder : undefined}
            className={`min-w-0 rounded-xl border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-right ${activeRecorder && onChangeRecorder ? 'cursor-pointer hover:border-teal-500' : 'cursor-default'}`}
            aria-label={activeRecorder && onChangeRecorder ? '記録者を切り替える' : 'ログイン中の職員'}
          >
            <span className="block max-w-28 truncate text-[11px] font-black text-white sm:max-w-48 sm:text-xs">
              {activeRecorder?.displayName || currentUser?.displayName || 'ローカル職員'}
            </span>
            <span className="block text-[9px] font-bold text-slate-400">
              {activeRecorder ? '記録者・タップで切替' : currentUser ? `${roleLabel(currentUser.role)}でログイン中` : 'ローカル試用'}
            </span>
          </button>
        </div>
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-[120] ui-fade-in" role="presentation">
          <button type="button" aria-label="画面メニューを閉じる" onClick={() => setMenuOpen(false)} className="absolute inset-0 h-full w-full bg-slate-950/60 backdrop-blur-[2px]" />
          <aside role="dialog" aria-modal="true" aria-label="画面メニュー" className="app-safe-block ui-slide-in-left absolute inset-y-0 left-0 flex w-[min(88vw,22rem)] flex-col bg-white shadow-2xl">
            <header className="bg-gradient-to-br from-slate-950 via-slate-900 to-teal-950 p-4 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-teal-300">画面メニュー</p>
                  <h2 className="mt-1 text-lg font-black">移動先を選択</h2>
                </div>
                <button type="button" onClick={() => setMenuOpen(false)} aria-label="閉じる" className="grid h-11 w-11 place-items-center rounded-xl bg-white/10"><X className="h-5 w-5" /></button>
              </div>
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/10 p-3">
                <p className="text-[10px] font-bold text-slate-300">現在の操作担当</p>
                <p className="mt-0.5 text-base font-black">{activeRecorder?.displayName || currentUser?.displayName || 'ローカル職員'}</p>
                <p className="mt-1 text-[10px] text-slate-300">
                  {activeRecorder && currentUser
                    ? `ログイン：${currentUser.displayName}（${roleLabel(currentUser.role)}）`
                    : currentUser
                      ? `${roleLabel(currentUser.role)}でログイン中`
                      : 'このブラウザー内だけで試用中'}
                </p>
                {activeRecorder && onChangeRecorder && (
                  <button type="button" onClick={() => { onChangeRecorder(); setMenuOpen(false); }} className="mt-2 flex min-h-9 items-center gap-1 rounded-lg bg-white px-3 text-xs font-black text-teal-800">
                    <UserRoundCog className="h-4 w-4" />記録者を切り替える
                  </button>
                )}
              </div>
            </header>

            <nav className="flex-1 overflow-y-auto p-3" aria-label="主要画面">
              <div className="space-y-1">
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const selected = activeTab === item.tab;
                  return (
                    <button key={item.tab} type="button" onClick={() => openTab(item.tab)} aria-current={selected ? 'page' : undefined} className={`flex min-h-16 w-full items-center gap-3 rounded-2xl px-3 text-left transition-colors ${selected ? 'bg-teal-50 text-teal-950 ring-1 ring-teal-200' : 'text-slate-800 hover:bg-slate-50'}`}>
                      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${selected ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600'}`}><Icon className="h-5 w-5" /></span>
                      <span className="min-w-0 flex-1">
                        <strong className="block text-sm">{item.label}</strong>
                        <span className="mt-0.5 block text-[10px] text-slate-500">{item.description}</span>
                      </span>
                      {item.tab === 'records' && unapprovedCount > 0 && <span className="rounded-full bg-amber-400 px-2 py-1 text-[10px] font-black text-slate-950">{unapprovedCount}</span>}
                      <ChevronRight className="h-4 w-4 text-slate-300" />
                    </button>
                  );
                })}
              </div>
            </nav>

            {onSignOut && (
              <div className="border-t border-slate-200 p-3">
                <button type="button" onClick={onSignOut} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 text-sm font-black text-rose-700">
                  <LogOut className="h-5 w-5" />ログアウト
                </button>
              </div>
            )}
          </aside>
        </div>
      )}
    </>
  );
};
