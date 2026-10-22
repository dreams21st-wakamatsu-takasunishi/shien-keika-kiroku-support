# セキュリティ保守・管理者確認手順

更新日: 2026-10-22

## 今回の変更

- DOMPurifyを3.4.13から3.4.17へ更新。再インストールでも修正版未満へ戻らない下限を設定。
- 開発用のViteを6.4.3から6.4.5、source-map-jsを1.2.1から1.2.2へ更新。
- GitHubのDependabot alertsとsecurity updatesを有効化。
- npmとGitHub Actionsの更新提案を週1回確認する設定を追加。
- 変更提案のテストと週1回の依存部品検査を追加。公開前にも開発用を含む依存部品の検査を実施。
- High/Criticalの既知の問題があれば検査を失敗させる。Low/Moderateも検査結果・Dependabotから確認する。
- 自動マージは無効のまま。提案を検証してから公開する。
- npmのインストール時の重複検査を省き、明示した検査工程で一度確認する。通信タイムアウト・503は検査成功として扱わず、公開を停止する。
- 検査サービスが応答しない場合のみ、1回20秒（プロセス上限30秒）・最大3回の再試行を行う。High/Criticalの報告があれば即停止し、3回とも結果不明なら公開を止める。

## 確認できた事項

- GitHub PagesのHTTPS強制が有効。
- 秘密情報の検出とpush protectionが有効。
- 児童、支援記録、下書き、ログイン職員、記録者、会議案件、活動案の主要7テーブルでRLSが有効。
- この7テーブルへの未ログインの件数確認では、参照可能なデータは0件またはアクセス拒否。内容自体は取得していない。
- GitHubリポジトリの共同管理者は1アカウント。権限の削除・変更は行っていない。

これは全テーブル・RPC・全役職の認可検証や、侵害有無の監査が完了したことを意味しない。

## 管理者本人による確認が必要

### 二段階認証

1. GitHub: <https://github.com/settings/security> を開き、二段階認証を設定する。
2. 回復コードを事業所で決めた安全な保管先へ保存する。コードをチャット・ソースコードに貼らない。
3. Supabase: <https://supabase.com/dashboard/account/security> からMFAを確認する。
4. Supabaseでは予備の認証手段も用意してから有効化する。他の管理者のログインに影響する組織単位の強制は、全管理者の設定完了後に行う。

接続中のGitHub APIでは本人の二段階認証状態が返らず、組織全体の設定確認も権限不足だった。Supabase管理アカウントのMFA状態も未確認。未設定と断定せず、設定済みなら維持する。認証アプリ・回復手段は自動作成しない。

### バックアップと復元

対象プロジェクト: <https://supabase.com/dashboard/project/cyqrxhknpboidvetdfgn>

2026-10-22の読み取り専用API確認では、バックアップ一覧がnull、PITRがfalseだった。バックアップ作成済み・復元可能とは確認できない。

1. 管理画面のDatabase → Backupsで、契約プラン、バックアップの有無・最新日時・保持期間を確認する。
2. 自動バックアップがない場合は、費用を確認して対応プランを選ぶか、暗号化した外部バックアップ運用を別途決定する。
3. 添付ファイルがある場合は、DBだけでなくStorageのファイル本体も保全対象とする。
4. 復元試験は本番とは別の隔離環境で行い、アカウント、児童・記録件数、添付ファイルの整合性を確認する。
5. 本番に対して「Restore」を試し押ししない。復元で停止やデータ巻き戻りが起きる可能性がある。

本番の復元、児童情報の新たなローカル書き出し、有料オプションの契約は今回行っていない。

### アカウント・権限

- Dサポートの「職員・アカウント管理」で、在籍と役職を管理者が照合する。退職者かどうかは自動判定しない。
- GitHub/Supabaseの共同管理者・招待・不要なアクセストークンを定期確認する。
- mainのブランチ保護は未設定。管理者が1アカウントのため、別人の承認を必須にする設定を無断で適用しない。運用担当を決めたうえで保護ルールを検討する。
- 定期検査の失敗を見逃さないよう、GitHubのActions・Dependabotの通知先を管理者が確認する。

## 更新時の手順

1. Dependabotの提案と開発元の脆弱性情報を確認する。
2. 個人情報を含まない環境で、`npm ci`、`npm run check`、`npm audit --audit-level=high`を実行する。
3. PDF関係を更新した場合は、`scripts/check-dependency-pdf-ui.mjs`で実際にPDFをダウンロードし、ページ数・表示を確認する。
4. 変更内容を確認してマージ・公開し、GitHub Actionsの成功と公開サイトの版を確認する。
5. 検査サービスが通信エラーの場合は「問題なし」と扱わず、再実行して確認する。

## 参考

- PHP公式: <https://www.php.net/archive/2026.php>
- Dependabot: <https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/configure-security-updates>
- Supabase管理者MFA: <https://supabase.com/docs/guides/platform/multi-factor-authentication>
- Supabaseバックアップ: <https://supabase.com/docs/guides/platform/backups>

今回のPHP脆弱性が直接影響するアプリ所有のPHP実行環境は見つからなかった。外部サービスの内部構成まで安全を保証するものではない。
