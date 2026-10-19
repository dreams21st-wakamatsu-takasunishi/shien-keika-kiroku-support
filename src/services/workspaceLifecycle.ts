import {supabase} from '../lib/supabase';
export const lifecycleResources={meeting_cases:'会議支援',morning_meeting_records:'朝礼記録',handover_items:'申し送り',activity_plans:'活動・指導案',facility_documents:'点検・おたより',supply_items:'備品・消耗品'} as const;
export type LifecycleResource=keyof typeof lifecycleResources;
export type RequestResource='staff_shift_requests'|'attendance_correction_requests';
export const canManageWorkspaceTrash=(role?:string)=>role==='admin'||role==='manager';
export interface TrashItem {resource:LifecycleResource;id:string;title:string;revision:number;deleted_at:string;deleted_by:string;deleted_by_name?:string}
async function rpc(name:string,args?:Record<string,unknown>){
 if(!supabase)throw Error('削除・復元は事業所にログインした環境で利用できます。');
 const {data,error}=await supabase.rpc(name,args);
 if(error){
  if(error.code==='PGRST202'||error.code==='42703')throw Error('削除・復元のデータベース更新が未反映です。管理者に確認してください。');
  if(error.code==='42501')throw Error('この操作を行う権限がありません。管理者・児発管、または本人の申請であることを確認してください。');
  if(error.code==='40001'||error.code==='P0002')throw Error('別の操作で更新・削除・承認されています。一覧を更新し、最新の内容を確認してください。');
  throw Error('操作を完了できませんでした。入力内容は変更していません。一覧を更新して確認してください。');
 }
 return data;
}
export async function changeWorkspaceLifecycle(resource:LifecycleResource,id:string,revision:number,restore=false){
 if(!Object.hasOwn(lifecycleResources,resource)||!id||!Number.isSafeInteger(revision)||revision<1)throw Error('対象の保存状態を確認してください。');
 await rpc('change_workspace_item_lifecycle',{p_resource:resource,p_record_id:id,p_expected_revision:revision,p_restore:restore});
 window.dispatchEvent(new CustomEvent('d-support:workspace-lifecycle',{detail:{table:resource,id,restore}}));
 if(resource==='morning_meeting_records')window.dispatchEvent(new CustomEvent('d-support:workspace-item-deleted',{detail:{resource,id,restore}}));
}
export async function listWorkspaceTrash():Promise<TrashItem[]>{
 const rows=await rpc('list_workspace_trash');
 if(!Array.isArray(rows))throw Error('削除済みデータを取得できませんでした。');
 return rows.map(row=>{
  if(!row||!Object.hasOwn(lifecycleResources,row.resource)||typeof row.id!=='string'||typeof row.title!=='string'||!Number.isSafeInteger(Number(row.revision))||Number(row.revision)<1||typeof row.deleted_at!=='string')throw Error('削除済みデータの形式を確認してください。');
  return {resource:row.resource,id:row.id,title:row.title,revision:Number(row.revision),deleted_at:row.deleted_at,deleted_by:typeof row.deleted_by==='string'?row.deleted_by:'',deleted_by_name:typeof row.deleted_by_name==='string'?row.deleted_by_name:undefined};
 });
}
export async function withdrawOwnRequest(resource:RequestResource,id:string,updatedAt:string){
 if(!['staff_shift_requests','attendance_correction_requests'].includes(resource)||!id||!updatedAt)throw Error('申請の更新状態を確認してください。');
 await rpc('withdraw_own_workspace_request',{p_resource:resource,p_record_id:id,p_expected_updated_at:updatedAt});
 window.dispatchEvent(new CustomEvent('d-support:workspace-lifecycle',{detail:{table:resource}}));
}
export async function listOwnWithdrawalHistory(organizationId:string,userId:string){
 if(!supabase)return [];
 const {data,error}=await supabase.from('workspace_lifecycle_events').select('id,resource,record_id,occurred_at,service_date').eq('organization_id',organizationId).eq('actor_id',userId).eq('action','withdraw').order('occurred_at',{ascending:false}).limit(100);
 if(error)throw Error('取り下げ履歴を取得できませんでした。');return data||[];
}
