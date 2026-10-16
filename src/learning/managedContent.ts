export const contentKinds = ['textTasks', 'customThemes', 'customEffects'] as const;
export type ContentKind = typeof contentKinds[number];
export interface TextTask { id: string; title: string; content: string; time: number; star: number; targetGroup: string; hidden: boolean }
export interface CustomReward { id: string; name: string; hidden: boolean; distribution: 'gacha' | 'present'; bg?: string; text?: string; btnBg?: string; btnText?: string; emojis?: string[] }
export type ContentItem = TextTask | CustomReward;
export interface ContentCatalog { textTasks: TextTask[]; customThemes: CustomReward[]; customEffects: CustomReward[] }
export interface CampusContent { organizationId: string; sourceProject: string; campusId: string; revision: number; fingerprint: string; content: ContentCatalog }
const fail = (): never => { throw Error('教材・ごほうびの応答または入力内容を確認してください。'); };
const record = (v: unknown): Record<string, any> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, any> : fail();
const text = (v: unknown, max: number, empty = false): string => typeof v === 'string' && v.length <= max && (empty || Boolean(v.trim())) ? v : fail();
export function parseContentItem(kind: ContentKind, value: unknown): ContentItem {
 const v=record(value);
 if(!contentKinds.includes(kind)||typeof v.id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(v.id)||typeof v.hidden!=='boolean')fail();
 const base={id:v.id as string,hidden:v.hidden as boolean};
 if(kind==='textTasks'){
  if(!Number.isInteger(v.time)||v.time<1||v.time>60||!Number.isInteger(v.star)||v.star<1||v.star>5)fail();
  return {...base,title:text(v.title,160),content:text(v.content,20000),time:v.time,star:v.star,targetGroup:text(v.targetGroup,80,true)};
 }
 if(!base.id.startsWith(kind==='customThemes'?'ct_':'ce_')||!['gacha','present'].includes(v.distribution))fail();
 const reward={...base,name:text(v.name,80),distribution:v.distribution as 'gacha'|'present'};
 if(kind==='customThemes'){
  if(['bg','text','btnBg','btnText'].some(key=>typeof v[key]!=='string'||!/^#[a-f0-9]{6}$/i.test(v[key])))fail();
  return {...reward,bg:v.bg,text:v.text,btnBg:v.btnBg,btnText:v.btnText};
 }
 if(!Array.isArray(v.emojis)||v.emojis.length<1||v.emojis.length>3)fail();
 return {...reward,emojis:v.emojis.map((v:unknown)=>text(v,32))};
}
export function parseCampusContent(value: unknown, campusId: string, organizationId?: string): CampusContent {
 const v=record(value),catalog=record(v.content);
 if(v.schemaVersion!==1||v.dataTable!=='user_data'||v.campusId!==campusId||campusId==='public'
  ||typeof v.organizationId!=='string'||!/^[a-f0-9-]{36}$/i.test(v.organizationId)||(organizationId&&v.organizationId!==organizationId)
  ||typeof v.sourceProject!=='string'||!/^[a-z0-9]{20}$/.test(v.sourceProject)||!Number.isSafeInteger(v.revision)||v.revision<0
  ||typeof v.fingerprint!=='string'||!/^[a-f0-9]{32}$/.test(v.fingerprint))fail();
 for(const kind of contentKinds){
  if(!Array.isArray(catalog[kind])||catalog[kind].length>(kind==='textTasks'?300:100))fail();
  catalog[kind]=catalog[kind].map((item:unknown)=>parseContentItem(kind,item));
  if(new Set(catalog[kind].map((item:ContentItem)=>item.id)).size!==catalog[kind].length)fail();
 }
 return {organizationId:v.organizationId,sourceProject:v.sourceProject,campusId,revision:v.revision,fingerprint:v.fingerprint,content:catalog as unknown as ContentCatalog};
}
export function parseContentCampuses(value:unknown):{organizationId:string;sourceProject:string;campuses:{id:string;name:string}[]} {
 const v=record(value);
 if(v.schemaVersion!==1||v.dataTable!=='user_data'||typeof v.organizationId!=='string'||!/^[a-f0-9-]{36}$/i.test(v.organizationId)
  ||typeof v.sourceProject!=='string'||!/^[a-z0-9]{20}$/.test(v.sourceProject)||!Array.isArray(v.campuses)||v.campuses.length>100)fail();
 const campuses=v.campuses.map((item:unknown)=>{const row=record(item),id=text(row.id,80);return {id,name:row.name==null?(id==='main'?'本校':id):text(row.name,160)};});
 if(campuses.some((row:{id:string})=>row.id==='public')||new Set(campuses.map((row:{id:string})=>row.id)).size!==campuses.length)fail();
 return {organizationId:v.organizationId,sourceProject:v.sourceProject,campuses};
}
