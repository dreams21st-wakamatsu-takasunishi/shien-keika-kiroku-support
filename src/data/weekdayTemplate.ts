import type { Template, TemplateField } from '../types';
import { HOMEWORK_FIELD_HELP, HOMEWORK_SUBJECTS } from '../utils/homeworkField';

export const EXPRESSION_SCALE_OPTIONS = [
  '1：うつむきや暗い表情が強く見られた',
  '2：表情が硬く、やや暗い様子だった',
  '3：普段通りで、大きな変化は見られなかった',
  '4：口元がやわらかく、穏やかな表情だった',
  '5：笑顔が見られ、明るい表情だった',
];

export const FATIGUE_RATING_OPTIONS = [
  '1：非常に強い疲労感が見られた',
  '2：強い疲れや休息を求める様子が見られた',
  '3：疲れた様子が見られた',
  '4：少し疲れた様子が見られた',
  '5：疲労感は見られなかった',
];

export const PREPARATION_SCALE_OPTIONS = [
  '1：準備を行うことができなかった',
  '2：繰り返しの声掛けや手順の提示で一部行えた',
  '3：指導員の声掛けで行えた',
  '4：少し確認を受けながら、ほぼ自分で行えた',
  '5：必要な準備に気づき、自分で行えた',
];

export const RESPONSE_SCALE_OPTIONS = [
  '1：声掛けに反応が見られなかった',
  '2：反応はあったが、返事が小さい・遅れる様子だった',
  '3：声掛けに返事ができた',
  '4：目を合わせ、返事ができた',
  '5：目を合わせ、はっきりと返事ができた',
];

export const HOMEWORK_ATTITUDE_SCALE_OPTIONS = [
  '1：宿題に取り組むことができなかった',
  '2：継続した支援を受けながら一部取り組めた',
  '3：分からないところを自ら聞いて取り組めた',
  '4：一部確認しながら、ほぼ自力で済ませられた',
  '5：自力で宿題を済ませられた',
];

export const TRANSITION_SCALE_OPTIONS = [
  '1：自由時間から切り替えることができなかった',
  '2：繰り返しの声掛け後に時間をかけて切り替えられた',
  '3：指導員からの声掛けで切り替えられた',
  '4：わずかな合図でタイマーに気づき、切り替えられた',
  '5：自分でタイマーに気づき、切り替えられた',
];

export const POSTURE_BACK_OPTIONS = [
  '背がまっすぐ',
  '猫背',
  '横を向いている',
];

export const POSTURE_LEG_OPTIONS = [
  '足を閉じている',
  '足が開いている',
  '足をクロスする',
  '足を組んでいる',
  '貧乏ゆすりをしている',
  '足が机から出ている',
];

export const POSTURE_CATEGORIES = ['背すじ', '足', 'その他'];

