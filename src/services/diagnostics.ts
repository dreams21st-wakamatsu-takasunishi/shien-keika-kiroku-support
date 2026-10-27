// Strictly structured device-local diagnostics. Never store messages, URLs, DOM text,
// form values, identities, record bodies, tokens, request/response bodies or stacks.
export const DIAGNOSTICS_KEY = 'd-support:diagnostics:v1';
export const DIAGNOSTICS_RETENTION_DAYS = 30;
const MAX_EVENTS = 200, MAX_ACTIONS = 12;
const screens = new Set(['home','form','records','preview','meetings','learning','trafficCost','activityPlans','facilityWork','legalTraining','children','templates','team','plans','dailyChanges','todayWork','attendance','calendar','monthlySchedule','operations','communication','assistant']);
const resources = new Set(['support_records','record_drafts','children','recorder_profiles','profiles','daily_child_plans','staff_schedule_items','transport_runs','meeting_cases','morning_meeting_records','legal_training_categories','legal_training_videos',
  'save_support_records_guarded','save_record_draft_guarded','finish_record_draft_save','take_over_record_draft_children','take_over_record_draft_children_into_existing','get_personal_transport_dashboard','issue_personal_staff_qr','set_recorder_menu_preferences',
  'optimize-transport-route','manage-member','manage-recorder-login',
  'activity_plans','announcement_confirmations','announcements','attendance_correction_requests','attendance_records','audit_logs','calendar_events','child_regular_day_schedules','daily_transport_requirements',
  'facility_documents','handover_confirmations','handover_items','legal_training_settings','meeting_export_events','meeting_progress_records','meeting_transcripts','member_invitations','morning_meeting_confirmations','morning_meeting_templates',
  'organization_ai_settings','organization_devices','organization_role_permissions','organization_service_settings','organizations','push_subscriptions','record_revisions','record_templates','schools','staff_shift_requests','staff_shift_templates',
  'supply_items','supply_movements','support_plans','transport_area_zones','transport_map_locations','transport_plan_days','transport_route_settings','transport_stop_events','transport_time_change_history','vehicles',
  'attendance-qr-login','calculate-transport-matrix','geocode-transport-locations','home-assistant','invite-member','polish-record','send-announcement-notification','send-transport-notification','staff-login',
  'cancel_transport_field_action','change_transport_assignment','current_organization_device_id','current_recorder_profile_id','delete_monthly_daily_schedules','delete_organization_device','delete_reviewed_part_time_shift_request',
  'get_current_staff_device_access','get_personal_staff_qr_device','get_personal_staff_qr_status','move_supply_stock','punch_attendance','record_transport_field_action','register_attendance_kiosk_device','rename_organization_device',
  'replace_child_monthly_transport_requirements','replace_monthly_transport_requirements','request_attendance_correction','request_personal_staff_qr_device','review_attendance_correction','review_organization_device','revoke_personal_staff_qr',
  'get_external_ai_policy','set_external_ai_policy','confirm_attendance_break',
  'save_morning_meeting_record_guarded','set_child_sibling_links','set_recorder_pin','set_transport_cover','set_transport_operation_event','take_over_record_draft_child','take_over_record_draft','update_shift_request_defaults',
  'update_staff_device_policy','update_transport_run_status','verify_recorder_pin']);
