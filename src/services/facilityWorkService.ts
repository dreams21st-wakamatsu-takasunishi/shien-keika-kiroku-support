import { supabase } from '../lib/supabase';
import { restoreFacilityDocument, validateFacilityDocument, validateMovement, validateSupply, type FacilityDocument, type FacilityKind, type SupplyItem, type SupplyMovement } from '../utils/facilityWork';

const localKey = 'd-support-facility-local-v1';
type LocalData = { documents: FacilityDocument[]; supplies: SupplyItem[]; movements: (SupplyMovement & { requestId: string })[] };
function localData(): LocalData {
  const raw = JSON.parse(localStorage.getItem(localKey) || '{}');
  return { documents: Array.isArray(raw.documents) ? raw.documents.flatMap((d: FacilityDocument) => { const valid = restoreFacilityDocument(JSON.stringify(d), d.kind); return valid ? [valid] : []; }) : [], supplies: Array.isArray(raw.supplies) ? raw.supplies : [], movements: Array.isArray(raw.movements) ? raw.movements : [] };
}
function writeLocal(data: LocalData) { localStorage.setItem(localKey, JSON.stringify(data)); }
const isLocal = (org: string) => !supabase && org === 'local';
function requireClient() { if (!supabase) throw new Error('ログイン状態を確認してください。'); return supabase; }
const conflict = () => new Error('他の職員による変更と競合しました。入力は残っています。一覧を更新して保存済みの内容を確認してください。');
function documentRow(row: any): FacilityDocument { return { id: row.id, organizationId: row.organization_id, kind: row.kind, title: row.title, date: row.document_date || '', status: row.status, isTemplate: row.is_template, content: row.content, revision: row.revision, updatedAt: row.updated_at }; }
function supplyRow(row: any): SupplyItem { return { id: row.id, organizationId: row.organization_id, name: row.name, category: row.category, unit: row.unit, quantity: row.quantity, threshold: row.threshold, location: row.location, note: row.note, requested: row.requested, archived: row.archived, revision: row.revision, updatedAt: row.updated_at }; }
function movementRow(row: any): SupplyMovement { return { id: row.id, itemId: row.item_id, kind: row.kind, delta: row.delta, quantityAfter: row.quantity_after, note: row.note, createdAt: row.created_at }; }
export async function listFacilityDocuments(org: string, kind: FacilityKind): Promise<FacilityDocument[]> {
  if (isLocal(org)) return localData().documents.filter((d) => d.kind === kind).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const { data, error } = await requireClient().from('facility_documents').select('*').eq('organization_id', org).eq('kind', kind).order('updated_at', { ascending: false }).limit(500);
  if (error) throw error;
  return (data || []).map(documentRow);
}
export async function saveFacilityDocument(doc: FacilityDocument, org: string): Promise<FacilityDocument> {
  const errors = validateFacilityDocument(doc); if (errors.length) throw new Error(errors.join('\n'));
  if (isLocal(org)) {
    const data = localData(); const old = data.documents.find((d) => d.id === doc.id);
    if (doc.id && (!old || old.revision !== doc.revision)) throw conflict();
    const saved = { ...doc, id: doc.id || crypto.randomUUID(), organizationId: org, revision: doc.revision + 1, updatedAt: new Date().toISOString() };
    data.documents = [saved, ...data.documents.filter((d) => d.id !== saved.id)]; writeLocal(data); return saved;
  }
  const client = requireClient(); const payload = { title: doc.title.trim(), document_date: doc.isTemplate ? null : doc.date, status: doc.status, is_template: doc.isTemplate, content: doc.content };
  const result = doc.id ? await client.from('facility_documents').update({ ...payload, revision: doc.revision + 1 }).eq('organization_id', org).eq('id', doc.id).eq('revision', doc.revision).select('*').maybeSingle() : await client.from('facility_documents').insert({ ...payload, kind: doc.kind, organization_id: org }).select('*').single();
  if (result.error) throw result.error; if (!result.data) throw conflict(); return documentRow(result.data);
}
export async function listSupplies(org: string): Promise<SupplyItem[]> {
  if (isLocal(org)) return localData().supplies.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  const { data, error } = await requireClient().from('supply_items').select('*').eq('organization_id', org).order('name').limit(1000);
  if (error) throw error; return (data || []).map(supplyRow);
}
export async function saveSupply(item: SupplyItem, org: string): Promise<SupplyItem> {
  const errors = validateSupply(item); if (errors.length) throw new Error(errors.join('\n'));
  if (isLocal(org)) {
    const data = localData(); const old = data.supplies.find((d) => d.id === item.id);
    if (item.id && (!old || old.revision !== item.revision)) throw conflict();
    const saved = { ...item, quantity: old ? old.quantity : 0, id: item.id || crypto.randomUUID(), organizationId: org, revision: item.revision + 1, updatedAt: new Date().toISOString() };
    data.supplies = [saved, ...data.supplies.filter((d) => d.id !== saved.id)]; writeLocal(data); return saved;
  }
  const client = requireClient(); const payload = { name: item.name.trim(), category: item.category, unit: item.unit.trim(), threshold: item.threshold, location: item.location, note: item.note, requested: item.requested, archived: item.archived };
  const result = item.id ? await client.from('supply_items').update({ ...payload, revision: item.revision + 1 }).eq('organization_id', org).eq('id', item.id).eq('revision', item.revision).select('*').maybeSingle() : await client.from('supply_items').insert({ ...payload, organization_id: org }).select('*').single();
  if (result.error) throw result.error; if (!result.data) throw conflict(); return supplyRow(result.data);
}
export async function moveSupply(org: string, itemId: string, revision: number, requestId: string, kind: SupplyMovement['kind'], delta: number, note: string): Promise<SupplyMovement> {
  const errors = validateMovement(kind, delta, note); if (errors.length) throw new Error(errors.join('\n'));
  if (isLocal(org)) {
    const data = localData(); const existing = data.movements.find((m) => m.requestId === requestId);
    if (existing) { if (existing.itemId !== itemId || existing.delta !== delta || existing.kind !== kind || existing.note !== note.trim()) throw new Error('再送内容が異なります。一覧を更新してください。'); return existing; }
    const item = data.supplies.find((i) => i.id === itemId);
    if (!item || item.archived || item.revision !== revision) throw conflict();
    const quantityAfter = item.quantity + delta;
    if (quantityAfter < 0 || quantityAfter > 1000000) throw new Error('在庫数量が0〜1,000,000の範囲を超えます。');
    const createdAt = new Date().toISOString(); const movement = { id: crypto.randomUUID(), itemId, requestId, kind, delta, note: note.trim(), quantityAfter, createdAt };
    item.quantity = quantityAfter; item.revision++; item.updatedAt = createdAt;
    if (kind === '入庫' && item.quantity > item.threshold) item.requested = false;
    data.movements.unshift(movement); writeLocal(data); return movement;
  }
  const { data, error } = await requireClient().rpc('move_supply_stock', { p_organization_id: org, p_item_id: itemId, p_revision: revision, p_request_id: requestId, p_kind: kind, p_delta: delta, p_note: note.trim() });
  if (error) throw error;
  return movementRow(data);
}
export async function listSupplyMovements(org: string, itemId: string): Promise<SupplyMovement[]> {
  if (isLocal(org)) return localData().movements.filter((m) => m.itemId === itemId).slice(0, 100);
  const { data, error } = await requireClient().from('supply_movements').select('*').eq('organization_id', org).eq('item_id', itemId).order('created_at', { ascending: false }).limit(100);
  if (error) throw error; return (data || []).map(movementRow);
}
export function facilityError(e: unknown): string {
  const message = e instanceof Error ? e.message : (e as { message?: string })?.message || '操作を完了できませんでした。';
  if (/row-level security|permission denied|FACILITY_ACCESS/i.test(message)) return '事業所・ログイン権限・共有端末の登録状態を確認してください。入力は残っています。';
  if (/FACILITY_CONFLICT/i.test(message)) return conflict().message;
  if (/schema cache|does not exist/i.test(message)) return '施設業務の保存先が未設定です。管理者によるデータベース更新が必要です。入力は残っています。';
  return message;
}
