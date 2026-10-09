import { supabase } from '../lib/supabase';
import { getAccessDeviceToken } from '../utils/accessDevice';
import type { LessonHistory, LessonIdentity, LessonLink } from '../learning/contracts';
import type {WordReviewRequest,WordReviewInbox} from '../learning/wordReviews';
import {parseLearningTask,parseLearningTasks,type LearningTask} from '../learning/tasks';
import { parseFetchedLessonProgress } from '../learning/progress';
import { parseTimedAccountCheck, parseAccountAudits } from '../learning/accounts';
import { parseCredentialOperations, parseCredentialResult, type CredentialAction } from '../learning/accountCredentials';
import { parseHandoffResult, parseRegistrationConfig, parseRegistrationResult, type HandoffReason, type RegistrationConfig, type RegistrationOperation } from '../learning/studentRegistration';

export const loadStudentRegistrationConfig = async (childId: string) => parseRegistrationConfig(await invoke({ action: 'configuration', childId }, 'lesson-student-registration'));
export const registerLessonStudent = async (childId: string, config: RegistrationConfig, operationId: string, campusId: string) => parseRegistrationResult(
  await invoke({ action: 'register', childId, operationId, campusId, fingerprint: config.fingerprint, confirmed: true }, 'lesson-student-registration'),
  childId, operationId, { sourceProject: config.sourceProject, campusId, name: config.name, birthDate: config.birthDate });
export const takeOverLessonRegistration = async (childId: string, config: RegistrationConfig, operation: RegistrationOperation, requestId: string, reason: HandoffReason) => parseHandoffResult(
  await invoke({ action: 'handoff', childId, operationId: operation.id, campusId: operation.campusId, fingerprint: config.fingerprint, confirmed: true, requestId, handoffRevision: operation.handoffRevision, reason }, 'lesson-student-registration'), childId, operation.id, requestId, operation.handoffRevision);

async function invoke<T>(body: Record<string, unknown>, endpoint = 'lesson-learning'): Promise<T> {
  if (!supabase) throw new Error('学習連携には職員ログインとクラウド接続が必要です。');
  const { data, error } = await supabase.functions.invoke(endpoint, {
    body, headers: { 'x-support-device-token': getAccessDeviceToken() },
  });
  if (error) {
    let message = '学習連携を取得できませんでした。通信とサーバー設定を確認してください。';
    try { const payload = await error.context.clone().json(); if (typeof payload.error === 'string') message = payload.error; } catch { /* Network errors have no response body. */ }
    throw new Error(message);
  }
  if (!data || data.error) throw new Error(data?.error || '学習連携の応答を確認できません。');
  return data as T;
}

export const loadLessonLinks = () => invoke<{ links: LessonLink[]; canManageLinks: boolean; canManageAccounts?: boolean; canIssueAccounts?: boolean; configured: boolean }>({ action: 'list' });
export const loadCredentialOperations = async (link: LessonLink) => {
  const result = await invoke<{ operations: unknown }>({ action: 'operations', childId: link.child_id }, 'lesson-account-credentials');
  return parseCredentialOperations(result.operations);
};
export const issueLessonCredentials = async (link: LessonLink, operationId: string, action: CredentialAction) => parseCredentialResult(
  await invoke({ action, operationId, childId: link.child_id, revision: link.revision, confirmed: true }, 'lesson-account-credentials'), link, operationId, action);
export const inspectLessonStudent = (childId: string, studentId: string) => invoke<{ identity: LessonIdentity; fingerprint: string }>({ action: 'inspect', childId, studentId });
export const linkLessonStudent = (childId: string, studentId: string, fingerprint: string) => invoke<{ link: LessonLink }>({ action: 'link', childId, studentId, fingerprint, confirmed: true });
export const disableLessonLink = (link: LessonLink) => invoke<{ link: LessonLink }>({ action: 'disable', childId: link.child_id, revision: link.revision });
export const loadLessonHistory = (childId: string, date: string) => invoke<LessonHistory>({ action: 'history', childId, date });
export const loadLessonProgress = async (link: LessonLink) => parseFetchedLessonProgress(await invoke({ action: 'progress', childId: link.child_id }), link);
export const checkLessonAccount = async (link: LessonLink) => parseTimedAccountCheck(await invoke({ action: 'inspect', childId: link.child_id }, 'lesson-accounts'), link);
export const verifyLessonLoginCard = async (link: LessonLink, passcode: string) => {
  const result = parseTimedAccountCheck(await invoke({ action: 'verify-card', childId: link.child_id, passcode, confirmed: true }, 'lesson-accounts'), link);
  if (!result.card) throw Error('ログインカードを確認できませんでした。');
  return result;
};
export const loadLessonAccountAudits = async (link: LessonLink) => {
  const result = await invoke<{ audits: unknown }>({ action: 'audit', childId: link.child_id }, 'lesson-accounts');
  return parseAccountAudits(result.audits);
};
export const loadLearningTasks=async(childId:string)=>parseLearningTasks(await invoke({action:'tasks-list',childId}));
export const saveLearningTask=async(childId:string,task:Omit<LearningTask,'updatedAt'>)=>{
  const result=await invoke<{schemaVersion:number;task:unknown}>({action:'tasks-save',childId,task});
  if(result.schemaVersion!==1)throw Error('課題の保存結果を確認できません。');
  const saved=parseLearningTask(result.task);if(saved.id!==task.id)throw Error('課題の保存結果を確認できません。');return saved;
};
export const loadWordReviewInbox=()=>invoke<WordReviewInbox>({action:'word-inbox'});
export interface WordArtifact {url:string;fileType:string;requestId:string;revision:number;fileHash:string}
export const loadWordArtifact=(request:WordReviewRequest)=>invoke<WordArtifact>({action:'word-artifact',childId:request.childId,requestId:request.id});
export const decideWordRequest=(request:WordReviewRequest,artifact:WordArtifact,decision:'approved'|'returned',reason:string)=>invoke<{request:WordReviewRequest}>({
  action:'word-decide',childId:request.childId,requestId:request.id,revision:request.revision,decision,reason,reviewed:true,fileHash:artifact.fileHash});
