import type { Template, TemplateField } from '../types';
import {
  createLearningPcFields,
  EXPRESSION_SCALE_OPTIONS,
  FATIGUE_RATING_OPTIONS,
  PREPARATION_SCALE_OPTIONS,
  RESPONSE_SCALE_OPTIONS,
} from './weekdayTemplate';

const ACTIVITY_INITIATIVE_SCALE_OPTIONS = [
  '1：活動への参加が難しかった',
  '2：継続した働き掛けで一部参加できた',
  '3：声掛けを受けて参加できた',
  '4：少し確認を受けながら、意欲的に参加できた',
  '5：自分から意欲的に参加できた',
];

function holidayWorkBlockFields(
  prefix: 'morning' | 'afternoon',
  label: '午前' | '午後',
): TemplateField[] {
  const blockCondition = { fieldId: `${prefix}_type`, equals: '学習/パソコン' };
  const periodFields = (periodNumber: 1 | 2) => {
    const periodPrefix = `${prefix}_period${periodNumber}`;
    return createLearningPcFields(
      periodPrefix,
      `${periodNumber}コマ目の取り組みはなんですか？`,
      `${periodNumber}コマ目の取り組み`,
    ).map((field) => {
      const ownConditions = field.visibleWhen
        ? Array.isArray(field.visibleWhen) ? field.visibleWhen : [field.visibleWhen]
        : [];
      return {
        ...field,
        visibleWhen: [blockCondition, ...ownConditions],
      };
    });
  };

  return [
    {
      id: `${prefix}_type`,
      label: `${label}の取り組み`,
      questionTitle: `${label}の取り組みはなんですか？`,
      type: 'radio',
      options: ['学習/パソコン', '活動', '取り組みなし', 'その他'],
      defaultValue: '',
      hasNote: true,
      noteVisibleWhen: ['取り組みなし', 'その他'],
      notePlaceholder: '取り組みがない理由や、利用時間などの補足を入力してください。',
      required: true,
    },
    ...periodFields(1),
    ...periodFields(2),
    {
      id: `${prefix}_period3_type`,
      label: '3コマ目の取り組み',
      questionTitle: '3コマ目の取り組みはなんですか？',
      type: 'radio',
      options: ['漢検', 'パソコン', 'その他'],
      defaultValue: '',
      hasNote: false,
      helpText: '取り組みを選ぶと、そのすぐ下に詳しい入力欄が表示されます。',
      visibleWhen: blockCondition,
    },
    {
      id: `${prefix}_activity_content`,
      label: '活動内容',
      questionTitle: '活動内容はなんですか？',
      type: 'textarea',
      defaultValue: '',
      helpText: '行った活動名や内容を簡潔に入力してください。',
      visibleWhen: { fieldId: `${prefix}_type`, equals: '活動' },
    },
    {
      id: `${prefix}_activity_initiative`,
      label: '活動への積極性',
      questionTitle: '活動への積極性はどうですか？',
      type: 'rating_scale',
      options: ACTIVITY_INITIATIVE_SCALE_OPTIONS,
      defaultValue: '',
      hasNote: true,
      notePlaceholder: '参加までの声掛けや、活動中の具体的な様子を入力してください。',
      helpText: '1が「参加が難しかった」、3が「声掛けで参加できた」、5が「自分から意欲的に参加できた」の基準です。',
      scaleLowLabel: '1：参加が難しい',
      scaleHighLabel: '5：自分から参加',
      visibleWhen: { fieldId: `${prefix}_type`, equals: '活動' },
    },
  ];
}

