import {supabase} from '../lib/supabase';
import type {UserProfile} from '../types';
import {canManageTraining,trainingTitle,trainingUrl,type TrainingCategory,type TrainingData,type TrainingProgress,type TrainingRepository,type TrainingVideo} from '../training/model';

// Deliberately separate from workspace loading, AI context, caches and notifications.
export function createTrainingRepository(user:UserProfile):TrainingRepository{
 const org=user.organizationId;
 if(!supabase){if(org==='local')return localRepository(user);throw Error('Training login required');}
 const client=supabase;
 const read=async(table:string)=>{
  const rows:Record<string,any>[]=[];
  for(let start=0;start<5000;start+=200){
   let query=client.from(table).select('*').eq('organization_id',org);
   if(table==='legal_training_progress')query=query.eq('user_id',user.id);
   const {data,error}=await query.order(table==='legal_training_progress'?'video_id':'id').range(start,start+199);
   if(error)throw error;
   if(data?.some(row=>row.organization_id!==org||(table==='legal_training_progress'&&row.user_id!==user.id)))throw Error('Training scope mismatch');
   rows.push(...(data||[]));if((data||[]).length<200)return rows;
  }
  throw Error('Training data limit exceeded');
 };
 const rpc=async(name:string,args:Record<string,unknown>)=>{
  const {data,error}=await client.rpc(name,{p_organization_id:org,...args});if(error)throw error;return data;
 };
 const manager=()=>{if(!canManageTraining(user.role))throw {code:'42501'};};
 return {
  async load(){const [categories,videos,progress]=await Promise.all([read('legal_training_categories'),read('legal_training_videos'),read('legal_training_progress')]);
   return {categories:categories.map(row=>({id:row.id,organizationId:row.organization_id,title:trainingTitle(row.title),active:row.active,revision:row.revision})),
    videos:videos.map(row=>({id:row.id,organizationId:row.organization_id,categoryId:row.category_id,title:trainingTitle(row.title,180),videoUrl:trainingUrl(row.video_url),materialUrl:trainingUrl(row.material_url||'',true),active:row.active,revision:row.revision})),
    progress:progress.map(progressRow)};
  },
  async addCategory(title){manager();await rpc('add_legal_training_category',{p_title:trainingTitle(title)});},
  async addVideo(categoryId,input){manager();await rpc('add_legal_training_video',{p_category_id:categoryId,p_title:trainingTitle(input.title,180),p_video_url:trainingUrl(input.videoUrl),p_material_url:trainingUrl(input.materialUrl,true)||null});},
  async archiveCategory(row){manager();await rpc('archive_legal_training_item',{p_kind:'category',p_id:row.id,p_expected_revision:row.revision});},
  async archiveVideo(row){manager();await rpc('archive_legal_training_item',{p_kind:'video',p_id:row.id,p_expected_revision:row.revision});},
  async setCompleted(videoId,completed,expectedRevision){const data=await rpc('set_legal_training_completion',{p_video_id:videoId,p_completed:completed,p_expected_revision:expectedRevision});const row=progressRow(data);if(row.videoId!==videoId||row.userId!==user.id)throw Error('Training scope mismatch');return row;},
 };
}
function progressRow(row:Record<string,any>):TrainingProgress{return {videoId:row.video_id,userId:row.user_id,completedAt:row.completed_at||null,revision:row.revision};}

const trials=new Map<string,TrainingData>();
function localRepository(user:UserProfile):TrainingRepository{
 const org=user.organizationId;const data=trials.get(org)||{categories:[],videos:[],progress:[]};trials.set(org,data);
 const manager=()=>{if(!canManageTraining(user.role))throw {code:'42501'};};
 return {
  async load(){return structuredClone({...data,progress:data.progress.filter(row=>row.userId===user.id)});},
  async addCategory(title){manager();data.categories.push({id:crypto.randomUUID(),organizationId:org,title:trainingTitle(title),active:true,revision:1});},
  async addVideo(categoryId,input){manager();if(!data.categories.some(row=>row.id===categoryId&&row.active))throw Error('Invalid category');data.videos.push({id:crypto.randomUUID(),organizationId:org,categoryId,title:trainingTitle(input.title,180),videoUrl:trainingUrl(input.videoUrl),materialUrl:trainingUrl(input.materialUrl,true),active:true,revision:1});},
  async archiveCategory(row){manager();archive(data.categories,row);},async archiveVideo(row){manager();archive(data.videos,row);},
  async setCompleted(videoId,completed,expectedRevision){
   if(!data.videos.some(row=>row.id===videoId&&row.active&&data.categories.some(c=>c.id===row.categoryId&&c.active)))throw Error('Invalid video');
   let row=data.progress.find(row=>row.videoId===videoId&&row.userId===user.id);
   if((row?.revision||0)!==expectedRevision)throw {code:'40001'};
   if(row){if(Boolean(row.completedAt)===completed)return {...row};row.completedAt=completed?new Date().toISOString():null;row.revision++;}
   else{row={videoId,userId:user.id,completedAt:completed?new Date().toISOString():null,revision:1};data.progress.push(row);}
   return {...row};
  },
 };
}
function archive<T extends TrainingCategory|TrainingVideo>(rows:T[],item:T){const current=rows.find(row=>row.id===item.id);if(!current||current.revision!==item.revision)throw {code:'40001'};current.active=false;current.revision++;}
