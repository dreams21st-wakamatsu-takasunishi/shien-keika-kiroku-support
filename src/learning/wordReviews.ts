import type {LessonLink} from './contracts';
export interface WordReviewRequest {
  id:string;studentId:string;stageId:string;childId:string;linkId:string;page:string;
  fileType:'application/pdf'|'image/png'|'image/jpeg';fileSize:number;
  status:'pending'|'approved'|'returned'|'expired';revision:number;
  submittedAt:string;reviewedAt:string|null;reviewerName:string|null;reason:string;reward:number;artifactAvailable:boolean;
}
export interface WordReviewInbox {requests:WordReviewRequest[];canReviewWord:boolean}
export const wordStageNames:Record<string,string>={w_b1_1:'B1-1',w_b1_2:'B1-2',w_b1_3:'B1-3',w_b1_4:'B1-4',w_b1_5:'B1-5',w_m4_1:'M4-1',w_m4_2:'M4-2',w_m4_3:'M4-3'};
export function parseWordInbox(value:unknown,links:LessonLink[]):WordReviewRequest[]{
  const body=value as {requests?:unknown[]}|null;
  if(!body||!Array.isArray(body.requests)||body.requests.length>1200)throw Error('Word申請の取得形式を確認してください。');
  const seen=new Set<string>();
  return body.requests.map(value=>{
    const row=value as WordReviewRequest;
    if(!row||typeof row.id!=='string'||! /^[0-9a-f-]{36}$/i.test(row.id)||seen.has(row.id)
      ||!links.some(link=>link.id===row.linkId&&link.child_id===row.childId&&link.source_student_id===row.studentId)
      ||!wordStageNames[row.stageId]||!['pending','approved','returned','expired'].includes(row.status)
      ||!['application/pdf','image/png','image/jpeg'].includes(row.fileType)||!Number.isInteger(row.fileSize)||row.fileSize<1||row.fileSize>8388608
      ||!Number.isInteger(row.revision)||row.revision<1||typeof row.page!=='string'||(row.page!==''&&!/^[1-9][0-9]{0,3}$/.test(row.page))
      ||typeof row.reason!=='string'||row.reason.length>600||typeof row.submittedAt!=='string'||!Number.isFinite(Date.parse(row.submittedAt))
      ||(row.reviewerName!==null&&(typeof row.reviewerName!=='string'||row.reviewerName.length>100))
      ||(row.reviewedAt!==null&&(typeof row.reviewedAt!=='string'||!Number.isFinite(Date.parse(row.reviewedAt))))
      ||![0,500].includes(row.reward)||typeof row.artifactAvailable!=='boolean')throw Error('Word申請の対象・版を確認できません。');
    seen.add(row.id);
    return {id:row.id,studentId:row.studentId,stageId:row.stageId,childId:row.childId,linkId:row.linkId,page:row.page,fileType:row.fileType,fileSize:row.fileSize,
      status:row.status,revision:row.revision,submittedAt:row.submittedAt,reviewedAt:row.reviewedAt,reviewerName:row.reviewerName,reason:row.reason,reward:row.reward,artifactAvailable:row.artifactAvailable};
  });
}
