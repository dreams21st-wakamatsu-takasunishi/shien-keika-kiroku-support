import type { UserProfile } from '../types';

export class LessonRequestError extends Error {
  constructor(message: string, public readonly httpStatus?: number) { super(message); this.name = 'LessonRequestError'; }
}

// Match can_read_lesson_learning; do not offer the action to a session that cannot read it.
export function canLoadWordNotice(profile: UserProfile | null | undefined): boolean {
  return Boolean(profile && !profile.fieldModeOnly && (['admin', 'manager'].includes(profile.role)
    || !profile.recorderProfileId || profile.accessDeviceKind === 'facility_shared'));
}

export function wordNoticeErrorGuidance(error: unknown): string {
  const status = error instanceof LessonRequestError ? error.httpStatus : undefined;
  if (status === 401) return 'ログインの有効期限を確認し、再ログインしてください。';
  if (status === 403) return 'このアカウント・端末の学習管理権限を確認してください。';
  if (status === 404 || status === 405) return '管理者に学習連携のサーバー公開状況を確認してください。';
  if (status === 429) return 'アクセスが集中しています。しばらく待ってから再取得してください。';
  if (status && status >= 500) return '学習連携サーバーから正常な応答がありません。エラー履歴を管理者に共有してください。';
  return '通信状態を確認してください。通知の取得失敗は、申請が0件であることを意味しません。';
}
