// Public assets only, no real child metadata or privileged-account operations.
import {publishedRuntime} from './published-runtime.mjs';
const expected=process.argv[2];if(!/^[a-f0-9]{7}$/.test(expected||''))throw Error('Expected short commit');
const base='https://dreams21st-wakamatsu-takasunishi.github.io/shien-keika-kiroku-support/';
async function read(path){const response=await fetch(new URL(path,base),{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error(path+': '+response.status);return response;}
const stamp=Date.now(),version=await(await read('version.json?verify='+stamp)).json(),manifest=await(await read('asset-manifest.json?verify='+stamp)).json();
if(!version.version.startsWith(expected+'.')||manifest.version!==version.version)throw Error('Old or mixed release');
const index=await(await read('?verify='+stamp)).text(),entry=index.match(/<script[^>]+src="(\.\/assets\/[^"?#]+\.js)"/)?.[1];if(!entry||!manifest.assets.includes(entry))throw Error('Missing entry');
const script=await publishedRuntime(manifest,read);for(const marker of ['契約日・保管書類の確認','get_child_document_register','save_child_document_settings','save_child_document_entry','この書類を削除','登録・訂正・削除履歴（元の情報を保持）','書類を絞り込み','契約日が未登録','保管書類のカテゴリ','契約・同意書','基本情報・アセスメント','受給者証・利用計画','個別支援計画・モニタリング','証明書・その他','最新作成日','この書類に未保存の入力があります','受給者証の期限と更新','extra:benefit-renewal-','受給者証を入力・確認','更新分には前回の期限より後'])if(!script.includes(marker))throw Error('Missing feature '+marker);
const guide=await(await read('manuals/d-support/index.html?verify='+stamp)).text();if(!guide.includes('id="child-documents"'))throw Error('Missing guide');
if(script.includes('相談支援交付日'))throw Error('Removed consultation date input still present');
for(const marker of ['未入力・未確認：','この欄へ移動','参考情報（書類不足とは別','初回書類','data-document-issue'])if(!script.includes(marker))throw Error('Missing specific consolidated alert '+marker);
for(const marker of ['extra:usage-plan-renewal-','利用計画を入力・確認','書類の更新・追加の確認案内','誕生月を手掛かりに更新時期を確認','事業所の管理目安','判定の考え方・地域差について'])if(!script.includes(marker))throw Error('Missing renewal/reminder '+marker);
const assets=manifest.assets.filter(path=>/\.(js|css|mjs)$/.test(path));await Promise.all(assets.map(async path=>{if(!/^\.\/assets\/[A-Za-z0-9_.-]+$/.test(path))throw Error('Invalid asset');await(await read(path)).arrayBuffer();}));
console.log(JSON.stringify({passed:true,version:version.version,documentRegisterPublished:true,categoryViewPublished:true,benefitExpiryRenewalPublished:true,usagePlanRenewalPublished:true,documentRemindersPublished:true,manualAvailable:true,runtimeAssetsResponding:assets.length,readsPrivateData:false,realChildDataWritten:false,realAccountOperationsVerified:false}));
