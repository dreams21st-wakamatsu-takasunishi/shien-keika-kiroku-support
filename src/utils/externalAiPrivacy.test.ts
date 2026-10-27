import {test} from 'node:test';
import assert from 'node:assert/strict';
import {redactAiText,makeAiPreview,verifyAiPreview,requireExternalAiPolicy} from '../../supabase/functions/_shared/externalAiPrivacy';
test('AI: known identifiers including whitespace variants, contact data and DOB are removed before preview',()=>{
 const text=redactAiText('架空 太郎／架 空太郎／カクウ タロウ／2016-01-01／生年月日:2016/1/1／test@example.invalid／090-1234-5678／〒807-0001／福岡県北九州市架空町2丁目1号室。行動を観察した。',['架空 太郎','カクウタロウ','2016-01-01']);
 for(const value of ['架空','カクウ','2016','test@','090-','807-','福岡県'])assert.ok(!text.includes(value),value);
 assert.ok(text.includes('行動を観察した。'));
 assert.ok(redactAiText('A+B と A.B',['A+B']).includes('[識別情報] と A.B'));
});
test('AI: proof binds exact text, operation, actor, organization, policy revision and expiry',async()=>{
 const now=1793000000000,scope='org:user:3:polish:child:abc',secret='fictional-test-secret',p=await makeAiPreview('確認した本文',scope,secret,now);
 assert.equal(await verifyAiPreview(p.token,p.text,scope,secret,now+1000),true);
 for(const changed of ['org:other:3:polish:child:abc','other:user:3:polish:child:abc','org:user:4:polish:child:abc',scope+':other'])assert.equal(await verifyAiPreview(p.token,p.text,changed,secret,now),false);
 assert.equal(await verifyAiPreview(p.token,p.text+'改変',scope,secret,now),false);
 assert.equal(await verifyAiPreview(p.token,p.text,scope,'wrong',now),false);
 assert.equal(await verifyAiPreview(p.token,p.text,scope,secret,now+120001),false);
 assert.equal(await verifyAiPreview(p.token,p.text,scope,secret,now-1),false);
 for(const token of [undefined,'','fake',p.token.slice(0,-1)+'z'])assert.equal(await verifyAiPreview(token,p.text,scope,secret,now),false);
});
test('AI: only explicit current-version organizational permission allows external calls',async()=>{
 const valid={enabled:true,revision:1,policyVersion:1};
 assert.equal(await requireExternalAiPolicy({rpc:async()=>({data:valid,error:null})}),1);
 for(const data of [null,{...valid,enabled:false},{...valid,enabled:'true'},{...valid,revision:0},{...valid,revision:1.5},{...valid,policyVersion:2}])await assert.rejects(()=>requireExternalAiPolicy({rpc:async()=>({data,error:null})}));
 await assert.rejects(()=>requireExternalAiPolicy({rpc:async()=>({data:valid,error:{code:'offline'}})}));
});
