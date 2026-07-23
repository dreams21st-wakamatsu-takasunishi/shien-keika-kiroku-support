import { Template } from '../types';

export const defaultTemplates: Template[] = [
  {
    id: 'template-weekday',
    name: '支援経過記録 (平日)',
    type: '平日',
    isDefault: true,
    description: '放課後等デイサービス・児童発達支援の平日利用向け標準テンプレート',
    sections: [
      {
        id: 'life',
        title: '生活',
        fields: [
          {
            id: 'fatigue',
            label: '【疲労感】',
            type: 'radio',
            options: ['なし', 'あり'],
            defaultValue: 'なし',
            hasNote: true,
            notePlaceholder: '補足（例: 来所時に少し眠気あり）'
          },
          {
            id: 'mood',
            label: '【機嫌】',
            type: 'radio',
            options: ['よい', 'わるい'],
            defaultValue: 'よい',
            hasNote: true,
            notePlaceholder: '理由・補足（例: 友達と笑顔で挨拶できた）'
          },
          {
            id: 'preparation',
            label: '【準備】',
            type: 'radio',
            options: ['自分で出来た', '声掛けで出来た', '出来なかった'],
            defaultValue: '自分で出来た',
            hasNote: true,
            notePlaceholder: '補足（例: 荷物の整理をスムーズに完了）'
          },
          {
            id: 'trouble',
            label: '【こまったこと】',
            type: 'radio',
            options: ['なかった', 'あった'],
            defaultValue: 'なかった',
            hasNote: true,
            notePlaceholder: '具体的内容（例: 水筒の蓋が開けづらかった）'
          },
          {
            id: 'response_to_prompt',
            label: '【声掛けへの反応】',
            type: 'radio',
            options: ['目が合う', '返事あり', '反応無し'],
            defaultValue: '返事あり',
            hasNote: true,
            notePlaceholder: '補足'
          },
          {
            id: 'medication',
            label: '※【服薬】',
            type: 'radio',
            options: ['対象なし', '自身で服薬', '声掛けで服薬', '拒否'],
            defaultValue: '対象なし',
            hasNote: true,
            notePlaceholder: '服薬内容・時間など'
          }
        ]
      },
      {
        id: 'study',
        title: '学習',
        hasSubTitleField: true,
        subTitleLabel: '取組内容',
        fields: [
          {
            id: 'homework_time',
            label: '【宿題取り組み時間】',
            type: 'number',
            unit: '分',
            defaultValue: '20',
            hasNote: true,
            notePlaceholder: '宿題内容（例: 算数プリント2枚・漢字練習）'
          },
          {
            id: 'homework_attitude',
            label: '【宿題の取り組み】',
            type: 'radio',
            options: ['自力で済ませた', 'わからないところを自ら聞けた', '指導員から声掛け', '出来なかった'],
            defaultValue: '自力で済ませた',
            hasNote: false
          },
          {
            id: 'leaving_seat',
            label: '【離席】',
            type: 'radio',
            options: ['なかった', 'あった'],
            defaultValue: 'なかった',
            hasNote: true,
            notePlaceholder: '回数・状況など'
          },
          {
            id: 'focus',
            label: '【集中力】',
            type: 'radio',
            options: ['良かった', '悪かった'],
            defaultValue: '良かった',
            hasNote: true,
            notePlaceholder: '補足'
          }
        ]
      },
      {
        id: 'pc',
        title: 'PC',
        hasSubTitleField: true,
        subTitleLabel: '取組内容',
        fields: [
          {
            id: 'finger_usage',
            label: '【タイピング時の指使い】',
            type: 'text',
            defaultValue: '右手: 3本 / 左手: 2本',
            hasNote: true,
            notePlaceholder: '補足（例: ホームポジションを意識できている）'
          },
          {
            id: 'posture',
            label: '【取り組み時の姿勢】',
            type: 'radio',
            options: ['まっすぐ', '斜め'],
            defaultValue: 'まっすぐ',
            hasNote: true,
            notePlaceholder: '補足'
          },
          {
            id: 'pc_focus',
            label: '【集中】',
            type: 'radio',
            options: ['よい', 'わるい'],
            defaultValue: 'よい',
            hasNote: true,
            notePlaceholder: '補足'
          }
        ]
      }
    ]
  },
  {
    id: 'template-holiday',
    name: '支援経過記録 (休日)',
    type: '休日',
    isDefault: true,
    description: '土祝・長期休暇などの終日支援向けテンプレート（食事・外活動対応）',
    sections: [
      {
        id: 'life',
        title: '生活',
        fields: [
          {
            id: 'fatigue',
            label: '【疲労感】',
            type: 'radio',
            options: ['なし', 'あり'],
            defaultValue: 'なし',
            hasNote: true,
            notePlaceholder: '補足'
          },
          {
            id: 'mood',
            label: '【機嫌】',
            type: 'radio',
            options: ['よい', 'わるい'],
            defaultValue: 'よい',
            hasNote: true,
            notePlaceholder: '理由・補足'
          },
          {
            id: 'preparation',
            label: '【準備】',
            type: 'radio',
            options: ['自分で出来た', '声掛けで出来た', '出来なかった'],
            defaultValue: '自分で出来た',
            hasNote: true,
            notePlaceholder: '補足'
          },
          {
            id: 'trouble',
            label: '【こまったこと】',
            type: 'radio',
            options: ['なかった', 'あった'],
            defaultValue: 'なかった',
            hasNote: true,
            notePlaceholder: '具体的内容'
          },
          {
            id: 'response_to_prompt',
            label: '【声掛けへの反応】',
            type: 'radio',
            options: ['目が合う', '返事あり', '反応無し'],
            defaultValue: '返事あり',
            hasNote: true,
            notePlaceholder: '補足'
          },
          {
            id: 'meal',
            label: '【食事】',
            type: 'radio',
            options: ['完食', '半量食べた', '1/4食べた', '不食'],
            defaultValue: '完食',
            hasNote: true,
            notePlaceholder: '食事時間（例: 25分）や箸遣いなどの補足'
          },
          {
            id: 'medication',
            label: '※【服薬】',
            type: 'radio',
            options: ['対象なし', '自身で服薬', '声掛けで服薬', '拒否'],
            defaultValue: '対象なし',
            hasNote: true,
            notePlaceholder: '昼食後薬など'
          }
        ]
      },
      {
        id: 'study',
        title: '学習',
        hasSubTitleField: true,
        subTitleLabel: '取組内容',
        fields: [
          {
            id: 'homework_time',
            label: '【宿題取り組み時間】',
            type: 'number',
            unit: '分',
            defaultValue: '30',
            hasNote: true,
            notePlaceholder: '宿題内容・自主学習問題'
          },
          {
            id: 'homework_attitude',
            label: '【宿題の取り組み】',
            type: 'radio',
            options: ['自力で済ませた', 'わからないところを自ら聞けた', '指導員から声掛け', '出来なかった'],
            defaultValue: 'わからないところを自ら聞けた',
            hasNote: false
          },
          {
            id: 'leaving_seat',
            label: '【離席】',
            type: 'radio',
            options: ['なかった', 'あった'],
            defaultValue: 'なかった',
            hasNote: true,
            notePlaceholder: '補足'
          },
          {
            id: 'focus',
            label: '【集中力】',
            type: 'radio',
            options: ['良かった', '悪かった'],
            defaultValue: '良かった',
            hasNote: true,
            notePlaceholder: '補足'
          }
        ]
      },
      {
        id: 'pc',
        title: 'PC',
        hasSubTitleField: true,
        subTitleLabel: '取組内容',
        fields: [
          {
            id: 'finger_usage',
            label: '【タイピング時の指使い】',
            type: 'text',
            defaultValue: '右手: 4本 / 左手: 3本',
            hasNote: true,
            notePlaceholder: '補足'
          },
          {
            id: 'posture',
            label: '【取り組み時の姿勢】',
            type: 'radio',
            options: ['まっすぐ', '斜め'],
            defaultValue: 'まっすぐ',
            hasNote: true,
            notePlaceholder: '補足'
          },
          {
            id: 'pc_focus',
            label: '【集中】',
            type: 'radio',
            options: ['よい', 'わるい'],
            defaultValue: 'よい',
            hasNote: true,
            notePlaceholder: '補足'
          }
        ]
      },
      {
        id: 'activity',
        title: '活動',
        hasSubTitleField: true,
        subTitleLabel: '活動名',
        fields: [
          {
            id: 'activity_initiative',
            label: '【積極性】',
            type: 'radio',
            options: ['あり', 'なし'],
            defaultValue: 'あり',
            hasNote: true,
            notePlaceholder: '補足（例: 進んで順番を守り参加）'
          },
          {
            id: 'activity_focus',
            label: '【集中】',
            type: 'radio',
            options: ['よい', 'わるい'],
            defaultValue: 'よい',
            hasNote: true,
            notePlaceholder: '補足'
          },
          {
            id: 'prompting_content',
            label: '【声かけ内容】',
            type: 'text',
            defaultValue: '「次は〜の順番だよ」「使った道具を戻そうね」',
            hasNote: true,
            notePlaceholder: '具体的な声掛け'
          }
        ]
      }
    ]
  }
];
