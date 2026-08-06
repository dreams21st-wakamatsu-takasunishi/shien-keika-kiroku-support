import React from 'react';
import { 
  BookOpen, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  ShieldAlert, 
  UserCheck, 
  ChevronRight,
  FileText,
  Edit3,
  Paperclip
} from 'lucide-react';
import { Manual, Staff } from '../types';

interface ManualCardProps {
  manual: Manual;
  currentStaff: Staff;
  onSelectManual: (manual: Manual) => void;
  onEditManual?: (manual: Manual) => void;
  readCount: number;
  totalStaffCount: number;
}

export const ManualCard: React.FC<ManualCardProps> = ({
  manual,
  currentStaff,
  onSelectManual,
  onEditManual,
  readCount,
  totalStaffCount,
}) => {
  const isReadByCurrentStaff = currentStaff.readManualIds.includes(manual.id);
  const isAdmin = currentStaff.role === '管理者' || currentStaff.role === '児童発達支援管理責任者' || currentStaff.role === '教室長';

  const getSeverityBadge = () => {
    switch (manual.severity) {
      case 'critical':
        return (
          <span className="inline-flex items-center space-x-1 bg-red-100 text-red-800 border border-red-200 text-[11px] font-bold px-2 py-0.5 rounded-full">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>最優先・緊急</span>
          </span>
        );
      case 'warning':
        return (
          <span className="inline-flex items-center space-x-1 bg-amber-100 text-amber-800 border border-amber-200 text-[11px] font-bold px-2 py-0.5 rounded-full">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>要確認</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center space-x-1 bg-blue-100 text-blue-800 border border-blue-200 text-[11px] font-medium px-2 py-0.5 rounded-full">
            <FileText className="w-3.5 h-3.5" />
            <span>日常基本</span>
          </span>
        );
    }
  };

  return (
    <div
      onClick={() => onSelectManual(manual)}
      className="bg-white border border-gray-200 hover:border-blue-500 rounded-xl p-5 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer group flex flex-col justify-between relative"
    >
      <div>
        {/* Top Badges */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="bg-gray-100 text-gray-700 text-[11px] font-semibold px-2.5 py-0.5 rounded border border-gray-200">
              {manual.categoryLabel}
            </span>
            {manual.isStatutoryMandatory && (
              <span className="bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-bold px-2 py-0.5 rounded">
                【法令義務化】
              </span>
            )}
            {manual.pdfUrl && (
              <span className="bg-red-50 text-red-700 border border-red-200 text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1">
                <Paperclip className="w-3 h-3 text-red-600" /> PDF添付
              </span>
            )}
            {getSeverityBadge()}
          </div>

          <div className="flex items-center space-x-2">
            {/* Individual Staff Read Status Tag */}
            {isReadByCurrentStaff ? (
              <span className="inline-flex items-center space-x-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-semibold px-2.5 py-0.5 rounded-full">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>確認済み</span>
              </span>
            ) : (
              <span className="inline-flex items-center space-x-1 bg-red-50 text-red-700 border border-red-200 text-[11px] font-semibold px-2.5 py-0.5 rounded-full">
                <Clock className="w-3.5 h-3.5 text-red-600" />
                <span>未確認</span>
              </span>
            )}

            {/* Admin Edit Button */}
            {onEditManual && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEditManual(manual);
                }}
                className="bg-gray-100 hover:bg-blue-100 text-gray-600 hover:text-blue-900 border border-gray-300 hover:border-blue-300 px-2 py-1 rounded text-xs font-semibold flex items-center space-x-1 transition-colors"
                title="マニュアルを編集（管理者）"
              >
                <Edit3 className="w-3.5 h-3.5 text-blue-800" />
                <span>編集</span>
              </button>
            )}
          </div>
        </div>

        {/* Manual Title */}
        <h3 className="text-base font-bold text-gray-900 group-hover:text-blue-900 transition-colors leading-snug mb-2">
          {manual.title}
        </h3>

        {/* Summary Description */}
        <p className="text-xs text-gray-600 line-clamp-2 leading-relaxed mb-4">
          {manual.summary}
        </p>

        {/* Target Role Tags */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {manual.targetRoles.map((role) => (
            <span
              key={role}
              className="text-[10px] bg-gray-50 text-gray-600 px-2 py-0.5 rounded border border-gray-200"
            >
              対象: {role}
            </span>
          ))}
        </div>
      </div>

      {/* Card Footer: Overall Facility Read Rate & CTA */}
      <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
        <div className="flex items-center space-x-1.5">
          <UserCheck className="w-3.5 h-3.5 text-blue-700" />
          <span>
            全スタッフ確認率:{' '}
            <strong className="text-gray-800 font-bold">
              {readCount}/{totalStaffCount}名 ({Math.round((readCount / totalStaffCount) * 100)}%)
            </strong>
          </span>
        </div>

        <span className="text-blue-700 group-hover:translate-x-1 transition-transform flex items-center font-bold">
          詳細確認 <ChevronRight className="w-4 h-4 ml-0.5" />
        </span>
      </div>
    </div>
  );
};
