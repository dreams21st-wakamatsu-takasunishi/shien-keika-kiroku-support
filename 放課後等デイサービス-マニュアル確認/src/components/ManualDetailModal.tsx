import React, { useState } from 'react';
import { 
  X, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  Phone, 
  ShieldAlert, 
  UserCheck, 
  CheckSquare, 
  Square, 
  Sparkles,
  FileCheck,
  Edit3,
  FileText,
  Download,
  ExternalLink,
  Eye,
  EyeOff
} from 'lucide-react';
import { Manual, Staff, ReadSignature } from '../types';

interface ManualDetailModalProps {
  manual: Manual | null;
  onClose: () => void;
  currentStaff: Staff;
  staffList: Staff[];
  onToggleRead: (manualId: string, staffId: string, notes?: string) => void;
  signatures: ReadSignature[];
  onEditManual?: (manual: Manual) => void;
}

export const ManualDetailModal: React.FC<ManualDetailModalProps> = ({
  manual,
  onClose,
  currentStaff,
  staffList,
  onToggleRead,
  signatures,
  onEditManual,
}) => {
  if (!manual) return null;

  const isReadByCurrent = currentStaff.readManualIds.includes(manual.id);
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [understandingConfirmed, setUnderstandingConfirmed] = useState(isReadByCurrent);
  const [signatureNotes, setSignatureNotes] = useState('');
  const [signedSuccessMsg, setSignedSuccessMsg] = useState(false);
  const [showInlinePdfPreview, setShowInlinePdfPreview] = useState(true);

  const toggleChecklist = (id: string) => {
    setCheckedItems((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSignConfirm = () => {
    if (!understandingConfirmed) return;
    onToggleRead(manual.id, currentStaff.id, signatureNotes);
    setSignedSuccessMsg(true);
    setTimeout(() => {
      setSignedSuccessMsg(false);
    }, 2500);
  };

  // Get signatures for this manual
  const manualSignatures = signatures.filter((s) => s.manualId === manual.id);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white border border-gray-200 rounded-xl w-full max-w-4xl shadow-xl text-gray-900 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-blue-900 px-6 py-4 border-b border-blue-800 flex items-start justify-between text-white">
          <div className="space-y-1 pr-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="bg-blue-800 text-blue-100 border border-blue-700 text-xs font-semibold px-2.5 py-0.5 rounded-md">
                {manual.categoryLabel}
              </span>
              <span className="text-xs text-blue-200">Ver. {manual.version}</span>
              <span className="text-xs text-blue-200">最終改訂: {manual.updatedAt}</span>
              {manual.isStatutoryMandatory && (
                <span className="bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-bold px-2 py-0.5 rounded">
                  【法令義務化】
                </span>
              )}
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-white leading-snug">
              {manual.title}
            </h2>
          </div>

          <div className="flex items-center space-x-2">
            {onEditManual && (
              <button
                onClick={() => {
                  onClose();
                  onEditManual(manual);
                }}
                className="bg-blue-800 hover:bg-blue-700 text-white border border-blue-600 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center space-x-1"
                title="マニュアルを改訂・編集"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>編集・改訂</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-blue-200 hover:text-white hover:bg-blue-800 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Modal Body Scrollable */}
        <div className="p-6 overflow-y-auto space-y-6 text-sm text-gray-800">
          {/* Summary Box */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs sm:text-sm text-gray-800 leading-relaxed">
            <strong className="text-blue-900 block mb-1 font-bold">【概要・対象範囲】</strong>
            {manual.summary}
          </div>

          {/* Attached PDF document viewer */}
          {manual.pdfUrl && (
            <div className="bg-red-50/70 border border-red-200 rounded-xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-red-200 pb-3">
                <div className="flex items-center space-x-2.5">
                  <div className="w-9 h-9 rounded-lg bg-red-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className="font-bold text-red-950 text-xs sm:text-sm">
                        {manual.pdfFileName || 'マニュアル原本資料 (PDF)'}
                      </h3>
                      <span className="bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                        PDF添付
                      </span>
                    </div>
                    <p className="text-[11px] text-red-800">
                      公式規程・図解PDFファイルをアプリ内で即時閲覧および保存可能です
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setShowInlinePdfPreview(!showInlinePdfPreview)}
                    className="bg-white hover:bg-red-50 text-red-900 border border-red-300 font-bold px-3 py-1.5 rounded-lg text-xs transition-colors flex items-center space-x-1 cursor-pointer"
                  >
                    {showInlinePdfPreview ? (
                      <>
                        <EyeOff className="w-3.5 h-3.5 text-red-700" />
                        <span>プレビュー非表示</span>
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5 text-red-700" />
                        <span>アプリ内プレビュー</span>
                      </>
                    )}
                  </button>

                  <a
                    href={manual.pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-red-700 hover:bg-red-800 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition-colors flex items-center space-x-1 shadow-xs"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>別タブで拡大閲覧</span>
                  </a>

                  <a
                    href={manual.pdfUrl}
                    download={manual.pdfFileName || `${manual.title}.pdf`}
                    className="bg-slate-800 hover:bg-slate-900 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition-colors flex items-center space-x-1 shadow-xs"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>PDF保存</span>
                  </a>
                </div>
              </div>

              {/* Embedded PDF iframe preview */}
              {showInlinePdfPreview && (
                <div className="bg-slate-900 rounded-xl overflow-hidden border border-red-200 shadow-md">
                  <div className="bg-slate-800 px-3 py-1.5 text-slate-300 text-[11px] font-medium flex items-center justify-between border-b border-slate-700">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                      PDFアプリ内プレビュー表示中
                    </span>
                    <span>{manual.pdfFileName || '添付PDFデータ'}</span>
                  </div>
                  <iframe
                    src={manual.pdfUrl}
                    title={manual.pdfFileName || manual.title}
                    className="w-full h-[400px] sm:h-[480px] border-none bg-white"
                  />
                </div>
              )}
            </div>
          )}

          {/* Key Points */}
          {manual.keyPoints && manual.keyPoints.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2">
              <h3 className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600" /> 最重要・事故防止ポイント
              </h3>
              <ul className="list-disc list-inside space-y-1 text-xs text-amber-950 font-medium leading-relaxed">
                {manual.keyPoints.map((point, idx) => (
                  <li key={`kp-${idx}-${manual.id}`}>{point}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Emergency Contacts if present */}
          {manual.emergencyContacts && manual.emergencyContacts.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-2">
              <h3 className="text-xs font-bold text-red-900 flex items-center gap-1.5">
                <Phone className="w-4 h-4 text-red-600" /> 緊急時連絡体制
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {manual.emergencyContacts.map((contact, idx) => (
                  <div key={`ec-${idx}-${contact.name}`} className="bg-white p-2.5 rounded-lg border border-red-200 flex justify-between items-center shadow-xs">
                    <div>
                      <span className="font-semibold text-gray-900 block">{contact.name}</span>
                      <span className="text-[11px] text-gray-500">{contact.note}</span>
                    </div>
                    <a
                      href={`tel:${contact.phone}`}
                      className="bg-red-600 hover:bg-red-700 text-white font-bold px-3 py-1 rounded text-xs flex items-center space-x-1"
                    >
                      <Phone className="w-3 h-3" />
                      <span>{contact.phone}</span>
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step-by-step instructions */}
          <div className="space-y-3">
            <h3 className="font-bold text-base text-gray-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-800" /> 標準対応ステップ・順序
            </h3>
            <div className="space-y-3">
              {manual.steps.map((step, idx) => (
                <div
                  key={`step-${idx}-${manual.id}`}
                  className="bg-gray-50 border border-gray-200 rounded-lg p-4 flex items-start space-x-3"
                >
                  <div className="w-7 h-7 rounded-full bg-blue-900 text-white font-bold flex items-center justify-center shrink-0 text-xs shadow-xs">
                    {idx + 1}
                  </div>
                  <p className="text-xs sm:text-sm text-gray-800 leading-relaxed pt-0.5">
                    {step}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Mandatory Safety Checklist */}
          {manual.checklist && manual.checklist.length > 0 && (
            <div className="space-y-3 pt-2">
              <h3 className="font-bold text-base text-gray-900 flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-blue-800" /> セルフ点検・確認チェックリスト
              </h3>
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-2">
                {manual.checklist.map((item) => {
                  const isChecked = !!checkedItems[item.id];
                  return (
                    <div
                      key={item.id}
                      onClick={() => toggleChecklist(item.id)}
                      className={`flex items-start space-x-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                        isChecked
                          ? 'bg-blue-50 border-blue-300 text-blue-950 font-medium'
                          : 'bg-white border-gray-200 hover:border-gray-300 text-gray-800'
                      }`}
                    >
                      {isChecked ? (
                        <CheckSquare className="w-5 h-5 text-blue-800 shrink-0 mt-0.5" />
                      ) : (
                        <Square className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
                      )}
                      <span className="text-xs sm:text-sm">{item.text}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Staff Signatures List for this Manual */}
          {manualSignatures.length > 0 && (
            <div className="space-y-2 pt-2">
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                このマニュアルを署名確認したスタッフ ({manualSignatures.length}名)
              </h4>
              <div className="flex flex-wrap gap-2 text-xs">
                {manualSignatures.map((sig) => (
                  <div key={sig.id} className="bg-gray-100 border border-gray-200 rounded-lg px-3 py-1.5 flex items-center space-x-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="font-semibold text-gray-800">{sig.staffName}</span>
                    <span className="text-[10px] text-gray-500">{sig.signedAt}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Interactive Sign-off Section */}
          <div className="bg-blue-50/60 border border-blue-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center space-x-3 border-b border-blue-200 pb-3">
              <UserCheck className="w-5 h-5 text-blue-800" />
              <div>
                <h4 className="font-bold text-gray-900 text-sm">
                  理解・確認署名（スタッフ: {currentStaff.name} 様）
                </h4>
                <p className="text-xs text-gray-600">
                  内容を確認の上、理解確認チェックを入れて「署名登録」を行ってください。
                </p>
              </div>
            </div>

            <label className="flex items-start space-x-3 cursor-pointer">
              <input
                type="checkbox"
                checked={understandingConfirmed}
                onChange={(e) => setUnderstandingConfirmed(e.target.checked)}
                className="mt-1 w-4 h-4 rounded border-gray-300 text-blue-900 focus:ring-blue-600 bg-white cursor-pointer"
              />
              <span className="text-xs sm:text-sm text-gray-800 font-medium leading-relaxed">
                上記の安全対応手順および要点を十分に読み、理解しました。（放課後等デイサービス運営規程に基づくスタッフ理解確認）
              </span>
            </label>

            <div>
              <label className="block text-xs text-gray-600 mb-1">
                備考・疑問点（任意）
              </label>
              <input
                type="text"
                value={signatureNotes}
                onChange={(e) => setSignatureNotes(e.target.value)}
                placeholder="例: 実技研修を受けました / 特記事項なし"
                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:border-blue-600"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              {signedSuccessMsg ? (
                <div className="text-emerald-700 text-xs font-bold flex items-center space-x-1.5 animate-pulse">
                  <FileCheck className="w-4 h-4 text-emerald-600" />
                  <span>署名確認が登録されました！</span>
                </div>
              ) : (
                <span className="text-[11px] text-gray-500">
                  最終更新日: {new Date().toLocaleDateString('ja-JP')}
                </span>
              )}

              <button
                onClick={handleSignConfirm}
                disabled={!understandingConfirmed}
                className={`px-5 py-2.5 rounded-lg font-bold text-xs sm:text-sm shadow transition-all flex items-center space-x-2 ${
                  understandingConfirmed
                    ? 'bg-blue-900 hover:bg-blue-800 text-white active:scale-95'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isReadByCurrent ? '署名を再登録・更新' : '理解・確認済みとして署名登録'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