export function createLearningPcFields(
  prefix: string,
  typeQuestion: string,
  typeLabel: string,
  options: string[] = ['学習', 'パソコン', 'その他'],
): TemplateField[] {
  const visibleWhen = (value: '学習' | 'パソコン') => ({
    fieldId: `${prefix}_type`,
    equals: value,
  });

  return [
    {
      id: `${prefix}_type`,
      label: typeLabel,
      questionTitle: typeQuestion,
      type: 'radio',
      options,
      defaultValue: '',
      hasNote: true,
      noteVisibleWhen: 'その他',
      notePlaceholder: '取り組み内容や補足を入力してください。',
      required: true,
    },
    {
      id: `${prefix}_study_homework`,
      label: '宿題内容',
      questionTitle: '宿題内容はなんですか？',
      type: 'homework_subjects',
      options: [...HOMEWORK_SUBJECTS],
      defaultValue: '',
      hasNote: false,
      helpText: HOMEWORK_FIELD_HELP,
      visibleWhen: visibleWhen('学習'),
    },
    {
      id: `${prefix}_study_attitude`,
      label: '宿題への取り組み',
      questionTitle: '宿題への取り組みはどうですか？',
      type: 'rating_scale',
      options: HOMEWORK_ATTITUDE_SCALE_OPTIONS,
      defaultValue: '',
      hasNote: true,
      notePlaceholder: '取り組み方や必要だった支援を簡潔に入力してください。',
      helpText: '1が「できなかった」、3が「分からないところを自ら聞いてできた」、5が「自力で済ませられた」の基準です。',
      scaleLowLabel: '1：できなかった',
      scaleHighLabel: '5：自力で完了',
      visibleWhen: visibleWhen('学習'),
    },
    {
      id: `${prefix}_study_extras`,
      label: '宿題以外の取り組み',
      questionTitle: '宿題以外の勉強は取り組んでいますか？',
      type: 'study_extras',
      options: ['漢検', 'エジソン', '取り組みなし', 'その他'],
      defaultValue: '',
      hasNote: false,
      helpText: '当てはまるものを複数選択してください。',
      visibleWhen: visibleWhen('学習'),
    },
    {
      id: `${prefix}_study_posture`,
      label: '学習時の姿勢',
      questionTitle: '学習時の姿勢はどうでしたか？',
      type: 'posture_observation',
      options: POSTURE_CATEGORIES,
      defaultValue: '',
      hasNote: false,
      helpText: '背すじ・足・その他を選び、変化が見られた時にいつでも追記できます。',
      visibleWhen: visibleWhen('学習'),
    },
    {
      id: `${prefix}_pc_content`,
      label: 'パソコン取り組み内容',
      questionTitle: '取り組み内容はなんですか？',
      type: 'pc_activities',
      options: ['Dレッスン', '文章入力模擬試験', 'その他'],
      defaultValue: '',
      hasNote: false,
      helpText: '当てはまる内容を複数選択し、表示された詳細を入力してください。',
      visibleWhen: visibleWhen('パソコン'),
    },
    {
      id: `${prefix}_pc_finger`,
      label: 'タイピング時の指使い',
      questionTitle: 'タイピング練習時の指使いはどうですか？',
      type: 'hand_count',
      defaultValue: '',
      helpText: '左手・右手それぞれで使用した指の本数を0～5本で入力してください。',
      hasNote: true,
      notePlaceholder: '指使いやホームポジションについて補足を入力してください。',
      visibleWhen: visibleWhen('パソコン'),
    },
    {
      id: `${prefix}_pc_posture`,
      label: '取り組み時の姿勢',
      questionTitle: '取り組み時の姿勢はどうでしたか？',
      type: 'posture_observation',
      options: POSTURE_CATEGORIES,
      defaultValue: '',
      hasNote: false,
      helpText: '背すじ・足・その他を選び、変化が見られた時にいつでも追記できます。',
      visibleWhen: visibleWhen('パソコン'),
    },
    {
      id: `${prefix}_pc_transition`,
      label: '自由時間からの切り替え',
      questionTitle: '自由時間からの切り替えはどうですか？',
      type: 'rating_scale',
      options: TRANSITION_SCALE_OPTIONS,
      defaultValue: '',
      hasNote: true,
      notePlaceholder: 'タイマーへの気づき方や、必要だった声掛けを簡潔に入力してください。',
      helpText: '1が「切り替えられなかった」、3が「声掛けで切り替えられた」、5が「自分でタイマーに気づき切り替えられた」の基準です。',
      scaleLowLabel: '1：切り替え不可',
      scaleHighLabel: '5：自分で切り替え',
      visibleWhen: visibleWhen('パソコン'),
    },
  ];
}

function periodFields(periodNumber: 1 | 2): TemplateField[] {
  return createLearningPcFields(
    `period${periodNumber}`,
    `${periodNumber}コマ目はなんの取り組みですか？`,
    `${periodNumber}コマ目の取り組み`,
  );
}

export const STANDARD_WEEKDAY_TEMPLATE: Template = {
  id: 'template-weekday',
  name: '支援経過記録 (平日)',
  type: '平日',
  isDefault: true,
  description: '平日の生活・学習・パソコン学習を、関連質問ごとにまとめて記録する標準フォーマット',
  wizardQuestions: {
    expression: {
      title: '来所時点での表情はどうですか？',
      help: '1が暗い表情、5が笑顔の基準です。最も近い状態を1つ選択してください。',
      options: EXPRESSION_SCALE_OPTIONS,
      noteLabel: '表情の備考（任意）',
      notePlaceholder: '来所時の具体的な表情や、その後の変化を入力してください。',
    },
    snack: {
      title: 'おやつはどうですか？',
      help: '最も近い状況を1つ選び、必要に応じて備考を入力してください。',
      options: ['食べた', '持ち帰り', '食べていない', '持ち込み'],
      noteLabel: 'おやつの備考（任意）',
      notePlaceholder: '量、持ち込み内容、食べなかった理由などを入力してください。',
    },
    abcBehavior: {
      title: '児童の様子で気になった様子はなんですか？',
      help: '観察できた行動を、箇条書きや短い言葉で簡潔に入力してください。',
    },
    abcConsequence: {
      title: 'どのような結果になりましたか？',
      help: 'その直後に起きたことや職員の対応を、簡潔に入力してください。',
    },
    abcAntecedent: {
      title: '何がきっかけでの出来事ですか？',
      help: '行動直前の状況、声掛け、課題、環境の変化などを簡潔に入力してください。',
    },
    abcSummary: {
      title: 'ABC行動分析に基づいて要約します。',
      help: 'A・B・Cの内容を確認して要約し、必要に応じて文章を修正してください。',
    },
  },
  sections: [
    {
      id: 'life',
      title: '生活',
      fields: [
        {
          id: 'fatigue',
          label: '疲労感',
          questionTitle: '来所時点での疲労感はどうですか？',
          type: 'rating_scale',
          options: FATIGUE_RATING_OPTIONS,
          defaultValue: '',
          hasNote: true,
          notePlaceholder: '疲れた様子、休息の必要性、眠気などを入力してください。',
          helpText: '1が「疲労感が非常に強い」、5が「疲労感なし」の基準です。',
          scaleLowLabel: '1：疲労感が非常に強い',
          scaleHighLabel: '5：疲労感なし',
        },
        {
          id: 'preparation',
          label: '準備',
          questionTitle: '準備はどうですか？',
          type: 'rating_scale',
          options: PREPARATION_SCALE_OPTIONS,
          defaultValue: '',
          hasNote: true,
          notePlaceholder: '荷物整理など、自分で行えた範囲を入力してください。',
          helpText: '1が「できなかった」、3が「声掛けでできた」、5が「自分でできた」の基準です。',
          scaleLowLabel: '1：できなかった',
          scaleHighLabel: '5：自分でできた',
        },
        {
          id: 'response_to_prompt',
          label: '声掛けへの反応',
          questionTitle: '指導員からの声掛けへの反応はどうですか？',
          type: 'rating_scale',
          options: RESPONSE_SCALE_OPTIONS,
          defaultValue: '',
          hasNote: true,
          notePlaceholder: '目線、返事の様子、反応までの時間などを入力してください。',
          helpText: '1が「反応なし」、3が「返事あり」、5が「目が合い、返事もはっきりできた」の基準です。',
          scaleLowLabel: '1：反応なし',
          scaleHighLabel: '5：目線・返事とも良好',
        },
        {
          id: 'medication',
          label: '※服薬',
          questionTitle: '※服薬は出来ましたか？',
          type: 'radio',
          options: ['対象なし', '自身で服薬', '声掛けで服薬', '拒否'],
          defaultValue: '',
          hasNote: true,
          notePlaceholder: '服薬時刻や本人の様子などを入力してください。',
          warningText: '服薬の補助、介助は行わないでください',
        },
      ],
    },
    {
      id: 'period1',
      title: '1コマ目',
      fields: periodFields(1),
    },
    {
      id: 'period2',
      title: '2コマ目',
      fields: periodFields(2),
    },
    {
      id: 'special',
      title: '特記',
      fields: [],
    },
  ],
};

