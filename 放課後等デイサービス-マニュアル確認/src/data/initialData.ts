import { Staff, IncidentReport, FacilityConfig, MasterOptions, ChildSupportDetail } from '../types';

export const INITIAL_MASTER_OPTIONS: MasterOptions = {
  categories: [
    { id: 'emergency', label: '🚨 緊急・危機管理', icon: '🚨' },
    { id: 'daily', label: '🏫 日常業務・療育', icon: '🏫' },
    { id: 'vehicle', label: '🚗 送迎・車内安全', icon: '🚗' },
    { id: 'medical', label: '💉 アレルギー・医療', icon: '💉' },
    { id: 'abuse_prevention', label: '🛡️ 権利擁護・虐待防止', icon: '🛡️' },
    { id: 'compliance', label: '⚖️ 法令順守・運営指導', icon: '⚖️' },
    { id: 'visiting_support', label: '🏫 保育所等訪問・学校', icon: '🏫' },
    { id: 'bcp_infection', label: '🦠 感染症・BCP', icon: '🦠' },
  ],
  roles: [
    '管理者',
    '児童発達支援管理責任者',
    '教室長',
    '教室長補佐',
    '児童指導員',
    '訪問支援員',
    '保育士',
    '送迎ドライバー',
    '看護師・医療スタッフ',
    '心理士・言語聴覚士',
    '事務員・その他'
  ],
  quickLocations: [
    '1階 療育室',
    '2階 訓練室',
    '玄関前・駐車場',
    '近隣公園',
    '送迎車内',
    'トイレ前',
    '高須中学校校内',
    '相談室・クールダウン室'
  ],
  incidentTypes: [
    'ヒヤリハット',
    '軽微な事故',
    '保護者連絡事例',
    '送迎車トラブル',
    '学校連携事案'
  ],
  incidentStatuses: [
    '未確認',
    '確認済み',
    '対策済'
  ],
  supportCategories: [
    '切り替え・活動移行',
    'パニック・感情爆発',
    '集中・指示理解',
    'コミュニケーション・友達関係',
    '感覚過敏・クールダウン',
    'パニック・他害自傷予防'
  ],
  childDevTraits: [
    'ASD・視覚優位',
    'ADHD・不注意・衝動性',
    'SLD・学習理解補助',
    '感覚過敏・音刺激弱',
    '言語発達遅滞・絵カード',
    'ダウン症・車椅子補助'
  ]
};

export const INITIAL_STAFF: Staff[] = [
  {
    id: 's-1',
    employeeCode: 'ST-001',
    name: '山本 一郎',
    role: '管理者',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    readManualIds: ['m-001', 'm-002', 'm-003', 'm-005', 'm-006', 'm-007', 'm-008', 'm-009', 'm-010', 'm-011'],
    lastReadAt: '2026-07-22 11:20'
  },
  {
    id: 's-2',
    employeeCode: 'ST-002',
    name: '佐藤 恵子',
    role: '児童発達支援管理責任者',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
    readManualIds: ['m-001', 'm-002', 'm-003', 'm-004', 'm-005', 'm-006', 'm-007', 'm-008', 'm-009', 'm-010', 'm-011'],
    lastReadAt: '2026-07-22 10:15'
  },
  {
    id: 's-3',
    employeeCode: 'ST-003',
    name: '高橋 健太',
    role: '教室長',
    avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=150&auto=format&fit=crop&q=80',
    readManualIds: ['m-001', 'm-002', 'm-003', 'm-004', 'm-005', 'm-007', 'm-009', 'm-010'],
    lastReadAt: '2026-07-21 17:30'
  },
  {
    id: 's-4',
    employeeCode: 'ST-004',
    name: '鈴木 あゆみ',
    role: '教室長補佐',
    avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80',
    readManualIds: ['m-001', 'm-002', 'm-004', 'm-005', 'm-007', 'm-008', 'm-009'],
    lastReadAt: '2026-07-20 09:40'
  },
  {
    id: 's-5',
    employeeCode: 'ST-005',
    name: '中村 勉',
    role: '児童指導員',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    readManualIds: ['m-001', 'm-003', 'm-004', 'm-007', 'm-009', 'm-011'],
    lastReadAt: '2026-07-19 14:10'
  },
  {
    id: 's-6',
    employeeCode: 'ST-006',
    name: '小林 さくら',
    role: '児童指導員',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80',
    readManualIds: ['m-001', 'm-004', 'm-005', 'm-007', 'm-008'],
    lastReadAt: '2026-07-21 16:45'
  },
  {
    id: 's-7',
    employeeCode: 'ST-007',
    name: '松本 拓也',
    role: '訪問支援員',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
    readManualIds: ['m-001', 'm-005', 'm-006', 'm-007', 'm-009', 'm-010'],
    lastReadAt: '2026-07-22 09:20'
  },
  {
    id: 's-8',
    employeeCode: 'ST-008',
    name: '加藤 由美',
    role: '訪問支援員',
    avatar: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=150&auto=format&fit=crop&q=80',
    readManualIds: ['m-001', 'm-005', 'm-007', 'm-008', 'm-010'],
    lastReadAt: '2026-07-21 18:10'
  },
  {
    id: 's-9',
    employeeCode: 'ST-009',
    name: '渡辺 健',
    role: '保育士',
    avatar: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150&auto=format&fit=crop&q=80',
    readManualIds: ['m-001', 'm-002', 'm-004', 'm-005', 'm-007'],
    lastReadAt: '2026-07-22 08:50'
  }
];

