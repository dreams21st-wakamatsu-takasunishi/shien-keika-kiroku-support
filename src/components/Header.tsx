import React, { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BusFront,
  Eye,
  EyeOff,
  FileText,
  Users,
  Settings,
  History,
  PlusCircle,
  RefreshCw,
  ShieldCheck,
  LogOut,
  House,
  Menu,
  X,
  ChevronDown,
  ChevronRight,
  LoaderCircle,
  RotateCcw,
  Save,
  SlidersHorizontal,
  UserRoundCog,
} from 'lucide-react';
import type {
  RecorderMenuItemId,
  RecorderMenuPreferences,
  RecorderProfile,
  UserProfile,
} from '../types';
import { APP_BUILD_TIME, APP_VERSION, useAppUpdate } from '../hooks/useAppUpdate';

export type ActiveTab = RecorderMenuItemId | 'plans';

interface HeaderProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  unapprovedCount: number;
  onNewRecord: () => void;
  currentUser?: UserProfile | null;
  activeRecorder?: RecorderProfile | null;
  onSaveMenuPreferences?: (preferences: RecorderMenuPreferences) => Promise<void>;
  onChangeRecorder?: () => void;
  onOpenFieldOperations?: () => void;
  onSignOut?: () => void;
  canOpenSettings?: boolean;
  canOpenTeam?: boolean;
}

const navigationItems = [
  { tab: 'home' as const, label: 'ホーム', description: '今日の状況と各機能', icon: House },
  { tab: 'form' as const, label: '記録作成', description: '支援経過記録を入力', icon: PlusCircle },
  { tab: 'records' as const, label: '記録一覧・確認', description: '記録の確認・修正・出力', icon: History },
  { tab: 'children' as const, label: '児童名簿', description: '児童情報と送迎先', icon: Users },
  { tab: 'templates' as const, label: '設定', description: '記録・学校・送迎の共通設定', icon: Settings, managerOnly: true },
  { tab: 'team' as const, label: '職員', description: '職員・権限・記録者', icon: ShieldCheck, managerOnly: true },
];

