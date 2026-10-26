// Build both guides from reviewable source content and synthetic screenshots.
import {readFileSync,writeFileSync,mkdirSync,copyFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),out=path.join(root,'public/manuals/d-support');
const date='2026-10-26',revision=execFileSync('git',['rev-parse','--short=7','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const guides=[
 {file:'index.html',source:'sections.json',pdf:'Dサポート_図解操作マニュアル.pdf',title:'画像付き操作ガイド',tag:'FIELD GUIDE',subtitle:'何をしたいか、から探せる。',trouble:false},
 {file:'troubleshooting.html',source:'troubleshooting.json',pdf:'Dサポート_トラブル対応ガイド.pdf',title:'トラブル対応ガイド',tag:'TROUBLESHOOTING',subtitle:'まず入力を守り、症状から確認する。',trouble:true},
];
mkdirSync(path.join(out,'images'),{recursive:true});
for(const guide of guides){
 const sections=JSON.parse(readFileSync(path.join(root,'docs/manuals',guide.source),'utf8'));
 const ids=new Set();
 for(const s of sections){
  if(!/^[a-z0-9-]+$/.test(s.id)||ids.has(s.id)||s.steps.length!==3||s.flow.length!==3||!s.note||!s.route)throw Error('Invalid section: '+s.id);
  ids.add(s.id);
  const target=path.join(out,'images',s.image+'.png'),newCapture=path.join(root,'output/playwright','guide-2026-10-15-'+s.image+'.png');
  if(!process.argv.includes('--keep-images')&&existsSync(newCapture))copyFileSync(newCapture,target);
  if(!existsSync(target))throw Error('Missing synthetic screenshot: '+s.image);
 }
 const groups=[...new Set(sections.map(s=>s.group))];
 const toc=groups.map(group=>'<div class="toc-group"><h3>'+escape(group)+'</h3><ul>'+sections.filter(s=>s.group===group).map(s=>'<li><a href="#'+s.id+'">'+(sections.indexOf(s)+1)+'. '+escape(s.title)+'</a></li>').join('')+'</ul></div>').join('');
 const pages=sections.map((s,i)=>'<section class="manual-page" id="'+s.id+'" data-search="'+escape([s.group,s.title,s.route,...s.steps,s.note].join(' '))+'">'+
  '<div class="eyebrow">'+escape(s.group)+'<span>'+String(i+1).padStart(2,'0')+' / '+sections.length+'</span></div>'+
  '<h2>'+escape(s.title)+'</h2><p class="route">開く場所：'+escape(s.route)+'</p>'+
  '<figure><button class="image-zoom" aria-label="'+escape(s.title)+'の画面例を拡大"><img src="images/'+s.image+'.png" alt="'+escape(s.title)+'の操作画面例" loading="lazy"></button>'+
  '<figcaption>架空データの操作画面例。'+(guide.trouble?'症状そのものの再現ではない画像も含みます。':'端末・権限により表示が異なります。')+'画像を選ぶと拡大できます。</figcaption></figure>'+
  '<div class="flow" aria-label="操作の流れ">'+s.flow.map((f,n)=>'<div><b>'+(n+1)+'</b>'+escape(f)+'</div>'+(n<2?'<span aria-hidden="true">→</span>':'')).join('')+'</div>'+
  '<ol class="steps">'+s.steps.map(step=>'<li>'+escape(step)+'</li>').join('')+'</ol>'+
  '<p class="note"><b>'+(guide.trouble?'注意・相談する目安':'確認ポイント')+'</b><br>'+escape(s.note)+'</p>'+
  (s.id==='install'?'<p class="source-links">端末操作の参考：<a href="https://support.apple.com/ja-jp/guide/iphone/iphea86e5236/ios">Apple公式ガイド</a> ／ <a href="https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DAndroid&amp;hl=ja">Google Chrome公式ガイド</a>（確認日 '+date+'）</p>':'')+
  '<p class="page-footer">Dサポート '+guide.title+' · '+date+' · '+(i+3)+'</p></section>').join('');
 const other=guides.find(g=>g!==guide);
 const safety=guide.trouble?'保存できないときも、入力を消す前に確認します。サイトデータ・アプリ・下書きの削除を最初の対処にしません。':'自分の職員名、対象の日付、児童・職員・便、保存結果を確認します。';
 const html='<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="Dサポートの画像付き・検索できる職員向けガイド"><title>Dサポート '+guide.title+'</title><link rel="stylesheet" href="manual.css"></head><body class="'+(guide.trouble?'troubleshooting':'operations')+'">'+
 '<header class="toolbar"><a href="#top">Dサポート '+guide.title+'</a><a href="'+other.file+'">'+other.title+'へ</a><label>項目を検索<input type="search" id="search" placeholder="'+(guide.trouble?'例：保存、QR、403、通信':'例：配車、記録、シフト、研修')+'"></label><button id="reset">すべて表示</button><a href="'+guide.pdf+'" download>PDFを保存</a><button id="print">印刷</button></header>'+
 '<main><section id="top" class="cover"><p class="eyebrow">D SUPPORT / '+guide.tag+'</p><h1>Dサポート<br>'+guide.title+'</h1><p class="subtitle">'+guide.subtitle+'</p>'+
 '<div class="cover-flow">'+(guide.trouble?'<div>入力を守る</div><span>→</span><div>症状を確認</div><span>→</span><div>安全に対処</div>':'<div>機能を探す</div><span>→</span><div>入力・確認</div><span>→</span><div>保存・共有</div>')+'</div>'+
 '<p>'+sections.length+'項目／画面画像付き／検索・画像拡大・PDF保存</p>'+
 '<div class="cover-notice"><b>このガイドの使い方</b><p>'+safety+'</p><p>'+date+'に現行ソース（'+revision+'からの更新を含む）と説明用画面を照合。画像は架空の児童・職員のデータを使用しています。実在の個人情報・有効なQR・合言葉は掲載していません。</p>'+
 '<p>2026-10-26更新：指導案の左右プレビュー、交通費計算の小窓、法定研修の完了操作を反映。ブラウザー版・配布PDFを同じ内容で更新しています。支援記録の入力画面は従来表示です。</p>'+
 '<p>機能の表示・編集可否は役職、追加権限、端末種別、サーバー設定で異なります。画像は操作説明用で、本番の認証・保存テストを示すものではありません。</p>'+
 '<p>'+(guide.trouble?'安全に関わる場合は事業所の緊急連絡手順を優先します。解消しない場合は発生日時・操作・エラー履歴を管理者へ。':'各項目は「開く場所 → 画像 → 3つの手順 → 確認ポイント」の順です。クラウド保存、自動取得、作品承認、打刻は別の処理です。')+'</p></div>'+
 '<p class="version">作成日：'+date+'／対象ソース：'+revision+'／実機・運用規程による確認は別途必要</p></section>'+
 '<nav class="contents" aria-label="目次"><p class="eyebrow">CONTENTS</p><h2>'+(guide.trouble?'症状から探す':'目的から探す')+'</h2><p>見出しを選ぶと該当の説明へ移動します。PDFでも目次リンクが使えます。</p><div class="toc-columns">'+toc+'</div><div class="tips"><b>'+(guide.trouble?'相談時に控えること':'使い始める前に')+'</b><p>'+(guide.trouble?'発生日時／画面名／直前の操作／期待した動作と実際の動作／通信状況。写真を渡すときは個人情報・QR・認証情報を隠します。':'共有端末と個人端末を使い分けます。保育所等訪問支援は種別・サービス選択のみ、個別支援計画は凍結中です。アプリに表示されない未提供機能を本書は案内しません。')+'</p></div></nav>'+
 '<p id="search-status" class="screen-only" role="status" aria-live="polite"></p>'+pages+
 '</main><dialog id="zoom"><button id="close-zoom" aria-label="画像の拡大を閉じる">閉じる</button><img alt="拡大した操作画面例"></dialog><script src="manual.js"></script></body></html>';
 writeFileSync(path.join(out,guide.file),html);
 console.log('Built '+guide.file+': '+sections.length+' illustrated sections');
}
