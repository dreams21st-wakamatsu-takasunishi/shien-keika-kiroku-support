# Google Maps地図表示の設定手順

送迎地点マップは、Google Maps JavaScript APIの地図上へGoogle Geocoding APIで取得した位置を表示します。公開設定がない場合は、住所の自動変換を停止し、手動配置用の代替地図へ切り替わります。

## 1. Google Cloud

1. `Maps JavaScript API` と `Geocoding API` を有効にします。
2. JavaScript用の本番Map IDを作成します。
3. ブラウザ表示用APIキーを作成し、次のように制限します。
   - アプリケーションの制限: ウェブサイト
   - 許可するリファラー: `https://dreams21st-wakamatsu-takasunishi.github.io/*`
   - APIの制限: Maps JavaScript APIのみ
4. サーバー用Geocoding APIキーを別に作成し、APIの制限をGeocoding APIだけにします。
5. Routes APIで使用中のキーは、ブラウザ表示用キーへ流用しません。
6. Google Cloudの割り当てで日次上限を設定し、請求先アカウントへ予算アラートを作成します。

## 2. Supabase

PowerShellでサーバー用Geocoding APIキーと、アプリ側の日次照会上限を登録します。

```powershell
Set-Location -LiteralPath 'C:\Users\conta\Desktop\支援経過記録作成サポート'

npx.cmd supabase secrets set GOOGLE_GEOCODING_API_KEY="サーバー用Geocoding APIキー" GEOCODING_DAILY_LIMIT="500"
npx.cmd supabase functions deploy geocode-transport-locations
```

`GOOGLE_GEOCODING_API_KEY`はGitHub Actionsや`.env.local`へ入れません。未登録の場合は既存の`GOOGLE_MAPS_API_KEY`を一時的に使用できますが、用途別のキー分離を推奨します。

## 3. GitHub Actions

ブラウザ用APIキーはRepository secret、Map IDはRepository variableへ登録します。

```powershell
gh secret set VITE_GOOGLE_MAPS_BROWSER_KEY
gh variable set VITE_GOOGLE_MAPS_MAP_ID --body "本番用Map ID"
```

`gh secret set`実行後に表示される入力欄へ、ウェブサイト制限済みのブラウザ用APIキーを貼り付けます。登録後、`main`のDeploy workflowを再実行します。

## 4. 動作確認

- 送迎マップにGoogleロゴとGoogleの著作権表示が出る
- 「Google地図の公開設定が未完了」の警告が出ない
- 住所から位置を更新すると確認画面が出る
- 学校・自宅のピンが登録住所へ配置される
- 同じ住所は1つの位置へまとめられる
- ピン選択で優先配車範囲を色分けできる
- 住所変更後に古い位置が使われず、再取得される
- Googleで取得した緯度・経度は30日で破棄され、必要時に再取得される
- API上限到達時は手動配置を案内し、それ以上自動照会しない

## 5. 個人情報と運用

住所の自動配置では、登録住所がGoogle Maps Platformへ送信されます。利用目的、外部送信先、保存期間、閲覧権限を事業所の個人情報保護規程へ明記し、管理者・児発管以外には位置編集権限を付与しないでください。
