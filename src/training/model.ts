import type {UserRole} from '../types';

export interface TrainingCategory {id:string;organizationId:string;title:string;active:boolean;revision:number;sortOrder?:number}
export interface TrainingVideo {id:string;organizationId:string;categoryId:string;title:string;videoUrl:string;materialUrl:string;active:boolean;revision:number;sortOrder?:number}
export interface TrainingProgress {videoId:string;userId:string;completedAt:string|null;revision:number}
export interface TrainingSettings {confirmationFormUrl:string;revision:number}
export interface TrainingData {categories:TrainingCategory[];videos:TrainingVideo[];progress:TrainingProgress[];settings?:TrainingSettings}
export interface TrainingRepository {
 load():Promise<TrainingData>;
 saveConfirmationForm(url:string,expectedRevision:number):Promise<void>;
 addCategory(title:string):Promise<void>;
 addVideo(categoryId:string,input:{title:string;videoUrl:string;materialUrl:string}):Promise<void>;
 updateCategory(category:TrainingCategory,title:string):Promise<void>;
 updateVideo(video:TrainingVideo,input:{title:string;videoUrl:string;materialUrl:string}):Promise<void>;
 archiveCategory(category:TrainingCategory):Promise<void>;
 archiveVideo(video:TrainingVideo):Promise<void>;
 reorderCategories(categories:TrainingCategory[]):Promise<void>;
 reorderVideos(categoryId:string,videos:TrainingVideo[]):Promise<void>;
 setCompleted(videoId:string,completed:boolean,expectedRevision:number):Promise<TrainingProgress>;
}
export const canManageTraining=(role?:UserRole)=>role==='admin'||role==='manager';
export function trainingTitle(input:string,max=120){
 const value=input.trim();
 if(!value||value.length>max||/[\u0000-\u001f\u007f]/.test(value))throw Error('TRAINING_TITLE_INVALID');
 return value;
}
/** Validate locally only. Never fetch, embed, preview or send URLs to an AI. */
export function trainingUrl(input:string,optional=false){
 const value=input.trim();if(!value&&optional)return '';
 if(!value||value.length>2048||/[\s\u0000-\u001f\u007f]/.test(value))throw Error('TRAINING_URL_INVALID');
 let url:URL;try{url=new URL(value);}catch{throw Error('TRAINING_URL_INVALID');}
 if(url.protocol!=='https:'||!url.hostname||url.username||url.password)throw Error('TRAINING_URL_INVALID');
 return url.href;
}
export function visibleTraining(data:TrainingData){
 const categories=data.categories.filter(row=>row.active).sort(compareTrainingOrder);
 const ids=new Set(categories.map(row=>row.id));
 return {categories,videos:data.videos.filter(row=>row.active&&ids.has(row.categoryId)).sort(compareTrainingOrder)};
}
function compareTrainingOrder(a:{id:string;sortOrder?:number},b:{id:string;sortOrder?:number}){
 return (a.sortOrder||0)-(b.sortOrder||0)||(a.id<b.id?-1:a.id>b.id?1:0);
}
/** Move without changing the original catalog or any completion data. */
export function moveTrainingItem<T extends {id:string}>(rows:T[],id:string,direction:-1|1):T[]{
 const index=rows.findIndex(row=>row.id===id),next=index+direction;
 const result=[...rows];if(index<0||next<0||next>=rows.length)return result;
 [result[index],result[next]]=[result[next],result[index]];return result;
}
export function moveTrainingItemTo<T extends {id:string}>(rows:T[],id:string,targetId:string):T[]{
 const from=rows.findIndex(row=>row.id===id),to=rows.findIndex(row=>row.id===targetId);
 const result=[...rows];if(from<0||to<0||from===to)return result;
 const [row]=result.splice(from,1);result.splice(to,0,row);return result;
}
/** Only opaque IDs and revisions go to the ordering RPC; never titles or URLs. */
export function trainingOrderSnapshot(rows:{id:string;revision:number}[]){
 if(rows.length>5000||new Set(rows.map(row=>row.id)).size!==rows.length||rows.some(row=>!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.id)||!Number.isSafeInteger(row.revision)||row.revision<1))throw Error('TRAINING_ORDER_INVALID');
 return rows.map(({id,revision})=>({id,revision}));
}
export function remainingTraining(videos:TrainingVideo[],progress:TrainingProgress[],userId:string){
 const completed=new Set(progress.filter(row=>row.userId===userId&&row.completedAt).map(row=>row.videoId));
 return videos.filter(row=>!completed.has(row.id)).length;
}
/** Two popups may be restricted by the browser; the UI always keeps fallback links. */
export function openTrainingResources(video:Pick<TrainingVideo,'videoUrl'|'materialUrl'>,open:(url:string,target:string,features:string)=>unknown){
 const urls=[trainingUrl(video.videoUrl),trainingUrl(video.materialUrl,true)].filter(Boolean);
 for(const url of [...new Set(urls)])open(url,'_blank','noopener,noreferrer');
}
export function trainingError(error:unknown){
 const code=(error as {code?:string})?.code;
 const message=error instanceof Error?error.message:'';
 if(message==='TRAINING_TITLE_INVALID')return '名前を入力してください（カテゴリ120文字、動画タイトル180文字まで）。';
 if(message==='TRAINING_URL_INVALID')return 'URLは https:// で始まる有効な形式で入力してください。ID・パスワードを含むURLは登録できません。';
 if(message==='TRAINING_ORDER_INVALID')return '表示順を保存できません。再読込してから操作してください。';
 if(['42P01','42703','PGRST205','PGRST202'].includes(code||''))return '法定研修のDB更新が未反映です。管理者に確認してください。';
 if(code==='23505')return '同じ名前が登録済みです。再読込して登録内容を確認してください。';
 if(code==='40001')return '別の端末で内容が変更されています。再読込してから操作してください。';
 if(code==='42501')return 'この操作を行う権限がありません。ログイン状態を確認してください。';
 return '法定研修の取得・保存に失敗しました。通信状態を確認して再度お試しください。';
}
