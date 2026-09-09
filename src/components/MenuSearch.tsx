import React, { useId } from 'react';
import { Search, X } from 'lucide-react';

export function MenuSearch({ value, onChange, label, placeholder }: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder: string;
}) {
  const id = useId();
  return (
    <div className="relative min-w-0">
      <label htmlFor={id} className="sr-only">{label}</label>
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
      <input id={id} type="text" inputMode="search" autoComplete="off" value={value}
        onChange={(event) => onChange(event.target.value)} placeholder={placeholder}
        className="min-h-11 w-full rounded-xl border border-slate-300 bg-white py-2 pl-10 pr-11 text-sm text-slate-900 placeholder:text-slate-500 focus:border-teal-500" />
      {value && <button type="button" onClick={() => onChange('')} aria-label={`${label}をクリア`}
        className="absolute right-0 top-0 grid h-11 w-11 place-items-center rounded-xl text-slate-500 hover:bg-slate-100"><X aria-hidden="true" className="h-4 w-4" /></button>}
    </div>
  );
}
