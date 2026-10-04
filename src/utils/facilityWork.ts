import { japanToday } from './activityPlans';

export type FacilityKind = 'inspection' | 'newsletter';
export type InspectionResult = '' | '問題なし' | '要対応' | '対象外';
export interface InspectionItem { id: string; label: string; result: InspectionResult; note: string; resolved: boolean }
export interface FacilityContent { author: string; notes: string; items: InspectionItem[]; greeting: string; body: string; upcoming: string; belongings: string; contact: string }
export interface FacilityDocument { id: string; organizationId: string; kind: FacilityKind; title: string; date: string; status: '下書き' | '完了' | '保管'; isTemplate: boolean; content: FacilityContent; revision: number; updatedAt: string }
export interface SupplyItem { id: string; organizationId: string; name: string; category: string; unit: string; quantity: number; threshold: number; location: string; note: string; requested: boolean; archived: boolean; revision: number; updatedAt: string }
export interface SupplyMovement { id: string; itemId: string; kind: '入庫' | '使用' | '調整'; delta: number; quantityAfter: number; note: string; createdAt: string }
export const inspectionLabels = ['玄関・避難経路の通行確認', '室内・遊具・備品の破損確認', '清掃・手洗い用品の確認', '救急用品・緊急連絡先の確認', '活動前の安全確認'];
export function emptyFacilityDocument(kind: FacilityKind): FacilityDocument {
  return { id: '', organizationId: '', kind, title: kind === 'inspection' ? '日常点検' : '保護者向けおたより', date: japanToday(), status: '下書き', isTemplate: false, revision: 0, updatedAt: '', content: { author: '', notes: '', items: kind === 'inspection' ? inspectionLabels.map((label) => ({ id: crypto.randomUUID(), label, result: '', note: '', resolved: false })) : [], greeting: '', body: '', upcoming: '', belongings: '', contact: '' } };
}
export function copyFacilityDocument(doc: FacilityDocument, isTemplate = false): FacilityDocument {
  const copy = structuredClone(doc);
  return { ...copy, id: '', organizationId: '', revision: 0, updatedAt: '', date: isTemplate ? '' : japanToday(), status: '下書き', isTemplate, content: { ...copy.content, author: '', notes: '', items: copy.content.items.map((i) => ({ ...i, id: crypto.randomUUID(), result: '', note: '', resolved: false })) } };
}
export function inspectionCounts(doc: FacilityDocument) {
  return { total: doc.content.items.length, checked: doc.content.items.filter((i) => i.result).length, outstanding: doc.content.items.filter((i) => i.result === '要対応' && !i.resolved).length };
}
function validDate(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value; }
export function validateFacilityDocument(doc: FacilityDocument): string[] {
  const errors: string[] = [];
  if (!['inspection', 'newsletter'].includes(doc.kind)) errors.push('種類を確認してください。');
  if (!doc.title.trim() || doc.title.length > 160) errors.push('名称は1〜160文字で入力してください。');
  if (!doc.isTemplate && !validDate(doc.date)) errors.push('正しい日付を入力してください。');
  if (!['下書き', '完了', '保管'].includes(doc.status)) errors.push('状態を確認してください。');
  for (const key of ['author', 'notes', 'greeting', 'body', 'upcoming', 'belongings', 'contact'] as const) if (typeof doc.content[key] !== 'string' || doc.content[key].length > 10000) errors.push('入力内容は各欄10,000文字以内にしてください。');
  if (doc.content.items.length > 80 || new Set(doc.content.items.map((i) => i.id)).size !== doc.content.items.length) errors.push('点検項目は重複なく80件以内にしてください。');
  for (const item of doc.content.items) {
    if (!item.label.trim() || item.label.length > 200 || item.note.length > 2000 || !['', '問題なし', '要対応', '対象外'].includes(item.result) || typeof item.resolved !== 'boolean') errors.push('点検項目名・結果・メモを確認してください。');
    if (item.result === '要対応' && !item.note.trim()) errors.push(`「${item.label}」の対応メモを入力してください。`);
  }
  if (doc.kind === 'inspection' && doc.status === '完了' && (!doc.content.author.trim() || !doc.content.items.length || doc.content.items.some((i) => !i.result))) errors.push('確認完了にするには、確認者とすべての点検結果を入力してください。');
  if (doc.kind === 'newsletter' && doc.status === '完了' && !doc.content.body.trim()) errors.push('おたよりの本文を入力してください。');
  if (new TextEncoder().encode(JSON.stringify(doc.content)).length > 180000) errors.push('内容が大きすぎます。項目や文章を減らしてください。');
  return [...new Set(errors)];
}
export function restoreFacilityDocument(raw: string | null, kind: FacilityKind): FacilityDocument | null {
  try {
    if (!raw || raw.length > 200000) return null;
    const d = JSON.parse(raw);
    if (d.kind !== kind || !d.content || !Array.isArray(d.content.items) || d.content.items.length > 80) return null;
    for (const key of ['id', 'organizationId', 'title', 'date', 'status', 'updatedAt']) if (typeof d[key] !== 'string') return null;
    for (const key of ['author', 'notes', 'greeting', 'body', 'upcoming', 'belongings', 'contact']) if (typeof d.content[key] !== 'string' || d.content[key].length > 10000) return null;
    if (typeof d.isTemplate !== 'boolean' || !Number.isInteger(d.revision) || d.revision < 0 || !['下書き', '完了', '保管'].includes(d.status)) return null;
    if (d.content.items.some((i: InspectionItem) => !i || typeof i.id !== 'string' || typeof i.label !== 'string' || typeof i.note !== 'string' || typeof i.resolved !== 'boolean' || !['', '問題なし', '要対応', '対象外'].includes(i.result))) return null;
    return d;
  } catch { return null; }
}
export function facilityDocumentText(doc: FacilityDocument): string {
  if (doc.kind === 'newsletter') return [doc.title, doc.date, doc.content.greeting, doc.content.body, doc.content.upcoming && `今後の予定\n${doc.content.upcoming}`, doc.content.belongings && `持ち物・お願い\n${doc.content.belongings}`, doc.content.contact && `お問い合わせ\n${doc.content.contact}`].filter(Boolean).join('\n\n');
  return [doc.title, `${doc.isTemplate ? 'ひな形' : doc.date} ／ ${doc.status}`, `確認者：${doc.content.author || '未入力'}`, ...doc.content.items.map((i) => `・${i.label}：${i.result || '未確認'}${i.result === '要対応' ? i.resolved ? '（対応済み）' : '（対応残り）' : ''}${i.note ? `\n  ${i.note}` : ''}`), doc.content.notes && `全体メモ\n${doc.content.notes}`].filter(Boolean).join('\n\n');
}
export function emptySupply(): SupplyItem { return { id: '', organizationId: '', name: '', category: '消耗品', unit: '個', quantity: 0, threshold: 1, location: '', note: '', requested: false, archived: false, revision: 0, updatedAt: '' }; }
export function validateSupply(item: SupplyItem): string[] {
  const errors: string[] = [];
  if (!item.name.trim() || item.name.length > 160) errors.push('品名は1〜160文字で入力してください。');
  if (!item.unit.trim() || item.unit.length > 20) errors.push('単位は1〜20文字で入力してください。');
  if (item.category.length > 80 || item.location.length > 160 || item.note.length > 2000) errors.push('分類・保管場所・メモの文字数を確認してください。');
  if (![item.quantity, item.threshold].every((n) => Number.isSafeInteger(n) && n >= 0 && n <= 1000000)) errors.push('数量と補充目安は0〜1,000,000の整数で入力してください。');
  return errors;
}
export function validateMovement(kind: SupplyMovement['kind'], delta: number, note: string): string[] {
  const errors: string[] = [];
  if (!['入庫', '使用', '調整'].includes(kind) || !Number.isSafeInteger(delta) || delta === 0 || Math.abs(delta) > 1000000 || (kind === '入庫' && delta < 0) || (kind === '使用' && delta > 0)) errors.push('変更する数量・区分を確認してください。');
  if (!note.trim() || note.length > 1000) errors.push('入出庫・調整の理由を1〜1,000文字で入力してください。');
  return errors;
}
export const needsRestock = (item: SupplyItem) => !item.archived && item.quantity <= item.threshold;
