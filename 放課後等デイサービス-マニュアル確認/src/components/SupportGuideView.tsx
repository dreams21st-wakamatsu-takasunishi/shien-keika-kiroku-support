import React, { useState, useEffect } from 'react';
import { 
  MessageSquareHeart, 
  Search, 
  Sparkles, 
  CheckCircle2, 
  XCircle, 
  Lightbulb, 
  Bookmark, 
  Copy, 
  Bot, 
  HelpCircle,
  Eye,
  Filter,
  Clock,
  ThumbsUp,
  Smile,
  Plus,
  Edit3,
  Trash2,
  X,
  Save,
  User,
  Users,
  GraduationCap,
  HeartHandshake,
  Check,
  ChevronRight
} from 'lucide-react';

export interface ChildProfile {
  id: string;
  name: string;
  grade: string;
  traits: string;
  supportFocus: string;
  avatarBg: string; // Tailwind bg class
}

export interface SupportPhraseItem {
  id: string;
  childId: string; // ID of child or 'c-common'
  category: 'transition' | 'instruction' | 'panic' | 'conflict' | 'habits' | 'praise';
  categoryLabel: string;
  trait: 'ASD・視覚優位' | 'ADHD・不注意' | '感覚過敏' | '共通・全般' | 'PDA・こだわり';
  title: string;
  situation: string;
  ngPhrase: string;
  ngReason: string;
  okPhrase: string;
  visualAid: string;
  supportTip: string;
  sampleDialog: string;
}

const CATEGORY_MAP: Record<SupportPhraseItem['category'], string> = {
  transition: '切り替え・活動移行',
  instruction: '指示が入らない・集中困難',
  panic: 'パニック・感情爆発',
  conflict: '他害・トラブル・譲れない',
  habits: '整理整頓・片付け・身支度',
  praise: '自己肯定感・褒め方'
};

const AVATAR_COLORS = [
  { label: 'ブルー', class: 'bg-blue-600' },
  { label: 'ピンク', class: 'bg-pink-600' },
  { label: 'アンバー', class: 'bg-amber-600' },
  { label: 'エメラルド', class: 'bg-emerald-600' },
  { label: 'インディゴ', class: 'bg-indigo-600' },
  { label: 'バイオレット', class: 'bg-purple-600' }
];

const INITIAL_CHILDREN: ChildProfile[] = [
  {
    id: 'c-common',
    name: '共通・全般',
    grade: '全児童対象',
    traits: '全般・基礎支援',
    supportFocus: 'スタッフ間の対応一元化・ポジティブな肯定文での指示',
    avatarBg: 'bg-indigo-600'
  },
  {
    id: 'c-001',
    name: 'たろう君',
    grade: '小学2年生',
    traits: 'ASD・視覚優位・こだわり傾向',
    supportFocus: '切り替え時の視覚タイマー活用・予定変更の事前予告・勝敗の受け入れ',
    avatarBg: 'bg-blue-600'
  },
  {
    id: 'c-002',
    name: 'はなこちゃん',
    grade: '小学1年生',
    traits: 'ADHD・不注意・感情起伏',
    supportFocus: '個別のアイコンタクト指示・1アクションずつの提示・即時称賛',
    avatarBg: 'bg-pink-600'
  },
  {
    id: 'c-003',
    name: 'けんた君',
    grade: '未就学（5歳）',
    traits: '感覚過敏・触感抵抗・言語遅滞',
    supportFocus: '視覚的手順ボード（写真構造化）・イヤーマフ着用・身体接触の事前声掛け',
    avatarBg: 'bg-amber-600'
  }
];

