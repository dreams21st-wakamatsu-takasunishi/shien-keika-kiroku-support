export const activityKinds = ['工作', '運動', '調理', '外出', '生活・学習', 'その他'] as const;
export const activityStatuses = ['下書き', '準備完了', '実施済み', '保管'] as const;
export interface ActivityStep { id: string; title: string; minutes: number; support: string; stage?: string }
export interface ActivityPreparation { id: string; name: string; quantity: string; owner: string; done: boolean }
export interface ActivityContent {
  goal: string; target: string; location: string; leader: string; startTime: string;
  considerations: string; safety: string; roles: string; reflection: string; nextTime: string;
  steps: ActivityStep[]; preparations: ActivityPreparation[];
  supportItem?: string; summary?: string; staffCount?: string; childCount?: string; travelMinutes?: string;
}
export interface ActivityPlan {
  id: string; organizationId: string; title: string; kind: typeof activityKinds[number]; date: string;
  status: typeof activityStatuses[number]; isTemplate: boolean; content: ActivityContent;
  revision: number; updatedAt: string;
}
export function japanToday() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
}
export function emptyActivity(): ActivityPlan {
  return { id: '', organizationId: '', title: '', kind: 'その他', date: japanToday(), status: '下書き', isTemplate: false, revision: 0, updatedAt: '',
    content: { goal: '', target: '', location: '', leader: '', startTime: '14:00', considerations: '', safety: '', roles: '', reflection: '', nextTime: '', supportItem: '', summary: '', staffCount: '', childCount: '', travelMinutes: '', steps: [], preparations: [] } };
}
const baseTemplates = [
  { kind: '工作', title: '工作活動', goal: '素材や道具を選び、自分の工夫を表現する。', steps: ['見本と手順を確認', '材料を選んで制作', '作品紹介・片付け'], safety: 'はさみ・接着剤などの扱い、誤飲、道具の数を確認する。', preparations: ['材料', '道具', '机の養生・片付け用品'] },
  { kind: '運動', title: '運動・ゲーム活動', goal: '自分のペースで体を動かし、順番やルールを意識して参加する。', steps: ['体調確認・準備運動', '運動・ゲーム', '整理運動・振り返り'], safety: '活動スペース、接触・転倒、休息・水分補給、体調変化を確認する。', preparations: ['用具', '水分', '救急用品・活動スペース'] },
  { kind: '調理', title: '調理活動', goal: '手順や役割を確認し、協力しながら調理に取り組む。', steps: ['衛生・材料・手順確認', '調理', '試食・片付け'], safety: 'アレルギー、衛生、加熱・刃物、誤嚥、食材の保管を事前確認する。', preparations: ['食材・アレルギー確認', '調理器具', '衛生用品'] },
  { kind: '外出', title: '外出活動', goal: '公共の場の過ごし方を確認し、体験を楽しむ。', steps: ['予定・約束・持ち物確認', '移動・現地活動', '帰所・振り返り'], safety: '経路・天候・人数確認・引率配置・トイレ・緊急連絡先・体調への対応を確認する。', preparations: ['行程・緊急連絡先', '持ち物・水分', '車両・座席・交通費確認'] },
] as const;
export const activityTemplates: ActivityPlan[] = baseTemplates.map((t) => {
  const p = emptyActivity();
  return { ...p, id: `builtin-${t.kind}`, title: t.title, kind: t.kind, isTemplate: true, date: '',
    content: { ...p.content, goal: t.goal, safety: t.safety,
      steps: t.steps.map((title, i) => ({ id: `step-${i}`, title, minutes: [5, 30, 10][i], support: '' })),
      preparations: t.preparations.map((name, i) => ({ id: `prep-${i}`, name, quantity: '', owner: '', done: false })) } };
});
export function copyActivity(source: ActivityPlan, asTemplate = false): ActivityPlan {
  return { ...structuredClone(source), id: '', organizationId: '', revision: 0, updatedAt: '', date: asTemplate ? '' : japanToday(),
    isTemplate: asTemplate, status: '下書き', title: `${source.title}${asTemplate ? '（ひな形）' : '（複製）'}`.slice(0, 160),
    content: { ...structuredClone(source.content), reflection: '', nextTime: '', preparations: source.content.preparations.map((item) => ({ ...item, done: false })) } };
}
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
export function validateActivity(plan: ActivityPlan): string[] {
  const errors: string[] = [];
  if (!plan.title.trim() || plan.title.length > 160) errors.push('活動名を1～160文字で入力してください。');
  if (!activityKinds.includes(plan.kind) || !activityStatuses.includes(plan.status)) errors.push('活動の種類・状態を確認してください。');
  if (!plan.isTemplate && !validDate(plan.date)) errors.push('実施日を正しく入力してください。');
  if (plan.content.startTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(plan.content.startTime)) errors.push('開始時刻を正しく入力してください。');
  if (Object.values(plan.content).some((v) => typeof v === 'string' && v.length > 10000)) errors.push('各文章は10,000文字以内で入力してください。');
  for (const key of ['staffCount', 'childCount', 'travelMinutes'] as const) {
    const value = plan.content[key];
    if (value !== undefined && (typeof value !== 'string' || (value !== '' && (!/^\d{1,4}$/.test(value) || Number(value) > (key === 'travelMinutes' ? 1440 : 1000))))) errors.push('人数は0～1000名、往復時間は0～1440分の整数で入力してください。');
  }
  if (plan.content.steps.some((s) => s.stage !== undefined && (typeof s.stage !== 'string' || s.stage.length > 100))) errors.push('段階は100文字以内で入力してください。');
  if (new TextEncoder().encode(JSON.stringify(plan.content)).length > 180000) errors.push('案の文章量が多すぎます。内容を分けるか短くしてください。');
  if (plan.content.steps.length > 40 || plan.content.preparations.length > 80) errors.push('流れは40件、準備物は80件まで登録できます。');
  if (plan.content.steps.some((s) => !s.title.trim() || s.title.length > 200 || s.support.length > 2000 || !Number.isInteger(s.minutes) || s.minutes < 1 || s.minutes > 600)) errors.push('活動の流れには内容と1～600分の所要時間を入力してください。');
  if (plan.content.preparations.some((p) => !p.name.trim() || p.name.length > 200 || p.quantity.length > 100 || p.owner.length > 160)) errors.push('準備物の名称・数量・担当を確認してください。');
  if (activityDuration(plan) > 1440) errors.push('活動の合計時間は24時間以内にしてください。');
  if (plan.status === '準備完了' && (!plan.content.goal.trim() || !plan.content.safety.trim() || !plan.content.steps.length || plan.content.preparations.some((p) => !p.done))) errors.push('準備完了にする前に、ねらい・活動の流れ・安全確認を入力し、準備物をチェックしてください。');
  return errors;
}
export function activityDuration(plan: ActivityPlan) { return plan.content.steps.reduce((sum, s) => sum + (Number.isFinite(s.minutes) ? s.minutes : 0), 0); }
export function activityTimeline(plan: ActivityPlan) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(plan.content.startTime)) return plan.content.steps.map(() => '時刻未設定');
  if (plan.content.steps.some((s) => !Number.isInteger(s.minutes) || s.minutes < 1 || s.minutes > 600)) return plan.content.steps.map(() => '時刻未確定');
  let minute = Number(plan.content.startTime.slice(0, 2)) * 60 + Number(plan.content.startTime.slice(3));
  const format = (n: number) => `${n >= 1440 ? '翌日 ' : ''}${String(Math.floor(n / 60) % 24).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
  return plan.content.steps.map((s) => { const start = minute; minute += s.minutes; return `${format(start)}～${format(minute)}`; });
}
export function activityText(plan: ActivityPlan) {
  const c = plan.content; const times = activityTimeline(plan);
  return [`活動・指導案：${plan.title}`, `${plan.isTemplate ? 'ひな形' : `実施日：${plan.date}`}／${plan.kind}／${plan.status}`, `対象：${c.target || '未設定'}／場所：${c.location || '未設定'}／主担当：${c.leader || '未設定'}`,
    `支援項目：${c.supportItem || plan.kind}／内容：${c.summary || '未設定'}`, `職員人数：${c.staffCount || '未設定'}名／児童人数：${c.childCount || '未設定'}名／往復時間：${c.travelMinutes || '未設定'}分`,
    `ねらい\n${c.goal}`, `活動の流れ（計${activityDuration(plan)}分）`, ...c.steps.map((s, i) => `${i + 1}. ${s.stage ? `${s.stage} ` : ''}${times[i]} ${s.title}\n   支援・配慮：${s.support || '未設定'}`),
    '準備物', ...c.preparations.map((p) => `${p.done ? '確認済' : '未確認'}：${p.name} ${p.quantity}／担当：${p.owner || '未設定'}`),
    `役割分担\n${c.roles}`, `参加しやすくする配慮\n${c.considerations}`, `安全・緊急時の対応\n${c.safety}`, `振り返り\n${c.reflection}`, `次回に活かすこと\n${c.nextTime}`].join('\n\n');
}
export function restoreActivityDraft(raw: string | null): ActivityPlan | null {
  try {
    if (!raw || raw.length > 200000) return null;
    const p = JSON.parse(raw) as ActivityPlan; const c = p.content;
    if (!c || !activityKinds.includes(p.kind) || !activityStatuses.includes(p.status) || typeof p.title !== 'string' || typeof p.id !== 'string' || typeof p.date !== 'string' || typeof p.isTemplate !== 'boolean' || !Number.isInteger(p.revision) || p.revision < 0) return null;
    if (['goal','target','location','leader','startTime','considerations','safety','roles','reflection','nextTime'].some((k) => typeof c[k as keyof ActivityContent] !== 'string')) return null;
    if (['supportItem','summary','staffCount','childCount','travelMinutes'].some((k) => c[k as keyof ActivityContent] !== undefined && typeof c[k as keyof ActivityContent] !== 'string')) return null;
    if (!Array.isArray(c.steps) || c.steps.length > 40 || c.steps.some((s) => typeof s.id !== 'string' || typeof s.title !== 'string' || typeof s.support !== 'string' || !Number.isFinite(s.minutes) || (s.stage !== undefined && (typeof s.stage !== 'string' || s.stage.length > 100)))) return null;
    if (!Array.isArray(c.preparations) || c.preparations.length > 80 || c.preparations.some((s) => ['id','name','quantity','owner'].some((k) => typeof s[k as keyof ActivityPreparation] !== 'string') || typeof s.done !== 'boolean')) return null;
    return p;
  } catch { return null; }
}
