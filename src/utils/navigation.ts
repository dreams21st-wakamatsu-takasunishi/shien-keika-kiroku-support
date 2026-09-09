import {
  BusFront, CalendarDays, CalendarRange, ClipboardList, Eye, History, House,
  MessageSquareText, PlusCircle, Settings, ShieldCheck, Sparkles, TriangleAlert, Users,
} from 'lucide-react';
import type { ComponentType } from 'react';
import type { RecorderMenuItemId, RecorderMenuPreferences } from '../types';

export type ActiveTab = 'home' | 'form' | 'records' | 'children' | 'templates' | 'team' | 'plans';
export type HomeWorkspaceItem = 'dailyChanges' | 'todayWork' | 'attendance' | 'calendar' | 'monthlySchedule' | 'operations' | 'communication' | 'assistant';
export const MENU_CATEGORIES = ['すべて', '当日の対応', '予定・送迎', '記録・児童', '共有・連絡'] as const;
export type MenuCategory = typeof MENU_CATEGORIES[number];
export interface NavigationItem {
  id: RecorderMenuItemId;
  tab?: ActiveTab;
  workspace?: HomeWorkspaceItem;
  label: string;
  description: string;
  keywords: string;
  category?: MenuCategory;
  tone: 'teal' | 'sky' | 'amber' | 'indigo' | 'violet';
  icon: ComponentType<{ className?: string }>;
  managerOnly?: boolean;
}

// The home screen and drawer deliberately share names, order, and search terms.
export const navigationItems: NavigationItem[] = [
  { id: 'home', tab: 'home', label: 'ホーム', description: '今日の状況と各機能', keywords: '', tone: 'teal', icon: House },
  { id: 'dailyChanges', workspace: 'dailyChanges', label: '当日変更', description: '急な欠席・追加利用・送迎担当の交代', keywords: '休み キャンセル トラブル', category: '当日の対応', tone: 'amber', icon: TriangleAlert },
  { id: 'todayWork', workspace: 'todayWork', label: '本日の業務', description: '職員配置・当日の送迎一覧', keywords: '今日 ガント 到着 乗車', category: '当日の対応', tone: 'teal', icon: ClipboardList },
  { id: 'attendance', workspace: 'attendance', label: '出勤予定', description: '自分の予定・打刻・シフト希望', keywords: '勤務 申請 承認 パート', category: '予定・送迎', tone: 'sky', icon: CalendarRange },
  { id: 'calendar', workspace: 'calendar', label: '業務カレンダー', description: '会議・外出・研修・面談・行事', keywords: '予定 休み', category: '予定・送迎', tone: 'indigo', icon: CalendarDays },
  { id: 'monthlySchedule', workspace: 'monthlySchedule', label: '利用予定／送迎管理', description: '利用予定・欠席・送迎条件・配車', keywords: '月間 下校 時刻 迎え 送り 住所 学校', category: '予定・送迎', tone: 'violet', icon: BusFront },
  { id: 'operations', workspace: 'operations', label: '記録状況', description: '利用児童・入力中・保存済みを確認', keywords: '未保存 引き継ぎ 下書き', category: '記録・児童', tone: 'sky', icon: Eye },
  { id: 'communication', workspace: 'communication', label: '共有・連絡', description: 'お知らせ・朝礼・申し送り', keywords: 'メモ 通知 連絡事項', category: '共有・連絡', tone: 'amber', icon: MessageSquareText },
  { id: 'assistant', workspace: 'assistant', label: 'AIアシスタント', description: '児童情報の変更や記録の整理', keywords: '提案 業務変更', category: '共有・連絡', tone: 'indigo', icon: Sparkles },
  { id: 'form', tab: 'form', label: '記録作成', description: '児童を選んで支援経過記録を入力', keywords: '新規 作成 保存', category: '記録・児童', tone: 'teal', icon: PlusCircle },
  { id: 'records', tab: 'records', label: '記録一覧・確認', description: '保存済み記録の確認・修正・出力', keywords: '過去 PDF 印刷 コピー 承認', category: '記録・児童', tone: 'teal', icon: History },
  { id: 'children', tab: 'children', label: '児童名簿', description: '児童情報・学校・利用曜日・送迎先', keywords: '住所 兄弟 基本予定 メモ', category: '記録・児童', tone: 'teal', icon: Users },
  { id: 'templates', tab: 'templates', label: '設定', description: '記録・学校・送迎の共通設定', keywords: '退所 時刻 エリア', tone: 'indigo', icon: Settings, managerOnly: true },
  { id: 'team', tab: 'team', label: '職員', description: '職員・権限・記録者', keywords: '端末 招待 名簿', tone: 'indigo', icon: ShieldCheck, managerOnly: true },
];

export function applyMenuPreferences<T extends { id: RecorderMenuItemId }>(items: T[], preferences?: RecorderMenuPreferences, includeHidden = false): T[] {
  const orderedIds = [...new Set([...(preferences?.order || []), ...items.map((item) => item.id)])];
  return orderedIds.flatMap((id) => {
    const item = items.find((candidate) => candidate.id === id);
    return item && (includeHidden || id === 'home' || !preferences?.hidden?.includes(id)) ? [item] : [];
  });
}

export function matchesMenuSearch(text: string, query: string): boolean {
  const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase('ja');
  const haystack = normalize(text);
  return normalize(query).trim().split(/\s+/).every((term) => haystack.includes(term));
}

export function activeNavigationId(tab: ActiveTab, workspace = 'menu'): RecorderMenuItemId | undefined {
  if (tab !== 'home') return navigationItems.find((item) => item.tab === tab)?.id;
  if (workspace === 'dispatch') return 'monthlySchedule';
  return workspace === 'menu' ? 'home' : navigationItems.find((item) => item.workspace === workspace)?.id;
}