export const INITIAL_INCIDENTS: IncidentReport[] = [
  {
    id: 'inc-01',
    date: '2026-07-21',
    title: '高須中学校訪問支援時における校内移動中の不安・パニック配慮',
    type: 'ヒヤリハット',
    relatedManualId: 'm-010',
    relatedManualTitle: '保育所等訪問支援および高須中学校等・学校連携支援手順マニュアル',
    reporterName: '松本 拓也',
    description: '高須中学校での特別支援学級訪問支援時、休み時間のチャイムと廊下の混雑により対象生徒が強い不安感を訴えた。',
    actionTaken: '訪問支援員が付き添い、即座に静かな相談室へ移動して深呼吸を誘導。5分程度で落ち着き授業参加できた。',
    preventionPlan: '高須中学校の担当教諭と共有し、移動時はチャイム鳴動直前の移動や静かな別ルートを使用する個別支援計画に反映。',
    status: '対策済'
  },
  {
    id: 'inc-02',
    date: '2026-07-18',
    title: '送迎車乗車時の靴脱げと足の挟み込み注意',
    type: 'ヒヤリハット',
    relatedManualId: 'm-003',
    relatedManualTitle: '送迎車内置きざり防止および乗降時安全確認マニュアル',
    reporterName: '中村 勉',
    description: 'スライドドア閉める直前にB君が靴を脱いで足を出そうとした。',
    actionTaken: 'ドライバーがドア自動操作を一時停止し、添乗員が足を引っ込めるよう誘導。',
    preventionPlan: 'ドア閉操作時は添乗指導員が「手足・靴よし」と声出し指差し確認してから操作合図を出す。',
    status: '確認済み'
  }
];

