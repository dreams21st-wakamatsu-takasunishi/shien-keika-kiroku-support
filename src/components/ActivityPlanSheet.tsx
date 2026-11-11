import React from 'react';
import { activityDuration, activitySupportItem, activityTimeline, type ActivityPlan } from '../utils/activityPlans';

/** Shared screen/print sheet. Empty legacy fields remain blank, never inferred. */
export function ActivityPlanSheet({ plan, dirty = false, activeField, onSelectField, navigationDisabled }: {
  plan: ActivityPlan; dirty?: boolean; activeField?: string | null; onSelectField?: (key: string) => void; navigationDisabled?: boolean;
}) {
  const c = plan.content;
  // Keep a just-added draft row editable in the preview, but never pad the
  // print sheet with unused rows or count empty draft rows in its timeline.
  const rows = onSelectField ? c.steps : c.steps.filter(s => s.title.trim() || s.stage?.trim() || s.support.trim());
  const sheetPlan = rows === c.steps ? plan : { ...plan, content: { ...c, steps: rows } };
  const times = activityTimeline(sheetPlan);
  const mark = (key: string) => ({ 'data-activity-preview': key, 'data-active': activeField === key || undefined });
  const jump = (key: string, label: string, value: React.ReactNode, empty = '未入力', inline = false) =>
    onSelectField ? <button type="button" disabled={navigationDisabled} aria-label={`編集：${label}`} className={`activity-sheet-jump${inline ? ' is-inline' : ''}`} onClick={() => onSelectField(key)}>{value || <span className="activity-sheet-empty">{empty}</span>}</button> : value;
  const notes = [['活動場所', c.location, 'targetLocation'], ['役割分担', c.roles, 'roles'], ['参加しやすくする配慮', c.considerations, 'considerations'], ['安全確認・緊急時の対応', c.safety, 'safety']].filter(([, value, key]) => onSelectField || value || activeField === key);
  return <div className="activity-sheet" aria-label="指導案の帳票">
    <p className="activity-sheet-meta">{plan.isTemplate ? 'ひな形' : <span {...mark('date')}>{jump('date', '実施日', `実施日：${plan.date || '未設定'}`, undefined, true)}</span>} ／ <span {...mark('status')}>{jump('status', '状態', plan.status, undefined, true)}</span>{dirty ? ' ／ 未保存の入力内容' : ''}{(onSelectField || activeField === 'startTime') && !rows.length && <span {...mark('startTime')}> ／ {jump('startTime', '開始時刻', `開始：${c.startTime || '未設定'}`, undefined, true)}</span>}</p>
    <table className="activity-sheet-overview">
      <colgroup><col style={{ width: '11%' }} /><col style={{ width: '33%' }} /><col style={{ width: '22%' }} /><col style={{ width: '34%' }} /></colgroup>
      <tbody>
        <tr><th colSpan={4} className="activity-sheet-title" {...mark('title')}>{jump('title', '活動名', plan.title || '企画名')}</th></tr>
        <tr><th>支援項目</th><td {...mark('supportItem')}>{jump('supportItem', '支援項目・種類', activitySupportItem(plan))}</td><th>講師名</th><td {...mark('leader')}>{jump('leader', '主担当', c.leader)}</td></tr>
        <tr><th>内容</th><td {...mark('summary')}>{jump('summary', '内容（概要）', c.summary)}</td><td className="activity-sheet-counts"><div {...mark('staffCount')}>{jump('staffCount', '職員人数', `職員人数　${c.staffCount || '　'} 名`)}</div><div {...mark('childCount')}>{jump('childCount', '児童人数', `児童人数　${c.childCount || '　'} 名`)}</div></td><td className="activity-sheet-counts"><div {...mark('travelMinutes')}>{jump('travelMinutes', '往復時間', `往復時間　${c.travelMinutes || '　'} 分程度`)}</div>活動時間　{activityDuration(sheetPlan)} 分程度</td></tr>
        <tr><th>ねらい</th><td colSpan={3} {...mark('goal')}>{jump('goal', '活動のねらい', c.goal)}</td></tr>
        <tr><th>用意するもの</th><td colSpan={3} className="activity-sheet-preparations"><div {...mark('preparationText')}>{jump('preparationText', '用意するもの', c.preparationText)}</div>{c.preparations.map((p, i) => <div key={p.id} {...mark(`prep:${p.id}`)}>{jump(`prep:${p.id}`, `準備チェック ${i + 1}`, `${p.done ? '☑' : '□'} ${p.name}${p.quantity ? `（${p.quantity}）` : ''}${p.owner ? ` ／ 担当：${p.owner}` : ''}`)}</div>)}</td></tr>
      </tbody>
    </table>
    {(rows.length > 0 || onSelectField) && <table className="activity-sheet-flow">
      <colgroup><col style={{ width: '22%' }} /><col style={{ width: '56%' }} /><col style={{ width: '22%' }} /></colgroup>
      <thead><tr><th>段階</th><th>指導内容</th><th>指導上の留意点</th></tr></thead>
      <tbody>{rows.map((s, i) => <tr key={s.id}>
        <td><div {...mark(`step:${s.id}:stage`)}>{jump(`step:${s.id}:stage`, `${i + 1}番目の段階`, s.stage || `${i + 1}`)}</div>
          <small><span {...(i === 0 ? mark('startTime') : {})}>{i === 0 ? jump('startTime', '開始時刻', times[i], undefined, true) : times[i]}</span><br /><span {...mark(`step:${s.id}:time`)}>{jump(`step:${s.id}:time`, `${i + 1}番目の所要時間`, `${s.minutes}分`, undefined, true)}</span></small></td>
        <td {...mark(`step:${s.id}:title`)}>{jump(`step:${s.id}:title`, `${i + 1}番目の活動内容`, s.title)}</td>
        <td {...mark(`step:${s.id}:support`)}>{jump(`step:${s.id}:support`, `${i + 1}番目の支援・声かけ・配慮`, s.support)}</td>
      </tr>)}
      {!rows.length && <tr><td colSpan={3} {...mark('addStep')}>{jump('addStep', '活動の流れを追加', '＋ 最初の流れを追加')}</td></tr>}</tbody>
    </table>}
    <table className="activity-sheet-reflection"><tbody><tr><th>自己評価<br />及び<br />改善案</th><td><div {...mark('reflection')}>{jump('reflection', '実施後の振り返り', c.reflection)}</div>{(onSelectField || c.nextTime || activeField === 'nextTime') && <div {...mark('nextTime')}>{jump('nextTime', '次回に活かすこと', <>【次回に活かすこと】<br />{c.nextTime}</>)}</div>}</td></tr></tbody></table>
    {(notes.length > 0 || c.target) && <table className="activity-sheet-notes"><caption>補足・安全確認</caption><tbody>{notes.map(([label, value, key]) => <tr key={key}><th>{label}</th><td {...mark(key)}>{jump(key, label, value)}</td></tr>)}{c.target && <tr><th>対象（旧記載）</th><td>{c.target}</td></tr>}</tbody></table>}
  </div>;
}
