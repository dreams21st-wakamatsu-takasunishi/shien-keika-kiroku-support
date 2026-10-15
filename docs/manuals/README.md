# Dサポート 図解操作マニュアル

更新日：2026-10-15。画像付き操作63項目とトラブル対応22項目。配車の時刻マーカー・小窓、学習進捗・アカウント・課題一括指定／変更、研修設定、事業所種別、保存復旧・エラー履歴に対応。右上の職員名からのユーザー切り替えと、管理者・児発管専用の契約日・保管書類管理の手順を追加。

同日・本人の入力画面の再利用、「この画面に児童を追加」、明示確認による自分の下書き統合の手順を追記。統合前の未同期入力・重複検出時は停止する。記録選択の画像は `check-record-entry-ui.mjs` の架空データで撮影する。

## 構成

- 本文：`sections.json`（操作63項目）、`troubleshooting.json`（症状別22項目）
- ブラウザ版：`public/manuals/d-support/index.html`
- トラブル対応ブラウザ版：`public/manuals/d-support/troubleshooting.html`
- 操作PDF：`public/manuals/d-support/Dサポート_図解操作マニュアル.pdf`（65ページ）
- トラブルPDF：`public/manuals/d-support/Dサポート_トラブル対応ガイド.pdf`（24ページ）
- 指導案出力見本：`output/pdf/指導案_表形式サンプル.pdf`

検索、目次リンク、画面画像の拡大に対応。各画面の「操作マニュアル」「困ったとき」から、その画面に対応する章を別タブで開く。「関連手順」で同じ機能の別の手順も選べる。設定・学習・出勤予定・連絡のタブに合わせてリンク先を切り替える。これは、2026-10-15の各画面から開く依頼に基づく新しい導線であり、旧操作ガイドの再導入ではない。
リンク先は固定の公開HTMLと章IDだけで構成し、児童名、職員名、記録本文、研修URL、認証情報はURLへ含めない。閲覧だけでは保存・認証・設定変更を実行しない。
画像は現行のReactコンポーネントにサンプルデータを渡した、隔離したローカル画面で撮影したもの。
サーバー接続が必要な機能について、画面図は入口または共通表示部分であり、本番の認可・保存動作の検証を示すものではない。

## 更新手順

1. 変更された機能の画面をサンプルデータで再撮影する。`scripts/Preview-Operations.ps1 -NoOpen`でローカルサーバーを起動。`node scripts/capture-guide-screens.mjs --cli <playwright-cli.js>`は隔離されたfixtureを撮影する。学習進捗・一括指定・一括変更は、それぞれの`check-lesson-progress-ui.mjs`、`check-lesson-task-batches-ui.mjs`、`check-lesson-task-batch-changes-ui.mjs`の架空データで撮影済み画像も使う。実在児童・住所・QRトークンを含めない。
2. `sections.json` のボタン名・手順をソースと照合して修正する。
3. `node scripts/build-illustrated-manual.mjs`で両方のブラウザ版を生成する。新しい撮影画像は`output/playwright/guide-2026-10-15-*.png`を優先し、変更のない既存項目は配布済みの確認用画像を再利用する。CSSとJSは`public/manuals/d-support/manual.css`と`manual.js`で共通管理する。
4. `node scripts/check-illustrated-manual-ui.mjs --cli <playwright-cli.js>`で両ガイドの検索・目次・画像拡大・読み込み・390px表示を確認し、クリック可能な目次・アウトライン付きA4縦PDFへ出力する（開発サーバーは3014番）。
5. `pdftoppm -r 65 -png public/manuals/d-support/Dサポート_図解操作マニュアル.pdf output/pdf/manual-current/page`で操作PDFの全ページを画像化する。トラブルPDFも同様に`output/pdf/troubleshooting-current/page`へ画像化する（出力フォルダは事前に作成）。`python scripts/check-illustrated-manual-pdf.py`で両冊の全文・画像・目次リンク・アウトラインを照合し、全ページの一覧画像と主要ページを目視確認する。PythonにはpypdfとPillowが必要。
6. 本番反映の承認を得てから、アプリ更新と一緒に公開する。
7. 画面のマニュアル導線を変更した場合は、`node scripts/check-contextual-manual-links-ui.mjs --cli <playwright-cli.js>`で章の切替、別タブ、入力保持、スマホ、印刷、配車モーダルを確認する。公開後は`node scripts/verify-contextual-manuals-release.mjs <コミット短縮ID>`でバージョン・リンク・画像・PDFの一致を確認する。

## 指導案の互換性

追加項目は既存JSON内の任意項目。旧指導案は追加項目がなくても読み込める。
旧データの人数や往復時間を推測で埋めない。従来の文章コピー・複製・保存時の競合確認も維持する。
段階・人数等は画面編集、下書き、共有保存、文章コピー、表形式のプレビュー・印刷に反映する。
12行を超える流れや長文は続きのページに出力し、役割・配慮・安全確認は補足として保持する。
データベースのテーブル追加・既存データ削除は行わない。
