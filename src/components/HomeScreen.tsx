import React from 'react';
import { ArrowRight, CalendarDays, CheckCircle2, ClipboardList, History, PlusCircle, Settings, Users } from 'lucide-react';
import type { ChildProfile, SupportRecord, UserProfile } from '../types';
import type { ActiveTab } from './Header';

interface HomeScreenProps {
  records: SupportRecord[];
  childrenList: ChildProfile[];
  currentUser?: UserProfile | null;
  canManageSettings: boolean;
  onNavigate: (tab: ActiveTab) => void;
  onNewRecord: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  records,
  childrenList,
  currentUser,
  canManageSettings,
  onNavigate,
  onNewRecord,
}) => {
  const today = new Date().toISOString().slice(0, 10);
  const todayRecords = records.filter((record) => record.date === today);
  const unapproved = records.filter((record) => record.approvalStatus === '未確認');
  const recentRecords = [...records]
    .sort((a, b) => `${b.date}${b.updatedAt}`.localeCompare(`${a.date}${a.updatedAt}`))
    .slice(0, 5);

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-teal-950 p-6 sm:p-8 text-white shadow-sm">
        <p className="text-xs font-bold text-teal-300">支援経過記録サポート</p>
        <h2 className="mt-2 text-2xl font-black">{currentUser?.displayName || '職員'}さん、お疲れさまです。</h2>
        <p className="mt-2 text-sm text-slate-300">児童の様子を、その場で迷わず記録できます。</p>
        <button type="button" onClick={onNewRecord} className="mt-6 min-h-12 rounded-xl bg-teal-500 px-5 text-sm font-black text-slate-950 shadow-lg shadow-teal-950/30 flex items-center gap-2">
          <PlusCircle className="w-5 h-5" />新しい記録を作成
        </button>
      </section>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatusCard icon={CalendarDays} label="本日の記録" value={`${todayRecords.length}件`} tone="teal" />
        <StatusCard icon={Users} label="登録児童" value={`${childrenList.length}名`} tone="blue" />
        <StatusCard icon={ClipboardList} label="未確認" value={`${unapproved.length}件`} tone="amber" />
        <StatusCard icon={CheckCircle2} label="確認済み" value={`${records.filter((record) => record.approvalStatus === '確認済み').length}件`} tone="emerald" />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-bold text-slate-900 flex items-center gap-2"><History className="w-5 h-5 text-teal-600" />最近の記録</h3>
            <button type="button" onClick={() => onNavigate('records')} className="text-xs font-bold text-teal-700 flex items-center gap-1">一覧を見る<ArrowRight className="w-4 h-4" /></button>
          </div>
          <div className="mt-4 divide-y divide-slate-100">
            {recentRecords.length === 0 && <p className="py-7 text-center text-sm text-slate-400">まだ記録がありません。</p>}
            {recentRecords.map((record) => (
              <button key={record.id} type="button" onClick={() => onNavigate('records')} className="w-full py-3 flex items-center justify-between gap-3 text-left">
                <span><strong className="block text-sm text-slate-900">{record.childName}</strong><span className="text-xs text-slate-500">{record.date}・{record.templateName}</span></span>
                <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${record.approvalStatus === '確認済み' ? 'bg-emerald-100 text-emerald-800' : record.approvalStatus === '要修正' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}`}>{record.approvalStatus}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-bold text-slate-900">よく使うメニュー</h3>
          <div className="mt-4 grid gap-2">
            <QuickLink icon={PlusCircle} label="記録を作成する" onClick={onNewRecord} />
            <QuickLink icon={Users} label="児童名簿を開く" onClick={() => onNavigate('children')} />
            <QuickLink icon={History} label="記録一覧を開く" onClick={() => onNavigate('records')} />
            {canManageSettings && <QuickLink icon={Settings} label="設定を開く" onClick={() => onNavigate('templates')} />}
          </div>
        </div>
      </section>
    </div>
  );
};

function StatusCard({ icon: Icon, label, value, tone }: { icon: React.ElementType; label: string; value: string; tone: 'teal' | 'blue' | 'amber' | 'emerald' }) {
  const tones = { teal: 'bg-teal-50 text-teal-700', blue: 'bg-sky-50 text-sky-700', amber: 'bg-amber-50 text-amber-700', emerald: 'bg-emerald-50 text-emerald-700' };
  return <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className={`h-9 w-9 rounded-lg flex items-center justify-center ${tones[tone]}`}><Icon className="w-5 h-5" /></div><p className="mt-3 text-[11px] font-bold text-slate-500">{label}</p><p className="text-xl font-black text-slate-900">{value}</p></div>;
}

function QuickLink({ icon: Icon, label, onClick }: { icon: React.ElementType; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="min-h-12 rounded-xl border border-slate-200 bg-slate-50 px-3 text-left text-sm font-bold text-slate-700 flex items-center gap-3 hover:border-teal-300 hover:bg-teal-50"><Icon className="w-5 h-5 text-teal-600" />{label}<ArrowRight className="ml-auto w-4 h-4 text-slate-400" /></button>;
}
