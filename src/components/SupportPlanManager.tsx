import React, { useMemo, useState } from 'react';
import { CalendarRange, Plus, Save, Target, XCircle } from 'lucide-react';
import { FIVE_DOMAINS } from '../constants';
import { ChildProfile, SupportPlan } from '../types';

interface SupportPlanManagerProps {
  childrenList: ChildProfile[];
  supportPlans: SupportPlan[];
  canEdit: boolean;
  onSavePlan: (plan: SupportPlan) => Promise<void> | void;
  onClosePlan: (planId: string) => Promise<void> | void;
}

function today() {
  return new Date().toISOString().split('T')[0];
}

export const SupportPlanManager: React.FC<SupportPlanManagerProps> = ({
  childrenList,
  supportPlans,
  canEdit,
  onSavePlan,
  onClosePlan,
}) => {
  const [childFilter, setChildFilter] = useState(childrenList[0]?.id || 'all');
  const [editing, setEditing] = useState<SupportPlan | null>(null);
  const [saving, setSaving] = useState(false);

  const visiblePlans = useMemo(
    () => supportPlans.filter((plan) => childFilter === 'all' || plan.childId === childFilter),
    [supportPlans, childFilter]
  );

  const createPlan = () => {
    const childId = childFilter === 'all' ? childrenList[0]?.id || '' : childFilter;
    const now = new Date().toISOString();
    setEditing({
      id: `plan-${Date.now()}`,
      childId,
      title: '個別支援計画',
      longTermGoal: '',
      shortTermGoal: '',
      domainGoals: {},
      validFrom: today(),
      status: '下書き',
      createdAt: now,
      updatedAt: now,
    });
  };

  const save = async () => {
    if (!editing?.childId || !editing.title.trim() || !editing.validFrom) return;
    setSaving(true);
    try {
      await onSavePlan({ ...editing, updatedAt: new Date().toISOString() });
      setEditing(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col md:flex-row justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2"><Target className="w-5 h-5 text-teal-600" />個別支援計画・5領域</h2>
          <p className="text-xs text-slate-500 mt-1">日々の経過記録を、長期・短期目標と本人支援の5領域へ関連付けます。</p>
        </div>
        {canEdit && (
          <button onClick={createPlan} className="bg-teal-600 text-white text-xs font-bold px-4 py-2.5 rounded-lg flex items-center gap-2">
            <Plus className="w-4 h-4" />新しい計画を作成
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <label className="text-xs font-bold text-slate-700">対象児童</label>
        <select value={childFilter} onChange={(e) => setChildFilter(e.target.value)} className="ml-3 border border-slate-300 rounded-lg p-2 text-xs min-w-52">
          <option value="all">すべての児童</option>
          {childrenList.map((child) => <option key={child.id} value={child.id}>{child.name}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {visiblePlans.map((plan) => {
          const child = childrenList.find((item) => item.id === plan.childId);
          return (
            <article key={plan.id} className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
              <div className="flex justify-between gap-3">
                <div>
                  <span className="text-[10px] font-bold text-teal-700">{child?.name || '児童未登録'}</span>
                  <h3 className="font-bold text-sm">{plan.title}</h3>
                </div>
                <span className={`text-[10px] font-bold px-2 py-1 rounded-full h-fit ${plan.status === '有効' ? 'bg-emerald-100 text-emerald-800' : plan.status === '終了' ? 'bg-slate-100 text-slate-600' : 'bg-amber-100 text-amber-800'}`}>{plan.status}</span>
              </div>
              <div className="text-xs bg-slate-50 rounded-lg p-3 space-y-2">
                <p><strong>長期目標：</strong>{plan.longTermGoal || '未設定'}</p>
                <p><strong>短期目標：</strong>{plan.shortTermGoal || '未設定'}</p>
              </div>
              <div className="space-y-1">
                {FIVE_DOMAINS.map((domain) => plan.domainGoals[domain] && (
                  <p key={domain} className="text-[11px]"><strong className="text-slate-700">{domain}：</strong>{plan.domainGoals[domain]}</p>
                ))}
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[10px] text-slate-500">
                <span className="flex items-center gap-1"><CalendarRange className="w-3.5 h-3.5" />{plan.validFrom} ～ {plan.validTo || '継続'}</span>
                {canEdit && (
                  <span className="space-x-2">
                    <button onClick={() => setEditing(JSON.parse(JSON.stringify(plan)))} className="text-teal-700 font-bold">編集</button>
                    {plan.status !== '終了' && <button onClick={() => onClosePlan(plan.id)} className="text-rose-700 font-bold">終了</button>}
                  </span>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {visiblePlans.length === 0 && (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 p-12 text-center text-sm text-slate-500">個別支援計画がまだ登録されていません。</div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-3xl max-h-[92vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold">個別支援計画の編集</h3>
              <button onClick={() => setEditing(null)}><XCircle className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="grid sm:grid-cols-2 gap-3 text-xs">
              <label className="font-bold">児童
                <select required value={editing.childId} onChange={(e) => setEditing({ ...editing, childId: e.target.value })} className="block mt-1 w-full border rounded-lg p-2 font-normal">
                  {childrenList.map((child) => <option key={child.id} value={child.id}>{child.name}</option>)}
                </select>
              </label>
              <label className="font-bold">計画名
                <input required value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} className="block mt-1 w-full border rounded-lg p-2 font-normal" />
              </label>
              <label className="font-bold">適用開始日
                <input type="date" required value={editing.validFrom} onChange={(e) => setEditing({ ...editing, validFrom: e.target.value })} className="block mt-1 w-full border rounded-lg p-2 font-normal" />
              </label>
              <label className="font-bold">適用終了日
                <input type="date" value={editing.validTo || ''} onChange={(e) => setEditing({ ...editing, validTo: e.target.value || undefined })} className="block mt-1 w-full border rounded-lg p-2 font-normal" />
              </label>
              <label className="font-bold">状態
                <select value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value as SupportPlan['status'] })} className="block mt-1 w-full border rounded-lg p-2 font-normal">
                  <option value="下書き">下書き</option><option value="有効">有効</option><option value="終了">終了</option>
                </select>
              </label>
            </div>
            <label className="block text-xs font-bold">長期目標
              <textarea rows={2} value={editing.longTermGoal} onChange={(e) => setEditing({ ...editing, longTermGoal: e.target.value })} className="block mt-1 w-full border rounded-lg p-2 font-normal" />
            </label>
            <label className="block text-xs font-bold">短期目標
              <textarea rows={2} value={editing.shortTermGoal} onChange={(e) => setEditing({ ...editing, shortTermGoal: e.target.value })} className="block mt-1 w-full border rounded-lg p-2 font-normal" />
            </label>
            <div className="space-y-2">
              <h4 className="text-xs font-bold">本人支援の5領域別目標</h4>
              {FIVE_DOMAINS.map((domain) => (
                <label key={domain} className="grid sm:grid-cols-[150px_1fr] gap-2 items-start text-xs font-bold">
                  <span className="pt-2">{domain}</span>
                  <textarea rows={2} value={editing.domainGoals[domain] || ''} onChange={(e) => setEditing({ ...editing, domainGoals: { ...editing.domainGoals, [domain]: e.target.value } })} className="border rounded-lg p-2 font-normal" />
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t">
              <button onClick={() => setEditing(null)} className="px-4 py-2 text-xs text-slate-600">キャンセル</button>
              <button onClick={save} disabled={saving} className="px-5 py-2 text-xs font-bold text-white bg-teal-600 rounded-lg flex items-center gap-2"><Save className="w-4 h-4" />{saving ? '保存中...' : '保存する'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

