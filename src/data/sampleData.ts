import { ChildProfile, SupportRecord } from '../types';

export const sampleChildren: ChildProfile[] = [
  {
    id: 'child-1',
    name: '佐藤 健太',
    kana: 'サトウ ケンタ',
    grade: '小学3年生',
    careType: '放課後等デイサービス',
    notes: 'タイピング習得に意欲的。姿勢の保持と声かけ時のアイコンタクトに留意。'
  },
  {
    id: 'child-2',
    name: '鈴木 葵',
    kana: 'スズキ アオイ',
    grade: '小学1年生',
    careType: '児童発達支援',
    notes: '環境変化に敏感。集団活動時の事前声掛けが有効。'
  },
  {
    id: 'child-3',
    name: '高橋 陸',
    kana: 'タカハシ リク',
    grade: '小学5年生',
    careType: '放課後等デイサービス',
    notes: '算数の宿題時に躓きが見られたら段階的ヒントを提示する。'
  }
];

export const sampleRecords: SupportRecord[] = [
  {
    id: 'rec-101',
    templateId: 'template-weekday',
    templateName: '支援経過記録 (平日)',
    templateType: '平日',
    childId: 'child-1',
    childName: '佐藤 健太',
    date: '2026-07-21',
    attendance: '出席',
    expressions: ['笑顔'],
    snack: '食べた',
    recorderName: '山田 指導員',
    sectionAnswers: {
      life: {
        sectionId: 'life',
        sectionTitle: '生活',
        answers: {
          fatigue: { value: '1：なし', note: '' },
          mood: { value: 'よい', note: '元気に「ただいま」と来所されました。' },
          preparation: { value: '自分で出来た', note: '連絡帳と水筒を定位置へスムーズに配置。' },
          trouble: { value: 'なかった', note: '' },
          response_to_prompt: { value: '返事あり', note: '名前を呼ぶとしっかり目を見て「はい」と返答。' },
          medication: { value: '対象なし' }
        },
        detailText: '元気に来所され、自分で身の回りの準備を終えることができました。他児とも笑顔で会話が見られ、終始安定した気持ちで過ごされていました。'
      },
      study: {
        sectionId: 'study',
        sectionTitle: '学習',
        subTitleValue: '学校の宿題（算数プリント・漢字練習）',
        answers: {
          homework_time: { value: '25', note: '算数計算ドリル、漢字2文字' },
          homework_attitude: { value: '自力で済ませた', note: '' },
          leaving_seat: { value: 'なかった', note: '' },
          focus: { value: '良かった', note: '姿勢よくタイマーを見ながら集中。' }
        },
        detailText: '算数の計算プリントに取り組みました。途中で引っかかる問題もありましたが、最後まで集中を切らさず自力で解答を導き出せました。離席もなく素晴らしい姿勢でした。'
      },
      pc: {
        sectionId: 'pc',
        sectionTitle: 'PC',
        subTitleValue: 'ホームポジションタイピング練習',
        answers: {
          finger_usage: { value: '右手: 4本 / 左手: 3本', note: '人差し指と中指の使い分けが定着してきた' },
          posture: { value: 'まっすぐ', note: '' },
          pc_focus: { value: 'よい', note: '' }
        },
        detailText: 'タイピングソフト「寿司打」の練習コースに挑戦。右手・左手の指使いを意識し、画面をしっかり見て姿勢よく取り組めていました。スコア更新を喜ばれていました。'
      }
    },
    synthesizedSummary: '【生活】元気に来所され身の回り準備完了。【学習】宿題（算数・漢字）25分自力完遂、離席なし。【PC】タイピング指使いを意識し姿勢良好。',
    approvalStatus: '確認済み',
    jihatsukanComment: '非常に丁寧な記録です。学習面の自立とPCでの姿勢保持が素晴らしいですね。',
    reviewedBy: '鈴木 児童発達支援管理責任者',
    reviewedAt: '2026-07-21 18:30',
    createdAt: '2026-07-21 17:10',
    updatedAt: '2026-07-21 18:30'
  }
];
