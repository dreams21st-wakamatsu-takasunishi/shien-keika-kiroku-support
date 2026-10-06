import type {UserRole} from '../types';

export interface TrainingCategory {id:string;organizationId:string;title:string;active:boolean;revision:number}
export interface TrainingVideo {id:string;organizationId:string;categoryId:string;title:string;videoUrl:string;materialUrl:string;active:boolean;revision:number}
export interface TrainingProgress {videoId:string;userId:string;completedAt:string|null;revision:number}
export interface TrainingData {categories:TrainingCategory[];videos:TrainingVideo[];progress:TrainingProgress[]}
export interface TrainingRepository {
 load():Promise<TrainingData>;
 addCategory(title:string):Promise<void>;
 addVideo(categoryId:string,input:{title:string;videoUrl:string;materialUrl:string}):Promise<void>;
 archiveCategory(category:TrainingCategory):Promise<void>;
 archiveVideo(video:TrainingVideo):Promise<void>;
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
 const categories=data.categories.filter(row=>row.active);
 const ids=new Set(categories.map(row=>row.id));
 return {categories,videos:data.videos.filter(row=>row.active&&ids.has(row.categoryId))};
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
 if(['42P01','42703','PGRST205','PGRST202'].includes(code||''))return '法定研修のDB更新が未反映です。管理者に確認してください。';
 if(code==='23505')return '同じ名前が登録済みです。再読込して登録内容を確認してください。';
 if(code==='40001')return '別の端末で内容が変更されています。再読込してから操作してください。';
 if(code==='42501')return 'この操作を行う権限がありません。ログイン状態を確認してください。';
 return '法定研修の取得・保存に失敗しました。通信状態を確認して再度お試しください。';
}
