import type { ChildProfile } from '../types';
import { childCareTypes, VISITING_SERVICE } from './careServices';
import { validDocumentDate } from './childDocuments';

export interface VisitActivity {
  startTime: string;
  endTime: string;
  activity: string;
  observation: string;
  notes: string;
}

export interface VisitReportContent {
  childName: string;
  sex: string;
  affiliation: string;
  timeline: VisitActivity[];
  summary: string;
  nextSupport: string;
}

export interface VisitReportSummary {
  id: string;
  child_id: string;
  revision: number;
  visit_date: string;
  report_date: string;
  author: string;
  destination: string;
}

export interface VisitReport extends VisitReportSummary {
  content: VisitReportContent;
}

export const MAX_VISIT_ACTIVITIES = 30;
export const newVisitActivity = (): VisitActivity =>
  ({ startTime: '', endTime: '', activity: '', observation: '', notes: '' });

export function visitingReportChildren(children: ChildProfile[]): ChildProfile[] {
  return children.filter(child => childCareTypes(child).includes(VISITING_SERVICE));
}

export function newVisitReport(child: ChildProfile, author: string, today: string, id: string): VisitReport {
  return {
    id, child_id: child.id, revision: 0, visit_date: today, report_date: today,
    author, destination: child.schoolName?.trim() ?? '',
    content: {
      childName: child.name, sex: child.sex?.trim() ?? '', affiliation: child.schoolClass?.trim() ?? '',
      timeline: [newVisitActivity()], summary: '', nextSupport: '',
    },
  };
}

export const hasVisitActivity = (row: VisitActivity) => Object.values(row).some(value => value.trim());

export function sortedVisitActivityEntries(rows: VisitActivity[]) {
  return rows.map((row, index) => ({row, index})).filter(({row}) => hasVisitActivity(row)).sort((a, b) =>
    (a.row.startTime || '24:00').localeCompare(b.row.startTime || '24:00'));
}
export function sortedVisitActivities(rows: VisitActivity[]) {
  return sortedVisitActivityEntries(rows).map(({row}) => row);
}

const validTime = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
export function validateVisitReport(report: VisitReport): string | null {
  if (!validDocumentDate(report.visit_date) || !validDocumentDate(report.report_date)) return '訪問日と作成日を入力してください。';
  if (report.report_date < report.visit_date) return '作成日は訪問日以降に設定してください。';
  if (!report.author.trim() || !report.destination.trim()) return '作成者と訪問先を入力してください。';
  if (!report.content.childName.trim()) return '利用者氏名を確認してください。';
  const rows = report.content.timeline;
  if (!rows.some(hasVisitActivity)) return '訪問時の活動内容を1件以上入力してください。';
  if (rows.length > MAX_VISIT_ACTIVITIES) return '活動の記録は30件までです。';
  for (const [index, row] of rows.entries()) {
    if (!hasVisitActivity(row)) continue;
    if (!validTime.test(row.startTime) || !row.activity.trim()) return `${index + 1}件目の開始時刻と活動内容を入力してください。`;
    if (row.endTime && (!validTime.test(row.endTime) || row.endTime < row.startTime)) return `${index + 1}件目の終了時刻を確認してください。`;
  }
  return null;
}

const japaneseDate = new Intl.DateTimeFormat('ja-JP-u-ca-japanese', {
  era: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Tokyo',
});
export function visitReportPrintDate(value: string): string {
  return validDocumentDate(value) ? japaneseDate.format(new Date(`${value}T03:00:00Z`)) : '—';
}
