import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { VisitingReportWorkspace } from '../../src/components/VisitingReportWorkspace';
import { ChildrenManager } from '../../src/components/ChildrenManager';
import type { VisitingReportApi } from '../../src/services/visitingSupportReportService';
import type { ChildProfile, SchoolProfile } from '../../src/types';
import { newVisitActivity, sortedVisitActivities, type VisitReport } from '../../src/utils/visitingSupportReport';
import '../../src/index.css';

const child: ChildProfile = { id: 'fixture-child', name: 'サンプル児童', careType: '保育所等訪問支援', birthDate: '2018-02-01',
  schoolId: 'fixture-school', schoolName: 'サンプル小学校', sex: '男性', schoolClass: '3年1組' };
const params = new URLSearchParams(location.search);
const state = { fail: false };
Object.assign(window, { visitingReportFixture: state });
const reports = new Map<string, VisitReport>();
const api: VisitingReportApi = {
  async list(_org, id) { return [...reports.values()].filter(report => report.child_id === id); },
  async get(_org, _child, id) { return structuredClone(reports.get(id)!); },
  async save(report) {
    if (state.fail) throw { code: '40001' };
    const next = { ...report, revision: report.revision + 1, content: { ...report.content, timeline: sortedVisitActivities(report.content.timeline) } };
    reports.set(next.id, structuredClone(next));
    return next;
  },
};
if (params.has('long')) {
  const id = '11111111-1111-4111-8111-111111111111';
  reports.set(id, {
    id, child_id: child.id, revision: 1, visit_date: '2026-11-16', report_date: '2026-11-18',
    author: 'サンプル職員', destination: 'サンプル小学校',
    content: { childName: child.name, sex: child.sex!, affiliation: child.schoolClass!,
      timeline: Array.from({ length: 23 }, (_, index) => ({
        ...newVisitActivity(), startTime: `10:${String(index).padStart(2,'0')}`, activity: `活動 ${index + 1}：グループ学習`,
        observation: '絵カードを見ながら、次の手順を確認した。手順が分かると、自分から用具を用意した。\n途中で、分からないことを質問する場面もあった。',
        notes: '次の活動への切り替えに備え、事前に手順を共有した。',
      })), summary: '活動の見通しを共有すると、自分から準備に入れた。', nextSupport: '視覚的な案内を引き続き使う。' },
  });
}
function Fixture() {
  const [dirty, setDirty] = useState(false);
  const [roster, setRoster] = useState([{ ...child, schoolId: undefined, schoolName: undefined, sex: undefined, schoolClass: undefined } as ChildProfile]);
  const schools: SchoolProfile[] = [{ id:child.schoolId!, name:child.schoolName!, active:true, address:'サンプル学校の住所' }];
  return <main className="p-3 sm:p-6"><p>架空テスト：{dirty ? '編集中' : '変更なし'}</p>
    {params.has('roster') ? <ChildrenManager childrenList={roster} schools={schools} canEdit
      onAddChild={item => setRoster(previous => [...previous,item])}
      onUpdateChild={item => setRoster(previous => previous.map(row => row.id === item.id ? item : row))}
      onDeleteChild={id => setRoster(previous => previous.filter(row => row.id !== id))}/> :
      <VisitingReportWorkspace user={{ organizationId: 'fixture-org', displayName: 'サンプル職員', role: params.has('staff') ? 'staff' : 'manager' }}
        childrenList={[child]} onDirtyChange={setDirty} api={api}/>}</main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