const INITIAL_SUPPORT_PHRASES: SupportPhraseItem[] = [
  {
    id: 'sp-001',
    childId: 'c-001',
    category: 'transition',
    categoryLabel: '切り替え・活動移行',
    trait: 'ASD・視覚優位',
    title: '好きな遊びやゲームに夢中でやめられない時',
    situation: '自由時間終了のチャイムが鳴っても「まだやる！」とゲームやブロックの手を止めない時',
    ngPhrase: '「もう終わりでしょ！いい加減にしなさい！ゲーム取り上げるよ！」',
    ngReason: '見通しがない状態での突然の中断指示は激しいパニックや反発を引き起こします。',
    okPhrase: '「あと3分でゲーム終わりね（タイマーを提示）。針が12になったら片付けようね」',
    visualAid: 'タイムタイマー（時間の経過が色でわかる視覚タイマー）または「まずゲーム→つぎ片付け」カード',
    supportTip: '耳からの言葉だけでなく、タイマーを視界に入れてカウントダウンします。事前に「あと5分」「あと1分」と予告を入れておくことが最重要です。',
    sampleDialog: 'スタッフ「たろう君、あと2分で緑の時間が終わるよ（タイマー見せる）。タイマーがピピッと鳴ったら箱に入れようね」'
  },
  {
    id: 'sp-002',
    childId: 'c-common',
    category: 'transition',
    categoryLabel: '切り替え・活動移行',
    trait: '共通・全般',
    title: '公園や外遊びから施設に戻りたくない時',
    situation: '「帰る時間だよ」と言ってもブランコや滑り台から降りようとしない時',
    ngPhrase: '「置いていっちゃうよ！勝手にしなさい！」',
    ngReason: '「置いていく」という見捨てられ不安や言葉通りの恐怖を与え、信頼関係を損ないます。',
    okPhrase: '「ブランコ10回漕いだら、お部屋でおいしいジュース（おやつ）にしようね」',
    visualAid: '「つぎ：事業所でおやつ」の写真カード、または指で数字をカウント（10, 9, 8...）',
    supportTip: '終わりの終わりを具体的に数量化（10回漕いだら）し、移動した後の楽しみ（おやつ・休憩）へ意識を向けます。',
    sampleDialog: 'スタッフ「ブランコ楽しかったね！あと10回漕いだらおしまい。一緒にイチ・ニ・サン...（10回一緒に数える）。よし、おやつ食べに帰ろう！」'
  },
  {
    id: 'sp-003',
    childId: 'c-002',
    category: 'instruction',
    categoryLabel: '指示が通らない・集中困難',
    trait: 'ADHD・不注意',
    title: '全体への「集まってください」に反応せず遊び続けている時',
    situation: '集団プログラム開始時に全体声掛けをしても全く耳に入らずマイペースに過ごしている時',
    ngPhrase: '「みんな集まってるでしょ！なんで言われたことができないの！」',
    ngReason: 'ADHDや聴覚処理の課題がある児童には、全体向けの言葉は「自分に向けられた指示」と認識されません。',
    okPhrase: '（視界に入り、肩を優しくポンポンと叩いて目を合わせてから）「はなこちゃん、椅子に座ろうね」',
    visualAid: '矢印付きの「自分の席」写真カード、または「着席」絵カード',
    supportTip: '刺激を遮断し、個別に視線と意識を合わせてから、動作を1つに絞って短く指示します（ワンアクション・ワンインストラクション）。',
    sampleDialog: 'スタッフ（児童の目の前に屈んで目を合わせる）「はなこちゃん。あっちの赤色の椅子に座ろうね（指差し）」'
  },
  {
    id: 'sp-004',
    childId: 'c-001',
    category: 'panic',
    categoryLabel: 'パニック・感情爆発',
    trait: 'ASD・視覚優位',
    title: '予定が突然変わった時（雨で公園中止など）',
    situation: '雨天で外遊びが室内プログラムに変更になり、「公園行くって言ったじゃん！」と大泣き・怒り出した時',
    ngPhrase: '「雨なんだから仕方ないでしょ！ワガママ言わないの！」',
    ngReason: '論理的理由（雨）よりも「予定の崩壊」に対する恐怖が先行しているため、正論での説得はパニックを悪化させます。',
    okPhrase: '「公園行きたかったね（共感）。今日は雨だから、お部屋でプラレールか工作にしよう（2択提示）」',
    visualAid: '「×公園（雨マーク）」→「〇室内プラレール or 〇工作」の変更スケジュールカード',
    supportTip: 'まず悔しい気持ちに短く共感し、言葉ではなく絵カードで変更後の代替案を「2択」で選ばせます（自己決定感を持たせる）。',
    sampleDialog: 'スタッフ「たろう君、公園楽しみだったね（カード指差し）。でも今日はバシャバシャ雨。お部屋でプラレールと工作、どっちにする？」'
  },
  {
    id: 'sp-005',
    childId: 'c-002',
    category: 'conflict',
    categoryLabel: '他害・トラブル・譲れない',
    trait: 'ADHD・不注意',
    title: '友達が使っているおもちゃを突然横取り・手を出した時',
    situation: '借りたい気持ちが抑えきれず、遊んでいるおもちゃを無理やり奪おうとした時',
    ngPhrase: '「ダメでしょ！ごめんなさいは！？意地悪しないで！」',
    ngReason: '強い叱責は自尊感情を低下させ、「取られた」と被害感を募らせます。無理な即時謝罪の強制も効果が薄いです。',
    okPhrase: '「借りたいんだね（気持ちの代弁）。『かして』って言ってみようか（または貸してカードを見せる）」',
    visualAid: '「かして」「どうぞ」「あとで」の絵カードまたはタイマー',
    supportTip: '手が出そうになった瞬間（直前）に身体を静かにはさみ、行動ではなく「借りたい気持ち」を言語化して代弁します。',
    sampleDialog: 'スタッフ「はなこちゃん、そのミニカー使いたかったんだね。『かして』って声をかけようね」'
  },
  {
    id: 'sp-006',
    childId: 'c-003',
    category: 'habits',
    categoryLabel: '整理整頓・片付け・身支度',
    trait: '感覚過敏',
    title: '手洗いやうがい、靴箱への整理を忘れて遊びに行く時',
    situation: '事業所に到着後、カバンや靴を放置してそのままおもちゃコーナーへ走ってしまう時',
    ngPhrase: '「靴は！？手洗いは！？順番を守りなさい！」',
    ngReason: '口頭注意はその場しのぎになりやすく、自立的な生活習慣（視覚的順序構造化）が身につきません。',
    okPhrase: '「けんた君、玄関の手順カード見てみよう。①くつ ②かばん ③てあらい だね」',
    visualAid: '玄関に設置した「とうちゃく後の流れ」写真付き手順ボード（写真1:靴箱、写真2:ロッカー、写真3:手洗い）',
    supportTip: '玄関や手洗い場に手順ポスター（構造化）を配置し、スタッフは口頭で怒るのではなく「カードを見てね」と指差しだけ行います。',
    sampleDialog: 'スタッフ「けんた君、ポスターの１番は何かな？（靴箱の写真を示す）。できたらシール貼ろうね」'
  },
  {
    id: 'sp-007',
    childId: 'c-003',
    category: 'panic',
    categoryLabel: 'パニック・感情爆発',
    trait: '感覚過敏',
    title: '大きな音や賑やかな声に耐えられず耳をふさいでうずくまる時',
    situation: 'お誕生会や音楽プログラム等で周囲の歓声・大きな音に過敏に反応し、その場から動けなくなった時',
    ngPhrase: '「みんな楽しんでるでしょ！我慢しなさい！」',
    ngReason: '感覚過敏による苦痛は本人の意思やワガママではなく、身体的な「激痛」と同等の負荷がかかっています。',
    okPhrase: '「音が大きかったね。静かなお部屋（クールダウン室）で休もうか（イヤーマフを渡す）」',
    visualAid: '「静かな部屋」ピクトグラムカード、イヤーマフ写真',
    supportTip: '無理に参加させず、避難できるクールダウンエリア（カームダウンエリア）を用意し、刺激から速やかに隔離します。',
    sampleDialog: 'スタッフ（静かな声でささやくように）「けんた君、あっちのお部屋で休憩しよう。イヤーマフつける？」'
  },
  {
    id: 'sp-008',
    childId: 'c-002',
    category: 'habits',
    categoryLabel: '整理整頓・片付け・身支度',
    trait: 'ADHD・不注意',
    title: '散らかった大量のおもちゃを前に「片付けなさい」でフリーズする時',
    situation: '部屋中に広げたブロックやカードを前に、どこから手をつけていいか分からず動けない時',
    ngPhrase: '「早く全部片付けなさい！片付けないと次のおもちゃ出さないよ！」',
    ngReason: '「全部片付ける」という曖昧で巨大な指示は、タスクの実行機能が弱い児童を圧倒させフリーズさせます。',
    okPhrase: '「まず赤色のブロックだけ箱に入れよう。スタッフは青色を片付けるね」',
    visualAid: '「赤いブロックの写真」が貼られた収納ボックス',
    supportTip: 'タスクを極限まで分解（スモールステップ）し、「色の限定」や「一緒にやる分担」でハードルを下げる。',
    sampleDialog: 'スタッフ「はなこちゃん、赤色ブロック集め対決！よーいスタート！」'
  },
  {
    id: 'sp-009',
    childId: 'c-001',
    category: 'panic',
    categoryLabel: 'パニック・感情爆発',
    trait: 'ASD・視覚優位',
    title: 'ゲームやカード対戦で負けて大泣き・カードを投げる時',
    situation: '勝負事で負けた瞬間に「ずるい！もうやらない！」と泣き叫び暴れる時',
    ngPhrase: '「負けたからって暴れないの！そんななら二度とゲームさせません！」',
    ngReason: '感情が高ぶっている最中の説教や罰は興奮を煽るだけです。認知の硬さ（ゼロイチ思考）への理解が必要です。',
    okPhrase: '「悔しかったね。最後まで頑張ったね。少し深呼吸して冷たいお水飲もう」',
    visualAid: '「悔しい」感情カード＋「深呼吸（吸って・吐いて）」カード',
    supportTip: '勝敗の結果ではなく「対戦に参加したプロセス」を即座に肯定。興奮が収まるまで静かに寄り添います。',
    sampleDialog: 'スタッフ「たろう君、悔しかったね。勝ちたかったよね。あっちで一旦お水飲んで落ち着こう」'
  },
  {
    id: 'sp-010',
    childId: 'c-common',
    category: 'praise',
    categoryLabel: '自己肯定感・褒め方',
    trait: '共通・全般',
    title: '順番待ちや約束を守れた時（肯定的な強化・褒め方）',
    situation: '普段は割り込んでしまう順番待ちで、じっと自分の番を待てた時',
    ngPhrase: '「やればできるじゃない。いつもこうしなさいね」',
    ngReason: '「いつも～しなさい」という過去の批判を混ぜると、せっかくの達成感が打ち消されます。',
    okPhrase: '「〇〇くん！静かに自分の番を待ててかっこいいね！ありがとう！」',
    visualAid: 'スマイルスタンプ・シールカード（視覚的報酬）',
    supportTip: '望ましい行動（好ましい行動）が出た「直後（2秒以内）」に、具体的に何が良かったかを伝えて褒めます。',
    sampleDialog: 'スタッフ「順番しっかり待てたね！笑顔で『どうぞ』できてとっても素敵！」'
  },
  {
    id: 'sp-011',
    childId: 'c-003',
    category: 'transition',
    categoryLabel: '切り替え・活動移行',
    trait: 'PDA・こだわり',
    title: '指示されると激しく拒絶・反発する時（指示への抵抗感）',
    situation: '「〇〇しなさい」と言われると途端にへそを曲げて絶対動かなくなる時',
    ngPhrase: '「返事は！？言われた通りにしなさい！」',
    ngReason: 'コントロールされることへの強い不安（PDA傾向）がある児童は、命令調の指示に激しい恐怖や反抗を示します。',
    okPhrase: '「カバンを片付けるのと、手洗いするの、どっちから始める？」',
    visualAid: '選択肢が描かれたイラストボード（自分で選ぶ仕組み）',
    supportTip: '「～しなさい」の命令ではなく、「選択肢を渡す（自己決定させる）」か「人形劇・キャラクターからの依頼」の形をとります。',
    sampleDialog: 'スタッフ「けんた君、くまさんが『一緒に手洗い行こう』って言ってるよ！どっちの手から洗う？」'
  },
  {
    id: 'sp-012',
    childId: 'c-001',
    category: 'instruction',
    categoryLabel: '指示が通らない・集中困難',
    trait: 'ASD・視覚優位',
    title: '学習時間・宿題への着手が難しくウロウロする時',
    situation: '「宿題の時間だよ」と言われても席につかず、本棚をウロウロ見ている時',
    ngPhrase: '「いつまで遊んでるの！早くプリント開きなさい！」',
    ngReason: 'どのプリントを何分やるかの見通しがないと、学習への心理的ハードルが高くなり回避行動をとります。',
    okPhrase: '「今日のプリントはこれ1枚（提示）。10分で終わったら自由時間だよ」',
    visualAid: '「今日やる課題」の専用透明トレイ＋プリント1枚＋タイマー',
    supportTip: '机の上から不要な視覚刺激（おもちゃ・他の本）を排除し、やるべき課題だけをトレイに1枚用意します。',
    sampleDialog: 'スタッフ「たろう君、今日の宿題はトレイの中のこの1枚だけ。終わったらタイマーがピピッと鳴って自由時間だよ」'
  }
];

