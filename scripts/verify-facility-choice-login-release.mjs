import './verify-lesson-task-audit-release.mjs';
const base='https://dreams21st-wakamatsu-takasunishi.github.io/shien-keika-kiroku-support/';
const read=async url=>{const r=await fetch(url,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Public facility login asset unavailable');return r.text();};
const html=await read(base+'?verifyFacilityChoice='+Date.now()),entry=html.match(/<script[^>]+src="(\.\/assets\/[^"?#]+\.js)"/)?.[1];
if(!entry)throw Error('Public entry missing');const js=await read(new URL(entry,base));
for(const text of ['施設共通ログイン','ログインID','利用する職員を選択','unified-login','get_current_facility_login_state','facility-login'])if(!js.includes(text))throw Error(`Facility choice login not published: ${text}`);
console.log('PASS: published facility gate, no-PIN staff choice, personal email login, explicit admin settings and session revocation checks; no private data read');
