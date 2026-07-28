import React, { useEffect } from 'react';
import { CalendarDays, GraduationCap, Info, X } from 'lucide-react';
import type { ChildProfile } from '../types';
import { calculateSchoolGrade } from '../utils/schoolGrade';
import { formatRegularDays } from '../utils/weekdays';

interface ChildInfoDialogProps {
  child: ChildProfile | null;
  onClose: () => void;
}

export const ChildInfoDialog: React.FC<ChildInfoDialogProps> = ({ child, onClose }) => {
  useEffect(() => {
    if (!child) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [child, onClose]);

  if (!child) return null;
  const grade = calculateSchoolGrade(child.birthDate) || child.grade || '未設定';

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="child-info-title"
        className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        <header className="sticky top-0 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
          <div className="min-w-0">
            <p className="flex items-center gap-1 text-[11px] font-black text-teal-700">
              <Info className="h-4 w-4" />児童情報
            </p>
            <h2 id="child-info-title" className="truncate text-xl font-black text-slate-950">{child.name}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="児童情報を閉じる"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="space-y-4 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <InfoCard icon={GraduationCap} label="学年" value={grade} />
            <InfoCard icon={CalendarDays} label="生年月日" value={child.birthDate || '未設定'} />
            <InfoCard icon={CalendarDays} label="定期利用曜日" value={formatRegularDays(child.regularDays || [])} />
            <InfoCard icon={Info} label="サービス・予約" value={child.careType || '未設定'} />
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs font-black text-amber-900">留意事項・アレルギー等</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
              {child.notes?.trim() || '登録されている留意事項はありません。'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-12 w-full rounded-xl bg-slate-900 px-4 text-sm font-black text-white"
          >
            元の画面に戻る
          </button>
        </div>
      </section>
    </div>
  );
};

function InfoCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="flex items-center gap-1 text-[10px] font-black text-slate-500">
        <Icon className="h-3.5 w-3.5" />{label}
      </p>
      <p className="mt-1 text-sm font-bold text-slate-900">{value}</p>
    </div>
  );
}
