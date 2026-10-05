import { Check } from 'lucide-react';
import { observationScaleLabel } from '../utils/recordObservation';

interface Props {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  label: string;
  multiple?: boolean;
  selectedValues?: string[];
}

/** Display the meaning, but retain the original option value for saved records. */
export function ObservationScaleChoices({ options, value, onChange, label, multiple = false, selectedValues = [] }: Props) {
  return <div className="space-y-2">
    <div role="group" aria-label={label} className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
      {options.map((option) => {
        const { level, label: shortLabel } = observationScaleLabel(option);
        const selected = multiple ? selectedValues.includes(option) : value === option;
        return <button key={option} type="button" aria-label={option} title={option} aria-pressed={selected} onClick={() => onChange(option)} className={`relative flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border-2 px-2 py-2 text-center transition-colors ${selected ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-300 bg-white text-slate-800 hover:border-teal-500'}`}>
          {level && <span className="text-sm font-black">{level}</span>}
          <span className="text-xs font-bold leading-snug">{shortLabel}</span>
          {selected && <Check aria-hidden="true" className="absolute right-1 top-1 h-3.5 w-3.5" />}
        </button>;
      })}
    </div>
    {value && !multiple && <p className="rounded-lg bg-teal-50 px-3 py-2 text-xs font-bold leading-relaxed text-teal-950">{value}</p>}
    <details className="text-xs text-slate-600"><summary className="min-h-11 cursor-pointer content-center font-bold">選択肢の詳しい基準</summary><ul className="space-y-1 rounded-lg bg-slate-50 p-3">{options.map((option) => <li key={option}>{option}</li>)}</ul></details>
  </div>;
}