export const STANDARD_HOLIDAY_TEMPLATE: Template = {
  id: 'template-holiday',
  name: '支援経過記録 (休日)',
  type: '休日',
  isDefault: true,
  description: '休日の生活・午前の取り組み・昼食・午後の取り組み・おやつを、関連質問ごとにまとめて記録する標準フォーマット',
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
      id: 'morning',
      title: '午前の取り組み',
      fields: holidayWorkBlockFields('morning', '午前'),
    },
    {
      id: 'lunch',
      title: '昼食',
      fields: [
        {
          id: 'lunch_details',
          label: '昼食の様子',
          questionTitle: 'お昼ご飯の様子はどうでしたか？',
          type: 'meal_details',
          options: ['完食', '半量食べた', '1/4食べた', '食べていない'],
          defaultValue: '',
          helpText: '食事にかかった時間と食べた量を選び、必要に応じて様子を入力してください。「食べていない」の場合、時間入力は不要です。',
        },
      ],
    },
    {
      id: 'afternoon',
      title: '午後の取り組み',
      fields: holidayWorkBlockFields('afternoon', '午後'),
    },
    {
      id: 'special',
      title: '特記',
      fields: [],
    },
  ],
};

export function isStructuredHolidayTemplate(template?: Template) {
  if (!template || template.type !== '休日') return false;
  const sectionIds = new Set(template.sections.map((section) => section.id));
  return sectionIds.has('life')
    && sectionIds.has('morning')
    && sectionIds.has('lunch')
    && sectionIds.has('afternoon')
    && sectionIds.has('special');
}

export function isIntegratedHolidayTemplate(template?: Template) {
  if (!isStructuredHolidayTemplate(template)) return false;
  return Boolean(
    template?.sections
      .find((section) => section.id === 'morning')
      ?.fields.some((field) => field.id === 'morning_period1_type')
  );
}

export function upgradeStandardHolidayTemplate(template: Template): Template {
  if (template.id !== STANDARD_HOLIDAY_TEMPLATE.id) return template;
  if (!isStructuredHolidayTemplate(template)) {
    return {
      ...STANDARD_HOLIDAY_TEMPLATE,
      name: template.name || STANDARD_HOLIDAY_TEMPLATE.name,
      description: template.description || STANDARD_HOLIDAY_TEMPLATE.description,
      isDefault: template.isDefault ?? true,
    };
  }
  if (!isIntegratedHolidayTemplate(template)) {
    const replacementSections = new Map(
      STANDARD_HOLIDAY_TEMPLATE.sections.map((section) => [section.id, section]),
    );
    return {
      ...template,
      description: template.description || STANDARD_HOLIDAY_TEMPLATE.description,
      wizardQuestions: {
        ...STANDARD_HOLIDAY_TEMPLATE.wizardQuestions,
        ...template.wizardQuestions,
      },
      sections: template.sections.map((section) =>
        section.id === 'morning' || section.id === 'afternoon'
          ? replacementSections.get(section.id) || section
          : section
      ),
    };
  }
  return {
    ...template,
    wizardQuestions: {
      ...template.wizardQuestions,
      expression: {
        ...template.wizardQuestions?.expression,
        title: STANDARD_HOLIDAY_TEMPLATE.wizardQuestions?.expression?.title || '来所時点での表情はどうですか？',
      },
    },
    sections: template.sections.map((section) => ({
      ...section,
      fields: section.fields.map((field) => {
        const standardField = STANDARD_HOLIDAY_TEMPLATE.sections
          .find((candidate) => candidate.id === section.id)
          ?.fields.find((candidate) => candidate.id === field.id);
        if (!standardField) return field;
        if (section.id === 'life' && field.id === 'fatigue') {
          return {
            ...field,
            questionTitle: standardField.questionTitle,
          };
        }
        if (
          /_(type|study_homework|study_attitude|study_posture|pc_posture)$/.test(field.id)
          || field.id === 'lunch_details'
        ) {
          return {
            ...field,
            type: standardField.type,
            options: standardField.options ? [...standardField.options] : field.options,
            hasNote: standardField.hasNote,
            noteVisibleWhen: standardField.noteVisibleWhen,
            notePlaceholder: standardField.notePlaceholder,
            hiddenWhen: standardField.hiddenWhen,
            helpText: standardField.helpText,
          };
        }
        return field;
      }),
    })),
  };
}