export function isStructuredWeekdayTemplate(template?: Template) {
  if (!template || template.type !== '平日') return false;
  const sectionIds = new Set(template.sections.map((section) => section.id));
  return sectionIds.has('life') && sectionIds.has('period1') && sectionIds.has('period2') && sectionIds.has('special');
}

export function upgradeStandardWeekdayTemplate(template: Template): Template {
  if (template.id !== STANDARD_WEEKDAY_TEMPLATE.id) return template;
  if (!isStructuredWeekdayTemplate(template)) {
    return {
      ...STANDARD_WEEKDAY_TEMPLATE,
      name: template.name || STANDARD_WEEKDAY_TEMPLATE.name,
      description: template.description || STANDARD_WEEKDAY_TEMPLATE.description,
      isDefault: template.isDefault ?? true,
    };
  }

  const currentExpression = template.wizardQuestions?.expression;
  const expressionNeedsDirectionFix = !currentExpression?.options?.length
    || /笑顔|明る/.test(currentExpression.options[0] || '');
  return {
    ...template,
    wizardQuestions: {
      ...template.wizardQuestions,
      expression: {
        ...STANDARD_WEEKDAY_TEMPLATE.wizardQuestions?.expression,
        ...currentExpression,
        title: STANDARD_WEEKDAY_TEMPLATE.wizardQuestions?.expression?.title || '来所時点での表情はどうですか？',
        ...(expressionNeedsDirectionFix ? {
          help: STANDARD_WEEKDAY_TEMPLATE.wizardQuestions?.expression?.help,
          options: [...EXPRESSION_SCALE_OPTIONS],
        } : {}),
      },
    },
    sections: template.sections.map((section) => ({
      ...section,
      fields: section.fields.map((field) => {
        const standardField = STANDARD_WEEKDAY_TEMPLATE.sections
          .find((candidate) => candidate.id === section.id)
          ?.fields.find((candidate) => candidate.id === field.id);
        const usesUpdatedLearningInput = /_(type|study_homework|study_attitude|study_posture|pc_posture)$/.test(field.id);
        if (standardField && usesUpdatedLearningInput) {
          return {
            ...field,
            type: standardField.type,
            options: standardField.options ? [...standardField.options] : field.options,
            hasNote: standardField.hasNote,
            noteVisibleWhen: standardField.noteVisibleWhen,
            hiddenWhen: standardField.hiddenWhen,
            helpText: standardField.helpText,
          };
        }
        if (section.id === 'life' && field.id === 'fatigue') {
          const fatigueNeedsDirectionFix = !field.options?.length
            || /疲労感は見られなかった|なし/.test(field.options[0] || '');
          return {
            ...field,
            questionTitle: '来所時点での疲労感はどうですか？',
            ...(fatigueNeedsDirectionFix ? {
              options: [...FATIGUE_RATING_OPTIONS],
              helpText: '1が「疲労感が非常に強い」、5が「疲労感なし」の基準です。',
              scaleLowLabel: '1：疲労感が非常に強い',
              scaleHighLabel: '5：疲労感なし',
            } : {}),
          };
        }
        return field;
      }),
    })),
  };
}
