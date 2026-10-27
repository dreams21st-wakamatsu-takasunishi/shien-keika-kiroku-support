export const AI_POLICY_VERSION=1;
export const AI_PREVIEW_REQUIRED='AI送信前の確認が必要です。もう一度プレビューを作成してください。';
type PolicyClient={rpc:(name:string)=>PromiseLike<{data:any;error:any}>};
export async function requireExternalAiPolicy(client:PolicyClient){
 const {data,error}=await client.rpc('get_external_ai_policy');
 if(error||data?.enabled!==true||data.policyVersion!==AI_POLICY_VERSION||!Number.isSafeInteger(data.revision)||data.revision<1)throw Error('外部AIは停止中です。管理者が「AI要約の文章設定」で契約・取扱条件を確認して許可してください。');
 return data.revision as number;
}
/** Defense in depth, not a claim of statutory anonymization. Human review remains mandatory. */
export function redactAiText(value:string,identifiers:string[]=[]){
 let text=value.normalize('NFKC');
 const known=[...new Set(identifiers.flatMap(s=>s?[s.normalize('NFKC'),s.normalize('NFKC').replace(/\s/g,'')]:[]))].filter(s=>s.length>=2).sort((a,b)=>b.length-a.length);
 for(const word of known){const pattern=Array.from(word.replace(/\s/g,'')).map(c=>c.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('[\\s　]*');text=text.replace(new RegExp(pattern,'giu'),'[識別情報]');}
 return text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[メール非表示]')
 .replace(/(?:\+81[-\s]?)?0\d{1,4}[-\s]\d{1,4}[-\s]\d{3,4}\b|\b0\d{9,10}\b/g,'[電話非表示]')
 .replace(/〒?\d{3}-\d{4}/g,'[郵便番号非表示]')
 .replace(/(?:生年月日|誕生日)\s*[:：]?\s*(?:\d{4}[年/.-]\d{1,2}[月/.-]\d{1,2}日?)/g,'生年月日：[非表示]')
 .replace(/(?:東京都|北海道|京都府|大阪府|[^\s、。:：]{2,3}県)[^\n、。]{0,80}?(?:\d+丁目|\d+番地|\d+-\d+)(?:[-\d号室 ]*)/g,'[住所非表示]');
}
const bytes=new TextEncoder();
async function proofSignature(message:string,secret:string){const key=await crypto.subtle.importKey('raw',bytes.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,bytes.encode(message))),b=>b.toString(16).padStart(2,'0')).join('');}
/** Proof is bound to exact prompt, actor, organization, operation and policy revision; no body is stored. */
export async function makeAiPreview(text:string,scope:string,secret:string,now=Date.now()){
 const expires=now+120000;return {text,token:`${expires}.${await proofSignature(`${scope}\n${expires}\n${text}`,secret)}`};
}
export async function verifyAiPreview(token:unknown,text:string,scope:string,secret:string,now=Date.now()){
 if(typeof token!=='string'||!/^\d{13}\.[a-f0-9]{64}$/.test(token))return false;
 const [time,signature]=token.split('.'),expires=Number(time);if(expires<now||expires>now+120000)return false;
 const expected=await proofSignature(`${scope}\n${expires}\n${text}`,secret);let difference=0;for(let i=0;i<expected.length;i++)difference|=expected.charCodeAt(i)^signature.charCodeAt(i);return difference===0;
}
