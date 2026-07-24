import React, { useState } from 'react';
import {
  ArrowRight,
  Bot,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  History,
  LoaderCircle,
  PlusCircle,
  RotateCcw,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import type { ChildProfile, HomeAssistantExecutionResult, HomeAssistantProposal, SupportRecord, UserProfile } from '../types';
import type { ActiveTab } from './Header';
import { executeHomeAssistantProposal, requestHomeAssistantProposal } from '../services/homeAssistantService';
import { formatJapaneseDate } from '../utils/weekdays';

interface HomeScreenProps {
  records: SupportRecord[];
  childrenList: ChildProfile[];
  currentUser?: UserProfile | null;
  canManageSettings: boolean;
  onNavigate: (tab: ActiveTab) => void;
  onNewRecord: () => void;
  onAssistantExecuted: (childId: string, result: HomeAssistantExecutionResult) => Promise<void> | void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  records,
  childrenList,
  currentUser,
  canManageSettings,
  onNavigate,
  onNewRecord,
  onAssistantExecuted,
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

      <HomeAssistantPanel childrenList={childrenList} onExecuted={onAssistantExecuted} />

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

function HomeAssistantPanel({
  childrenList,
  onExecuted,
}: {
  childrenList: ChildProfile[];
  onExecuted: (childId: string, result: HomeAssistantExecutionResult) => Promise<void> | void;
}) {
  const [selectedChildId, setSelectedChildId] = useState('');
  const [instruction, setInstruction] = useState('');
  const [proposal, setProposal] = useState<HomeAssistantProposal | null>(null);
  const [resultMessage, setResultMessage] = useState('');
  const [error, setError] = useState('');
  const [phase, setPhase] = useState<'idle' | 'proposing' | 'executing'>('idle');
  const selectedChild = childrenList.find((child) => child.id === selectedChildId);
  const busy = phase !== 'idle';

  const resetResult = () => {
    setProposal(null);
    setResultMessage('');
    setError('');
  };

  const handleCreateProposal = async () => {
    if (!selectedChild) return setError('児童名を選択してください。');
    if (!instruction.trim()) return setError('AIへの指示文を入力してください。');
    setPhase('proposing');
    setError('');
    setResultMessage('');
    try {
      setProposal(await requestHomeAssistantProposal(selectedChild, instruction.trim()));
    } catch (requestError) {
      setProposal(null);
      setError(requestError instanceof Error ? requestError.message : '実行案を作成できませんでした。');
    } finally {
      setPhase('idle');
    }
  };

  const handleExecute = async () => {
    if (!proposal) return;
    setPhase('executing');
    setError('');
    try {
      const result = await executeHomeAssistantProposal(proposal);
      await onExecuted(proposal.childId, result);
      setResultMessage(result.message);
      setProposal(null);
      setInstruction('');
    } catch (executeError) {
      setError(executeError instanceof Error ? executeError.message : 'アシスタントを実行できませんでした。');
    } finally {
      setPhase('idle');
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-indigo-200 bg-white shadow-sm">
      <div className="border-b border-indigo-100 bg-gradient-to-r from-indigo-950 via-slate-900 to-teal-950 px-5 py-4 text-white sm:px-6">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-xl bg-white/10 p-2"><Bot className="h-6 w-6 text-teal-300" /></div>
          <div>
            <p className="text-[11px] font-bold text-teal-300">承認後にだけ実行する安全設計</p>
            <h3 className="mt-0.5 text-lg font-black">AI業務アシスタント</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-300">指示をAIが実行案に整理します。内容を確認し、承認するまで児童情報は変更されません。</p>
          </div>
        </div>
      </div>

      <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[1fr_1.1fr]">
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-slate-700">児童名</span>
            <select
              value={selectedChildId}
              disabled={busy}
              onChange={(event) => {
                setSelectedChildId(event.target.value);
                resetResult();
              }}
              className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:opacity-60"
            >
              <option value="">児童を選択してください</option>
              {childrenList.map((child) => <option key={child.id} value={child.id}>{child.name}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-slate-700">アシスタント内容</span>
            <textarea
              rows={4}
              value={instruction}
              disabled={busy}
              onChange={(event) => {
                setInstruction(event.target.value);
                resetResult();
              }}
              placeholder="例：8月26日からの定期利用日を水曜日と金曜日になるようにしてほしい"
              className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm leading-relaxed focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:opacity-60"
            />
          </label>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-600">
            <p className="flex items-center gap-1.5 font-bold text-slate-700"><ShieldCheck className="h-4 w-4 text-teal-600" />現在実行できる内容</p>
            <p className="mt-1">指定日からの定期利用曜日変更に対応しています。児童名は指示文に書かず、上の欄で選択してください。</p>
          </div>

          <button
            type="button"
            disabled={busy || !selectedChildId || !instruction.trim()}
            onClick={handleCreateProposal}
            className="min-h-12 w-full rounded-xl bg-indigo-600 px-4 text-sm font-black text-white shadow-sm flex items-center justify-center gap-2 hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {phase === 'proposing' ? <><LoaderCircle className="h-5 w-5 animate-spin" />AIが実行案を作成中...</> : <><Sparkles className="h-5 w-5" />実行案を作成</>}
          </button>
        </div>

        <div className="min-h-64 rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-4 sm:p-5">
          {!proposal && !resultMessage && !error && (
            <div className="h-full min-h-52 flex flex-col items-center justify-center text-center text-slate-400">
              <Sparkles className="h-9 w-9 text-indigo-300" />
              <p className="mt-3 text-sm font-bold text-slate-500">ここにAIの実行案が表示されます</p>
              <p className="mt-1 max-w-xs text-xs">対象児童と指示を入力し、「実行案を作成」を押してください。</p>
            </div>
          )}

          {proposal && (
            <div className="space-y-4">
              <div>
                <p className="text-[11px] font-bold text-indigo-600">AIアシスタント案</p>
                <h4 className="mt-1 text-base font-black text-slate-900">{proposal.summary}</h4>
              </div>
              <dl className="grid gap-2 text-xs sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <dt className="text-slate-500">対象児童</dt>
                  <dd className="mt-1 font-bold text-slate-900">{proposal.childName}</dd>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <dt className="text-slate-500">適用日</dt>
                  <dd className="mt-1 font-bold text-slate-900">{formatJapaneseDate(proposal.effectiveDate)}</dd>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3 sm:col-span-2">
                  <dt className="text-slate-500">変更後の定期利用曜日</dt>
                  <dd className="mt-1 font-bold text-slate-900">{proposal.regularDays.map((day) => `${day}曜日`).join('・')}</dd>
                </div>
              </dl>
              <p className="rounded-xl bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-800">承認すると予約が登録されます。適用日より前の記録候補には影響しません。</p>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <button type="button" disabled={busy} onClick={handleExecute} className="min-h-12 rounded-xl bg-teal-600 px-4 text-sm font-black text-white flex items-center justify-center gap-2 hover:bg-teal-500 disabled:opacity-60">
                  {phase === 'executing' ? <><LoaderCircle className="h-5 w-5 animate-spin" />アシスタント実行中...</> : <><CheckCircle2 className="h-5 w-5" />この内容を承認して実行</>}
                </button>
                <button type="button" disabled={busy} onClick={() => setProposal(null)} className="min-h-12 rounded-xl border border-slate-300 bg-white px-4 text-xs font-bold text-slate-600 disabled:opacity-60">指示を修正</button>
              </div>
            </div>
          )}

          {resultMessage && (
            <div role="status" className="h-full min-h-52 flex flex-col items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-600" />
              <p className="mt-3 text-[11px] font-bold text-emerald-700">アシスタントの実行が完了しました</p>
              <p className="mt-1 text-sm font-black leading-relaxed text-emerald-950">{resultMessage}</p>
              <button type="button" onClick={resetResult} className="mt-4 min-h-10 rounded-lg border border-emerald-300 bg-white px-4 text-xs font-bold text-emerald-800 flex items-center gap-2"><RotateCcw className="h-4 w-4" />別の指示を入力</button>
            </div>
          )}

          {error && (
            <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
              <p className="font-bold">実行案を作成できませんでした</p>
              <p className="mt-1 text-xs leading-relaxed">{error}</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function StatusCard({ icon: Icon, label, value, tone }: { icon: React.ElementType; label: string; value: string; tone: 'teal' | 'blue' | 'amber' | 'emerald' }) {
  const tones = { teal: 'bg-teal-50 text-teal-700', blue: 'bg-sky-50 text-sky-700', amber: 'bg-amber-50 text-amber-700', emerald: 'bg-emerald-50 text-emerald-700' };
  return <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className={`h-9 w-9 rounded-lg flex items-center justify-center ${tones[tone]}`}><Icon className="w-5 h-5" /></div><p className="mt-3 text-[11px] font-bold text-slate-500">{label}</p><p className="text-xl font-black text-slate-900">{value}</p></div>;
}

function QuickLink({ icon: Icon, label, onClick }: { icon: React.ElementType; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="min-h-12 rounded-xl border border-slate-200 bg-slate-50 px-3 text-left text-sm font-bold text-slate-700 flex items-center gap-3 hover:border-teal-300 hover:bg-teal-50"><Icon className="w-5 h-5 text-teal-600" />{label}<ArrowRight className="ml-auto w-4 h-4 text-slate-400" /></button>;
}
