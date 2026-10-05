import React from 'react';
import { Check, LockKeyhole } from 'lucide-react';
import { recordProgramClass } from '../utils/recordObservation';

interface Props {
  name: string;
  program: '小学部' | 'キャリアズ';
  selected: boolean;
  detail: string;
  lockOwner?: string;
  disabled?: boolean;
  onClick: () => void;
}

export const RecordChildChoice: React.FC<Props> = ({ name, program, selected, detail, lockOwner, disabled, onClick }) => {
  return <button type="button" disabled={disabled || Boolean(lockOwner)} aria-pressed={selected} onClick={onClick} className={`flex min-h-20 w-full items-center gap-3 rounded-xl border-2 p-3 text-left disabled:opacity-70 ${recordProgramClass(program, selected)}`}>
    <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border-2 ${selected ? 'border-white bg-white/20' : 'border-current bg-white'}`}>{lockOwner ? <LockKeyhole aria-hidden="true" className="h-4 w-4" /> : selected ? <Check aria-hidden="true" className="h-5 w-5" /> : null}</span>
    <span className="min-w-0 flex-1"><span className="mb-1 block text-[11px] font-black">{program}</span><strong className="block text-base">{name}</strong><span className="mt-1 block text-xs leading-relaxed">{lockOwner ? `${lockOwner}が入力中・選択できません` : detail}</span></span>
  </button>;
};
