import {supabase} from '../lib/supabase';
import type {SupportRecord} from '../types';
export interface ParentShareDraft {body:string;revision:number;source_version:number;source_updated_at:string}
function parse(value:any):ParentShareDraft|null{
 if(value===null)return null;
 if(typeof value?.body!=='string'||value.body.length>4000||!Number.isSafeInteger(Number(value.revision))||Number(value.revision)<1||!Number.isFinite(Date.parse(value.source_updated_at))||!Number.isSafeInteger(Number(value.source_version)))throw Error('共有文の下書きを確認できません。');
 return {body:value.body,revision:Number(value.revision),source_version:Number(value.source_version),source_updated_at:value.source_updated_at};
}
function failure(error:any){
 return new Error(error?.message?.includes('PARENT_SHARE_SOURCE_CHANGED')?'元の支援記録が更新されています。最新の記録を確認して共有文を再作成してください。':error?.code==='40001'?'別の端末で下書きが変更されました。入力を控えてから開き直してください。':'共有文を保存・取得できませんでした。通信と利用権限を確認してください。');
}
export async function loadParentShareDraft(recordId:string){if(!supabase)throw Error('クラウド接続が必要です。');const {data,error}=await supabase.rpc('load_parent_share_draft',{p_record_id:recordId});if(error)throw failure(error);return parse(data);}
export async function saveParentShareDraft(record:SupportRecord,body:string,revision:number){if(!supabase)throw Error('クラウド接続が必要です。');const {data,error}=await supabase.rpc('save_parent_share_draft',{p_record_id:record.id,p_body:body,p_source_version:record.version||1,p_source_updated_at:record.updatedAt,p_expected_revision:revision});if(error)throw failure(error);const saved=parse(data);if(!saved)throw Error('保存結果を確認できません。');return saved;}
export async function deleteParentShareDraft(recordId:string,revision:number){if(!supabase)throw Error('クラウド接続が必要です。');const {error}=await supabase.rpc('delete_parent_share_draft',{p_record_id:recordId,p_expected_revision:revision});if(error)throw failure(error);}
