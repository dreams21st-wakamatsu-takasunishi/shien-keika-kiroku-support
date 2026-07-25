import React from 'react';
import { SectionAnswer, SupportRecord } from '../types';

interface PDFDocumentProps {
  record: SupportRecord;
  id?: string;
  isDualFormat?: boolean; // If true, renders top and bottom 2-up format like paper form
}

export const PDFDocument: React.FC<PDFDocumentProps> = ({
  record,
  id = 'pdf-document-target',
  isDualFormat = false,
}) => {
  const renderSinglePageContent = (labelSuffix = '') => {
    const life = record.sectionAnswers?.['life'];
    const study = record.sectionAnswers?.['study'];
    const pc = record.sectionAnswers?.['pc'];
    const activity = record.sectionAnswers?.['activity'];

    return (
      <div className="bg-white text-slate-900 text-xs font-sans p-6 leading-relaxed max-w-[800px] mx-auto border border-slate-300 shadow-xs print:shadow-none print:border-none">
        {/* Title Header */}
        <div className="flex items-center justify-between border-b-2 border-slate-900 pb-1 mb-2">
          <h1 className="text-base font-bold tracking-wider text-slate-900 flex items-center gap-2">
            <span>支援経過記録</span>
            <span className="text-xs font-normal border border-slate-800 px-2 py-0.5 rounded-xs">
              ({record.templateType || '平日'})
            </span>
            {labelSuffix && <span className="text-[10px] text-slate-500">{labelSuffix}</span>}
          </h1>
          <div className="flex items-center gap-4 text-xs font-semibold">
            <span>児童名: <strong className="text-sm underline ml-1">{record.childName || '未選択'}</strong></span>
          </div>
        </div>

        {/* Header Table */}
        <table className="w-full border-collapse border-2 border-slate-900 text-center mb-3 text-[11px]">
          <tbody>
            <tr className="bg-slate-100 font-bold">
              <td className="border border-slate-800 p-1 w-20">日付</td>
              <td className="border border-slate-800 p-1 w-16">出欠</td>
              <td className="border border-slate-800 p-1">表情（複数可）</td>
              <td className="border border-slate-800 p-1 w-20">おやつ</td>
              <td className="border border-slate-800 p-1 w-24">記録者</td>
            </tr>
            <tr>
              <td className="border border-slate-800 p-1 font-bold">{record.date}</td>
              <td className="border border-slate-800 p-1 font-medium">{record.attendance}</td>
              <td className="border border-slate-800 p-1 font-medium">{record.expressions?.join('、') || '未回答'}</td>
              <td className="border border-slate-800 p-1 font-medium">{record.snack}</td>
              <td className="border border-slate-800 p-1 font-medium">{record.recorderName}</td>
            </tr>
            {(record.attendanceNote || record.expressionNote || record.snackNote) && (
              <tr className="text-left text-[10px]">
                <td className="border border-slate-800 p-1 font-bold">備考</td>
                <td colSpan={4} className="border border-slate-800 p-1">
                  {[record.attendanceNote && `出欠：${record.attendanceNote}`, record.expressionNote && `表情：${record.expressionNote}`, record.snackNote && `おやつ：${record.snackNote}`].filter(Boolean).join(' ／ ')}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {record.templateType !== 'カスタム' && <>
        {/* Section 1: 生活 */}
        {life && (
          <div className="border-2 border-slate-900 mb-3">
            <div className="flex border-b border-slate-900">
              <div className="bg-slate-200 font-bold text-center w-14 flex items-center justify-center p-2 border-r border-slate-900 writing-mode-vertical">
                生活
              </div>
              <div className="flex-1 p-2 space-y-1 bg-white">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                  <div>
                    <strong>【疲労感】</strong> {life.answers['fatigue']?.value || 'なし'}
                    {life.answers['fatigue']?.note && <span className="ml-1 text-slate-600">({life.answers['fatigue']?.note})</span>}
                  </div>
                  <div>
                    <strong>【機嫌】</strong> {life.answers['mood']?.value || 'よい'}
                    {life.answers['mood']?.note && <span className="ml-1 text-slate-600">({life.answers['mood']?.note})</span>}
                  </div>
                  <div>
                    <strong>【準備】</strong> {life.answers['preparation']?.value || '自分で出来た'}
                    {life.answers['preparation']?.note && <span className="ml-1 text-slate-600">({life.answers['preparation']?.note})</span>}
                  </div>
                  <div>
                    <strong>【こまったこと】</strong> {life.answers['trouble']?.value || 'なかった'}
                    {life.answers['trouble']?.note && <span className="ml-1 text-slate-600">({life.answers['trouble']?.note})</span>}
                  </div>
                  <div>
                    <strong>【声掛けへの反応】</strong> {life.answers['response_to_prompt']?.value || '返事あり'}
                    {life.answers['response_to_prompt']?.note && <span className="ml-1 text-slate-600">({life.answers['response_to_prompt']?.note})</span>}
                  </div>
                  {life.answers['meal'] && (
                    <div>
                      <strong>【食事】</strong> {life.answers['meal']?.value}
                      {life.answers['meal']?.note && <span className="ml-1 text-slate-600">({life.answers['meal']?.note})</span>}
                    </div>
                  )}
                  {life.answers['medication'] && (
                    <div>
                      <strong>※【服薬】</strong> {life.answers['medication']?.value}
                      {life.answers['medication']?.note && <span className="ml-1 text-slate-600">({life.answers['medication']?.note})</span>}
                    </div>
                  )}
                </div>

                <div className="mt-2 pt-1 border-t border-slate-300">
                  <div className="font-bold text-[11px] mb-0.5">【特記】</div>
                  <div className="p-1.5 bg-slate-50 border border-slate-200 rounded-xs min-h-[48px] whitespace-pre-wrap text-[11px]">
                    {life.detailText || '特記事項なし'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Section 2: 学習 */}
        {study && (
          <div className="border-2 border-slate-900 mb-3">
            <div className="flex border-b border-slate-900">
              <div className="bg-slate-200 font-bold text-center w-14 flex items-center justify-center p-2 border-r border-slate-900">
                学習
              </div>
              <div className="flex-1 p-2 space-y-1 bg-white">
                <div className="text-[11px] font-semibold border-b border-slate-200 pb-1 mb-1">
                  宿題内容： <span className="font-normal text-slate-800">{study.answers['homework_content']?.value || study.subTitleValue || '学校宿題・個別課題'}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                  <div>
                    <strong>【宿題取り組み時間】</strong> {study.answers['homework_time']?.value || '0'} 分
                  </div>
                  <div>
                    <strong>【取り組み】</strong> {study.answers['homework_attitude']?.value || '自力で済ませた'}
                  </div>
                  <div>
                    <strong>【離席】</strong> {study.answers['leaving_seat']?.value || 'なかった'}
                    {study.answers['leaving_seat']?.note && <span className="ml-1 text-slate-600">({study.answers['leaving_seat']?.note})</span>}
                  </div>
                  <div>
                    <strong>【集中力】</strong> {study.answers['focus']?.value || '良かった'}
                    {study.answers['focus']?.note && <span className="ml-1 text-slate-600">({study.answers['focus']?.note})</span>}
                  </div>
                </div>
                <div className="mt-1 pt-1 border-t border-slate-200">
                  <div className="font-bold text-[11px] mb-0.5">【様子】</div>
                  <div className="p-1.5 bg-slate-50 border border-slate-200 rounded-xs min-h-[36px] whitespace-pre-wrap text-[11px]">
                    {study.detailText || '問題なく取り組むことができました。'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Section 3: PC */}
        {pc && (
          <div className="border-2 border-slate-900 mb-3">
            <div className="flex border-b border-slate-900">
              <div className="bg-slate-200 font-bold text-center w-14 flex items-center justify-center p-2 border-r border-slate-900">
                PC
              </div>
              <div className="flex-1 p-2 space-y-1 bg-white">
                <div className="text-[11px] font-semibold border-b border-slate-200 pb-1 mb-1">
                  取組内容： <span className="font-normal text-slate-800">{pc.subTitleValue || 'タイピング練習'}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                  <div>
                    <strong>【タイピング指使い】</strong> {pc.answers['finger_usage']?.value || '標準'}
                  </div>
                  <div>
                    <strong>【取り組み時の姿勢】</strong> {pc.answers['posture']?.value || 'まっすぐ'}
                  </div>
                  <div>
                    <strong>【集中】</strong> {pc.answers['pc_focus']?.value || 'よい'}
                  </div>
                </div>
                <div className="mt-1 pt-1 border-t border-slate-200">
                  <div className="font-bold text-[11px] mb-0.5">【様子】</div>
                  <div className="p-1.5 bg-slate-50 border border-slate-200 rounded-xs min-h-[36px] whitespace-pre-wrap text-[11px]">
                    {pc.detailText || '集中してタイピングに取り組みました。'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Section 4: 活動 (休日の場合) */}
        {activity && (
          <div className="border-2 border-slate-900 mb-3">
            <div className="flex border-b border-slate-900">
              <div className="bg-slate-200 font-bold text-center w-14 flex items-center justify-center p-2 border-r border-slate-900">
                活動
              </div>
              <div className="flex-1 p-2 space-y-1 bg-white">
                <div className="text-[11px] font-semibold border-b border-slate-200 pb-1 mb-1">
                  活動名： <span className="font-normal text-slate-800">{activity.subTitleValue || '集団活動'}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                  <div>
                    <strong>【積極性】</strong> {activity.answers['activity_initiative']?.value || 'あり'}
                  </div>
                  <div>
                    <strong>【集中】</strong> {activity.answers['activity_focus']?.value || 'よい'}
                  </div>
                  <div className="col-span-2">
                    <strong>【声かけ内容】</strong> {activity.answers['prompting_content']?.value || '適切に促し実施'}
                  </div>
                </div>
                <div className="mt-1 pt-1 border-t border-slate-200">
                  <div className="font-bold text-[11px] mb-0.5">【様子】</div>
                  <div className="p-1.5 bg-slate-50 border border-slate-200 rounded-xs min-h-[36px] whitespace-pre-wrap text-[11px]">
                    {activity.detailText || '楽しく活動に参加できました。'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        </>}

        {record.templateType === 'カスタム' && (Object.values(record.sectionAnswers || {}) as SectionAnswer[]).map((sectionAnswer) => {
          const sectionTemplate = record.templateSectionsSnapshot?.find((section) => section.id === sectionAnswer.sectionId);
          return (
            <div key={sectionAnswer.sectionId} className="border-2 border-slate-900 mb-3">
              <div className="flex border-b border-slate-900">
                <div className="bg-slate-200 font-bold text-center w-20 flex items-center justify-center p-2 border-r border-slate-900">
                  {sectionAnswer.sectionTitle}
                </div>
                <div className="flex-1 p-2 bg-white">
                  {sectionAnswer.subTitleValue && <div className="text-[11px] border-b pb-1 mb-1"><strong>取組内容：</strong>{sectionAnswer.subTitleValue}</div>}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-1 text-[11px]">
                    {Object.entries(sectionAnswer.answers || {}).map(([fieldId, answer]) => {
                      const field = sectionTemplate?.fields.find((item) => item.id === fieldId);
                      return (
                        <div key={fieldId}>
                          <strong>{field?.label || `【${fieldId}】`}</strong> {answer.value || '未記入'}
                          {answer.note && <span className="text-slate-600">（{answer.note}）</span>}
                        </div>
                      );
                    })}
                  </div>
                  {sectionAnswer.detailText && <div className="mt-2 pt-1 border-t border-slate-300 whitespace-pre-wrap"><strong>【様子・特記】</strong><br />{sectionAnswer.detailText}</div>}
                </div>
              </div>
            </div>
          );
        })}

        {record.goalProgress && record.goalProgress.length > 0 && (
          <div className="border border-slate-800 mb-3 p-2 text-[10px]">
            <div className="font-bold border-b border-slate-300 pb-1 mb-1">【個別支援目標に対する本日の状況】</div>
            {record.goalProgress.map((progress) => (
              <div key={progress.domain} className="py-0.5">
                <strong>{progress.domain}：</strong>{progress.status}{progress.note ? `（${progress.note}）` : ''}
              </div>
            ))}
          </div>
        )}

        {/* Jihatsukan Review Footer */}
        {record.jihatsukanComment && (
          <div className="border border-emerald-800 bg-emerald-50/50 p-2 rounded-xs text-[11px] mt-2">
            <div className="flex items-center justify-between font-bold text-emerald-950 border-b border-emerald-200 pb-0.5 mb-1">
              <span>【児童発達支援管理責任者 経過確認】</span>
              <span className="text-[10px] font-normal text-emerald-800">
                承認者: {record.reviewedBy || '児発管'} ({record.reviewedAt})
              </span>
            </div>
            <div className="text-emerald-900 whitespace-pre-wrap">{record.jihatsukanComment}</div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div id={id} className="pdf-print-container bg-slate-50 p-2 print:p-0">
      {isDualFormat ? (
        <div className="space-y-4 print:space-y-2">
          {renderSinglePageContent('（事業所保存用）')}
          <div className="border-t-2 border-dashed border-slate-400 my-2 relative text-center">
            <span className="bg-slate-50 px-3 text-[10px] text-slate-500 font-mono -top-2.5 relative">切り取り線</span>
          </div>
          {renderSinglePageContent('（保護者控え・副本）')}
        </div>
      ) : (
        renderSinglePageContent()
      )}
    </div>
  );
};
