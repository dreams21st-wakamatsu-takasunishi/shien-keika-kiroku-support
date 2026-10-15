// Static help destinations only. Never put names, dates, IDs, input or tokens in URLs.
export const MANUAL_TITLES = {
  "user-switch": "右上の職員名からユーザーを切り替える",
  "login": "ログインと端末の使い分け",
  "home": "ホームで目的の機能を探す",
  "menu": "自分のメニュー・通知・画面更新",
  "install": "スマートフォンから開く・ホーム画面へ追加",
  "record-select": "記録日と複数児童を選ぶ",
  "record-input": "様子・活動・宿題の記録を入力する",
  "record-save": "確認して保存・上書きする",
  "record-status": "記録状況と記録の引き継ぎ",
  "record-list": "記録一覧で検索・確認・出力する",
  "quick-memo": "クイックメモから申し送りへ登録する",
  "children": "児童名簿・基本予定・恒常的な連絡",
  "daily-change": "当日の欠席・追加利用・担当交代",
  "monthly": "利用・送迎一覧と日ごとの編集",
  "monthly-bulk": "基本予定の反映・一括編集・学校確認",
  "dispatch": "ガントの時刻マーカーから配車を組む",
  "dispatch-time": "移動時間を計算・手動調整する",
  "today": "本日の業務・全体送迎を確認する",
  "field": "個人端末で送迎を操作する",
  "transport-log": "送迎実績の一覧と手動修正",
  "dispatch-windows": "小窓・ガント・アラートを使い分ける",
  "attendance": "自分の勤務予定を確認する",
  "shift-request": "複数日のシフト希望を提出する",
  "shift-create": "シフトを作成・承認・削除する",
  "personal-qr-register": "本人用QRが出ないときの個人端末登録",
  "qr-punch": "本人用QRで出退勤を打刻する",
  "legal-training": "法定研修を受講・完了・取り消しする",
  "attendance-correct": "打刻実績と打刻修正",
  "calendar": "業務カレンダーと職員の休み",
  "announcements": "お知らせを共有・確認する",
  "morning": "朝礼記録を共同編集する",
  "handover": "児童別・全体の申し送り",
  "activity": "活動・指導案を作る",
  "activity-print": "原本に合わせた表で指導案を出力する",
  "traffic": "交通費・児童1人あたりの金額を計算する",
  "inspection": "日常点検を記録する",
  "supplies": "備品の在庫と補充を管理する",
  "newsletter": "保護者向けおたよりを作る",
  "meeting": "複数児童の会議支援とTiro連携",
  "learning": "Dレッスン連携・学習管理",
  "lesson-auto": "Dレッスンの実績を自動反映・再取得する",
  "lesson-details": "Dレッスンの要点表示・手入力・実績選択",
  "assistant": "AIアシスタントの実行案を確認する",
  "lesson-progress": "児童別の学習進捗・苦手キーを確認する",
  "lesson-task": "児童ごとに練習課題・ステージを指定する",
  "lesson-batch": "校舎・グループを絞って課題をまとめて指定",
  "lesson-batch-change": "指定済み課題をまとめて編集・停止する",
  "lesson-word": "Wordの提出作品を確認・承認・差し戻し",
  "lesson-account": "既存の学習アカウント・ログインを確認",
  "lesson-new": "学習アカウントがない児童を新規登録",
  "schools": "学校台帳・長期休暇・下校時刻表",
  "transport-settings": "基本時刻・地点・エリア・ピン色",
  "vehicles": "車両台帳を管理する",
  "shift-template": "勤務テンプレートを管理する",
  "permissions": "児発管・教室長の権限割り振り",
  "record-settings": "記録の質問・テンプレートとAI文章設定",
  "staff": "職員名簿・個人ログイン・紐づけ",
  "devices": "登録端末とアクセス管理",
  "invitation-audit": "メール招待・利用停止・監査履歴",
  "training-settings": "法定研修の追加・編集・順序・確認フォーム",
  "service-types": "事業所種別・児童の利用サービスを選ぶ",
  "diagnostics": "エラー履歴を確認・書き出して相談する"
} as const;
export const TROUBLE_TITLES = {
  "protect-input": "困ったとき、入力を消す前に",
  "save-offline": "通信できず記録を保存できない",
  "save-conflict": "「別端末で保存」「更新競合」が続く",
  "save-cleanup": "保存済みなのに入力中の児童が残る",
  "missing-answer": "未入力表示・「未入力箇所へ移動」で進めない",
  "wrong-user": "別の職員でログインしている・ログインできない",
  "forbidden": "403・権限エラー／共有端末なのに個人端末扱い",
  "personal-qr": "本人用QRが表示されない・承認が必要と出る",
  "qr-reading": "QRが読めない・カメラが起動しない",
  "menu-hidden": "使いたい機能がメニューに見つからない",
  "monthly-wrong": "利用人数・基本予定・長期休暇が想定と違う",
  "route-calc": "時間計算が422・502等で失敗する",
  "wrong-map": "「地図を開く」で違う場所へ案内される",
  "transport-overlap": "赤・黄の配車アラート／時刻が未確定",
  "shift-status": "希望が勤務予定にならない・編集／削除できない",
  "realtime": "朝礼の他職員の入力・共同編集者が反映されない",
  "lesson-missing": "Dレッスン実績が出ない・別児童／日付に見える",
  "lesson-partial": "課題一括指定・学習登録が途中で止まった",
  "training-user": "法定研修を別職員で完了にした・動画が開かない",
  "pdf-output": "PDF・印刷・文章コピーがうまくいかない",
  "update": "画面が古い・公開後も機能が変わらない",
  "report": "改善しないとき、必要な情報を安全に渡す"
} as const;
export type ManualTopic=keyof typeof MANUAL_TITLES;
export type TroubleTopic=keyof typeof TROUBLE_TITLES;
export interface ManualContext {topics:ManualTopic[];troubles:TroubleTopic[]}
const context=(topics:ManualTopic[],troubles:TroubleTopic[]):ManualContext=>({topics,troubles});
const screens={
 home:context(['home','menu','user-switch','quick-memo','install'],['menu-hidden','update','protect-input','report']),
 dailyChanges:context(['daily-change'],['monthly-wrong','wrong-map','report']),
 todayWork:context(['today','transport-log'],['transport-overlap','wrong-map']),
 calendar:context(['calendar'],['monthly-wrong','report']),
 monthlySchedule:context(['monthly','monthly-bulk','schools'],['monthly-wrong','route-calc']),
 dispatch:context(['dispatch','dispatch-time','dispatch-windows','transport-log'],['route-calc','transport-overlap','wrong-map']),
 operations:context(['record-status'],['forbidden','save-cleanup','save-offline']),
 communication:context(['announcements','morning','handover'],['realtime','report']),
 assistant:context(['assistant'],['forbidden','report']),
 meeting:context(['meeting'],['forbidden','save-offline','report']),
 records:context(['record-list'],['save-conflict','pdf-output']),
 children:context(['children','service-types'],['monthly-wrong','forbidden']),
 record:context(['record-input','record-select','record-save','lesson-auto','lesson-details'],['missing-answer','save-offline','save-conflict','save-cleanup']),
 activity:context(['activity','activity-print'],['pdf-output','save-offline']),
 traffic:context(['traffic'],['pdf-output','report']),
 facility:context(['inspection','supplies','newsletter'],['save-offline','pdf-output']),
 learning:context(['learning','lesson-auto','lesson-details'],['lesson-missing','lesson-partial']),
 training:context(['legal-training'],['training-user','forbidden']),
 settings:context(['record-settings','schools','transport-settings','permissions','diagnostics'],['menu-hidden','forbidden','report']),
 team:context(['staff','devices','invitation-audit'],['wrong-user','forbidden','personal-qr']),
 auth:context(['login','install','qr-punch'],['wrong-user','forbidden','qr-reading']),
 personal:context(['field','qr-punch','personal-qr-register'],['wrong-map','personal-qr','qr-reading']),
 qr:context(['qr-punch','personal-qr-register'],['qr-reading','personal-qr','forbidden']),
 diagnostics:context(['diagnostics'],['report','save-offline']),
} as const;
export type ManualScreen=keyof typeof screens;
export function getManualContext(screen:ManualScreen,section?:string):ManualContext {
 if(screen==='record'){
  if(section==='review')return context(['record-save','record-input'],['save-offline','save-conflict','save-cleanup']);
  if(['date','children','template','recorder'].includes(section||''))return context(['record-select','record-input'],['wrong-user','forbidden']);
 }
 if(screen==='communication')return context([section==='morning'?'morning':section==='handover'?'handover':'announcements'],[section==='morning'?'realtime':'report']);
 if(screen==='facility')return context([section==='supplies'?'supplies':section==='newsletter'?'newsletter':'inspection'],['save-offline','pdf-output']);
 if(screen==='learning'){
  if(section==='progress')return context(['lesson-progress'],['lesson-missing']);
  if(section==='individual')return context(['lesson-task','lesson-batch'],['lesson-partial']);
  if(section==='batch')return context(['lesson-batch','lesson-batch-change'],['lesson-partial']);
  if(section==='reviews')return context(['lesson-word'],['lesson-missing','pdf-output']);
  if(section==='links')return context(['lesson-account','lesson-new','learning'],['lesson-partial','lesson-missing']);
 }
 if(screen==='settings'){
  const pages:Record<string,ManualTopic>={ai:'record-settings',templates:'record-settings',schools:'schools',transportMap:'transport-settings',rolePermissions:'permissions',shiftTemplates:'shift-template',vehicles:'vehicles',serviceTypes:'service-types',legalTraining:'training-settings',diagnostics:'diagnostics'};
  if(section&&pages[section])return context([pages[section]],section==='diagnostics'?['report']:['forbidden','report']);
 }
 if(screen==='team'){
  if(section==='devices')return context(['devices'],['forbidden','personal-qr']);
  if(section==='invite'||section==='invitations'||section==='audit')return context(['invitation-audit'],['wrong-user','forbidden']);
 }
 if(screen==='personal'&&section==='qr')return context(['qr-punch','personal-qr-register'],['personal-qr','qr-reading']);
 return screens[screen];
}
export function attendanceManualContext(section:string):ManualContext {
 return section==='planning'?context(['shift-create','shift-template'],['shift-status']):
 section==='request'?context(['shift-request','attendance'],['shift-status']):
 section==='attendance'?context(['attendance-correct','qr-punch'],['shift-status','qr-reading']):
 context(['attendance','shift-request','qr-punch'],['shift-status','qr-reading']);
}
export function manualHref(topic:ManualTopic,base='./'):string {return base+'manuals/d-support/index.html#'+topic;}
export function homeManualContext(workspace:string,section?:string):ManualContext {
 const homeScreens=['dailyChanges','todayWork','calendar','monthlySchedule','dispatch','operations','communication','assistant'] as const;
 const screen=homeScreens.find(value=>value===workspace);
 return getManualContext(screen||'home',section);
}
export function troubleHref(topic:TroubleTopic,base='./'):string {return base+'manuals/d-support/troubleshooting.html#'+topic;}