for(const resource of ['get_child_document_register','save_child_document_settings','save_child_document_entry','lesson-learning','lesson-accounts','lesson-account-credentials','lesson-student-registration','lesson-task-batches','lesson-task-audit','lesson-managed-content','facility-login'])resources.add(resource);
for(const resource of ['change_workspace_item_lifecycle','list_workspace_trash','withdraw_own_workspace_request','workspace_lifecycle_events'])resources.add(resource);
const serverCodes = new Set(['57014','42501','23505','23503','22023','40001','40P01','53300','53100','57P03','PGRST116','PGRST202','PGRST301','PGRST302']);
const methods = new Set(['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS']);
const localOperations = new Set(['app.start','connection.online','connection.offline','record.save','record.save.complete','record.draft.cleanup','record.save.deleted_id_replaced','record.save.same_content_confirmed','record.save.save_result_rechecked','record.save.cancelled','record.overwrite.confirm','record.overwrite.cancel','record.save.single','record.save.all','diagnostics.export','runtime.error','runtime.rejection']);
export type DiagnosticCode = 'NETWORK'|'CONFLICT'|'DUPLICATE'|'DELETED_RECORD'|'PERMISSION'|'VALIDATION'|'SERVER'|'UNEXPECTED'|'RECOVERY'|'OK';
const codes = new Set<DiagnosticCode>(['NETWORK','CONFLICT','DUPLICATE','DELETED_RECORD','PERMISSION','VALIDATION','SERVER','UNEXPECTED','RECOVERY','OK']);
export interface DiagnosticAction { at: string; operation: string }
export interface DiagnosticEvent {
  id: string; at: string; version: string; screen: string; online: boolean;
  kind: 'error'|'recovery'|'connection'; code: DiagnosticCode; operation: string;
  httpStatus?: number; actions: DiagnosticAction[];
  requestScreen?: string; requestMethod?: string; durationMs?: number; serverCode?: string;
}
const safeOperation = (value: unknown) => typeof value === 'string' && (localOperations.has(value) || (value.startsWith('api.') && resources.has(value.slice(4))) || (value.startsWith('screen.') && screens.has(value.slice(7)))) ? value : 'api.other';
const validTime = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(value) && Number.isFinite(Date.parse(value));
const safeVersion = (value: unknown) => typeof value === 'string' && /^[a-zA-Z0-9_.-]{1,60}$/.test(value) ? value : 'unknown';
export function sanitizeDiagnostic(value: unknown): DiagnosticEvent | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as DiagnosticEvent;
  if (!validTime(item.at) || !['error','recovery','connection'].includes(item.kind) || !codes.has(item.code)) return null;
  return { id: typeof item.id === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(item.id) ? item.id : 'unknown',
    at: item.at, version: safeVersion(item.version), screen: screens.has(item.screen) ? item.screen : 'unknown',
    online: item.online === true, kind: item.kind, code: item.code, operation: safeOperation(item.operation || ''),
    ...(Number.isInteger(item.httpStatus) && item.httpStatus! >= 100 && item.httpStatus! <= 599 ? {httpStatus:item.httpStatus} : {}),
    ...(typeof item.requestScreen==='string'?{requestScreen:screens.has(item.requestScreen)?item.requestScreen:'unknown'}:{}),
    ...(methods.has(item.requestMethod||'')?{requestMethod:item.requestMethod}:{}),
    ...(typeof item.durationMs==='number'&&Number.isFinite(item.durationMs)&&item.durationMs>=0&&item.durationMs<=3600000?{durationMs:Math.round(item.durationMs)}:{}),
    ...(serverCodes.has(item.serverCode||'')?{serverCode:item.serverCode}:{}),
    actions: Array.isArray(item.actions) ? item.actions.slice(-MAX_ACTIONS).filter(action=>validTime(action?.at)).map(action=>({at:action.at,operation:safeOperation(action.operation || '')})) : [] };
}
export function createDiagnosticStore(storage: Pick<Storage,'getItem'|'setItem'|'removeItem'>, now = ()=>Date.now()) {
  let fallback: DiagnosticEvent[] = [], persisted = true;
  const prune = (items: unknown[]) => items.map(sanitizeDiagnostic).filter((item): item is DiagnosticEvent=>Boolean(item && Date.parse(item.at) >= now()-DIAGNOSTICS_RETENTION_DAYS*86400000 && Date.parse(item.at) <= now()+60000)).slice(-MAX_EVENTS);
  const read = () => { if(!persisted) return [...fallback]; try { const raw=JSON.parse(storage.getItem(DIAGNOSTICS_KEY)||'[]'); fallback=prune(Array.isArray(raw)?raw:[]); } catch { persisted=false; } return [...fallback]; };
  const write = (items: DiagnosticEvent[]) => { fallback=prune(items); try { storage.setItem(DIAGNOSTICS_KEY,JSON.stringify(fallback)); persisted=true; } catch { persisted=false; } };
  return { read, append: (event: DiagnosticEvent)=>write([...read(),event]), compact:()=>write(read()),
    clear: ()=>{fallback=[];try{storage.removeItem(DIAGNOSTICS_KEY);persisted=true;}catch{persisted=false;}},
    persisted: ()=>persisted };
}
let screen='unknown', version='unknown', actions: DiagnosticAction[]=[];
let store: ReturnType<typeof createDiagnosticStore> | undefined;
function currentStore() {
  if (!store && typeof window !== 'undefined') store=createDiagnosticStore({getItem:key=>window.localStorage.getItem(key),setItem:(key,value)=>window.localStorage.setItem(key,value),removeItem:key=>window.localStorage.removeItem(key)});
  return store;
}
export function diagnosticAction(operation: string) {
  actions=[...actions,{at:new Date().toISOString(),operation:safeOperation(operation)}].slice(-MAX_ACTIONS);
}
export function setDiagnosticScreen(value: string) { screen=screens.has(value)?value:'unknown'; diagnosticAction(`screen.${screen}`); }
export function classifyDiagnosticError(error: unknown, status?: number): DiagnosticCode {
  const value=error && typeof error==='object'?error as {message?:unknown;code?:unknown}:{};
  const message=typeof value.message==='string'?value.message:'';
  const code=typeof value.code==='string'?value.code:'';
  if (/network|fetch|connection|offline|通信/i.test(message)) return 'NETWORK';
  if (/CONFLICT|競合|別端末.*更新/.test(message) || status===409) return 'CONFLICT';
  if (/削除され|RECORD_DELETED/.test(message)) return 'DELETED_RECORD';
  if (/DUPLICATE|重複/.test(message) || code==='23505') return 'DUPLICATE';
  if (status===401 || status===403 || code==='42501') return 'PERMISSION';
  if (status && status>=500) return 'SERVER';
  if (status && status>=400 || code==='22023' || code==='23503') return 'VALIDATION';
  return 'UNEXPECTED';
}
export function recordDiagnostic(operation: string, error?: unknown, options: {kind?:DiagnosticEvent['kind'];code?:DiagnosticCode;httpStatus?:number;requestScreen?:string;requestMethod?:string;durationMs?:number}={}) {
  try {
    const event: DiagnosticEvent={id:crypto.randomUUID(),at:new Date().toISOString(),version,screen,
      online:typeof navigator==='undefined'||navigator.onLine,kind:options.kind||'error',
      code:options.code||classifyDiagnosticError(error,options.httpStatus),operation:safeOperation(operation),httpStatus:options.httpStatus,actions:[...actions],
      requestScreen:options.requestScreen,requestMethod:options.requestMethod,durationMs:options.durationMs,
      serverCode:error&&typeof error==='object'&&'code' in error&&typeof error.code==='string'&&serverCodes.has(error.code)?error.code:undefined};
    currentStore()?.append(event);
    if(typeof window!=='undefined') window.dispatchEvent(new Event('d-support:diagnostics'));
  } catch { /* Diagnostics must never break the user's operation. */ }
}
export const readDiagnostics = ()=>currentStore()?.read() || [];
export const diagnosticsPersisted = ()=>currentStore()?.persisted() ?? false;
export const clearDiagnostics = ()=>currentStore()?.clear();
export function apiDiagnosticOperation(input: RequestInfo | URL): string {
  try { const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
    const path=url.pathname.split('/').filter(Boolean); const resource=path.at(-1)||'';
    return resources.has(resource)?`api.${resource}`:'api.other'; } catch {return 'api.other';}
}
export async function diagnosticFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const operation=apiDiagnosticOperation(input); diagnosticAction(operation);
  const requestScreen=screen,started=performance.now(),requestMethod=(init?.method||(typeof Request!=='undefined'&&input instanceof Request?input.method:'GET')).toUpperCase();
  try {const response=await fetch(input,init);
    const durationMs=performance.now()-started;
    if(!response.ok){let error:unknown;try{error=await response.clone().json();}catch{} recordDiagnostic(operation,error,{httpStatus:response.status,requestScreen,requestMethod,durationMs});}
    return response;
  } catch(error) { if(!(error&&typeof error==='object'&&'name' in error&&error.name==='AbortError'))recordDiagnostic(operation,error,{code:'NETWORK',requestScreen,requestMethod,durationMs:performance.now()-started});throw error; }
}
export function formatDiagnosticReport(event: DiagnosticEvent): string {
  const item=sanitizeDiagnostic(event);if(!item)return 'このエラー情報は読み出せません。';
  return [
    `発生日時：${new Date(item.at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})}（日本時間）`,
    `${item.kind==='error'?'失敗した操作':'対象操作'}：${item.operation}`,
    `要求開始画面：${item.requestScreen||'未記録（旧版）'} ／ エラー検知時の画面：${item.screen}`,
    `版：${item.version} ／ 接続：${item.online?'オンライン':'オフライン'}${item.httpStatus?` ／ HTTP ${item.httpStatus}`:''}`,
    ...(item.requestMethod?[`通信方式：${item.requestMethod}`]:[]),
    ...(item.durationMs!==undefined?[`応答まで：${(item.durationMs/1000).toFixed(2)}秒`]:[]),
    ...(item.serverCode?[`エラーコード：${item.serverCode}${item.serverCode==='57014'?'（データベース処理の時間制限）':''}`]:[]),
    '直前の操作：',...item.actions.map((action,index)=>`${index+1}. ${new Date(action.at).toLocaleTimeString('ja-JP',{timeZone:'Asia/Tokyo'})} · ${action.operation}`),
  ].join('\n');
}
const buttonActions: Record<string,string>={ 'この児童1名分のみ保存':'record.save.single','比較した内容で保存する':'record.overwrite.confirm','上書きせず入力に戻る':'record.overwrite.cancel','入力中一覧の更新を再試行':'record.draft.cleanup' };
export function installDiagnostics(appVersion: string) {
  version=safeVersion(appVersion); currentStore()?.compact();
  diagnosticAction('app.start');
  const connection=(event: Event)=>{const operation=`connection.${event.type}`;diagnosticAction(operation);recordDiagnostic(operation,undefined,{kind:'connection',code:'OK'});};
  const error=(event:ErrorEvent)=>{if(event.filename && !event.filename.startsWith(location.origin)) return;recordDiagnostic('runtime.error',event.error);};
  const rejection=(event:PromiseRejectionEvent)=>recordDiagnostic('runtime.rejection',event.reason);
  const click=(event:Event)=>{const button=event.target instanceof Element?event.target.closest('button'):null;if(!button)return;
    const explicit=button.getAttribute('data-diagnostic-action');const label=button.textContent?.trim()||'';
    const operation=explicit?localOperations.has(explicit)?explicit:null:buttonActions[label];if(operation)diagnosticAction(operation);};
  window.addEventListener('online',connection);window.addEventListener('offline',connection);
  window.addEventListener('error',error);window.addEventListener('unhandledrejection',rejection);document.addEventListener('click',click,true);
  return ()=>{window.removeEventListener('online',connection);window.removeEventListener('offline',connection);window.removeEventListener('error',error);window.removeEventListener('unhandledrejection',rejection);document.removeEventListener('click',click,true);};
}
