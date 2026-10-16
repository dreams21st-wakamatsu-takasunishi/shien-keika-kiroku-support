import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCampusContent,parseContentCampuses,parseContentItem} from '../learning/managedContent';
const org='11111111-1111-4111-8111-111111111111',project='a'.repeat(20);
const task={id:'tt_old',title:'保存済みの課題',content:'{漢字|かんじ}\nあいうえお',time:3,star:2,targetGroup:'A',hidden:false};
const theme={id:'ct_test',name:'テスト',distribution:'gacha',hidden:false,bg:'#ffffff',text:'#123456',btnBg:'#006655',btnText:'#ffffff'};
const snapshot=()=>({schemaVersion:1,dataTable:'user_data',organizationId:org,sourceProject:project,campusId:'main',revision:0,fingerprint:'a'.repeat(32),content:{textTasks:[{...task}],customThemes:[{...theme}],customEffects:[]}});
test('managed content retains task IDs, ruby, newlines, group and safe theme values',()=>{
 const v=parseCampusContent(snapshot(),'main',org);assert.deepEqual(v.content.textTasks,[task]);assert.equal(v.content.customThemes[0].id,'ct_test');
 assert.deepEqual(parseContentItem('customEffects',{id:'ce_1',name:'演出',hidden:false,distribution:'present',emojis:['⭐','🌸']}),{id:'ce_1',name:'演出',hidden:false,distribution:'present',emojis:['⭐','🌸']});
});
test('managed content rejects wrong campus, org, project/table, version and duplicate IDs',()=>{
 for(const patch of [{campusId:'foreign'},{organizationId:'22222222-2222-4222-8222-222222222222'},{sourceProject:'bad'},{dataTable:'test_user_data'},{schemaVersion:2},{revision:-1},{fingerprint:'bad'}])assert.throws(()=>parseCampusContent({...snapshot(),...patch},'main',org));
 const v=snapshot();v.content.textTasks.push(task);assert.throws(()=>parseCampusContent(v,'main',org));
 assert.throws(()=>parseCampusContent({...snapshot(),campusId:'public'},'public',org));
});
test('managed content rejects unsafe CSS, missing text and invalid timing/reward controls',()=>{
 for(const patch of [{bg:'red;url(https://example.com)'},{id:'tt_other'},{distribution:'all'}])assert.throws(()=>parseContentItem('customThemes',{...theme,...patch}));
 for(const patch of [{time:0},{time:61},{star:6},{content:' '},{targetGroup:'x'.repeat(81)},{hidden:'false'}])assert.throws(()=>parseContentItem('textTasks',{...task,...patch}));
 assert.throws(()=>parseContentItem('customEffects',{id:'ce_1',name:'演出',distribution:'gacha',hidden:false,emojis:['']}));
});
test('only distinct, non-public permitted campuses are accepted',()=>{
 const base={schemaVersion:1,dataTable:'user_data',organizationId:org,sourceProject:project};
 assert.equal(parseContentCampuses({...base,campuses:[{id:'main'}]}).campuses.length,1);
 for(const campuses of [[{id:'public'}],[{id:'main'},{id:'main'}],[{id:''}]])assert.throws(()=>parseContentCampuses({...base,campuses}));
});
