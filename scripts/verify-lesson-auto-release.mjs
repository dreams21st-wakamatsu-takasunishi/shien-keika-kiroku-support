// Read-only verification of the public release. Does not log in or read records.
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
const js=await (await read(entry)).text();
for(const text of ['Dレッスンの実績を自動反映','最新の実績を再取得','保存済み記録は自動変更しません。',
 '取り込み済みの実績がDレッスン側で変更されています。','学習連携が変更されました。再取得してください。',
 'Dレッスンの記録への書き出し','自動反映：','dLessonHistoryEvidence',
 '要点にまとめる','実績をすべて記載','取り込んだ実績の詳細（',
 // Unknown-result labels are composed at runtime; literal bundle checks use
 // their stable metric controls and outcome label instead. Unit tests cover output.
 'dLessonSummaryMode','正確率（%）','入力文字数','完了状況未確認','課題名・完了状況・正確率・文字数をまとめます。',
 '取り組んだ練習（複数選択可）','保存済みの詳細手入力（','dLessonManualExercises',
 '日付を選んで実績を取得・追加','実績の取得日','実績の日付は記録日から3日前までを選択してください。',
 'recordDate','実施の実績：','前回の支援の振り返り','支援記録の要点（抜粋）',
 '振り返りの児童を検索','元の記録を確認','この日の支援記録はありません。',
 '事業所種別を保存','保育所等訪問支援も利用する','organization_service_settings','visiting_support_enabled']){
 if(!js.includes(text))throw Error(`Feature absent: ${text}`);
}
let assets=0;
for(const path of manifest.assets.filter(path=>/\.(js|css|mjs)$/.test(path))){
 if(!/^\.\/assets\/[A-Za-z0-9_.-]+$/.test(path))throw Error('Unexpected asset path');
 await read(path);assets++;
}
console.log(JSON.stringify({version:version.version,automaticLessonImportIncluded:true,taskResultsIncluded:true,legacyManualInputIncluded:true,threeDayHistoryIncluded:true,morningSupportRecapIncluded:true,visitingServiceSelectionIncluded:true,runtimeAssetsResponding:assets,readsPrivateData:false}));
