import { supabase } from '../lib/supabase';
import { getAccessDeviceToken } from '../utils/accessDevice';
import type { AttendanceQrChallenge } from '../types';

export type StaffQrAction = 'ログイン' | '出勤' | '退勤';
export interface StaffQrAttendanceResult {
  displayName: string;
  action: '出勤' | '退勤';
  scannedAt: string;
  clockInAt?: string;
  clockOutAt?: string;
}

export function staffQrError(error: unknown) {
  const raw = error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error || '');
  if (raw.includes('STAFF_QR_PERSONAL_REQUIRED')) return '本人用QRの表示には、本人に紐づいた承認済み個人端末が必要です。端末・アクセス管理を確認してください。';
  if (raw.includes('STAFF_QR_ACCOUNT_UNAVAILABLE')) return '職員名簿とログインアカウントの紐づき・利用状態を確認してください。';
  if (raw.includes('STAFF_QR_OUTSIDE_ACCESS_TIME')) return '現在は個人端末を利用できる時間外です。';
  if (raw.includes('DEVICE_LABEL_DUPLICATE')) return '同名の端末が登録済みです。端末・アクセス管理で名称を確認してください。';
  if (raw.includes('Could not find the function')) return '本人用QRのサーバー更新が必要です。管理者に確認してください。';
  return raw || 'QRの処理に失敗しました。通信状況を確認してください。';
}

export async function issuePersonalStaffQr(): Promise<AttendanceQrChallenge & { displayName: string }> {
  if (!supabase) throw new Error('QR機能にはオンライン接続が必要です。');
  const { data, error } = await supabase.rpc('issue_personal_staff_qr', { p_device_token: getAccessDeviceToken() });
  if (error) throw new Error(staffQrError(error));
  if (!data?.token || !data.expiresAt || !data.serverNow) throw new Error('本人用QRを発行できませんでした。');
  return data;
}

export async function getPersonalStaffQrStatus(token: string): Promise<{ usedAt?: string; action?: StaffQrAction }> {
  if (!supabase) throw new Error('オンライン接続が必要です。');
  const { data, error } = await supabase.rpc('get_personal_staff_qr_status', { p_qr_token: token });
  if (error) throw new Error(staffQrError(error));
  return data || {};
}

export async function revokePersonalStaffQr(token: string) {
  if (!supabase) return;
  await supabase.rpc('revoke_personal_staff_qr', { p_qr_token: token });
}

export async function scanPersonalStaffQr(qrToken: string, action: StaffQrAction): Promise<{
  session?: { access_token: string; refresh_token: string };
  attendance?: StaffQrAttendanceResult;
}> {
  if (!supabase) throw new Error('QR機能にはオンライン接続が必要です。');
  const { data, error } = await supabase.functions.invoke('attendance-qr-login', {
    body: { qrToken, deviceToken: getAccessDeviceToken(), action }, timeout: 15_000,
  });
  if (error) {
    let message = '通信に失敗しました。打刻の場合は本人用QR画面・勤務実績で結果を確認してから再試行してください。';
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const result = await context.clone().json();
        if (typeof result.error === 'string') message = result.error;
      } catch { /* Proxy responses may not contain JSON. */ }
    }
    throw new Error(message);
  }
  return data;
}
