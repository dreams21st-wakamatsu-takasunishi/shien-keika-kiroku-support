# 支援経過記録作成サポート

放課後等デイサービス・児童発達支援向けの、支援経過記録作成・児発管承認・PDF出力アプリです。

## 実装済みの運用機能

- Supabase Authによるログイン
- 事業所単位のデータ分離（RLS）
- 職員・児発管・管理者の権限管理
- 招待制ログイン（無関係な新規登録はAuth設定・DBの両方で拒否）
- 職員のメール招待、編集、利用停止、完全削除
- 児童名簿、記録、テンプレートの共有DB保存
- 複数児童をタブで切り替える一括記録
- 個人端末用の送迎専用モード（支援記録・名簿は非表示）
- 事業所共有端末の物理端末単位承認
- 児童ごとの送迎到着・乗車・降車時刻と応援引き継ぎ
- 端末内とSupabaseの本人専用下書き自動保存
- ABC分析入力とAI要約
- AIの文体・文章量・追加指示の事業所設定
- 承認済み記録のロックと差戻しフロー
- 全変更の監査ログ
- 論理削除、テンプレート版管理
- Supabase Edge Function経由のGemini文章作成
- A4 PDF、事業所保存用・保護者控えの2面出力

個別支援計画・本人支援5領域は、将来再開できるようデータと実装を保持したまま運用画面では凍結しています。

## 1. ローカル依存関係

PowerShellで実行します。

```powershell
npm.cmd install
```

## 2. Supabaseデータベース

### Supabase CLIを使う場合（PowerShell）

プロジェクトへリンクした後、マイグレーションを適用します。

```powershell
npx.cmd supabase login
npx.cmd supabase link --project-ref YOUR_PROJECT_REF
npx.cmd supabase db push
```

### Supabase管理画面を使う場合（SQL Editor）

`supabase/migrations` 内のSQLをファイル名順にSupabase SQL Editorで実行します。

## 3. フロントエンド環境変数

`.env.example` を `.env.local` にコピーし、Supabase Project Settings → APIで確認した値を設定します。

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
```

`service_role`キーはブラウザ用ファイルへ絶対に設定しないでください。

## 4. Edge FunctionsとAI

PowerShellでGeminiキーをEdge FunctionのSecretへ登録し、利用するFunctionをデプロイします。

```powershell
npx.cmd supabase secrets set GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
npx.cmd supabase functions deploy polish-record
npx.cmd supabase functions deploy invite-member
npx.cmd supabase functions deploy manage-member
npx.cmd supabase functions deploy optimize-transport-route
npx.cmd supabase functions deploy staff-login
npx.cmd supabase functions deploy send-transport-notification
```

送迎経路最適化を利用する場合は、Google Cloudで課金を有効にしたプロジェクトにRoutes APIを追加し、Routes APIだけに制限したサーバー用APIキーをSupabase Secretへ登録します。APIキーを`.env.local`やGitHub Actionsへ登録しないでください。

```powershell
npx.cmd supabase secrets set GOOGLE_MAPS_API_KEY="YOUR_SERVER_SIDE_ROUTES_API_KEY"
npx.cmd supabase functions deploy optimize-transport-route
```

住所からのピン配置とGoogle地図表示は、Routes APIのキーと分離して設定します。詳しい制限内容と確認手順は[Google Maps地図表示の設定手順](docs/Google_Maps地図表示_設定手順.md)を参照してください。

経路候補は管理者・児発管が明示的に実行したときだけ作成します。児童名や支援記録はGoogleへ送らず、出発地点・終着地点・乗降場所だけを経路計算へ使用します。提案された経路は必ず運転者が安全性と当日の道路状況を確認してください。

AIへ児童氏名は送信されません。選択項目と職員メモだけが送信され、生成前後の内容は事業所内の監査用ログへ保存されます。利用する生成AIサービスの契約・データ利用条件は、事業所の個人情報保護規程に照らして別途確認してください。

## 5. Auth設定

Supabase AuthenticationでEmail認証を有効にし、**Allow new users to sign up** は無効にします。本番URLをSite URLとRedirect URLsへ登録してください。職員登録はアプリの「職員」画面からの招待だけで行います。DBトリガーも有効な招待がないユーザー作成を拒否します。

本番ではSupabase AuthのMFA設定も有効化してください。

## 6. GitHub Pagesへ公開

このリポジトリには、`main`ブランチへのpush時に`dist`をGitHub Pagesへ自動公開するWorkflowが含まれています。

### GitHub側の設定

1. GitHubでリポジトリを作成し、このプロジェクトを`main`ブランチへpushします。
2. リポジトリの **Settings → Secrets and variables → Actions → Variables** を開き、次のRepository variablesを登録します。
   - `VITE_SUPABASE_URL`: Supabase Project URL
   - `VITE_SUPABASE_ANON_KEY`: SupabaseのPublishable keyまたはAnon key
3. **Settings → Pages → Build and deployment → Source** で **GitHub Actions** を選択します。
4. **Actions → Deploy to GitHub Pages** の完了後、表示されたURLを携帯電話で開きます。

`service_role`キーやGemini APIキーはGitHubへ登録しないでください。Gemini APIキーはSupabase Edge FunctionのSecretにだけ保存します。

### Supabase Auth側の設定

Supabase Dashboardの **Authentication → URL Configuration** で、GitHub PagesのURLを設定します。

```text
Site URL: https://YOUR_GITHUB_NAME.github.io/YOUR_REPOSITORY/
Redirect URLs: https://YOUR_GITHUB_NAME.github.io/YOUR_REPOSITORY/**
```

この設定は職員招待メールの遷移先にも使われます。独自ドメインを使う場合は、そのURLもRedirect URLsへ追加してください。

## 7. 携帯入力

- 画面下部に固定ナビゲーションを表示します。
- 記録作成は1画面1問の形式で、進捗と質問数を表示します。
- 最初に複数児童を選択し、児童タブで入力対象を切り替えます。
- 質問をスキップでき、質問一覧と児童タブに未回答数を表示します。
- 画面ロック、アプリ切替、再読み込み後も下書きを復元します。
- 最後の確認画面から選択した児童全員の記録を保存します。
- 入力欄とボタンは、携帯で押しやすい大きさに調整されています。

## 8. 起動と検証

```powershell
npm.cmd run dev
npm.cmd run lint
npm.cmd run build
```

Supabase設定がない場合は、従来どおりLocalStorageを使った「ローカル試用モード」で起動します。ローカル試用モードは実運用には使用しないでください。

## 9. 保存・バックアップ

マイグレーションは記録を物理削除せず、監査履歴を保持する設計です。Supabase側では日次バックアップ、復元手順、保存期間経過後の削除手順を事業所の運用規程に合わせて設定してください。
