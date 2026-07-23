# 支援経過記録作成サポート

放課後等デイサービス・児童発達支援向けの、支援経過記録作成・児発管承認・個別支援計画・PDF出力アプリです。

## 実装済みの運用機能

- Supabase Authによるログイン
- 事業所単位のデータ分離（RLS）
- 職員・児発管・管理者の権限管理
- 職員のメール招待
- 児童名簿、記録、テンプレートの共有DB保存
- 個別支援計画と本人支援5領域の関連付け
- 承認済み記録のロックと差戻しフロー
- 全変更の監査ログ
- 論理削除、テンプレート版管理
- Supabase Edge Function経由のGemini文章作成
- A4 PDF、事業所保存用・保護者控えの2面出力

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

`supabase/migrations/202607220001_initial_schema.sql` の全内容をSupabase SQL Editorで実行します。

## 3. フロントエンド環境変数

`.env.example` を `.env.local` にコピーし、Supabase Project Settings → APIで確認した値を設定します。

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
```

`service_role`キーはブラウザ用ファイルへ絶対に設定しないでください。

## 4. Edge FunctionsとAI

PowerShellでGeminiキーをEdge FunctionのSecretへ登録し、2つのFunctionをデプロイします。

```powershell
npx.cmd supabase secrets set GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
npx.cmd supabase functions deploy polish-record
npx.cmd supabase functions deploy invite-member
```

AIへ児童氏名は送信されません。選択項目と職員メモだけが送信され、生成前後の内容は事業所内の監査用ログへ保存されます。利用する生成AIサービスの契約・データ利用条件は、事業所の個人情報保護規程に照らして別途確認してください。

## 5. Auth設定

Supabase AuthenticationでEmail認証を有効にします。本番URLをSite URLとRedirect URLsへ登録してください。最初に「事業所を新規登録」した利用者が管理者になります。以降の職員はアプリの「職員」画面から招待します。

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
- 必須項目が未入力の場合は次の質問へ進まず、その場で案内します。
- 最後の確認画面から記録を保存します。
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
