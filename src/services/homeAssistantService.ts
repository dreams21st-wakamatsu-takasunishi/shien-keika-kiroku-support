import { supabase } from '../lib/supabase';
import type {
  ChildProfile,
  HomeAssistantExecutionResult,
  HomeAssistantProposal,
  Weekday,
} from '../types';
import { formatJapaneseDate, getLocalDateString } from '../utils/weekdays';

const WEEKDAY_PATTERN = /([月火水木金土日])曜/g;
const WEEKDAY_ORDER: Weekday[] = ['月', '火', '水', '木', '金', '土', '日'];

export async function requestHomeAssistantProposal(
  child: ChildProfile,
  instruction: string
): Promise<HomeAssistantProposal> {
  if (!supabase) return buildLocalProposal(child, instruction);

  const { data, error } = await supabase.functions.invoke('home-assistant', {
    body: { mode: 'propose', childId: child.id, instruction },
  });
  if (error) throw new Error(await readFunctionError(error, 'AIによる実行案の作成に失敗しました。'));
  if (!data?.supported || !data?.proposal) {
    throw new Error(data?.message || 'この指示は現在のアシスタントでは実行できません。');
  }
  return data.proposal as HomeAssistantProposal;
}

export async function executeHomeAssistantProposal(
  proposal: HomeAssistantProposal,
  child?: ChildProfile,
): Promise<HomeAssistantExecutionResult> {
  if (!supabase) {
    return executeLocalProposal(proposal, child);
  }

  const { data, error } = await supabase.functions.invoke('home-assistant', {
    body: { mode: 'execute', actionId: proposal.actionId },
  });
  if (error) throw new Error(await readFunctionError(error, 'アシスタントの実行に失敗しました。'));
  if (!data?.message) throw new Error(data?.error || '実行結果を確認できませんでした。');
  return data as HomeAssistantExecutionResult;
}

async function readFunctionError(error: any, fallback: string) {
  try {
    const body = await error?.context?.json?.();
    return body?.error || body?.message || fallback;
  } catch {
    return error?.message || fallback;
  }
}

