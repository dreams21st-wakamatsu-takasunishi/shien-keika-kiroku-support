import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import '../../src/index.css';
import {LessonLearningManager} from '../../src/components/LessonLearningManager';

const childrenList = [
  {id:'child-ui-a',name:'架空児童 あおい'},
  {id:'child-ui-b',name:'架空児童 ひなた'},
  {id:'child-ui-unlinked',name:'架空児童 未連携'},
];
function Fixture() {
  const [scopeKey,setScopeKey] = useState('fixture-admin');
  return <main className="min-h-screen bg-white p-4 text-slate-950">
    <button type="button" onClick={()=>setScopeKey('fixture-readonly')} className="mb-4 border p-2">試験用：職員切替</button>
    <LessonLearningManager childrenList={childrenList} remoteMode={true} scopeKey={scopeKey}/>
  </main>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Fixture/></React.StrictMode>);
