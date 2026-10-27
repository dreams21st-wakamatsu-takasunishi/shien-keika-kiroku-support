// Public app assets only: never signs in, reads training data or opens provider URLs.
import {publishedRuntime} from './published-runtime.mjs';
const expected=process.argv[2];
if(!/^[a-f0-9]{7,40}$/.test(expected||''))throw Error('Expected commit is required');
const base='https://dreams21st-wakamatsu-takasunishi.github.io/shien-keika-kiroku-support/';
const stamp=Date.now();
async function read(path){
 const response=await fetch(new URL(path,base),{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error(`Public resource failed: ${response.status} ${path}`);
 return response;
}
const version=await (await read(`version.json?verify=${stamp}`)).json();
if(!version.version.startsWith(`${expected}.`))throw Error(`Different release: ${version.version}`);
const manifest=await (await read(`asset-manifest.json?verify=${stamp}`)).json();
if(manifest.version!==version.version)throw Error('Mixed release');
const html=await (await read(`?verify=${stamp}`)).text();
const entry=html.match(/<script[^>]+src="(\.\/assets\/[^"?#]+\.js)"/)?.[1];
if(!entry)throw Error('Entry module not found');
const js=await publishedRuntime(manifest,read);
for(const marker of ['法定研修追加','受講する職員を確認してください','現在のログイン職員','この職員で受講する',
 '別の職員で受講する（ログアウト）','本人の受講完了を保存しました。','完了を取り消しました。',
 'legal_training_categories','legal_training_videos','legal_training_progress','set_legal_training_completion',
 'add_legal_training_category','add_legal_training_video','archive_legal_training_item',
 'reorder_legal_training_items','update_legal_training_category','update_legal_training_video',
 'legal_training_settings','set_legal_training_confirmation_form','受講確認フォーム','フォームURLを保存',
 'カテゴリの表示順を保存しました。','動画の表示順を保存しました。','研修名の変更を保存','動画の変更を保存','カテゴリを削除']){
 if(!js.includes(marker))throw Error(`Feature absent: ${marker}`);
}
if(!js.includes('受講状況の自動更新ができませんでした。必要に応じて「再読込」を押してください。'))throw Error('Stable background refresh missing');
if(js.includes('外部タブを開きました。動画・資料が開かない場合は、個別のリンクを押してください。'))throw Error('Legacy two-popup handler remains');
let assets=0;
for(const path of manifest.assets.filter(path=>/\.(js|css|mjs)$/.test(path))){
 if(!/^\.\/assets\/[A-Za-z0-9_.-]+$/.test(path))throw Error('Unexpected asset path');
 await (await read(path)).arrayBuffer();assets++;
}
console.log(JSON.stringify({version:version.version,legalTrainingIncluded:true,identityConfirmationIncluded:true,completionAndUndoIncluded:true,orderingAndEditingIncluded:true,confirmationFormIncluded:true,stableBackgroundRefreshPublished:true,legacyTwoPopupHandlerRemoved:true,runtimeAssetsResponding:assets,readsTrainingData:false}));
