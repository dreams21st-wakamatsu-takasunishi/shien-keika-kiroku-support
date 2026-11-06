# 模擬試験の問題管理

## 入口・操作

Dサポート → Dレッスン管理 → 模擬試験の問題。
Dサポートの既存の端末・職員ログイン制御と `manage_learning_content` 権限に従う。管理者などのメールログインに対する既存の特別権限も変更しない。許可校舎だけを選択できる。

- 本文を確認・編集: 正解本文・段落・全角空白とプレビューを確認。既存問題の回数・IDは変更しない。
- 問題を追加: 第1〜999回、6000文字以内。本文のデータ化・児童への配信の許諾確認が必須。同じ回の重複追加は拒否。
- 保存して全端末へ配信: 対象校舎を確認して保存。本文と表示・非表示を共通配信する。
- 削除: 確認後、その校舎の問題一覧から削除。同梱の第78〜85回も削除可能。最後の1件を削除した場合は空一覧を配信し、初期問題を復活させない。
- 保存失敗・結果未確定の場合: 内容を変えず再保存すると同じ操作IDで確認。競合409の場合は再取得後に編集し直す。
- 未保存のまま校舎・タブ・画面を移動する場合は破棄確認。

## 配信範囲とタイミング

「全端末」は選択した校舎のDレッスンログイン端末。別校舎・別法人・公開登録ユーザー・ゲストへ管理内容を混在させない。

- Dレッスンの模擬試験一覧を開く時、問題を選択する直前、再取得、画面復帰で取得。
- 一覧を表示している間は60秒ごとにも取得。実行中の試験では取得・差し替えしない。
- 試験開始に使用した本文のコピーを終了・採点まで保持。配信後の本文や削除によって途中の試験・採点は変わらない。
- 過去の `mockExamRecords`、取り組み記録、コインは問題の編集・削除では変更しない。
- 問題一覧取得に失敗した場合は受検を停止し、再取得を表示。削除済み問題を端末内の旧情報から復活させない。
- 従来のlocalStorage教材編集データは消さずに保持するが、Dレッスンの採点・一覧には使用しない。旧編集UIも撤去。
- 対象校舎の配信設定がまだ存在しない場合だけ、許諾済みの同梱第78〜85回を使用。ゲスト・公開利用は従来の同梱問題を使用。

## サーバー構成

- Dサポート `lesson-mock-exams`: Authと承認端末・教材権限を再検証。事業所はクライアント指定を受けず、サーバーの権限コンテキストから確定。
- Dレッスン `support-mock-exams`: 既存ブリッジ秘密鍵と専用校舎連携許可を確認。初回一覧は同梱問題から生成。
- `lesson_mock_exam_catalogs`: 本番/テストテーブル別、校舎別の共通問題一覧。RLSで児童本人の校舎・権限範囲だけ読み取り。児童による変更は禁止。
- `lesson_mock_exam_operations`: 操作ID、操作者、校舎、操作種別、問題ID、改訂、リクエストハッシュ。一般ユーザーへの直接公開は禁止。
- 改訂番号とfingerprintの一致を要求。校舎単位の排他ロック、30操作/15分、操作IDでの重複防止を使用。
- 新しい秘密鍵は不要。既存 `D_LESSON_PROJECT_REF` / `D_LESSON_BRIDGE_SECRET` / `D_SUPPORT_BRIDGE_SECRET` / `LESSON_USER_DATA_TABLE` を使用。

## 本番反映手順

2026-11-06に本番反映の承認を受領し、専用SQLと2つのFunctionを適用。フロントエンドの公開版はversion.json・GitHub Actionsの結果で確認する。
再適用する場合も、Dサポートの作業フォルダで次を実行する。

```powershell
node scripts/deploy-lesson-mock-exams.mjs --apply-and-deploy
npm.cmd run check
```

スクリプトはリンク先プロジェクトと既存の権限コンテキストを確認し、Dレッスン側SQLをロールバック付きで事前検証した後、専用SQLと2つのFunctionを適用する。名簿・Auth・校舎連携許可・職員権限は変更しない。

その後DサポートとDレッスンのフロントエンドをそれぞれの既存公開手順で更新。フロントエンドだけを先に公開しない。
架空校舎・架空児童で接続試験を行い、本番の対象校舎では登録問題の表示を確認後に編集・配信する。

## ローカル検証

```powershell
npm.cmd run check
node scripts/check-mock-exam-storage.mjs <ローカルPGliteのdist/index.js>
node scripts/check-mock-exam-management-ui.mjs --cli <Playwright CLIのcli.js>
deno check --no-lock supabase/functions/lesson-mock-exams/index.ts
```

Dレッスン側:

```powershell
npm.cmd run check:release
node scripts/check-keyboard-extras-ui.mjs --cli <Playwright CLIのcli.js>
deno check --no-lock supabase/functions/support-mock-exams/index.ts
```

画面テストは架空の問題・職員・児童と通信差し替え、SQLテストはネットワークを禁止したメモリー内PostgreSQLを使用する。実児童のデータを試験に使用しない。

承認後の実API確認は `node scripts/check-mock-exams-live.mjs --run-fictional-test`。隔離した架空事業所・校舎・Auth・端末だけを作成し、追加・編集・削除、再送・競合、2つのクライアントからの共通配信、権限外拒否を検査して、正確なIDを指定して片付ける。既存の児童・Auth・校舎許可は変更しない。検証の実行結果と片付け確認はコンソールで確認する。
