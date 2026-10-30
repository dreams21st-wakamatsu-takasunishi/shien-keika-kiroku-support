// Public assets and a malformed unauthenticated request only. No account login.
import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
const expected=process.argv[2];if(!/^[a-f\d]{7,40}$/.test(expected||''))throw Error('Expected commit required');
const base='https://dreams21st-wakamatsu-takasunishi.github.io/shien-keika-kiroku-support/';
const get=async path=>{const r=await fetch(new URL(path,base),{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Public asset unavailable: '+r.status);return r;};
const version=await (await get('version.json?unified='+Date.now())).json();if(!version.version.startsWith(expected))throw Error('Published version mismatch');
const html=await (await get('?unified='+Date.now())).text(),entry=html.match(/<script[^>]+src="(\.\/assets\/[^"?#]+\.js)"/)?.[1];if(!entry)throw Error('Entry missing');
const js=await (await get(entry)).text();
for(const marker of ['unified-login','ログインID','初回の事業所設定・事業所を変更','利用する職員を選択','本人用QRでログイン'])if(!js.includes(marker))throw Error('Login marker missing: '+marker);
for(const retired of ['従来の個人職員IDログイン','管理者・教室長・児発管のメールログイン'])if(js.includes(retired))throw Error('Old method chooser still published');
const guide=await (await get('manuals/d-support/index.html')).text();if(!guide.includes('方式の切り替えは不要です'))throw Error('Manual stale');
const sha=bytes=>createHash('sha256').update(Buffer.from(bytes)).digest('hex');
if(sha(await (await get('manuals/d-support/images/auth.png')).arrayBuffer())!==sha(readFileSync('public/manuals/d-support/images/auth.png')))throw Error('Screenshot mismatch');
const env=readFileSync('.env.local','utf8'),anon=env.match(/^VITE_SUPABASE_ANON_KEY\s*=\s*(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g,'');if(!anon)throw Error('Public key unavailable');
const api=await fetch('https://cyqrxhknpboidvetdfgn.supabase.co/functions/v1/unified-login',{method:'POST',headers:{apikey:anon,'Content-Type':'application/json'},body:JSON.stringify({loginId:'',password:'',deviceToken:'invalid'})});
if(api.status!==400||typeof (await api.json()).error!=='string')throw Error('Unified API not responding as expected');
console.log(JSON.stringify({passed:true,version:version.version,unifiedLoginPublished:true,oldChoosersRemoved:true,manualAndScreenshotPublished:true,apiResponding:true,realAccountLogins:0,realRecordWrites:0}));
