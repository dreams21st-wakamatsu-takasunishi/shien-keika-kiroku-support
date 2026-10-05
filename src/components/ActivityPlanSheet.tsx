import React from 'react';
import { activityDuration, activityTimeline, type ActivityPlan } from '../utils/activityPlans';

/** Shared screen/print sheet. Empty legacy fields remain blank, never inferred. */
export function ActivityPlanSheet({ plan, dirty = false }: { plan: ActivityPlan; dirty?: boolean }) {
  const c = plan.content;
  const times = activityTimeline(plan);
  const rows = Array.from({ length: Math.max(12, c.steps.length) }, (_, i) => c.steps[i]);
  const notes = [['対象・場所', [c.target, c.location].filter(Boolean).join('／')], ['役割分担', c.roles], ['参加しやすくする配慮', c.considerations], ['安全確認・緊急時の対応', c.safety]].filter(([, value]) => value);
  return <div className="activity-sheet" aria-label="指導案の帳票">
    <p className="activity-sheet-meta">{plan.isTemplate ? 'ひな形' : `実施日：${plan.date}`} ／ {plan.status}{dirty ? ' ／ 未保存の入力内容' : ''}</p>
    <table className="activity-sheet-overview">
      <colgroup><col style={{ width: '11%' }} /><col style={{ width: '33%' }} /><col style={{ width: '22%' }} /><col style={{ width: '34%' }} /></colgroup>
      <tbody>
        <tr><th colSpan={4} className="activity-sheet-title">{plan.title || '企画名'}</th></tr>
        <tr><th>支援項目</th><td>{c.supportItem || plan.kind}</td><th>講師名</th><td>{c.leader}</td></tr>
        <tr><th>内容</th><td>{c.summary}</td><td className="activity-sheet-counts">職員人数　{c.staffCount || '　'} 名<br />児童人数　{c.childCount || '　'} 名</td><td className="activity-sheet-counts">往復時間　{c.travelMinutes || '　'} 分程度<br />活動時間　{activityDuration(plan)} 分程度</td></tr>
        <tr><th>ねらい</th><td colSpan={3}>{c.goal}</td></tr>
        <tr><th>用意するもの</th><td colSpan={3} className="activity-sheet-preparations">{c.preparations.map((p) => <div key={p.id}>{p.done ? '☑' : '□'} {p.name}{p.quantity ? `（${p.quantity}）` : ''}{p.owner ? ` ／ 担当：${p.owner}` : ''}</div>)}</td></tr>
      </tbody>
    </table>
    <table className="activity-sheet-flow">
      <colgroup><col style={{ width: '22%' }} /><col style={{ width: '56%' }} /><col style={{ width: '22%' }} /></colgroup>
      <thead><tr><th>段階</th><th>指導内容</th><th>指導上の留意点</th></tr></thead>
      <tbody>{rows.map((s, i) => <tr key={s?.id || `blank-${i}`}><td>{s && <>{s.stage || `${i + 1}`}<small>{times[i]}<br />{s.minutes}分</small></>}</td><td>{s?.title}</td><td>{s?.support}</td></tr>)}</tbody>
    </table>
    <table className="activity-sheet-reflection"><tbody><tr><th>自己評価<br />及び<br />改善案</th><td>{c.reflection}{c.nextTime && <><br />【次回に活かすこと】<br />{c.nextTime}</>}</td></tr></tbody></table>
    {!!notes.length && <table className="activity-sheet-notes"><caption>補足・安全確認</caption><tbody>{notes.map(([label, value]) => <tr key={label}><th>{label}</th><td>{value}</td></tr>)}</tbody></table>}
  </div>;
}
