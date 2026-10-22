import React from 'react';
import { activityDuration, activityTimeline, type ActivityPlan } from '../utils/activityPlans';

/** Shared screen/print sheet. Empty legacy fields remain blank, never inferred. */
export function ActivityPlanSheet({ plan, dirty = false, activeField }: { plan: ActivityPlan; dirty?: boolean; activeField?: string | null }) {
  const c = plan.content;
  const times = activityTimeline(plan);
  const rows = Array.from({ length: Math.max(12, c.steps.length) }, (_, i) => c.steps[i]);
  const mark = (key: string) => ({ 'data-activity-preview': key, 'data-active': activeField === key || undefined });
  const notes = [['対象・場所', [c.target, c.location].filter(Boolean).join('／'), 'targetLocation'], ['役割分担', c.roles, 'roles'], ['参加しやすくする配慮', c.considerations, 'considerations'], ['安全確認・緊急時の対応', c.safety, 'safety']].filter(([, value, key]) => value || activeField === key);
  return <div className="activity-sheet" aria-label="指導案の帳票">
    <p className="activity-sheet-meta"><span {...mark('date')}>{plan.isTemplate ? 'ひな形' : `実施日：${plan.date}`}</span> ／ <span {...mark('status')}>{plan.status}</span>{dirty ? ' ／ 未保存の入力内容' : ''}{activeField === 'startTime' && !c.steps.length && <span {...mark('startTime')}> ／ 開始：{c.startTime || '未設定'}（活動の流れは未登録）</span>}</p>
    <table className="activity-sheet-overview">
      <colgroup><col style={{ width: '11%' }} /><col style={{ width: '33%' }} /><col style={{ width: '22%' }} /><col style={{ width: '34%' }} /></colgroup>
      <tbody>
        <tr><th colSpan={4} className="activity-sheet-title" {...mark('title')}>{plan.title || '企画名'}</th></tr>
        <tr><th>支援項目</th><td {...mark('supportItem')}>{c.supportItem || plan.kind}</td><th>講師名</th><td {...mark('leader')}>{c.leader}</td></tr>
        <tr><th>内容</th><td {...mark('summary')}>{c.summary}</td><td className="activity-sheet-counts"><div {...mark('staffCount')}>職員人数　{c.staffCount || '　'} 名</div><div {...mark('childCount')}>児童人数　{c.childCount || '　'} 名</div></td><td className="activity-sheet-counts"><div {...mark('travelMinutes')}>往復時間　{c.travelMinutes || '　'} 分程度</div>活動時間　{activityDuration(plan)} 分程度</td></tr>
        <tr><th>ねらい</th><td colSpan={3} {...mark('goal')}>{c.goal}</td></tr>
        <tr><th>用意するもの</th><td colSpan={3} className="activity-sheet-preparations">{c.preparations.map((p) => <div key={p.id} {...mark(`prep:${p.id}`)}>{p.done ? '☑' : '□'} {p.name}{p.quantity ? `（${p.quantity}）` : ''}{p.owner ? ` ／ 担当：${p.owner}` : ''}</div>)}</td></tr>
      </tbody>
    </table>
    <table className="activity-sheet-flow">
      <colgroup><col style={{ width: '22%' }} /><col style={{ width: '56%' }} /><col style={{ width: '22%' }} /></colgroup>
      <thead><tr><th>段階</th><th>指導内容</th><th>指導上の留意点</th></tr></thead>
      <tbody>{rows.map((s, i) => <tr key={s?.id || `blank-${i}`}><td {...(s ? mark(`step:${s.id}:time`) : {})}>{s && <>{s.stage || `${i + 1}`}<small><span {...(i === 0 ? mark('startTime') : {})}>{times[i]}</span><br />{s.minutes}分</small></>}</td><td {...(s ? mark(`step:${s.id}:title`) : {})}>{s?.title}</td><td {...(s ? mark(`step:${s.id}:support`) : {})}>{s?.support}</td></tr>)}</tbody>
    </table>
    <table className="activity-sheet-reflection"><tbody><tr><th>自己評価<br />及び<br />改善案</th><td><div {...mark('reflection')}>{c.reflection}</div>{(c.nextTime || activeField === 'nextTime') && <div {...mark('nextTime')}>【次回に活かすこと】<br />{c.nextTime}</div>}</td></tr></tbody></table>
    {!!notes.length && <table className="activity-sheet-notes"><caption>補足・安全確認</caption><tbody>{notes.map(([label, value, key]) => <tr key={key}><th>{label}</th><td {...mark(key)}>{value}</td></tr>)}</tbody></table>}
  </div>;
}
