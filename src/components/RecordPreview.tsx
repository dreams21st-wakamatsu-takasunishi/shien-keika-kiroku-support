import React, { useState } from 'react';
import { SupportRecord } from '../types';
import { PDFDocument } from './PDFDocument';
import { generatePDFFromElement } from '../utils/pdfGenerator';
import { generateRecordSummary, generateNarrativeReport } from '../utils/textGenerator';
import { Download, Printer, Copy, Edit, Check, ArrowLeft, LayoutGrid, FileText } from 'lucide-react';

interface RecordPreviewProps {
  record: SupportRecord;
  onEditRecord: (record: SupportRecord) => void;
  onBackToList: () => void;
  canReview?: boolean;
  defaultReviewerName?: string;
  lockReviewerName?: boolean;
  onUpdateApproval?: (
    recordId: string,
    comment: string,
    status: '確認済み' | '要修正',
    reviewerName: string
  ) => void;
}

export const RecordPreview: React.FC<RecordPreviewProps> = ({
  record,
  onEditRecord,
  onBackToList,
  canReview = false,
  defaultReviewerName,
  lockReviewerName = false,
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
    if (onUpdateApproval) {
      onUpdateApproval(record.id, jihatsukanComment, status, reviewerName);
    }
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
        </div>
      </div>
    </div>
  );
};
