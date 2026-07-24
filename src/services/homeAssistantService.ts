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
  proposal: HomeAssistantProposal
): Promise<HomeAssistantExecutionResult> {
  if (!supabase) {
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

  const { data, error } = await supabase.functions.invoke('home-assistant', {
    body: { mode: 'execute', actionId: proposal.actionId },
  });
  if (error) throw new Error(await readFunctionError(error, 'アシスタントの実行に失敗しました。'));
  if (!data?.schedule) throw new Error(data?.error || '実行結果を確認できませんでした。');
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
  const days = new Set<Weekday>();
  for (const match of instruction.matchAll(WEEKDAY_PATTERN)) {
    days.add(match[1] as Weekday);
  }
  const regularDays = WEEKDAY_ORDER.filter((day) => days.has(day));
  if (regularDays.length === 0) {
    throw new Error('曜日を特定できませんでした。「水曜日と金曜日」のように入力してください。');
  }

  const japaneseDate = instruction.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/);
  const isoDate = instruction.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  const monthDay = instruction.match(/(\d{1,2})月\s*(\d{1,2})日/);
  const today = getLocalDateString();
  const currentYear = Number(today.slice(0, 4));
  const inferredDate = monthDay
    ? `${currentYear}-${monthDay[1].padStart(2, '0')}-${monthDay[2].padStart(2, '0')}`
    : '';
  const effectiveDate = japaneseDate
    ? `${japaneseDate[1]}-${japaneseDate[2].padStart(2, '0')}-${japaneseDate[3].padStart(2, '0')}`
    : isoDate
      ? `${isoDate[1]}-${isoDate[2].padStart(2, '0')}-${isoDate[3].padStart(2, '0')}`
      : inferredDate && inferredDate >= today
        ? inferredDate
        : inferredDate
          ? `${currentYear + 1}-${inferredDate.slice(5)}`
          : today;

  if (effectiveDate < today) {
    throw new Error('過去日にさかのぼる変更は実行できません。');
  }

  return {
    actionId: `local-action-${Date.now()}`,
    actionType: 'schedule_regular_days',
    childId: child.id,
    childName: child.name,
    instruction,
    effectiveDate,
    regularDays,
    summary: `${formatJapaneseDate(effectiveDate)}から、${child.name}さんの定期利用曜日を${regularDays.map((day) => `${day}曜日`).join('・')}に変更します。よろしいですか？`,
  };
}
