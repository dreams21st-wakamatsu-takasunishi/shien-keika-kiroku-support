import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseDocumentSettings,parseDocumentEntry} from '../utils/childDocumentData';
test('document settings parser rejects invalid dates, months and revisions and strips unrelated metadata',()=>{
 const source={child_id:'a',revision:1,contract_date:'2024-04-15',monitoring_months:[4,10],effective_from:'2024-04-15',private:'NEVER_COPY'};
 assert.equal(JSON.stringify(parseDocumentSettings(source)).includes('NEVER_COPY'),false);
 for(const patch of [{revision:0},{revision:NaN},{contract_date:'2026-02-30'},{monitoring_months:[0]},{monitoring_months:[4,4]},{effective_from:'bad'}])assert.throws(()=>parseDocumentSettings({...source,...patch}));
});
test('document entry parser whitelists metadata and rejects malformed values',()=>{
 const source={id:'uuid',child_id:'a',document_type:'assessment',cycle_key:'annual:2024-04-15',document_date:'2024-04-16',confirmed:true,operation:'record',raw_file:'NEVER_COPY'};
 assert.equal(JSON.stringify(parseDocumentEntry(source)).includes('NEVER_COPY'),false);
 for(const patch of [{document_type:'invalid'},{confirmed:'yes'},{operation:'delete'},{document_date:'2026-02-30'},{consent_date:'bad'}])assert.throws(()=>parseDocumentEntry({...source,...patch}));
});
