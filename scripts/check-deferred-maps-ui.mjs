import {spawnSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
const args=process.argv.slice(2),cli=args[args.indexOf('--cli')+1];
const url=args.includes('--url')?args[args.indexOf('--url')+1]:'http://127.0.0.1:3014/tests/fixtures/deferred-map.html';
const target=new URL(url);
if(!args.includes('--cli')||!['localhost','127.0.0.1'].includes(target.hostname)||target.pathname!=='/tests/fixtures/deferred-map.html')throw Error('Local fixture and CLI required');
mkdirSync('output/playwright',{recursive:true});
const session=`deferred-map-${process.pid}-${Date.now()}`;
function command(...args){const result=spawnSync(process.execPath,[resolve(cli),`-s=${session}`,...args],{encoding:'utf8',timeout:180000,maxBuffer:4194304});if(result.status!==0||result.stdout.includes('### Error'))throw Error(result.stdout+result.stderr);return result.stdout;}
async function check(page,url){
 const assert=(ok,label)=>{if(!ok)throw Error(label);};
 const requests=[];let navigations=0;
 page.on('request',request=>requests.push(request.url()));
 // No child records, Google calls, tile servers, or production APIs.
 await page.context().route('https://**',route=>route.abort());
 await page.context().route('**/src/components/DailyTransportMiniMap.tsx*',async route=>{await new Promise(resolve=>setTimeout(resolve,500));await route.continue();});
 await page.goto(url);await page.getByLabel('配車メモ',{exact:true}).waitFor();
 page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations++;});
 const loaded=name=>requests.some(request=>request.includes(`/src/components/${name}.tsx`));
 assert(!loaded('DailyTransportMiniMap')&&!loaded('TransportMapPanel')&&!loaded('GoogleTransportMap'),'no map modules at startup');
 await page.getByLabel('配車メモ',{exact:true}).fill('未保存の配車入力');
 await page.getByLabel('迎え時刻',{exact:true}).fill('15:20');
 await page.getByRole('button',{name:'ミニマップを表示',exact:true}).click();
 await page.getByRole('status').filter({hasText:'ミニマップを読み込み中'}).waitFor();
 await page.getByLabel('配車メモ',{exact:true}).fill('読み込み中も入力継続');
 await page.getByRole('heading',{name:'本日の迎え先ミニマップ',exact:true}).waitFor();
 assert(loaded('DailyTransportMiniMap')&&!loaded('TransportMapPanel'),'mini loads independently of settings map');
 assert(await page.getByLabel('配車メモ',{exact:true}).inputValue()==='読み込み中も入力継続','draft preserved while loading');
 assert(await page.getByLabel('迎え時刻',{exact:true}).inputValue()==='15:20','time preserved');
 await page.getByRole('button',{name:'地図を収納',exact:true}).click();
 await page.getByRole('button',{name:'読み込み失敗試験',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'試験地図を読み込めませんでした'}).waitFor();
 await page.getByLabel('配車メモ',{exact:true}).fill('失敗中にも入力したメモ');
 await page.getByRole('button',{name:'試験地図の読み込みを再試行',exact:true}).click();
 await page.getByRole('status').filter({hasText:'再試行完了：失敗中にも入力したメモ'}).waitFor();
 assert(await page.getByLabel('迎え時刻',{exact:true}).inputValue()==='15:20','retry does not remount owning form');
 await page.getByRole('button',{name:'送迎地点の地図を表示',exact:true}).click();
 await page.getByRole('heading',{name:'送迎地点とエリア',exact:true}).waitFor();
 assert(loaded('TransportMapPanel'),'settings map loaded on demand');
 await page.setViewportSize({width:390,height:844});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile no overflow');
 await page.screenshot({path:'output/playwright/deferred-map-mobile.png',fullPage:true});
 assert(navigations===0,'opening/loading/retry never reloads editing page');
 await page.goto(url+'?closing=true');navigations=0;
 await page.getByLabel('配車メモ',{exact:true}).fill('待機中に収納しても保持');
 await page.getByRole('button',{name:'ミニマップを表示',exact:true}).click();
 await page.getByRole('status').filter({hasText:'ミニマップを読み込み中'}).waitFor();
 await page.getByRole('button',{name:'地図を収納',exact:true}).click();
 await page.waitForTimeout(800);
 assert(await page.getByRole('heading',{name:'本日の迎え先ミニマップ',exact:true}).count()===0,'late load cannot reopen a closed map');
 assert(await page.getByLabel('配車メモ',{exact:true}).inputValue()==='待機中に収納しても保持'&&navigations===0,'closing pending map keeps editing state');
 // An actual failed chunk download is isolated, too. A fresh document resets
 // the native module cache; retry remains best-effort if the browser caches it.
 await page.context().unroute('**/src/components/DailyTransportMiniMap.tsx*');
 await page.context().route('**/src/components/DailyTransportMiniMap.tsx*',route=>route.abort());
 await page.goto(url);navigations=0;
 await page.getByLabel('配車メモ',{exact:true}).fill('通信失敗でも保持');
 await page.getByRole('button',{name:'ミニマップを表示',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'ミニマップを読み込めませんでした'}).waitFor();
 assert(await page.getByLabel('配車メモ',{exact:true}).inputValue()==='通信失敗でも保持','failed chunk preserves draft');
 assert(navigations===0,'failed chunk never refreshes page');
 await page.getByRole('button',{name:'地図を収納',exact:true}).click();
 assert(await page.getByLabel('配車メモ',{exact:true}).inputValue()==='通信失敗でも保持','map can close after failure');
 // Repeat isolation against the actual dispatch screen, not only a probe form.
 await page.goto(url+'?planner=true');navigations=0;
 const time=page.locator('input[type=time]').first(),driver=page.locator('select').filter({has:page.locator('option[value="fictional-driver"]')}).first();
 await time.fill('15:25');await driver.selectOption('fictional-driver');
 await page.getByRole('button',{name:'ミニマップを表示',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'ミニマップを読み込めませんでした'}).waitFor();
 assert(await time.inputValue()==='15:25'&&await driver.inputValue()==='fictional-driver','actual dispatch time and driver survive failed map');
 await time.fill('15:35');
 await page.getByRole('button',{name:'ミニマップを収納',exact:true}).click();
 assert(await time.inputValue()==='15:35'&&await driver.inputValue()==='fictional-driver','actual dispatch stays editable after map failure');
 assert(navigations===0,'actual dispatch never refreshes automatically');
 await page.setViewportSize({width:1280,height:900});
 await page.screenshot({path:'output/playwright/deferred-map-dispatch-desktop.png',fullPage:false});
 return {passed:true,cases:16,syntheticDataOnly:true,mapsDeferred:true,draftPreserved:true,dispatchFormPreserved:true,automaticReloads:0};
}
try{command('open',url);command('snapshot');const out=command('run-code',`async(page)=>await (${check.toString()})(page,${JSON.stringify(url)})`),match=out.match(/### Result\s+([\s\S]*?)\s+### Ran/);if(!match||!JSON.parse(match[1]).passed)throw Error(out);console.log(match[1]);}finally{command('close');}
