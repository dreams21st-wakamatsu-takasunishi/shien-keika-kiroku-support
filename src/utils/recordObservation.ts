import type { ChildProfile, TemplateField } from '../types';
import { calculateSchoolGrade } from './schoolGrade';
import { getTransportProgram, type TransportProgram } from './transportDeparture';

export const RECORD_PROGRAMS = ['小学部', 'キャリアズ'] as const;
export type RecordProgramFilter = 'すべて' | TransportProgram;

/** Use the registered program first, including children outside the usual age range. */
export function getRecordProgram(child: Pick<ChildProfile, 'transportProgram' | 'grade' | 'birthDate'>, date: string): TransportProgram {
  return getTransportProgram({ ...child, grade: calculateSchoolGrade(child.birthDate, new Date(`${date}T12:00:00`)) || child.grade });
}

export function recordProgramClass(program: TransportProgram, selected = false): string {
  return program === '小学部'
    ? selected ? 'border-sky-700 bg-sky-700 text-white' : 'border-sky-300 bg-sky-50 text-sky-950'
    : selected ? 'border-violet-700 bg-violet-700 text-white' : 'border-violet-300 bg-violet-50 text-violet-950';
}

// Only shorten known standard choices; custom choices keep their full wording.
const SHORT_SCALE_LABELS: Record<string, string> = {
  '1：うつむきや暗い表情が強く見られた': 'うつむき・暗い',
  '2：表情が硬く、やや暗い様子だった': '硬い・やや暗い',
  '3：普段通りで、大きな変化は見られなかった': '普段通り',
  '4：口元がやわらかく、穏やかな表情だった': '穏やか',
  '5：笑顔が見られ、明るい表情だった': '笑顔・明るい',
  '1：非常に強い疲労感が見られた': '非常に強い疲れ',
  '2：強い疲れや休息を求める様子が見られた': '強い疲れ・休息',
  '3：疲れた様子が見られた': '疲れが見られる',
  '4：少し疲れた様子が見られた': '少し疲れている',
  '5：疲労感は見られなかった': '疲れは見られない',
  '1：準備を行うことができなかった': '準備できず',
  '2：繰り返しの声掛けや手順の提示で一部行えた': '繰り返し支援',
  '3：指導員の声掛けで行えた': '声掛けで準備',
  '4：少し確認を受けながら、ほぼ自分で行えた': '少し確認・ほぼ自分',
  '5：必要な準備に気づき、自分で行えた': '気づいて自分で',
  '1：声掛けに反応が見られなかった': '反応なし',
  '2：反応はあったが、返事が小さい・遅れる様子だった': '小さい・遅い返事',
  '3：声掛けに返事ができた': '返事あり',
  '4：目を合わせ、返事ができた': '目線と返事',
  '5：目を合わせ、はっきりと返事ができた': '目線・明確な返事',
  '1：宿題に取り組むことができなかった': '取り組めず',
  '2：継続した支援を受けながら一部取り組めた': '継続支援で一部',
  '3：分からないところを自ら聞いて取り組めた': '自ら質問して',
  '4：一部確認しながら、ほぼ自力で済ませられた': '一部確認・ほぼ自力',
  '5：自力で宿題を済ませられた': '自力で完了',
  '1：自由時間から切り替えることができなかった': '切替できず',
  '2：繰り返しの声掛け後に時間をかけて切り替えられた': '繰返し声掛け・時間',
  '3：指導員からの声掛けで切り替えられた': '声掛けで切替',
  '4：わずかな合図でタイマーに気づき、切り替えられた': '少しの合図で',
  '5：自分でタイマーに気づき、切り替えられた': '自分で気づいて',
  '1：活動への参加が難しかった': '参加が難しい',
  '2：継続した働き掛けで一部参加できた': '継続支援で一部',
  '3：声掛けを受けて参加できた': '声掛けで参加',
  '4：少し確認を受けながら、意欲的に参加できた': '少し確認・意欲的',
  '5：自分から意欲的に参加できた': '自分から参加',
};

export function observationScaleLabel(value: string): { level: string; label: string } {
  const match = /^(\d+)：(.*)$/.exec(value);
  return { level: match?.[1] || '', label: SHORT_SCALE_LABELS[value] || match?.[2] || value };
}

export function observationPrompt(kind: string, field: TemplateField | undefined, program: TransportProgram): { title: string; hint: string } | undefined {
  if (kind === 'attendance') return { title: '出欠', hint: '実際の出欠を選択。遅刻・早退は備考に時刻を残します。' };
  if (kind === 'expression') return { title: '来所時の表情', hint: '見た表情に近いものを選択。普段との差や、その後の変化はメモへ。' };
  if (kind === 'snack') return { title: 'おやつ', hint: '食べた状況を選択。量・理由・持参した物はメモへ。' };
  if (!field) return undefined;
  const elementary = program === '小学部';
  if (field.id === 'fatigue') return { title: '来所時の疲れ・休息', hint: '眠気・姿勢・休息を求める様子など、観察した事実から選択。' };
  if (field.id === 'preparation') return { title: '準備に必要だった支援', hint: elementary ? '荷物整理・学習準備など、自分で行えた範囲と声掛けの量を確認。' : '荷物・予定・課題の準備など、本人の判断と必要だった確認を観察。' };
  if (field.id === 'response_to_prompt') return { title: '声掛けへの反応', hint: '返事・目線・反応までの時間を確認。目線だけで判断せず、具体的な様子もメモへ。' };
  if (field.id === 'medication') return { title: '服薬の状況', hint: '対象の有無と実際の状況を確認。必要に応じて時刻・本人の様子をメモへ。' };
  if (field.id.endsWith('_study_attitude')) return { title: '学習に必要だった支援', hint: elementary ? '取り組めた範囲・質問・声掛けを観察。課題量やつまずきはメモへ。' : '課題の進め方・質問・自己確認を観察。本人の工夫や必要だった支援はメモへ。' };
  if (field.id.endsWith('_pc_transition')) return { title: '自由時間からの切替', hint: 'タイマーへの気づき・合図・声掛けの回数を確認。切替後の様子もメモへ。' };
  if (field.id.endsWith('_activity_initiative')) return { title: '活動への参加と働き掛け', hint: elementary ? '参加できた場面と必要だった声掛けを確認。' : '本人からの提案・役割・協力と、必要だった働き掛けを確認。' };
  return undefined;
}

export interface ObservationStepReference {
  id: string;
  kind: string;
  sectionId?: string;
  fieldId?: string;
  moduleId?: string;
  moduleType?: string;
}

/** Map only to an existing visible question. Never create a module or copy an answer. */
export function matchingObservationStep(current: ObservationStepReference, source: ObservationStepReference[], target: ObservationStepReference[]): ObservationStepReference | undefined {
  if (!current.moduleId) return target.find((step) => step.id === current.id);
  const moduleIds = [...new Set(source.filter((step) => step.moduleType === current.moduleType).map((step) => step.moduleId))];
  const ordinal = moduleIds.indexOf(current.moduleId);
  const targetIds = [...new Set(target.filter((step) => step.moduleType === current.moduleType).map((step) => step.moduleId))];
  const targetId = targetIds[ordinal];
  if (!targetId) return undefined;
  return target.find((step) => step.moduleId === targetId && step.kind === current.kind && step.fieldId === current.fieldId)
    || target.find((step) => step.moduleId === targetId);
}
