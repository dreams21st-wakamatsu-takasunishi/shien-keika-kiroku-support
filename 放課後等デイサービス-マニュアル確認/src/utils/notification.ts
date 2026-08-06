import { EmergencySOSPattern } from '../types';

export interface SOSPatternDetail {
  pattern: EmergencySOSPattern;
  label: string;
  icon: string;
  color: string; // Tailwind color class
  badgeBg: string;
  summaryAction: string;
  steps: string[];
  recommendedContacts: string[];
}

export const SOS_PATTERNS: Record<EmergencySOSPattern, SOSPatternDetail> = {
  runaway: {
    pattern: 'runaway',
    label: '飛び出し・行方不明',
    icon: '🏃',
    color: 'bg-red-600',
    badgeBg: 'bg-red-100 text-red-800 border-red-300',
    summaryAction: '【10分ルール】10分捜索で見つからなければ即110番警察通報！付近幹線道路・公園・自動販売機を緊急重点捜索。',
    steps: [
      '大声で周囲スタッフに「〇〇ちゃん飛び出し！」と伝達',
      '手分けして幹線道路・公園・自販機・川沿いを優先捜索',
      '10分経過時は即110番通報（服装・靴・本人の特徴を提示）'
    ],
    recommendedContacts: ['警察 110番', '保護者連絡']
  },
  epipen: {
    pattern: 'epipen',
    label: 'アナフィラキシー / エピペン要領',
    icon: '💉',
    color: 'bg-rose-700',
    badgeBg: 'bg-rose-100 text-rose-900 border-rose-300',
    summaryAction: '呼吸困難・嘔吐時、119番通報と同時にエピペン®を太もも外側へ5秒間垂直にカチッと押し当て！',
    steps: [
      'エピペン保管場所から即座に取り出し（オレンジキャップ外し）',
      '太もも前外側へ垂直に強く押し当て「5秒間保持」',
      '同時に119番（救急）通報し、投与時刻を救急隊へ伝達'
    ],
    recommendedContacts: ['救急 1119番', '指定協力病院']
  },
  car: {
    pattern: 'car',
    label: '送迎車トラブル / 置きざり疑い',
    icon: '🚗',
    color: 'bg-amber-600',
    badgeBg: 'bg-amber-100 text-amber-900 border-amber-300',
    summaryAction: '送迎車内・後部座席・足元を即時現場捜索！乗車名簿とのクロス点呼を徹底実行。',
    steps: [
      'ドライバー・添乗員で送迎車両の全シート・足元を直接目視確認',
      '利用児童名簿と現在点呼数を直ちに再照合',
      '車内・車両周辺の安全確保と管理者への報告'
    ],
    recommendedContacts: ['施設本部', '送迎ドライバー']
  },
  panic: {
    pattern: 'panic',
    label: 'パニック・他害・自傷',
    icon: '⚡',
    color: 'bg-purple-700',
    badgeBg: 'bg-purple-100 text-purple-900 border-purple-300',
    summaryAction: '他児童を別室へ即避難！感覚刺激（照明・音）を遮断し、応援スタッフ1名が静かに付き添い。',
    steps: [
      '周りの他児童を別スペースへ速やかに避難・誘導',
      '対応スタッフを1名に絞り、大声を出さず静かな声で安全確保',
      '照明を落とし、クールダウンエリア（カームダウン）へ誘導'
    ],
    recommendedContacts: ['支援リーダー', '看護スタッフ']
  },
  disaster: {
    pattern: 'disaster',
    label: '地震・火災・避難誘導',
    icon: '🦺',
    color: 'bg-orange-600',
    badgeBg: 'bg-orange-100 text-orange-900 border-orange-300',
    summaryAction: '頭部保護・安全な場所で身を低く！揺れ収まり後、非常用持ち出しリュックを持参し指定避難場所へ。',
    steps: [
      'まず身の安全確保（頭部保護・火の元確認）',
      '非常持出袋・児童点呼名簿を持参',
      '指定避難場所へ児童を集団誘導・全員点呼'
    ],
    recommendedContacts: ['消防 119番', '指定避難場所']
  },
  other: {
    pattern: 'other',
    label: 'その他緊急・助けて呼び出し',
    icon: '🆘',
    color: 'bg-red-800',
    badgeBg: 'bg-red-100 text-red-900 border-red-300',
    summaryAction: '現場での緊急トラブル発生！近くの対応可能スタッフは至急現地へ駆けつけてください！',
    steps: [
      '現場の安全を確保し、対応可能スタッフが急行',
      '状況を即座に把握し、管理者・保護者へ連絡',
      '必要に応じて警察・救急へ手配'
    ],
    recommendedContacts: ['管理者・施設本部']
  }
};

/**
 * Request notification permission from the browser
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    console.warn('This browser does not support desktop notifications');
    return 'denied';
  }

  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch (err) {
    console.error('Error requesting notification permission:', err);
    return 'denied';
  }
}

/**
 * Send a Popup Device Notification (Web Notification API) + Sound/Vibration
 */
export function triggerDeviceNotification(
  title: string,
  body: string,
  patternIcon: string = '🚨'
) {
  // 1. Device Vibration (if supported on mobile)
  if ('vibrate' in navigator) {
    try {
      navigator.vibrate([400, 150, 400, 150, 400, 150, 600]);
    } catch (e) {
      console.log('Vibration not supported/allowed', e);
    }
  }

  // 2. Speech Synthesis Audio Alert (Voice reading)
  if ('speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel(); // Cancel any existing speech
      const utterance = new SpeechSynthesisUtterance(`緊急エスオーエス発生。${title}。${body.slice(0, 50)}`);
      utterance.lang = 'ja-JP';
      utterance.rate = 1.1;
      utterance.pitch = 1.2;
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.log('Speech synthesis error', e);
    }
  }

  // 3. Desktop / Mobile Web Notification API
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      const notification = new Notification(`${patternIcon} ${title}`, {
        body,
        icon: '/favicon.ico',
        tag: 'houkago-emergency-sos',
        requireInteraction: true, // Remains on screen until user interacts
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    } catch (err) {
      console.error('Error triggering notification:', err);
    }
  }
}