{/* --- Child Modal --- */}
interface EditChildModalProps {
  child: ChildProfile | null;
  onClose: () => void;
  onSave: (savedChild: ChildProfile) => void;
}

const EditChildModal: React.FC<EditChildModalProps> = ({ child, onClose, onSave }) => {
  const [name, setName] = useState(child?.name || '');
  const [grade, setGrade] = useState(child?.grade || '小学1年生');
  const [traits, setTraits] = useState(child?.traits || '');
  const [supportFocus, setSupportFocus] = useState(child?.supportFocus || '');
  const [avatarBg, setAvatarBg] = useState(child?.avatarBg || 'bg-blue-600');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('児童の氏名・呼び名は必須入力です。');
      return;
    }

    const saved: ChildProfile = {
      id: child?.id || `c-${Date.now()}`,
      name: name.trim(),
      grade: grade.trim() || '未設定',
      traits: traits.trim() || '個別の配慮事項',
      supportFocus: supportFocus.trim() || '全体的な見守りと個別声掛け',
      avatarBg
    };

    onSave(saved);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-gray-200 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
        <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white p-4 sm:p-5 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <User className="w-5 h-5 text-pink-300" />
            <h3 className="font-bold text-base sm:text-lg">
              {child ? '児童プロフィールの編集' : '新規児童プロフィールの追加'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-blue-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-800 mb-1">
              児童の氏名・呼び名 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: たろう君、はなこちゃん"
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-xs sm:text-sm font-semibold text-gray-900 focus:outline-none focus:border-blue-600"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-800 mb-1">
                学年・年齢
              </label>
              <input
                type="text"
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                placeholder="例: 小学2年生、未就学(5歳)"
                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-xs font-semibold text-gray-900 focus:outline-none focus:border-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-800 mb-1">
                テーマカラー
              </label>
              <div className="flex items-center space-x-2 pt-1">
                {AVATAR_COLORS.map((col) => (
                  <button
                    key={col.class}
                    type="button"
                    onClick={() => setAvatarBg(col.class)}
                    className={`w-6 h-6 rounded-full ${col.class} flex items-center justify-center transition-transform cursor-pointer ${
                      avatarBg === col.class ? 'ring-2 ring-offset-2 ring-blue-900 scale-110' : 'opacity-70 hover:opacity-100'
                    }`}
                  >
                    {avatarBg === col.class && <Check className="w-3.5 h-3.5 text-white" />}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-800 mb-1">
              発達特性・認知の強み・配慮事項
            </label>
            <input
              type="text"
              value={traits}
              onChange={(e) => setTraits(e.target.value)}
              placeholder="例: ASD・視覚優位・感覚過敏・時間の見通し重視"
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-xs font-semibold text-gray-900 focus:outline-none focus:border-blue-600"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-800 mb-1">
              個別支援の重点目標・基本姿勢
            </label>
            <textarea
              rows={3}
              value={supportFocus}
              onChange={(e) => setSupportFocus(e.target.value)}
              placeholder="例: タイムタイマーで時間の見える化を行い、感情の起伏が高まる前に言葉の代弁と視覚提示でクールダウンを図る。"
              className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-xs text-gray-900 focus:outline-none focus:border-blue-600"
            />
          </div>

          <div className="flex items-center justify-end space-x-3 pt-3 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-xl text-xs font-bold text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
            >
              キャンセル
            </button>
            <button
              type="submit"
              className="bg-blue-900 hover:bg-blue-800 text-white font-bold text-xs px-5 py-2 rounded-xl transition-all shadow-md flex items-center space-x-1.5 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>保存する</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

{/* --- Support Phrase Modal --- */}
interface EditSupportPhraseModalProps {
  item: SupportPhraseItem | null;
  childrenList: ChildProfile[];
  defaultChildId: string;
  onClose: () => void;
  onSave: (savedItem: SupportPhraseItem) => void;
}

const EditSupportPhraseModal: React.FC<EditSupportPhraseModalProps> = ({
  item,
  childrenList,
  defaultChildId,
  onClose,
  onSave
}) => {
  const [childId, setChildId] = useState<string>(item?.childId || defaultChildId || 'c-common');
  const [title, setTitle] = useState(item?.title || '');
  const [category, setCategory] = useState<SupportPhraseItem['category']>(item?.category || 'transition');
  const [trait, setTrait] = useState<SupportPhraseItem['trait']>(item?.trait || 'ASD・視覚優位');
  const [situation, setSituation] = useState(item?.situation || '');
  const [ngPhrase, setNgPhrase] = useState(item?.ngPhrase || '');
  const [ngReason, setNgReason] = useState(item?.ngReason || '');
  const [okPhrase, setOkPhrase] = useState(item?.okPhrase || '');
  const [visualAid, setVisualAid] = useState(item?.visualAid || '');
  const [supportTip, setSupportTip] = useState(item?.supportTip || '');
  const [sampleDialog, setSampleDialog] = useState(item?.sampleDialog || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !okPhrase.trim()) {
      alert('「タイトル・場面」と「おすすめの具体声掛け (OK例)」は必須項目です。');
      return;
    }

    const newItem: SupportPhraseItem = {
      id: item?.id || `sp-${Date.now()}`,
      childId,
      title: title.trim(),
      category,
      categoryLabel: CATEGORY_MAP[category],
      trait,
      situation: situation.trim() || '特になし',
      ngPhrase: ngPhrase.trim() || '「ダメ！何やってるの！」',
      ngReason: ngReason.trim() || '否定語や急な命令は児童を混乱させます。',
      okPhrase: okPhrase.trim(),
      visualAid: visualAid.trim() || '視覚タイマー・手順カード等',
      supportTip: supportTip.trim() || '視線・感情に配慮し、短く伝えましょう。',
      sampleDialog: sampleDialog.trim() || `スタッフ「${okPhrase.trim()}」`
    };

    onSave(newItem);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-gray-200 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
        <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white p-4 sm:p-5 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <MessageSquareHeart className="w-5 h-5 text-pink-300" />
            <h3 className="font-bold text-base sm:text-lg">
              {item ? '声掛け・支援パターンの編集' : '新規声掛けパターンの作成'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-blue-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Target Child Selector */}
          <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3">
            <label className="block text-xs font-bold text-blue-950 mb-1 flex items-center gap-1.5">
              <User className="w-4 h-4 text-blue-700" />
              対象児童の指定 <span className="text-red-500">*</span>
            </label>
            <select
              value={childId}
              onChange={(e) => setChildId(e.target.value)}
              className="w-full bg-white border border-blue-300 rounded-lg px-3 py-2 text-xs font-bold text-gray-900 focus:outline-none focus:border-blue-600"
            >
              {childrenList.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.grade})
                </option>
              ))}
            </select>
          </div>

          {/* Title & Categories */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-gray-800 mb-1">
                場面タイトル <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例: 好きなゲームに夢中でやめられない時"
                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-xs sm:text-sm font-semibold text-gray-900 focus:outline-none focus:border-blue-600"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-800 mb-1">
                  場面カテゴリ
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as SupportPhraseItem['category'])}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-xs font-semibold text-gray-900 focus:outline-none focus:border-blue-600"
                >
                  <option value="transition">🔄 切り替え・活動移行</option>
                  <option value="instruction">🗣️ 指示が入らない・集中困難</option>
                  <option value="panic">💥 パニック・感情爆発</option>
                  <option value="conflict">🤝 他害・トラブル・譲れない</option>
                  <option value="habits">🧹 整理整頓・片付け・身支度</option>
                  <option value="praise">🌟 自己肯定感・褒め方</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-800 mb-1">
                  発達特性・タイプ
                </label>
                <select
                  value={trait}
                  onChange={(e) => setTrait(e.target.value as SupportPhraseItem['trait'])}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-xs font-semibold text-gray-900 focus:outline-none focus:border-blue-600"
                >
                  <option value="ASD・視覚優位">ASD・視覚優位</option>
                  <option value="ADHD・不注意">ADHD・不注意</option>
                  <option value="感覚過敏">感覚過敏</option>
                  <option value="PDA・こだわり">PDA・こだわり</option>
                  <option value="共通・全般">共通・全般</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-800 mb-1">
                具体的な場面・状況の説明
              </label>
              <textarea
                rows={2}
                value={situation}
                onChange={(e) => setSituation(e.target.value)}
                placeholder="例: 自由時間終了のチャイムが鳴っても「まだやる！」とブロックの手を止めない時..."
                className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-xs text-gray-900 focus:outline-none focus:border-blue-600"
              />
            </div>
          </div>

          {/* NG vs OK Phrases */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            {/* NG Block */}
            <div className="bg-red-50/70 border border-red-200 rounded-xl p-3.5 space-y-2">
              <span className="font-bold text-red-900 text-xs flex items-center gap-1">
                <XCircle className="w-4 h-4 text-red-600" /> 避ける声掛け (NG例)
              </span>
              <div>
                <input
                  type="text"
                  value={ngPhrase}
                  onChange={(e) => setNgPhrase(e.target.value)}
                  placeholder="例: 「もう終わりでしょ！いい加減にしなさい！」"
                  className="w-full bg-white border border-red-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-950 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-red-900 mb-0.5">NG理由</label>
                <textarea
                  rows={2}
                  value={ngReason}
                  onChange={(e) => setNgReason(e.target.value)}
                  placeholder="突然の中断指示は激しいパニックを引き起こします..."
                  className="w-full bg-white border border-red-200 rounded-lg p-2 text-xs text-red-900 focus:outline-none"
                />
              </div>
            </div>

            {/* OK Block */}
            <div className="bg-emerald-50/80 border border-emerald-300 rounded-xl p-3.5 space-y-2">
              <span className="font-bold text-emerald-900 text-xs flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" /> おすすめの具体声掛け (OK例) <span className="text-red-500">*</span>
              </span>
              <div>
                <textarea
                  rows={3}
                  value={okPhrase}
                  onChange={(e) => setOkPhrase(e.target.value)}
                  placeholder="例: 「あと3分でゲーム終わりね。針が12になったら片付けようね」"
                  className="w-full bg-white border border-emerald-300 rounded-lg p-2.5 text-xs font-extrabold text-emerald-950 focus:outline-none"
                  required
                />
              </div>
            </div>
          </div>

          {/* Visual Aid & Tips */}
          <div className="space-y-3 pt-2">
            <div>
              <label className="block text-xs font-bold text-gray-800 mb-1">
                視覚・構造化支援 (ツール・環境設定)
              </label>
              <input
                type="text"
                value={visualAid}
                onChange={(e) => setVisualAid(e.target.value)}
                placeholder="例: タイムタイマー（色の視覚タイマー）または「まず〇〇→つぎ〇〇」カード"
                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-800 mb-1">
                支援のコツ・心構え
              </label>
              <textarea
                rows={2}
                value={supportTip}
                onChange={(e) => setSupportTip(e.target.value)}
                placeholder="耳からの言葉だけでなく、タイマーを視界に入れてカウントダウンします..."
                className="w-full bg-white border border-gray-300 rounded-lg p-2 text-xs text-gray-900 focus:outline-none focus:border-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-800 mb-1">
                現場対話・会話例
              </label>
              <input
                type="text"
                value={sampleDialog}
                onChange={(e) => setSampleDialog(e.target.value)}
                placeholder="例: スタッフ「あと2分で緑の時間が終わるよ。ピピッと鳴ったら箱に入れようね」"
                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-blue-600"
              />
            </div>
          </div>

          {/* Submit buttons */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-xl text-xs font-bold text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
            >
              キャンセル
            </button>
            <button
              type="submit"
              className="bg-blue-900 hover:bg-blue-800 text-white font-bold text-xs px-5 py-2 rounded-xl transition-all shadow-md flex items-center space-x-1.5 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>保存する</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface SupportGuideViewProps {
  onConsultAI?: (query: string) => void;
}

export const SupportGuideView: React.FC<SupportGuideViewProps> = ({ onConsultAI }) => {
  // Children State
  const [childrenList, setChildrenList] = useState<ChildProfile[]>(() => {
    const saved = localStorage.getItem('houkago_children_v1');
    return saved ? JSON.parse(saved) : INITIAL_CHILDREN;
  });

  // Selected Child Tab State ('all' | childId)
  const [selectedChildId, setSelectedChildId] = useState<string>('c-001');

  // Phrases State
  const [phrases, setPhrases] = useState<SupportPhraseItem[]>(() => {
    const saved = localStorage.getItem('houkago_support_phrases_v1');
    return saved ? JSON.parse(saved) : INITIAL_SUPPORT_PHRASES;
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedTrait, setSelectedTrait] = useState<string>('all');
  const [includeCommon, setIncludeCommon] = useState<boolean>(true); // When viewing a specific child, also show common phrases
  const [showBookmarksOnly, setShowBookmarksOnly] = useState<boolean>(false);
  const [bookmarkedIds, setBookmarkedIds] = useState<string[]>(() => {
    const saved = localStorage.getItem('houkago_support_bookmarks');
    return saved ? JSON.parse(saved) : ['sp-001', 'sp-003'];
  });
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Modals
  const [isChildModalOpen, setIsChildModalOpen] = useState(false);
  const [editingChild, setEditingChild] = useState<ChildProfile | null>(null);

  const [isPhraseModalOpen, setIsPhraseModalOpen] = useState(false);
  const [editingPhrase, setEditingPhrase] = useState<SupportPhraseItem | null>(null);

  // Persistence
  useEffect(() => {
    localStorage.setItem('houkago_children_v1', JSON.stringify(childrenList));
  }, [childrenList]);

  useEffect(() => {
    localStorage.setItem('houkago_support_phrases_v1', JSON.stringify(phrases));
  }, [phrases]);

  useEffect(() => {
    localStorage.setItem('houkago_support_bookmarks', JSON.stringify(bookmarkedIds));
  }, [bookmarkedIds]);

  const toggleBookmark = (id: string) => {
    setBookmarkedIds((prev) =>
      prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]
    );
  };

  const copyPhraseToClipboard = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => {
      setCopiedId(null);
    }, 2000);
  };

  // Child CRUD Handlers
  const handleAddChild = () => {
    setEditingChild(null);
    setIsChildModalOpen(true);
  };

  const handleEditChild = (child: ChildProfile) => {
    setEditingChild(child);
    setIsChildModalOpen(true);
  };

  const handleDeleteChild = (child: ChildProfile) => {
    if (child.id === 'c-common') {
      alert('「共通・全般」タブは削除できません。');
      return;
    }
    if (window.confirm(`「${child.name}」のプロフィールと個別支援データを削除しますか？`)) {
      setChildrenList((prev) => prev.filter((c) => c.id !== child.id));
      setPhrases((prev) => prev.filter((p) => p.childId !== child.id));
      if (selectedChildId === child.id) {
        setSelectedChildId('c-common');
      }
    }
  };

  const handleSaveChild = (savedChild: ChildProfile) => {
    setChildrenList((prev) => {
      const exists = prev.some((c) => c.id === savedChild.id);
      if (exists) {
        return prev.map((c) => (c.id === savedChild.id ? savedChild : c));
      } else {
        return [...prev, savedChild];
      }
    });
    setSelectedChildId(savedChild.id);
    setIsChildModalOpen(false);
  };

  // Phrase CRUD Handlers
  const handleCreatePhrase = () => {
    setEditingPhrase(null);
    setIsPhraseModalOpen(true);
  };

  const handleEditPhrase = (phrase: SupportPhraseItem) => {
    setEditingPhrase(phrase);
    setIsPhraseModalOpen(true);
  };

  const handleDeletePhrase = (id: string, title: string) => {
    if (window.confirm(`「${title}」の支援パターンを削除してもよろしいですか？`)) {
      setPhrases((prev) => prev.filter((p) => p.id !== id));
    }
  };

  const handleSavePhrase = (savedPhrase: SupportPhraseItem) => {
    setPhrases((prev) => {
      const exists = prev.some((p) => p.id === savedPhrase.id);
      if (exists) {
        return prev.map((p) => (p.id === savedPhrase.id ? savedPhrase : p));
      } else {
        return [savedPhrase, ...prev];
      }
    });
    setIsPhraseModalOpen(false);
  };

  // Active Child Information
  const activeChild = childrenList.find((c) => c.id === selectedChildId);

  // Filtered Phrases Calculation
  const filteredItems = phrases.filter((item) => {
    // Child filter
    let matchesChild = false;
    if (selectedChildId === 'all') {
      matchesChild = true;
    } else if (selectedChildId === 'c-common') {
      matchesChild = item.childId === 'c-common';
    } else {
      matchesChild = item.childId === selectedChildId || (includeCommon && item.childId === 'c-common');
    }

    if (!matchesChild) return false;

    // Search query
    const matchesSearch = 
      item.title.includes(searchQuery) ||
      item.situation.includes(searchQuery) ||
      item.okPhrase.includes(searchQuery) ||
      item.visualAid.includes(searchQuery) ||
      item.supportTip.includes(searchQuery);

    // Category filter
    const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;

    // Trait filter
    const matchesTrait = selectedTrait === 'all' || item.trait === selectedTrait;

    // Bookmarks filter
    const matchesBookmark = !showBookmarksOnly || bookmarkedIds.includes(item.id);

    return matchesSearch && matchesCategory && matchesTrait && matchesBookmark;
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-900 text-white p-6 sm:p-8 shadow-xl border border-indigo-900/40">
        <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 max-w-4xl space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="bg-blue-500/30 text-blue-200 border border-blue-400/30 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1.5 backdrop-blur-md">
                <MessageSquareHeart className="w-4 h-4 text-pink-300" />
                児童別 支援・声掛けガイドシート
              </span>
              <span className="bg-amber-400/20 text-amber-200 border border-amber-400/30 text-xs font-semibold px-2.5 py-0.5 rounded-full">
                放課後等デイサービス・個別支援計画連動
              </span>
            </div>

            <button
              onClick={handleCreatePhrase}
              className="bg-pink-600 hover:bg-pink-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition-all shadow-md flex items-center space-x-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>声掛けパターンを追加</span>
            </button>
          </div>

          <h2 className="text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight text-white leading-snug">
            児童一人ひとりの特性に応じた「共通理解と声掛け」
          </h2>

          <p className="text-xs sm:text-sm text-blue-100/90 leading-relaxed">
            児童によって「刺さる言葉」「パニックのトリガー」「視覚カードの有効性」は大きく異なります。スタッフ間での対応のブレを防ぎ、個別支援計画に基づいた一貫性のあるかかわりを可視化します。
          </p>

          <div className="pt-2 flex flex-wrap items-center gap-4 text-xs font-medium text-blue-200">
            <span className="flex items-center gap-1.5">
              <Users className="w-4 h-4 text-pink-300" /> 児童別タブ切り替え
            </span>
            <span className="flex items-center gap-1.5">
              <Lightbulb className="w-4 h-4 text-amber-300" /> 構造化・視覚支援セット
            </span>
            <span className="flex items-center gap-1.5">
              <Bot className="w-4 h-4 text-sky-300" /> AI個案相談連携
            </span>
          </div>
        </div>
      </div>

      {/* --- Children Tabs Navigation --- */}
      <div className="bg-white rounded-2xl p-3 sm:p-4 shadow-sm border border-gray-200 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Users className="w-4 h-4 text-blue-900" />
            <h3 className="text-xs font-extrabold text-gray-900 tracking-wide uppercase">
              児童選択タブ ({childrenList.length}名登録中)
            </h3>
          </div>

          <button
            onClick={handleAddChild}
            className="text-xs font-bold text-blue-900 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3 py-1.5 rounded-xl transition-colors flex items-center space-x-1 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>児童を追加</span>
          </button>
        </div>

        {/* Tab Items Scrollable Bar */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          {/* All Children Filter Tab */}
          <button
            onClick={() => setSelectedChildId('all')}
            className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer border ${
              selectedChildId === 'all'
                ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>すべての児童 (全{phrases.length}件)</span>
          </button>

          {/* Individual Child Tabs */}
          {childrenList.map((c) => {
            const count = phrases.filter((p) => p.childId === c.id).length;
            const isSelected = selectedChildId === c.id;

            return (
              <button
                key={c.id}
                onClick={() => setSelectedChildId(c.id)}
                className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer border ${
                  isSelected
                    ? 'bg-blue-900 text-white border-blue-900 shadow-sm'
                    : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                }`}
              >
                <div className={`w-2.5 h-2.5 rounded-full ${c.avatarBg}`} />
                <span>{c.name}</span>
                <span
                  className={`text-[10px] font-extrabold px-1.5 py-0.2 rounded-full ${
                    isSelected ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'
                  }`}
                >
                  {count}件
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* --- Active Child Header Profile Card (if single child selected) --- */}
      {activeChild && selectedChildId !== 'all' && (
        <div className="bg-gradient-to-r from-blue-50/80 via-indigo-50/50 to-white rounded-2xl p-4 sm:p-5 border border-blue-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start space-x-3.5">
            <div className={`w-12 h-12 rounded-2xl ${activeChild.avatarBg} text-white font-black text-lg flex items-center justify-center shrink-0 shadow-md`}>
              {activeChild.name.slice(0, 1)}
            </div>

            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base sm:text-lg font-black text-gray-900">
                  {activeChild.name} の支援ガイド
                </h3>
                <span className="bg-blue-100 text-blue-900 text-xs font-bold px-2 py-0.5 rounded-md flex items-center gap-1 border border-blue-200">
                  <GraduationCap className="w-3.5 h-3.5 text-blue-700" />
                  {activeChild.grade}
                </span>
                <span className="bg-purple-100 text-purple-900 text-xs font-bold px-2 py-0.5 rounded-md border border-purple-200">
                  {activeChild.traits}
                </span>
              </div>

              <p className="text-xs text-gray-700 font-medium leading-relaxed">
                <strong className="text-blue-950 font-bold">【個別支援目標・留意点】</strong> {activeChild.supportFocus}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0 self-end md:self-auto">
            {activeChild.id !== 'c-common' && (
              <>
                <button
                  onClick={() => handleEditChild(activeChild)}
                  className="bg-white hover:bg-gray-100 text-gray-800 border border-gray-300 text-xs font-bold px-3 py-1.5 rounded-xl transition-colors flex items-center space-x-1 cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>プロフィール編集</span>
                </button>

                <button
                  onClick={() => handleDeleteChild(activeChild)}
                  className="bg-white hover:bg-red-50 text-red-600 border border-red-200 text-xs font-bold px-2.5 py-1.5 rounded-xl transition-colors flex items-center space-x-1 cursor-pointer"
                  title="児童プロフィール削除"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}

            <button
              onClick={handleCreatePhrase}
              className="bg-blue-900 hover:bg-blue-800 text-white text-xs font-bold px-3.5 py-1.5 rounded-xl transition-all shadow-xs flex items-center space-x-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>この児童のパターン追加</span>
            </button>
          </div>
        </div>
      )}

      {/* Toolbar: Search, Filters & Toggles */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Search Bar */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="場面、声掛けワード、ツール（例: タイマー、手洗い）で検索..."
              className="w-full bg-gray-50 border border-gray-300 rounded-xl pl-9 pr-4 py-2 text-xs sm:text-sm text-gray-900 font-medium focus:bg-white focus:outline-none focus:border-blue-600"
            />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Category Select */}
            <div className="flex items-center space-x-1 bg-gray-50 border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs">
              <Filter className="w-3.5 h-3.5 text-gray-500" />
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="bg-transparent font-semibold text-gray-800 focus:outline-none cursor-pointer"
              >
                <option value="all">すべての場面</option>
                <option value="transition">🔄 切り替え・活動移行</option>
                <option value="instruction">🗣️ 指示が入らない・集中困難</option>
                <option value="panic">💥 パニック・感情爆発</option>
                <option value="conflict">🤝 他害・トラブル・譲れない</option>
                <option value="habits">🧹 整理整頓・片付け・身支度</option>
                <option value="praise">🌟 自己肯定感・褒め方</option>
              </select>
            </div>

            {/* Trait Select */}
            <div className="flex items-center space-x-1 bg-gray-50 border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs">
              <Eye className="w-3.5 h-3.5 text-gray-500" />
              <select
                value={selectedTrait}
                onChange={(e) => setSelectedTrait(e.target.value)}
                className="bg-transparent font-semibold text-gray-800 focus:outline-none cursor-pointer"
              >
                <option value="all">すべての特性タイプ</option>
                <option value="ASD・視覚優位">ASD・視覚優位</option>
                <option value="ADHD・不注意">ADHD・不注意</option>
                <option value="感覚過敏">感覚過敏</option>
                <option value="PDA・こだわり">PDA・こだわり</option>
                <option value="共通・全般">共通・全般</option>
              </select>
            </div>

            {/* Bookmarks Toggle */}
            <button
              onClick={() => setShowBookmarksOnly(!showBookmarksOnly)}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                showBookmarksOnly
                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                  : 'bg-gray-50 hover:bg-gray-100 text-gray-700 border-gray-300'
              }`}
            >
              <Bookmark className={`w-3.5 h-3.5 ${showBookmarksOnly ? 'fill-amber-600 text-amber-600' : ''}`} />
              <span>お気に入りのみ ({bookmarkedIds.length})</span>
            </button>
          </div>
        </div>

        {/* Checkbox: Include common phrases when viewing a specific child tab */}
        {selectedChildId !== 'all' && selectedChildId !== 'c-common' && (
          <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-xs">
            <label className="flex items-center space-x-2 text-gray-700 font-semibold cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeCommon}
                onChange={(e) => setIncludeCommon(e.target.checked)}
                className="w-4 h-4 rounded text-blue-900 focus:ring-blue-600 border-gray-300 cursor-pointer"
              />
              <span>「共通・全般」の支援パターンも併せて一覧表示する</span>
            </label>

            <span className="text-gray-400 font-medium">
              表示中: <strong className="text-gray-900">{filteredItems.length}</strong> 件
            </span>
          </div>
        )}
      </div>

      {/* Results Header / Stats */}
      <div className="flex items-center justify-between px-1">
        <p className="text-xs font-bold text-gray-600">
          全 <span className="text-blue-900 text-sm font-extrabold">{filteredItems.length}</span> 件の支援パターンを表示中
        </p>
      </div>

      {/* --- Main Cards List --- */}
      {filteredItems.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-gray-200 space-y-3 shadow-xs">
          <div className="w-12 h-12 bg-gray-100 text-gray-400 rounded-full flex items-center justify-center mx-auto">
            <MessageSquareHeart className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-gray-800">該当する声掛けパターンが見つかりませんでした</h3>
          <p className="text-xs text-gray-500 max-w-md mx-auto">
            検索条件を変更するか、新しい支援パターンを作成してください。
          </p>
          <div className="flex items-center justify-center space-x-3 pt-2">
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('all');
                setSelectedTrait('all');
                setShowBookmarksOnly(false);
              }}
              className="bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold px-4 py-2 rounded-lg transition-colors cursor-pointer"
            >
              条件リセット
            </button>
            <button
              onClick={handleCreatePhrase}
              className="bg-blue-900 hover:bg-blue-800 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors cursor-pointer flex items-center space-x-1"
            >
              <Plus className="w-4 h-4" />
              <span>新しくパターンを作成</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredItems.map((item) => {
            const isBookmarked = bookmarkedIds.includes(item.id);
            const isCopied = copiedId === item.id;
            const targetChild = childrenList.find((c) => c.id === item.childId);

            return (
              <div
                key={item.id}
                className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col justify-between group"
              >
                {/* Card Top */}
                <div className="p-5 space-y-4">
                  {/* Category & Child Badges & Action Buttons */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {/* Target Child Badge */}
                      <span className="bg-slate-900 text-white text-[11px] font-extrabold px-2.5 py-0.5 rounded-md flex items-center gap-1">
                        <User className="w-3 h-3 text-pink-300" />
                        {targetChild ? targetChild.name : '共通'}
                      </span>

                      <span className="bg-blue-100 text-blue-900 font-bold text-[11px] px-2.5 py-0.5 rounded-md border border-blue-200">
                        {item.categoryLabel}
                      </span>
                      <span className="bg-purple-50 text-purple-800 font-semibold text-[11px] px-2.5 py-0.5 rounded-md border border-purple-200">
                        {item.trait}
                      </span>
                    </div>

                    <div className="flex items-center space-x-1">
                      {/* Edit Button */}
                      <button
                        onClick={() => handleEditPhrase(item)}
                        className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:text-blue-900 hover:bg-blue-50 transition-colors cursor-pointer"
                        title="この支援パターンを編集"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>

                      {/* Delete Button */}
                      <button
                        onClick={() => handleDeletePhrase(item.id, item.title)}
                        className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                        title="削除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>

                      {/* Bookmark Button */}
                      <button
                        onClick={() => toggleBookmark(item.id)}
                        className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                          isBookmarked
                            ? 'bg-amber-100 border-amber-300 text-amber-700'
                            : 'bg-white border-gray-200 text-gray-400 hover:text-gray-600'
                        }`}
                        title={isBookmarked ? 'お気に入りから削除' : 'お気に入りに追加'}
                      >
                        <Bookmark className={`w-3.5 h-3.5 ${isBookmarked ? 'fill-amber-500 text-amber-500' : ''}`} />
                      </button>
                    </div>
                  </div>

                  {/* Title & Situation */}
                  <div className="space-y-1">
                    <h3 className="text-base sm:text-lg font-bold text-gray-900 leading-snug group-hover:text-blue-900 transition-colors">
                      {item.title}
                    </h3>
                    <p className="text-xs text-gray-600 leading-relaxed bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                      <strong className="text-gray-800">【具体的な場面】</strong> {item.situation}
                    </p>
                  </div>

                  {/* NG vs OK Phrases comparison */}
                  <div className="grid grid-cols-1 gap-3 pt-1">
                    {/* NG Phrase Box */}
                    <div className="bg-red-50/80 rounded-xl p-3 border border-red-200/80 space-y-1">
                      <div className="flex items-center space-x-1.5 text-red-900 font-bold text-xs">
                        <XCircle className="w-4 h-4 text-red-600 shrink-0" />
                        <span>避ける声掛け (NG例)</span>
                      </div>
                      <p className="text-xs font-extrabold text-red-950 line-through decoration-red-500 decoration-2 pl-5">
                        {item.ngPhrase}
                      </p>
                      <p className="text-[11px] text-red-800/90 pl-5 leading-tight">
                        <span className="font-semibold">理由:</span> {item.ngReason}
                      </p>
                    </div>

                    {/* OK Phrase Box */}
                    <div className="bg-emerald-50 rounded-xl p-3.5 border-2 border-emerald-300/80 space-y-2 relative">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-1.5 text-emerald-950 font-bold text-xs">
                          <CheckCircle2 className="w-4.5 h-4.5 text-emerald-600 shrink-0" />
                          <span>おすすめの具体声掛け (OK例)</span>
                        </div>

                        <button
                          onClick={() => copyPhraseToClipboard(item.id, item.okPhrase)}
                          className="flex items-center space-x-1 text-[11px] font-bold text-emerald-800 hover:text-emerald-950 bg-emerald-100 hover:bg-emerald-200 px-2 py-0.5 rounded transition-colors cursor-pointer"
                          title="フレーズをコピー"
                        >
                          <Copy className="w-3 h-3" />
                          <span>{isCopied ? 'コピー完了！' : 'コピー'}</span>
                        </button>
                      </div>

                      <p className="text-xs sm:text-sm font-black text-emerald-950 bg-white p-2.5 rounded-lg border border-emerald-200 shadow-2xs leading-relaxed">
                        {item.okPhrase}
                      </p>
                    </div>
                  </div>

                  {/* Visual Aid & Support Tips */}
                  <div className="space-y-2 pt-2 border-t border-gray-100 text-xs">
                    <div className="flex items-start space-x-2 text-gray-800">
                      <Eye className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-blue-900 font-bold">視覚・環境構造化:</strong>{' '}
                        <span className="font-medium text-gray-700">{item.visualAid}</span>
                      </div>
                    </div>

                    <div className="flex items-start space-x-2 text-gray-800">
                      <Lightbulb className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-amber-900 font-bold">支援のコツ:</strong>{' '}
                        <span className="font-medium text-gray-700">{item.supportTip}</span>
                      </div>
                    </div>

                    <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-slate-800 font-medium">
                      <span className="font-bold text-slate-900 text-[11px] block mb-0.5">💬 現場対話イメージ:</span>
                      {item.sampleDialog}
                    </div>
                  </div>
                </div>

                {/* Card Footer */}
                <div className="p-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleEditPhrase(item)}
                      className="text-xs font-bold text-gray-600 hover:text-blue-900 transition-colors flex items-center space-x-1 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>編集</span>
                    </button>
                    <span className="text-gray-300">|</span>
                    <span className="text-[11px] text-gray-400 font-mono">
                      ID: {item.id}
                    </span>
                  </div>

                  {onConsultAI && (
                    <button
                      onClick={() => {
                        const childName = targetChild ? targetChild.name : '児童';
                        onConsultAI(`「${childName}の支援事例：${item.title}」について、放課後デイのマニュアルや行動調整・個案の具体的な手順を詳しく相談したいです。`);
                      }}
                      className="text-xs font-bold text-blue-900 hover:text-blue-700 flex items-center space-x-1 hover:underline cursor-pointer"
                    >
                      <Bot className="w-3.5 h-3.5 text-sky-600" />
                      <span>この事例をAI相談する</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Bottom Educational Callout */}
      <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-5 space-y-2">
        <h4 className="text-sm font-bold text-blue-950 flex items-center gap-1.5">
          <ThumbsUp className="w-4 h-4 text-blue-700" /> スタッフ間の個別統一支援と申し送り
        </h4>
        <p className="text-xs text-blue-800 leading-relaxed">
          放課後等デイサービスでは、スタッフによって対応や声掛けが異なると、児童は混乱し不安や行動障害が強まります。児童ごとに「響く言葉」や「避けるべき対応」を登録・更新し、朝礼や個別支援計画の作成に役立てましょう。
        </p>
      </div>

      {/* --- Modals --- */}
      {isChildModalOpen && (
        <EditChildModal
          child={editingChild}
          onClose={() => setIsChildModalOpen(false)}
          onSave={handleSaveChild}
        />
      )}

      {isPhraseModalOpen && (
        <EditSupportPhraseModal
          item={editingPhrase}
          childrenList={childrenList}
          defaultChildId={selectedChildId === 'all' ? 'c-common' : selectedChildId}
          onClose={() => setIsPhraseModalOpen(false)}
          onSave={handleSavePhrase}
        />
      )}
    </div>
  );
};
