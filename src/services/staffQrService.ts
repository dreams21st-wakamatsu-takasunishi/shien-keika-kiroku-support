import { supabase } from '../lib/supabase';
import { getAccessDevicePlatform, getAccessDeviceToken } from '../utils/accessDevice';
import type { AttendanceQrChallenge } from '../types';

export type StaffQrAction = 'ログイン' | '出勤' | '退勤';
export interface PersonalStaffQrDevice {
  state: 'unregistered' | 'pending' | 'approved' | 'revoked' | 'facility_shared' | 'other_owner';
  displayName: string;
  label?: string;
}
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
  if (raw.includes('STAFF_QR_DEVICE_SHARED')) return 'このブラウザーは施設共用端末です。本人用QRはご自身の個人端末で表示してください。';
  if (raw.includes('STAFF_QR_DEVICE_OTHER_OWNER')) return 'このブラウザーは他の職員の個人端末として登録されています。管理者に確認してください。';
  if (raw.includes('STAFF_QR_DEVICE_REVOKED')) return 'この個人端末は利用停止中です。管理者に再承認を依頼してください。';
  if (raw.includes('STAFF_QR_DEVICE_TOKEN_INVALID')) return '端末情報を確認できません。画面を開き直してください。';
  if (raw.includes('DEVICE_LABEL_DUPLICATE')) return '同名の端末が登録済みです。端末・アクセス管理で名称を確認してください。';
  if (raw.includes('Could not find the function')) return '本人用QRのサーバー更新が必要です。管理者に確認してください。';
  return raw || 'QRの処理に失敗しました。通信状況を確認してください。';
}

function parsePersonalDevice(data: unknown): PersonalStaffQrDevice {
  const value = data as Partial<PersonalStaffQrDevice> | null;
  if (!value || !['unregistered', 'pending', 'approved', 'revoked', 'facility_shared', 'other_owner'].includes(value.state || '')
    || typeof value.displayName !== 'string' || !value.displayName.trim()
    || (value.label !== undefined && typeof value.label !== 'string')) throw new Error('個人端末の登録状況を確認できませんでした。');
  return value as PersonalStaffQrDevice;
}

export async function getPersonalStaffQrDevice(): Promise<PersonalStaffQrDevice> {
  if (!supabase) throw new Error('オンライン接続が必要です。');
  const { data, error } = await supabase.rpc('get_personal_staff_qr_device', { p_device_token: getAccessDeviceToken() });
  if (error) throw new Error(staffQrError(error));
  return parsePersonalDevice(data);
}

export async function requestPersonalStaffQrDevice(label: string): Promise<PersonalStaffQrDevice> {
  if (!supabase) throw new Error('オンライン接続が必要です。');
  const { data, error } = await supabase.rpc('request_personal_staff_qr_device', {
    p_device_token: getAccessDeviceToken(), p_label: label.trim(), p_platform: getAccessDevicePlatform(),
  });
  if (error) throw new Error(staffQrError(error));
  return parsePersonalDevice(data);
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