function buildLocalProposal(child: ChildProfile, instruction: string): HomeAssistantProposal {
  const common = {
    actionId: `local-action-${Date.now()}`,
    childId: child.id,
    childName: child.name,
    instruction,
  };
  const targetDate = extractDate(instruction);

  if (/削除|招待|権限|承認|テンプレート|AI設定/.test(instruction)) {
    throw new Error('削除・職員招待・権限・記録承認・テンプレート・AI設定は、安全のため各管理画面から操作してください。');
  }

  if (/要約|まとめ|傾向/.test(instruction)) {
    const periodMatch = instruction.match(/(\d+)\s*(日|週間|か月|ヶ月|月)/);
    const amount = Number(periodMatch?.[1]) || 30;
    const unit = periodMatch?.[2];
    const periodDays = unit === '週間' ? amount * 7 : unit && /か月|ヶ月|月/.test(unit) ? amount * 30 : amount;
    return {
      ...common,
      actionType: 'summarize_recent_records',
      periodDays: Math.max(1, Math.min(365, periodDays)),
      summary: `${child.name}さんの直近${Math.max(1, Math.min(365, periodDays))}日間の記録をAIで要約します。よろしいですか？`,
      details: [
        { label: '対象児童', value: child.name },
        { label: '対象期間', value: `直近${Math.max(1, Math.min(365, periodDays))}日間` },
      ],
      confirmationNote: '承認後、対象期間の記録内容を個人名なしでAIへ送り、傾向を要約します。',
    };
  }

  if (/記録.*(一覧|確認|表示)|過去.*記録/.test(instruction)) {
    return {
      ...common,
      actionType: 'open_child_records',
      summary: `${child.name}さんの支援経過記録を一覧表示します。よろしいですか？`,
      details: [{ label: '表示対象', value: `${child.name}さんの記録` }],
      confirmationNote: '記録内容は変更せず、児童名で絞り込んだ一覧画面へ移動します。',
    };
  }

  if (/記録.*(開始|作成|入力)|支援経過.*(開始|作成)/.test(instruction)) {
    const recordDate = targetDate || getLocalDateString();
    return {
      ...common,
      actionType: 'start_support_record',
      recordDate,
      summary: `${child.name}さんの${formatJapaneseDate(recordDate)}の記録作成を開始します。よろしいですか？`,
      details: [
        { label: '対象児童', value: child.name },
        { label: '記録日', value: formatJapaneseDate(recordDate) },
      ],
      confirmationNote: '承認後、対象児童と記録日を設定した記録作成画面へ移動します。',
    };
  }

  if (/留意|配慮|申し送り|注意事項/.test(instruction)) {
    const quoted = instruction.match(/[「『](.+?)[」』]/)?.[1]?.trim();
    const notesText = quoted || instruction.split(/[：:]/).slice(1).join('：').trim();
    if (!notesText) throw new Error('留意点へ反映する文章を「」で囲んで入力してください。');
    const notesMode = /置き換|上書|変更/.test(instruction) && !/追記|追加/.test(instruction) ? 'replace' : 'append';
    return {
      ...common,
      actionType: 'update_child_notes',
      notesMode,
      notesText,
      summary: `${child.name}さんの指導上の留意点を${notesMode === 'replace' ? '置き換え' : '追記'}します。よろしいですか？`,
      details: [
        { label: '変更方法', value: notesMode === 'replace' ? '置き換え' : '追記' },
        { label: '反映する内容', value: notesText },
      ],
      confirmationNote: notesMode === 'replace' ? '現在の留意点はこの内容に置き換わります。' : '現在の留意点を残したまま末尾へ追記します。',
    };
  }

  if (/生年月日|フリガナ|氏名|サービス種別|児童発達支援|放課後等デイサービス/.test(instruction)) {
    const profileChanges: HomeAssistantProposal['profileChanges'] = {};
    const details: HomeAssistantProposal['details'] = [];
    if (/生年月日/.test(instruction) && targetDate) {
      profileChanges.birthDate = targetDate;
      details.push({ label: '生年月日', value: `${child.birthDate || '未登録'} → ${formatJapaneseDate(targetDate)}` });
    }
    const kana = instruction.match(/フリガナ(?:を|は)\s*[「『]?(.+?)[」』]?\s*(?:に|へ|と)(?:変更|修正|して)/)?.[1]?.trim();
    if (kana) {
      profileChanges.kana = kana;
      details.push({ label: 'フリガナ', value: `${child.kana || '未登録'} → ${kana}` });
    }
    const name = instruction.match(/(?:児童)?氏名(?:を|は)\s*[「『]?(.+?)[」』]?\s*(?:に|へ|と)(?:変更|修正|して)/)?.[1]?.trim();
    if (name) {
      profileChanges.name = name;
      details.push({ label: '児童氏名', value: `${child.name} → ${name}` });
    }
    const careType = instruction.includes('児童発達支援')
      ? '児童発達支援'
      : instruction.includes('放課後等デイサービス')
        ? '放課後等デイサービス'
        : undefined;
    if (careType) {
      profileChanges.careType = careType;
      details.push({ label: 'サービス種別', value: `${child.careType || '未登録'} → ${careType}` });
    }
    if (details.length === 0) throw new Error('変更する児童基本情報を特定できませんでした。');
    return {
      ...common,
      actionType: 'update_child_profile',
      profileChanges,
      summary: `${child.name}さんの児童基本情報を変更します。よろしいですか？`,
      details,
      confirmationNote: '児童名簿へ即時反映されます。生年月日を変更した場合、学年も自動再計算されます。',
    };
  }

  const days = new Set<Weekday>();
  for (const match of instruction.matchAll(WEEKDAY_PATTERN)) {
    days.add(match[1] as Weekday);
  }
  const regularDays = WEEKDAY_ORDER.filter((day) => days.has(day));
  if (regularDays.length === 0) {
    throw new Error('曜日を特定できませんでした。「水曜日と金曜日」のように入力してください。');
  }

  const today = getLocalDateString();
  const effectiveDate = targetDate || today;

  if (effectiveDate < today) {
    throw new Error('過去日にさかのぼる変更は実行できません。');
  }

  return {
    ...common,
    actionType: 'schedule_regular_days',
    effectiveDate,
    regularDays,
    summary: `${formatJapaneseDate(effectiveDate)}から、${child.name}さんの定期利用曜日を${regularDays.map((day) => `${day}曜日`).join('・')}に変更します。よろしいですか？`,
    details: [
      { label: '対象児童', value: child.name },
      { label: '適用日', value: formatJapaneseDate(effectiveDate) },
      { label: '変更後の定期利用曜日', value: regularDays.map((day) => `${day}曜日`).join('・') },
    ],
    confirmationNote: '適用日より前の記録候補には影響しません。',
  };
}

