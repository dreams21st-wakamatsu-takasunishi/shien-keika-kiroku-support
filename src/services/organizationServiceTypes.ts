import {supabase} from '../lib/supabase';
import {parseOrganizationServices} from '../utils/careServices';
import type {CareType} from '../types';

export interface OrganizationServices {types:CareType[];revision:number}
let trial:OrganizationServices={types:[],revision:0};
const isTrial=(organizationId:string)=>!supabase&&organizationId==='local';
function client(){if(!supabase)throw Error('事業所種別はログインした運用環境で保存できます。');return supabase;}
export function serviceSettingsError(error:unknown):string{
 const raw=error&&typeof error==='object'?error as {code?:string;message?:string}:{};
 if(['42P01','42703','PGRST205','PGRST204'].includes(raw.code||''))return '事業所種別の保存項目が未反映です。管理者にデータベースの更新状況を確認してください。';
 if(raw.code==='23505'||raw.message?.includes('SERVICE_SETTINGS_CONFLICT'))return '他の管理者が事業所種別を変更しました。再読込して確認してください。';
 return raw.message||'事業所種別を取得・保存できませんでした。';
}
export async function loadOrganizationServices(organizationId:string):Promise<OrganizationServices>{
 if(isTrial(organizationId))return {...trial,types:[...trial.types]};
 const {data,error}=await client().from('organization_service_settings').select('service_types,revision').eq('organization_id',organizationId).maybeSingle();
 if(error)throw error;
 return data?{types:parseOrganizationServices(data.service_types),revision:data.revision}:{types:[],revision:0};
}
export async function saveOrganizationServices(organizationId:string,current:OrganizationServices,types:CareType[]):Promise<OrganizationServices>{
 const parsed=parseOrganizationServices(types);
 if(isTrial(organizationId)){
  if(trial.revision!==current.revision)throw Error('SERVICE_SETTINGS_CONFLICT');
  trial={types:parsed,revision:trial.revision+1};return {...trial,types:[...trial.types]};
 }
 const table=client().from('organization_service_settings');
 const mutation=current.revision===0
  ?table.insert({organization_id:organizationId,service_types:parsed,revision:1})
  :table.update({service_types:parsed,revision:current.revision+1}).eq('organization_id',organizationId).eq('revision',current.revision);
 const {data,error}=await mutation.select('service_types,revision').maybeSingle();
 if(error)throw error;
 if(!data)throw Error('SERVICE_SETTINGS_CONFLICT');
 return {types:parseOrganizationServices(data.service_types),revision:data.revision};
}
