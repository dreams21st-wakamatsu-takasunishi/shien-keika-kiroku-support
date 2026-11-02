import {supabase} from '../lib/supabase';
import type {MorningSectionKey} from '../types';
import {parseMorningRecord} from '../utils/morningSections';
function failure(error:any){return new Error(error?.message?.includes('MORNING_DELETED')?'この朝礼記録は削除されています。入力を保持しています。管理者が復元してから再開してください。':error?.code==='22001'?'朝礼全体は20,000文字までです。入力を保持したまま内容を整理してください。':'朝礼を取得・保存できませんでした。入力は保持しています。通信と利用権限を確認してください。');}
export async function loadMorningSections(date:string){if(!supabase)throw Error('クラウド接続が必要です。');const {data,error}=await supabase.rpc('load_morning_meeting_sections',{p_date:date});if(error)throw failure(error);return data===null?undefined:parseMorningRecord(data);}
export async function saveMorningSection(date:string,key:MorningSectionKey,text:string,expected:number){if(!supabase)throw Error('クラウド接続が必要です。');const {data,error}=await supabase.rpc('save_morning_meeting_section',{p_date:date,p_key:key,p_text:text,p_expected_revision:expected});if(error)throw failure(error);if(typeof data?.conflict!=='boolean')throw Error('朝礼の保存結果を確認できません。');return {conflict:data.conflict as boolean,record:parseMorningRecord(data.record)};}