function executeLocalProposal(
  proposal: HomeAssistantProposal,
  child?: ChildProfile,
): HomeAssistantExecutionResult {
  if (proposal.actionType === 'schedule_regular_days' && proposal.effectiveDate && proposal.regularDays) {
    return {
      message: `${formatJapaneseDate(proposal.effectiveDate)}より、定期利用曜日を${proposal.regularDays.map((day) => `${day}曜日`).join('・')}に自動変更する予約を登録しました。`,
      schedule: {
        id: `local-schedule-${Date.now()}`,
        effectiveFrom: proposal.effectiveDate,
        regularDays: proposal.regularDays,
        createdAt: new Date().toISOString(),
      },
    };
  }
  if (proposal.actionType === 'update_child_profile') {
    return {
      message: `${proposal.profileChanges?.name || proposal.childName}さんの児童基本情報を更新しました。`,
      updatedChild: proposal.profileChanges,
    };
  }
  if (proposal.actionType === 'update_child_notes') {
    const notes = proposal.notesMode === 'replace'
      ? proposal.notesText || ''
      : [child?.notes?.trim(), proposal.notesText].filter(Boolean).join('\n');
    return {
      message: `${proposal.childName}さんの指導上の留意点を${proposal.notesMode === 'replace' ? '更新' : '追記'}しました。`,
      updatedChild: { notes },
    };
  }
  if (proposal.actionType === 'start_support_record') {
    return {
      message: `${formatJapaneseDate(proposal.recordDate || getLocalDateString())}の記録作成画面を準備しました。`,
      clientAction: {
        type: 'start_support_record',
        childId: proposal.childId,
        date: proposal.recordDate || getLocalDateString(),
      },
    };
  }
  if (proposal.actionType === 'open_child_records') {
    return {
      message: '対象児童の記録一覧を表示します。',
      clientAction: { type: 'open_child_records', childId: proposal.childId },
    };
  }
  return {
    message: `直近${proposal.periodDays || 30}日間の記録を要約しました。`,
    output: 'ローカル試用モードではAI要約を実行しません。本番環境では、継続して見られる様子・有効だった支援・次回確認点を整理して表示します。',
  };
}

function extractDate(instruction: string) {
  const japaneseDate = instruction.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/);
  const isoDate = instruction.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  const monthDay = instruction.match(/(\d{1,2})月\s*(\d{1,2})日/);
  const today = getLocalDateString();
  const currentYear = Number(today.slice(0, 4));
  if (/今日|本日/.test(instruction)) return today;
  if (/明日|翌日/.test(instruction)) return shiftDate(today, 1);
  if (/昨日|前日/.test(instruction)) return shiftDate(today, -1);
  if (japaneseDate) return `${japaneseDate[1]}-${japaneseDate[2].padStart(2, '0')}-${japaneseDate[3].padStart(2, '0')}`;
  if (isoDate) return `${isoDate[1]}-${isoDate[2].padStart(2, '0')}-${isoDate[3].padStart(2, '0')}`;
  if (!monthDay) return '';
  const currentYearDate = `${currentYear}-${monthDay[1].padStart(2, '0')}-${monthDay[2].padStart(2, '0')}`;
  return currentYearDate >= today ? currentYearDate : `${currentYear + 1}-${currentYearDate.slice(5)}`;
}

function shiftDate(date: string, days: number) {
  const parsed = new Date(`${date}T00:00:00`);
  parsed.setDate(parsed.getDate() + days);
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
