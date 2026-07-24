import type { Template, WizardQuestionConfig, WizardQuestionId, WizardQuestions } from '../types';

export const DEFAULT_WIZARD_QUESTIONS: WizardQuestions = {
  template: {
    title: 'どの記録フォーマットを使いますか？',
    help: '利用日の種類に合うものを選択してください。',
  },
  children: {
    title: '記録する児童を選択してください。',
    help: '複数選択できます。入力中は児童タブですぐに切り替えられます。',
  },
  date: { title: 'いつの支援記録ですか？' },
  recorder: { title: 'この記録を入力する職員は誰ですか？' },
  attendance: {
    title: '本日の出欠を教えてください。',
    help: '必要に応じて遅刻・早退の状況などを備考に入力できます。',
    options: ['出席', '欠席', '遅刻', '早退', 'その他'],
    noteLabel: '出欠の備考（任意）',
    notePlaceholder: '例：学校行事のため16時に来所',
  },
  expression: {
    title: '来所時の表情はどうでしたか？',
    help: '当てはまる表情を複数選択できます。',
    options: ['笑顔', '真顔', '暗め', '泣き顔', '不機嫌', 'その他'],
    noteLabel: '表情の備考（任意）',
    notePlaceholder: '例：来所直後は緊張した様子だったが、徐々に笑顔が見られた',
  },
  snack: {
    title: 'おやつの状況を選んでください。',
    help: '最も近い状況を1つ選び、必要に応じて備考を入力してください。',
    options: ['食べた', '持ち帰り', '食べていない', '持ち込み'],
    noteLabel: 'おやつの備考（任意）',
    notePlaceholder: '例：持参したおやつを半分食べ、残りは持ち帰り',
  },
  abcBehavior: {
    title: '{section}：子どもの気になる様子は何かありましたか？（B）',
    help: '観察できた行動だけを、箇条書き・短い言葉で入力してください。ない場合はスキップできます。',
  },
  abcConsequence: {
    title: '{section}：どのような結果になりましたか？（C）',
    help: 'その直後に起きたことや職員の対応を、簡潔に入力してください。',
  },
  abcAntecedent: {
    title: '{section}：何がきっかけでの出来事ですか？（A）',
    help: '行動の直前の状況、声かけ、課題、環境の変化などを簡潔に入力してください。',
  },
  abcSummary: {
    title: '{section}：ABC分析に基づいて要約します。',
    help: 'A・B・Cの入力を確認し、「ABC分析を要約する」を押してください。文章は後から修正できます。',
  },
};

export const WIZARD_QUESTION_ORDER: WizardQuestionId[] = [
  'template',
  'date',
  'children',
  'recorder',
  'attendance',
  'expression',
  'snack',
  'abcBehavior',
  'abcConsequence',
  'abcAntecedent',
  'abcSummary',
];

export const WIZARD_QUESTION_LABELS: Record<WizardQuestionId, string> = {
  template: 'テンプレート選択',
  children: '児童選択',
  date: '記録日',
  recorder: '記録者',
  attendance: '出欠',
  expression: '来所時の表情',
  snack: 'おやつ',
  abcBehavior: 'ABC：行動（B）',
  abcConsequence: 'ABC：結果（C）',
  abcAntecedent: 'ABC：きっかけ（A）',
  abcSummary: 'ABC：要約',
};

export function getWizardQuestions(template?: Template): WizardQuestions {
  const custom = template?.wizardQuestions || {};
  return Object.fromEntries(
    WIZARD_QUESTION_ORDER.map((id) => [
      id,
      { ...DEFAULT_WIZARD_QUESTIONS[id], ...(custom[id] || {}) },
    ]),
  ) as WizardQuestions;
}

export function renderQuestionText(config: WizardQuestionConfig, sectionTitle?: string) {
  return {
    title: config.title.replaceAll('{section}', sectionTitle || '各時間'),
    help: config.help?.replaceAll('{section}', sectionTitle || '各時間'),
  };
}