export const INITIAL_CHILDREN: ChildSupportDetail[] = [
  {
    id: 'c-01',
    name: 'Aくん',
    grade: '小学2年生',
    schoolName: '高須小学校',
    traits: 'ASD（自閉スペクトラム症）・視覚優位・感覚過敏（高音チャイム）',
    supportFocus: '言葉のみの指示だと混乱しやすいため、スケジュールカードやタイマーによる視覚提示が必須。活動切り替え時は5分前・3分前予告。',
    phrases: [
      {
        id: 'p-01',
        title: '自由時間から学習活動へのスムーズな切り替え',
        category: '切り替え・活動移行',
        trait: 'ASD・視覚優位',
        situation: 'ブロック遊びに集中しており、片付けて学習机に移動してほしい時',
        ngPhrase: '「もう時間だよ！早く片付けて勉強しなさい！」',
        ngReason: '突然の言葉による強制的遮断は不安を増幅させ、強いパニックを誘発する。',
        okPhrase: '「タイマーがピピッと鳴ったら、赤い箱にブロックを3個入れて机に行こうね」（Visual Card提示）',
        visualAid: 'カウントダウンタイマー＋「かたづけ」手順絵カード',
        supportTip: 'タイマーを本人の見える位置に置き、残り時間を事前に共有しておくこと。',
        sampleDialog: 'スタッフ: 「あと3分でタイマーが鳴るよ。鳴ったらお片付けね。」\nAくん: 「・・・（タイマーを見る）」\nスタッフ: 「鳴ったね！ブロックを赤箱に入れたら、算数プリントをしよう。」'
      },
      {
        id: 'p-02',
        title: '集団活動で声が大きくなった時',
        category: '指示が入らない・集中困難',
        trait: '感覚過敏',
        situation: '興奮して大きな声を出し、周りの児童や自分が眩暈を起こしそうな時',
        ngPhrase: '「うるさい！静かにしなさい！」',
        ngReason: '「うるさい」は抽象的で否定的な言葉であり、感情的な反発を生む。',
        okPhrase: '「声を『声の大きさ1（ひそひそ声）』にチェンジしよう」（声の大きさメーターカード提示）',
        visualAid: '1〜5段階の声の大きさカード',
        supportTip: 'ジェスチャー（口元に指を当てる）を併用し、穏やかな低音で伝える。',
        sampleDialog: 'スタッフ: （静かにカードを示して）「いまは声レベル1ね。」\nAくん: 「あ、ひそひそ声だね。」'
      }
    ]
  },
  {
    id: 'c-02',
    name: 'Bちゃん',
    grade: '小学4年生',
    schoolName: '高須東小学校',
    traits: 'ADHD（注意欠如多動症）・聴覚注意の持続困難・言葉の処理の遅れ',
    supportFocus: '長い文章での説明は理解が追いつかないため、短く一指示一動作（ワンアクション）で伝える。褒めて達成感を育てる。',
    phrases: [
      {
        id: 'p-03',
        title: 'おやつ後の片付け・手洗い誘導',
        category: '習慣・ルール',
        trait: 'ADHD・不注意',
        situation: 'おやつを食べ終わった後、皿を放置して遊びに行こうとする時',
        ngPhrase: '「食べた後はお皿を下げて手を洗ってタオルで拭いてから遊んでね」',
        ngReason: '複数の命令を同時に伝えると途中の指示を忘れ、行動が立ち消えになる。',
        okPhrase: '「まず、お皿を青いトレーに置こう」（1ステップずつ）',
        visualAid: '1.お皿 2.手洗い 3.あそび の3ステップ絵カード',
        supportTip: '1つ完了するごとに「できたね！」と即座に肯定的にフィードバックする。',
        sampleDialog: 'スタッフ: 「お皿をトレーに乗せられたね！次は手洗いにGO！」\nBちゃん: 「はーい！」'
      }
    ]
  },
  {
    id: 'c-03',
    name: 'Cくん',
    grade: '中学1年生',
    schoolName: '高須中学校',
    traits: '環境変化への過敏・対人緊張・こだわり・パニック時の自傷行為（壁叩き）',
    supportFocus: '高須中学校等との学校連携において重要。パニック発作時は否定せず静かなクールダウン室へ誘導し、安全を確保する。',
    phrases: [
      {
        id: 'p-04',
        title: '対人トラブルや課題の躓きで感情が爆発した時',
        category: 'パニック・感情爆発',
        trait: 'PDA・こだわり',
        situation: 'ゲームで負けたり学習問題が解けず、声を上げて壁を叩こうとする時',
        ngPhrase: '「暴れるのはやめなさい！中学生でしょ！」',
        ngReason: '正論やプレッシャーはパニックを増悪させ、自傷・他害行為を加速させる。',
        okPhrase: '「悔しかったね。静かな小部屋（静養室）で、一緒に深呼吸しよう」',
        visualAid: 'クールダウン室の案内カード＋深呼吸リズムカード',
        supportTip: '安全を確保しながら刺激（光・音）を最小限にし、本人が落ち着くまで見守る。',
        sampleDialog: 'スタッフ: 「落ち着くまでここで休んでいいよ。そばにいるね。」\nCくん: 「・・・（深呼吸をする）」'
      }
    ]
  }
];

export const DEFAULT_FACILITY_CONFIG: FacilityConfig = {
  facilityName: '多機能型事業所 ひだまりパーク高須（放課後等デイサービス・保育所等訪問支援）',
  facilityAddress: '高知県高知市高須2丁目15-10',
  emergencyEvacuationSite: '高須中学校 体育館・グラウンド（事業所より徒歩4分）',
  managerName: '山本 一郎（管理者） / 佐藤 恵子（児童発達支援管理責任者）',
  mainPhone: '088-888-0192',
  policePhone: '110（高知東警察署: 088-878-0110）',
  firePhone: '119（高知市南消防署: 088-883-0119）',
  designatedHospital: '高須中央病院 / 高知赤十字病院',
  epipenStorageLocation: '1階 事務室・鍵付き医療専用保管庫（黄色ポーチ）',
  aedLocation: 'エントランスホール正面壁面（訪問支援員持出対応可）'
};
