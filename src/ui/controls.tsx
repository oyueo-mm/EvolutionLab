import { useState, type ReactNode } from 'react';

export function Section({ title, children, defaultOpen = true, aside }: { title: string; children: ReactNode; defaultOpen?: boolean; aside?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-stone-200">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-stone-500 hover:text-stone-800"
      >
        <span className="flex items-center gap-1.5">
          <span className={`inline-block transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
          {title}
        </span>
        {aside}
      </button>
      {open && <div className="space-y-3 px-4 pb-4">{children}</div>}
    </section>
  );
}

/** Marks a parameter that only takes effect after a reset. */
export function ResetBadge() {
  return (
    <span title="재시작 시 적용" className="ml-1 rounded bg-amber-100 px-1 text-[9px] font-medium text-amber-700">
      재시작
    </span>
  );
}

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  hint?: string;
  resetOnly?: boolean;
  disabled?: boolean;
}

export function Slider({ label, value, min, max, step = 1, onChange, format, hint, resetOnly, disabled }: SliderProps) {
  return (
    <label className={`block ${disabled ? 'opacity-40' : ''}`} title={hint}>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="text-stone-600">
          {label}
          {resetOnly && <ResetBadge />}
        </span>
        <span className="font-mono tabular-nums text-stone-900">{format ? format(value) : value}</span>
      </div>
      <input
        type="range"
        className="lab-range w-full"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function Toggle({ label, checked, onChange, hint, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string; disabled?: boolean }) {
  return (
    <label className={`flex cursor-pointer items-center justify-between gap-2 text-xs ${disabled ? 'opacity-40' : ''}`} title={hint}>
      <span className="text-stone-600">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${checked ? 'bg-stone-800' : 'bg-stone-300'}`}
      >
        <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${checked ? 'left-3.5' : 'left-0.5'}`} />
      </button>
    </label>
  );
}

export function Segmented<T extends string | number>({ options, value, onChange, size = 'sm' }: { options: { value: T; label: string; title?: string }[]; value: T; onChange: (v: T) => void; size?: 'sm' | 'xs' }) {
  return (
    <div className="flex rounded-md bg-stone-200/70 p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          title={o.title}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded px-2 ${size === 'xs' ? 'py-0.5 text-[11px]' : 'py-1 text-xs'} font-medium transition-colors ${
            o.value === value ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-800'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, children, resetOnly }: { label: string; children: ReactNode; resetOnly?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-stone-600">
        {label}
        {resetOnly && <ResetBadge />}
      </span>
      {children}
    </div>
  );
}

export const fmt = {
  int: (v: number) => String(Math.round(v)),
  f1: (v: number) => v.toFixed(1),
  f2: (v: number) => v.toFixed(2),
  pct: (v: number) => `${Math.round(v * 100)}%`,
  sec: (v: number) => `${v}s`,
};
