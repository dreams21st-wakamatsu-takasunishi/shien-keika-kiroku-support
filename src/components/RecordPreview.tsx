import React, { useEffect, useState } from 'react';
import { RecordRevision, ReviewIssue, SectionAnswer, SupportRecord } from '../types';
import { PDFDocument } from './PDFDocument';
import { generatePDFFromElement } from '../utils/pdfGenerator';
import { generateRecordSummary, generateNarrativeReport } from '../utils/textGenerator';
import { Download, Printer, Copy, Edit, Check, ArrowLeft, LayoutGrid, FileText, History, Plus, Trash2 } from 'lucide-react';
import { loadRecordRevisions } from '../services/dataService';

interface RecordPreviewProps {
  record: SupportRecord;
  onEditRecord: (record: SupportRecord) => void;
  onBackToList: () => void;
  canReview?: boolean;
  defaultReviewerName?: string;
  lockReviewerName?: boolean;
  organizationId?: string;
  onUpdateApproval?: (
    recordId: string,
    comment: string,
    status: '確認済み' | '要修正',
    reviewerName: string,
    reviewIssues: ReviewIssue[]
  ) => void;
}

export const RecordPreview: React.FC<RecordPreviewProps> = ({
  record,
  onEditRecord,
  onBackToList,
  canReview = false,
  defaultReviewerName,
  lockReviewerName = false,
  organizationId,
  onUpdateApproval,
}) => {
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [isDualFormat, setIsDualFormat] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [copiedNarrative, setCopiedNarrative] = useState(false);

  // Jihatsukan Review inputs
  const [jihatsukanComment, setJihatsukanComment] = useState(
    record.jihatsukanComment || ''
  );
  const [reviewerName, setReviewerName] = useState(
    record.reviewedBy || defaultReviewerName || '児童発達支援管理責任者'
  );
  const [reviewIssues, setReviewIssues] = useState<ReviewIssue[]>(record.reviewIssues || []);
  const [issueLabel, setIssueLabel] = useState('記録全体');
  const [issueComment, setIssueComment] = useState('');
  const [revisions, setRevisions] = useState<RecordRevision[]>([]);
  const [revisionLoading, setRevisionLoading] = useState(false);

  useEffect(() => {
    setJihatsukanComment(record.jihatsukanComment || '');
    setReviewIssues(record.reviewIssues || []);
    setReviewerName(record.reviewedBy || defaultReviewerName || '児童発達支援管理責任者');
  }, [defaultReviewerName, record]);

  useEffect(() => {
    if (!organizationId) return;
    let active = true;
    setRevisionLoading(true);
    void loadRecordRevisions(organizationId, record.id)
      .then((items) => {
        if (active) setRevisions(items);
      })
      .catch(() => {
        if (active) setRevisions([]);
      })
      .finally(() => {
        if (active) setRevisionLoading(false);
      });
    return () => {
      active = false;
    };
  }, [organizationId, record.id, record.updatedAt]);

  // Handle PDF Download
  const handleDownloadPDF = async () => {
    setIsExportingPDF(true);
    try {
      const filename = `支援経過記録_${record.childName}_${record.date}.pdf`;
      await generatePDFFromElement('pdf-preview-target-container', filename);
    } catch (err) {
      alert('PDF出力中にエラーが発生しました。ブラウザの印刷機能をお試しください。');
    } finally {
      setIsExportingPDF(false);
    }
  };

  // Handle Print
  const handlePrint = () => {
    window.print();
  };

  // Handle Copy Raw Structured Text
  const handleCopyText = () => {
    const summary = generateRecordSummary(record);
    navigator.clipboard.writeText(summary);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  // Handle Copy Narrative Prose
  const handleCopyNarrative = () => {
    const narrative = generateNarrativeReport(record);
    navigator.clipboard.writeText(narrative);
    setCopiedNarrative(true);
    setTimeout(() => setCopiedNarrative(false), 2000);
  };

  // Handle Jihatsukan Approval
  const handleApprovalSubmit = (status: '確認済み' | '要修正') => {
    if (status === '要修正' && !jihatsukanComment.trim() && !reviewIssues.some((issue) => !issue.resolved)) {
      alert('要修正にする場合は、全体コメントまたは修正箇所を入力してください。');
      return;
    }
    if (onUpdateApproval) {
      onUpdateApproval(record.id, jihatsukanComment, status, reviewerName, reviewIssues);
    }
  };

  const addReviewIssue = () => {
    if (!issueComment.trim()) return;
    setReviewIssues((previous) => [
      ...previous,
      {
        id: typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `issue-${Date.now()}`,
        label: issueLabel,
        comment: issueComment.trim(),
        resolved: false,
        createdAt: new Date().toISOString(),
      },
    ]);
    setIssueComment('');
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Action Header Bar */}
      <div className="bg-slate-900 text-white p-4 rounded-xl shadow-md border border-slate-800 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <button
          onClick={onBackToList}
          className="text-xs font-semibold text-slate-300 hover:text-white flex items-center gap-1 bg-slate-800 px-3 py-1.5 rounded-md border border-slate-700"
        >
          <ArrowLeft className="w-4 h-4" />
          一覧に戻る
        </button>

        <div className="flex flex-wrap items-center gap-2">
          {/* Format Toggle */}
          <button
            onClick={() => setIsDualFormat(!isDualFormat)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-md border transition-colors flex items-center gap-1.5 ${
              isDualFormat
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            {isDualFormat ? '紙様式 (2面分割表示中)' : '1面表示'}
          </button>

          {/* Copy Plain Text */}
          <button
            onClick={handleCopyText}
            className="text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5"
          >
            {copiedText ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedText ? '構造化テキスト複製完了' : '項目コピー'}
          </button>

          {/* Copy Narrative Prose */}
          <button
            onClick={handleCopyNarrative}
            className="text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-teal-300 border border-slate-700 px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5"
          >
            {copiedNarrative ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <FileText className="w-3.5 h-3.5" />}
            {copiedNarrative ? '文章データ複製完了' : '文章コピー'}
          </button>

          {/* Edit Button */}
          <button
            onClick={() => onEditRecord(record)}
            className="text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5"
          >
            <Edit className="w-3.5 h-3.5" />
            再編集
          </button>

          {/* Print Button */}
          <button
            onClick={handlePrint}
            className="text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" />
            印刷
          </button>

          {/* PDF Download Button */}
          <button
            onClick={handleDownloadPDF}
            disabled={isExportingPDF}
            className="text-xs font-bold bg-teal-600 hover:bg-teal-500 text-white px-4 py-1.5 rounded-md shadow-sm transition-all flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            {isExportingPDF ? 'PDF生成中...' : 'PDFダウンロード'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Document Preview (A4 Paper view) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-slate-200/80 p-4 rounded-xl border border-slate-300 shadow-inner overflow-x-auto">
            <div id="pdf-preview-target-container" className="bg-white shadow-xl rounded-xs">
              <PDFDocument
                record={record}
                id="pdf-document-target"
                isDualFormat={isDualFormat}
              />
            </div>
          </div>
        </div>

        {/* Jihatsukan Review & Comments Panel */}
        <div className="space-y-4 print:hidden">
          <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-xs text-slate-900 uppercase tracking-wider">
                児発管 経過確認・承認
              </h3>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  record.approvalStatus === '確認済み'
                    ? 'bg-emerald-100 text-emerald-800'
                    : record.approvalStatus === '要修正'
                    ? 'bg-rose-100 text-rose-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {record.approvalStatus}
              </span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  児発管コメント・助言
                </label>
                <textarea
                  rows={4}
                  value={jihatsukanComment}
                  onChange={(e) => setJihatsukanComment(e.target.value)}
                  placeholder="指導員へのフィードバックや保護者対応時の補足指示を記入"
                  className="w-full bg-slate-50 text-xs border border-slate-300 rounded-lg p-2.5 focus:bg-white focus:ring-2 focus:ring-teal-500 leading-relaxed"
                  disabled={!canReview}
                />
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-black text-slate-800">質問・項目ごとの修正箇所</p>
                {reviewIssues.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {reviewIssues.map((issue) => (
                      <div key={issue.id} className={`rounded-lg border bg-white p-2.5 ${issue.resolved ? 'border-emerald-200 opacity-70' : 'border-rose-200'}`}>
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <p className={`text-[10px] font-black ${issue.resolved ? 'text-emerald-700' : 'text-rose-700'}`}>
                              {issue.label}・{issue.resolved ? '修正対応済み' : '要修正'}
                            </p>
                            <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-800">{issue.comment}</p>
                          </div>
                          {canReview && !issue.resolved && (
                            <button
                              type="button"
                              aria-label="修正箇所を削除"
                              onClick={() => setReviewIssues((previous) => previous.filter((item) => item.id !== issue.id))}
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-rose-700 hover:bg-rose-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {canReview && (
                  <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
                    <select
                      value={issueLabel}
                      onChange={(event) => setIssueLabel(event.target.value)}
                      className="min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs font-bold"
                    >
                      <option>記録全体</option>
                      <option>出欠・表情・おやつ</option>
                      <option>ABC分析</option>
                      {(Object.values(record.sectionAnswers || {}) as SectionAnswer[]).map((section) => (
                        <option key={section.sectionId}>{section.sectionTitle}</option>
                      ))}
                    </select>
                    <textarea
                      rows={3}
                      value={issueComment}
                      onChange={(event) => setIssueComment(event.target.value)}
                      placeholder="どこを、どのように修正するか入力"
                      className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs leading-relaxed"
                    />
                    <button
                      type="button"
                      disabled={!issueComment.trim()}
                      onClick={addReviewIssue}
                      className="flex min-h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-indigo-300 bg-white text-xs font-bold text-indigo-700 disabled:opacity-40"
                    >
                      <Plus className="h-4 w-4" />修正箇所を追加
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  確認者氏名
                </label>
                <input
                  type="text"
                  value={reviewerName}
                  onChange={(e) => setReviewerName(e.target.value)}
                  className="w-full bg-slate-50 text-xs border border-slate-300 rounded-lg p-2 focus:bg-white focus:ring-2 focus:ring-teal-500 font-medium"
                  disabled={!canReview || lockReviewerName}
                />
              </div>

              {canReview ? <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => handleApprovalSubmit('要修正')}
                  className="flex-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold py-2 rounded-lg transition-colors"
                >
                  要修正にする
                </button>

                <button
                  type="button"
                  onClick={() => handleApprovalSubmit('確認済み')}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-2 rounded-lg shadow-xs transition-colors"
                >
                  確認完了・承認
                </button>
              </div> : (
                <p className="text-[11px] bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-600">
                  確認・承認は児発管または管理者が行います。
                </p>
              )}
            </div>
          </div>

          {/* Auto-Generated Summary View */}
          <div className="bg-slate-900 text-slate-200 rounded-xl p-4 space-y-2 border border-slate-800">
            <h4 className="text-xs font-bold text-teal-300 uppercase tracking-wider flex items-center justify-between">
              <span>文章合成プレビュー</span>
              <button
                onClick={handleCopyNarrative}
                className="text-[10px] text-slate-400 hover:text-white underline"
              >
                コピー
              </button>
            </h4>
            <div className="bg-slate-950 p-3 rounded-lg text-xs font-mono text-slate-300 whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
              {generateNarrativeReport(record)}
            </div>
          </div>

          <details className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <summary className="flex min-h-12 cursor-pointer items-center gap-2 px-4 text-xs font-black text-slate-800">
              <History className="h-4 w-4 text-indigo-600" />
              修正履歴（{revisions.length}件）
            </summary>
            <div className="border-t border-slate-200 p-3">
              {revisionLoading ? (
                <p className="py-4 text-center text-xs text-slate-500">履歴を読み込んでいます...</p>
              ) : revisions.length === 0 ? (
                <p className="py-4 text-center text-xs text-slate-500">まだ修正履歴はありません。</p>
              ) : (
                <div className="space-y-2">
                  {revisions.map((revision) => (
                    <div key={revision.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs font-black text-slate-800">
                        バージョン {revision.version}
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-500">
                        {new Date(revision.changedAt).toLocaleString('ja-JP')}
                      </p>
                      <p className="mt-2 text-[11px] leading-relaxed text-slate-700">
                        {describeRevisionDifference(revision.snapshot, record)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </details>
        </div>
      </div>
    </div>
  );
};

function describeRevisionDifference(snapshot: Record<string, unknown>, current: SupportRecord) {
  const comparisons: Array<[string, unknown, unknown]> = [
    ['出欠', snapshot.attendance, current.attendance],
    ['表情', snapshot.expression, current.expressions.join('、')],
    ['おやつ', snapshot.snack, current.snack],
    ['記録者', snapshot.recorder_name, current.recorderName],
    ['記録内容', snapshot.section_answers, current.sectionAnswers],
    ['AI要約', snapshot.synthesized_summary, current.synthesizedSummary],
    ['確認状態', snapshot.approval_status, current.approvalStatus],
    ['児発管コメント', snapshot.review_comment, current.jihatsukanComment],
    ['修正箇所', snapshot.review_issues, current.reviewIssues],
  ];
  const changed = comparisons
    .filter(([, previous, next]) => JSON.stringify(previous ?? null) !== JSON.stringify(next ?? null))
    .map(([label]) => label);
  return changed.length > 0
    ? `現在の内容との差分：${changed.join('、')}`
    : '現在の内容と主要項目の差分はありません。';
}