const roleLabel = (role?: UserProfile['role']) =>
  role === 'admin' ? '管理者' : role === 'manager' ? '児発管' : role === 'classroom_manager' ? '教室長' : '職員';

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  unapprovedCount,
  onNewRecord,
  currentUser,
  activeRecorder,
  onSaveMenuPreferences,
  onChangeRecorder,
  onOpenFieldOperations,
  onSignOut,
  canOpenSettings = false,
  canOpenTeam = false,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [customizingMenu, setCustomizingMenu] = useState(false);
  const [draftOrder, setDraftOrder] = useState<RecorderMenuItemId[]>([]);
  const [draftHidden, setDraftHidden] = useState<RecorderMenuItemId[]>([]);
  const [savingMenu, setSavingMenu] = useState(false);
  const [menuMessage, setMenuMessage] = useState('');
  const [privilegedMenuOpen, setPrivilegedMenuOpen] = useState(false);
  const {
    state: appUpdateState,
    updateAvailable,
    availableVersion,
    applyUpdate,
    refreshApplication,
  } = useAppUpdate();
  const fieldModeItems = new Set<RecorderMenuItemId>(['home']);
  const roleItems = navigationItems.filter((item) =>
    (item.tab !== 'templates' || canOpenSettings)
    && (item.tab !== 'team' || canOpenTeam)
    && (!item.managerOnly || !currentUser || currentUser.role !== 'staff')
    && (!currentUser?.fieldModeOnly || fieldModeItems.has(item.tab))
  );
  const privilegedItemIds = new Set<RecorderMenuItemId>(['templates', 'team']);
  const roleItemIds = roleItems.filter((item) => !privilegedItemIds.has(item.tab)).map((item) => item.tab);
  const configuredOrder = activeRecorder?.menuPreferences?.order || [];
  const orderedIds = [
    ...configuredOrder.filter((item) => roleItemIds.includes(item)),
    ...roleItemIds.filter((item) => !configuredOrder.includes(item)),
  ];
  const hiddenItems = new Set(activeRecorder?.menuPreferences?.hidden || []);
  const visibleItems = orderedIds
    .filter((item) => item === 'home' || !hiddenItems.has(item))
    .map((item) => roleItems.find((candidate) => candidate.tab === item))
    .filter((item): item is (typeof navigationItems)[number] => Boolean(item));
  const mainVisibleItems = visibleItems;
  const privilegedItems = roleItems.filter((item) => privilegedItemIds.has(item.tab));
  const privilegedMenuLabel = currentUser?.role === 'admin'
    ? '管理者メニュー'
    : currentUser?.role === 'manager'
      ? '児発管メニュー'
      : currentUser?.role === 'classroom_manager'
        ? '教室長メニュー'
      : '管理メニュー';
  const currentItem = navigationItems.find((item) => item.tab === activeTab);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        setCustomizingMenu(false);
        setPrivilegedMenuOpen(false);
      }
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [menuOpen]);

  const openTab = (tab: ActiveTab) => {
    if (tab === 'form') onNewRecord();
    setActiveTab(tab);
    setMenuOpen(false);
    setCustomizingMenu(false);
    setPrivilegedMenuOpen(false);
  };

  const openMenuCustomizer = () => {
    setDraftOrder(orderedIds);
    setDraftHidden(roleItemIds.filter((item) => item !== 'home' && hiddenItems.has(item)));
    setMenuMessage('');
    setCustomizingMenu(true);
  };

  const moveDraftItem = (itemId: RecorderMenuItemId, direction: -1 | 1) => {
    setDraftOrder((current) => {
      const index = current.indexOf(itemId);
      const targetIndex = index + direction;
      if (index < 0 || targetIndex < 0 || targetIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  };

  const toggleDraftItem = (itemId: RecorderMenuItemId) => {
    if (itemId === 'home') return;
    setDraftHidden((current) => current.includes(itemId)
      ? current.filter((item) => item !== itemId)
      : [...current, itemId]);
  };

  const saveMenuPreferences = async () => {
    if (!onSaveMenuPreferences) return;
    setSavingMenu(true);
    setMenuMessage('');
    try {
      await onSaveMenuPreferences({ order: draftOrder, hidden: draftHidden });
      setMenuMessage('この記録者のメニューを保存しました。');
      setCustomizingMenu(false);
    } catch (error) {
      setMenuMessage(error instanceof Error ? error.message : 'メニュー設定を保存できませんでした。');
    } finally {
      setSavingMenu(false);
    }
  };

  return (
    <>
      <header className="app-safe-top sticky top-0 z-30 border-b border-slate-800 bg-slate-950 text-white shadow-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-2 sm:h-16 sm:px-5">
          <button
            type="button"
            onClick={() => { setMenuOpen(true); setPrivilegedMenuOpen(activeTab === 'templates' || activeTab === 'team'); }}
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
            onClick={() => void refreshApplication()}
            disabled={appUpdateState === 'checking' || appUpdateState === 'updating'}
            className={`relative grid h-10 w-10 shrink-0 place-items-center rounded-xl border transition-colors disabled:opacity-60 ${updateAvailable ? 'border-amber-300 bg-amber-300 text-slate-950' : 'border-slate-700 bg-slate-900 text-slate-200 hover:border-teal-500 hover:text-white'}`}
            aria-label={updateAvailable ? '新しいバージョンへ更新する' : '最新情報に更新する'}
            title={`最新情報に更新（現在 ${APP_VERSION}）`}
          >
            <RefreshCw className={`h-4.5 w-4.5 ${appUpdateState === 'checking' || appUpdateState === 'updating' ? 'animate-spin' : ''}`} />
            {updateAvailable && <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-slate-950 bg-rose-500" />}
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

      {updateAvailable && (
        <div className="border-b border-amber-300 bg-amber-50 px-3 py-2 text-amber-950 shadow-sm" role="status">
          <div className="mx-auto flex max-w-7xl items-center gap-2">
            <RefreshCw className="h-4 w-4 shrink-0" />
            <p className="min-w-0 flex-1 text-[11px] font-bold sm:text-xs">
              新しいアプリが利用できます{availableVersion ? `（${availableVersion}）` : ''}。
            </p>
            <button type="button" onClick={applyUpdate} className="min-h-9 shrink-0 rounded-lg bg-amber-400 px-3 text-[11px] font-black text-slate-950">
              更新する
            </button>
          </div>
        </div>
      )}

      {menuOpen && (
        <div className="fixed inset-0 z-[120] ui-fade-in" role="presentation">
          <button type="button" aria-label="画面メニューを閉じる" onClick={() => { setMenuOpen(false); setCustomizingMenu(false); setPrivilegedMenuOpen(false); }} className="absolute inset-0 h-full w-full bg-slate-950/60 backdrop-blur-[2px]" />
          <aside role="dialog" aria-modal="true" aria-label="画面メニュー" className="app-safe-block ui-slide-in-left absolute inset-y-0 left-0 flex w-[min(88vw,22rem)] flex-col bg-white shadow-2xl">
            <header className="bg-gradient-to-br from-slate-950 via-slate-900 to-teal-950 p-4 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-teal-300">画面メニュー</p>
                  <h2 className="mt-1 text-lg font-black">移動先を選択</h2>
                </div>
                <button type="button" onClick={() => { setMenuOpen(false); setCustomizingMenu(false); setPrivilegedMenuOpen(false); }} aria-label="閉じる" className="grid h-11 w-11 place-items-center rounded-xl bg-white/10"><X className="h-5 w-5" /></button>
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
                {currentUser?.fieldModeOnly && (
                  <p className="mt-2 rounded-lg bg-amber-300/15 px-2 py-1.5 text-[10px] font-bold text-amber-100">
                    個人端末用の送迎モードで表示しています
                  </p>
                )}
                {activeRecorder && onChangeRecorder && (
                  <button type="button" onClick={() => { onChangeRecorder(); setMenuOpen(false); setCustomizingMenu(false); }} className="mt-2 flex min-h-9 items-center gap-1 rounded-lg bg-white px-3 text-xs font-black text-teal-800">
                    <UserRoundCog className="h-4 w-4" />記録者を切り替える
                  </button>
                )}
              </div>
            </header>

            <nav className="flex-1 overflow-y-auto p-3" aria-label="主要画面">
              {customizingMenu ? (
                <div className="space-y-3">
                  <div className="rounded-2xl border border-teal-200 bg-teal-50 p-3">
                    <p className="text-sm font-black text-teal-950">メニューをカスタマイズ</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-teal-800">
                      表示する画面と並び順を設定します。この内容は{activeRecorder?.displayName || '現在の記録者'}さん専用です。
                    </p>
                  </div>
                  <div className="space-y-2">
                    {draftOrder.map((itemId, index) => {
                      const item = roleItems.find((candidate) => candidate.tab === itemId);
                      if (!item) return null;
                      const Icon = item.icon;
                      const hidden = draftHidden.includes(itemId);
                      return (
                        <div key={itemId} className={`flex min-h-16 items-center gap-2 rounded-2xl border p-2 ${hidden ? 'border-slate-200 bg-slate-50 text-slate-400' : 'border-teal-200 bg-white text-slate-900'}`}>
                          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${hidden ? 'bg-slate-200 text-slate-500' : 'bg-teal-100 text-teal-800'}`}><Icon className="h-5 w-5" /></span>
                          <span className="min-w-0 flex-1">
                            <strong className="block text-sm">{item.label}</strong>
                            <span className="block text-[10px]">{itemId === 'home' ? '常に表示' : hidden ? '非表示' : '表示中'}</span>
                          </span>
                          <div className="grid grid-cols-2 gap-1">
                            <button type="button" onClick={() => moveDraftItem(itemId, -1)} disabled={index === 0} aria-label={`${item.label}を上へ移動`} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                            <button type="button" onClick={() => moveDraftItem(itemId, 1)} disabled={index === draftOrder.length - 1} aria-label={`${item.label}を下へ移動`} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                            <button type="button" onClick={() => toggleDraftItem(itemId)} disabled={itemId === 'home'} aria-label={`${item.label}の表示を切り替える`} className="col-span-2 flex h-9 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-[10px] font-black text-slate-600 disabled:opacity-40">
                              {hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}{hidden ? '表示する' : '隠す'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <button type="button" onClick={() => { setDraftOrder(roleItemIds); setDraftHidden([]); }} className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white text-xs font-black text-slate-600"><RotateCcw className="h-4 w-4" />初期状態に戻す</button>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" disabled={savingMenu} onClick={() => setCustomizingMenu(false)} className="min-h-12 rounded-xl border border-slate-300 bg-white text-sm font-black text-slate-700">キャンセル</button>
                    <button type="button" disabled={savingMenu} onClick={() => void saveMenuPreferences()} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-teal-600 text-sm font-black text-white disabled:bg-slate-400">
                      {savingMenu ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{savingMenu ? '保存中...' : '保存'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {activeRecorder && onSaveMenuPreferences && (
                    <button type="button" onClick={openMenuCustomizer} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-teal-200 bg-teal-50 text-xs font-black text-teal-800">
                      <SlidersHorizontal className="h-4 w-4" />この記録者のメニューを編集
                    </button>
                  )}
                  {menuMessage && <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-800">{menuMessage}</p>}
                  {onOpenFieldOperations && (
                    <button type="button" onClick={() => { onOpenFieldOperations(); setMenuOpen(false); }} className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-3 text-left text-sky-950">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-600 text-white"><BusFront className="h-5 w-5" /></span>
                      <span className="min-w-0 flex-1"><strong className="block text-sm">出退勤・送迎対応</strong><span className="mt-0.5 block text-[10px] text-sky-700">QR打刻、自分の送迎、全体の送迎を開く</span></span>
                      <ChevronRight className="h-4 w-4 text-sky-400" />
                    </button>
                  )}
                  <div className="space-y-1">
                    {mainVisibleItems.map((item) => {
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
                    {privilegedItems.length > 0 && (
                      <div className={`overflow-hidden rounded-2xl border transition-colors ${privilegedItems.some((item) => item.tab === activeTab) ? 'border-indigo-200 bg-indigo-50/70' : 'border-slate-200 bg-white'}`}>
                        <button
                          type="button"
                          onClick={() => setPrivilegedMenuOpen((current) => !current)}
                          aria-expanded={privilegedMenuOpen}
                          className="flex min-h-16 w-full items-center gap-3 px-3 text-left"
                        >
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-100 text-indigo-700"><ShieldCheck className="h-5 w-5" /></span>
                          <span className="min-w-0 flex-1">
                            <strong className="block text-sm text-slate-900">{privilegedMenuLabel}</strong>
                            <span className="mt-0.5 block text-[10px] text-slate-500">役割に応じた設定・職員管理</span>
                          </span>
                          <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${privilegedMenuOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {privilegedMenuOpen && (
                          <div className="ui-panel-enter space-y-1 border-t border-indigo-100 bg-white p-2">
                            {privilegedItems.map((item) => {
                              const Icon = item.icon;
                              const selected = activeTab === item.tab;
                              const nestedLabel = item.tab === 'templates'
                                ? '事業所・記録設定'
                                : currentUser?.role === 'admin'
                                  ? '職員・権限・端末管理'
                                  : '記録者・端末・招待管理';
                              return (
                                <button key={item.tab} type="button" onClick={() => openTab(item.tab)} aria-current={selected ? 'page' : undefined} className={`flex min-h-14 w-full items-center gap-3 rounded-xl px-3 text-left ${selected ? 'bg-indigo-50 text-indigo-950' : 'text-slate-700 hover:bg-slate-50'}`}>
                                  <Icon className={`h-4 w-4 shrink-0 ${selected ? 'text-indigo-700' : 'text-slate-500'}`} />
                                  <span className="min-w-0 flex-1"><strong className="block text-xs">{nestedLabel}</strong><span className="mt-0.5 block text-[9px] text-slate-500">{item.description}</span></span>
                                  <ChevronRight className="h-4 w-4 text-slate-300" />
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </nav>

            <div className="border-t border-slate-200 p-3">
              <p className="mb-2 text-center text-[9px] font-bold text-slate-400" title={`ビルド日時 ${APP_BUILD_TIME}`}>
                アプリ版 {APP_VERSION}
              </p>
              {onSignOut && (
                <button type="button" onClick={onSignOut} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 text-sm font-black text-rose-700">
                  <LogOut className="h-5 w-5" />ログアウト
                </button>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
};
