// The manual dashboard values and browser observations are deliberately separate.
// No response body, URL, user ID or credentials are stored or sent.
export const FREE_EGRESS_GB = 5;
export const EGRESS_TARGET_GB = 3.5;
export const TRANSFER_HISTORY_LIMIT = 24;
export const SUPABASE_USAGE_URL = 'https://supabase.com/dashboard/org/_/usage';
const HISTORY_KEY = 'd-support:transfer-usage:v1';
const dayMs = 86_400_000;
export const transferToday = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(new Date());
export type TransferSample = {
  start: string; end: string; observed: string; uncached: number; cached: number;
};
const validDay = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
const validGB = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1_000_000;
export function parseTransferSample(value: unknown): TransferSample | null {
  if (!value || typeof value !== 'object') return null;
  const {start,end,observed,uncached,cached}=value as Partial<TransferSample>;
  if (!validDay(start) || !validDay(end) || !validDay(observed) || start >= end ||
      observed < start || observed > end || !validGB(uncached) || !validGB(cached)) return null;
  return {start,end,observed,uncached,cached};
}
export function parseTransferGB(value: string): number | undefined {
  const s=value.trim();
  if (!/^\d+(?:\.\d{1,6})?$/.test(s)) return undefined;
  const number=Number(s);
  return validGB(number) ? number : undefined;
}
export function assessFreeEgress(gb: number) {
  const percentage = gb / FREE_EGRESS_GB * 100;
  const level = percentage >= 100 ? 'limit' : percentage >= 85 ? 'high' : percentage >= 70 ? 'watch' : 'ok';
  return {percentage,level,remaining:Math.max(0,FREE_EGRESS_GB-gb)};
}
export function projectTransferSample(sample: TransferSample) {
  const span=(Date.parse(sample.end)-Date.parse(sample.start))/dayMs;
  // Use the observed day as the last partial day and don't project off fewer than seven dates.
  const elapsed=Math.min(span,(Date.parse(sample.observed)-Date.parse(sample.start))/dayMs+1);
  if (elapsed < 7 || elapsed >= span) return null;
  return {uncached:sample.uncached*span/elapsed,cached:sample.cached*span/elapsed};
}
export function mergeTransferSample(history: TransferSample[], item: TransferSample) {
  const key=(s:TransferSample)=>[s.observed,s.start,s.end].join('|');
  return [...history.filter(row=>key(row)!==key(item)),item]
    .sort((a,b)=>key(b).localeCompare(key(a))).slice(0,TRANSFER_HISTORY_LIMIT);
}
export function createTransferHistory(storage: Pick<Storage,'getItem'|'setItem'>, organizationId: string) {
  const key=HISTORY_KEY+':'+organizationId;
  return {
    read():TransferSample[] {
      const raw=storage.getItem(key);
      if (!raw) return [];
      if (raw.length>12000) throw Error('転送量の履歴を読み込めません。');
      const data:unknown=JSON.parse(raw);
      if (!Array.isArray(data)) throw Error('転送量の履歴を読み込めません。');
      return data.slice(0,TRANSFER_HISTORY_LIMIT).map(parseTransferSample).filter((row):row is TransferSample=>row!==null);
    },
    write(items: TransferSample[]) {
      storage.setItem(key,JSON.stringify(items.slice(0,TRANSFER_HISTORY_LIMIT)));
    },
  };
}

export function declaredResponseBytes(response: Pick<Response,'status'|'headers'>, method: string): number | null {
  if (method==='HEAD' || [204,205,304].includes(response.status)) return 0;
  const raw=response.headers.get('content-length');
  if (raw===null || !/^\d{1,16}$/.test(raw)) return null;
  const value=Number(raw);
  return Number.isSafeInteger(value) ? value : null;
}
type ApiUsage = {operation:string; requests:number; failures:number; measured:number; declaredBytes:number};
export function createTransferCounter() {
  let generation=0;
  const totals=new Map<string,ApiUsage>();
  return {
    begin(operation: string) {
      const epoch=generation;
      let settled=false;
      return (failed: boolean, bytes: number | null) => {
        if (settled || epoch!==generation) return;
        settled=true;
        const name=totals.has(operation)||totals.size<95?operation:'api.other';
        const row=totals.get(name) ?? {operation:name,requests:0,failures:0,measured:0,declaredBytes:0};
        row.requests++;
        if (failed) row.failures++;
        if (bytes!==null) {row.measured++;row.declaredBytes+=bytes;}
        totals.set(name,row);
      };
    },
    read() {
      return [...totals.values()].map(row=>({...row})).sort((a,b)=>b.requests-a.requests||a.operation.localeCompare(b.operation));
    },
    clear() {generation++;totals.clear();},
  };
}
export const browserTransferCounter=createTransferCounter();
