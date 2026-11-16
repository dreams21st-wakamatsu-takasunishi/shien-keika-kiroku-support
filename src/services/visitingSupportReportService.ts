import { supabase } from '../lib/supabase';
import { sortedVisitActivities, type VisitReport, type VisitReportSummary } from '../utils/visitingSupportReport';

export const VISIT_REPORT_PAGE_SIZE = 25;
export interface VisitingReportApi {
  list(org: string, child: string, offset: number, signal: AbortSignal): Promise<VisitReportSummary[]>;
  get(org: string, child: string, id: string, signal: AbortSignal): Promise<VisitReport>;
  save(report: VisitReport): Promise<VisitReport>;
}

const fields = 'id,child_id,revision,visit_date,report_date,author,destination';
function client() {
  if (!supabase) throw new Error('報告書を保存・閲覧するにはDサポートへの接続が必要です。');
  return supabase;
}
export const visitingReportApi: VisitingReportApi = {
  async list(org, child, offset, signal) {
    const { data, error } = await client().from('visiting_support_reports').select(fields)
      .eq('organization_id', org).eq('child_id', child)
      .order('visit_date', { ascending: false }).order('id', { ascending: false })
      .range(offset, offset + VISIT_REPORT_PAGE_SIZE - 1).abortSignal(signal);
    if (error) throw error;
    return data;
  },
  async get(org, child, id, signal) {
    const { data, error } = await client().from('visiting_support_reports').select(`${fields},content`)
      .eq('organization_id', org).eq('child_id', child).eq('id', id).abortSignal(signal).single();
    if (error) throw error;
    return data as VisitReport;
  },
  async save(report) {
    const { data, error } = await client().rpc('save_visiting_support_report', {
      p_id: report.id, p_child_id: report.child_id, p_expected_revision: report.revision,
      p_visit_date: report.visit_date, p_report_date: report.report_date, p_author: report.author,
      p_destination: report.destination,
      p_content: { ...report.content, timeline: sortedVisitActivities(report.content.timeline) },
    });
    if (error) throw error;
    return data as VisitReport;
  },
};
