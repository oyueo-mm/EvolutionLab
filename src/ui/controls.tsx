import { useId, useState, type CSSProperties, type ReactNode } from 'react';

/**
 * Accordion section. The summary stays visible while collapsed so the user can read the
 * current values without opening it (progressive disclosure). Content stays mounted
 * (inert while closed) so local state survives and opening animates smoothly.
 */
export function Section({ title, summary, children, defaultOpen = false, level = 1 }: { title: string; summary?: ReactNode; children: ReactNode; defaultOpen?: boolean; level?: 1 | 2 }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <section className={level === 1 ? 'border-b border-neutral-100' : ''}>
      <h3 className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((o) => !o)}
          className={`group flex w-full items-center gap-2 text-left transition-colors hover:bg-neutral-50 ${level === 1 ? 'px-5 py-3' : 'px-5 py-2.5 pl-8'}`}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden className={`shrink-0 text-neutral-400 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}>
            <path d="M3 1.5 7 5 3 8.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className={`font-medium ${level === 1 ? 'text-[13px] text-neutral-900' : 'text-xs text-neutral-700'}`}>{title}</span>
          {!open && summary != null && <span className="ml-auto min-w-0 truncate pl-2 text-[11px] text-neutral-400">{summary}</span>}
        </button>
      </h3>
      <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div id={id} inert={!open} className="min-h-0 overflow-hidden">
          <div className={`space-y-4 pb-4 pr-5 ${level === 1 ? 'pl-5' : 'pl-8'}`}>{children}</div>
        </div>
      </div>
    </section>
  );
}

/** Small uppercase group label between related sections. */
export function GroupLabel({ children }: { children: ReactNode }) {
  return <div className="px-5 pb-1 pt-5 text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-400">{children}</div>;
}

/** Marks a parameter that only takes effect after a reset. */
export function ResetBadge() {
  return (
    <span title="초기화 후 적용됩니다" className="ml-1.5 rounded bg-amber-50 px-1 py-px align-middle text-[9px] font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
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
  const fill = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <label className={`block ${disabled ? 'opacity-50' : ''}`} title={hint}>
      <div className="mb-0.5 flex items-baseline justify-between text-xs">
        <span className="text-neutral-600">
          {label}
          {resetOnly && <ResetBadge />}
        </span>
        <span className="font-mono tabular-nums text-neutral-900">{format ? format(value) : value}</span>
      </div>
      <input
        type="range"
        className="lab-range w-full"
        style={{ '--fill': `${fill}%` } as CSSProperties}
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
  const id = useId();
  return (
    <div className={`flex items-center justify-between gap-3 text-xs ${disabled ? 'opacity-50' : ''}`} title={hint}>
      <label htmlFor={id} className="cursor-pointer text-neutral-600">{label}</label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-[18px] w-8 shrink-0 rounded-full transition-colors ${checked ? 'bg-neutral-900' : 'bg-neutral-300'}`}
      >
        <span className={`absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-all ${checked ? 'left-[16px]' : 'left-[2px]'}`} />
      </button>
    </div>
  );
}

export function Segmented<T extends string | number>({ options, value, onChange, size = 'sm', label }: { options: { value: T; label: string; title?: string }[]; value: T; onChange: (v: T) => void; size?: 'sm' | 'xs'; label?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-lg bg-neutral-100 p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-md px-2 font-medium transition-colors ${size === 'xs' ? 'py-1 text-[11px]' : 'py-1.5 text-xs'} ${
            o.value === value ? 'bg-white text-neutral-900 shadow-sm ring-1 ring-black/5' : 'text-neutral-500 hover:text-neutral-800'
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
      <span className="text-neutral-600">
        {label}
        {resetOnly && <ResetBadge />}
      </span>
      {children}
    </div>
  );
}

export function Button({ children, onClick, variant = 'secondary', disabled, title, className = '', ...rest }: { children: ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'ghost' | 'warn'; disabled?: boolean; title?: string; className?: string } & React.AriaAttributes) {
  const v = {
    primary: 'bg-neutral-900 text-white hover:bg-black shadow-sm',
    secondary: 'bg-white text-neutral-800 ring-1 ring-inset ring-neutral-200 hover:bg-neutral-50',
    ghost: 'text-neutral-600 hover:bg-neutral-100',
    warn: 'bg-amber-50 text-amber-900 ring-1 ring-inset ring-amber-300 hover:bg-amber-100',
  }[variant];
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title} {...rest} className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-40 ${v} ${className}`}>
      {children}
    </button>
  );
}

export const fmt = {
  int: (v: number) => String(Math.round(v)),
  f1: (v: number) => v.toFixed(1),
  f2: (v: number) => v.toFixed(2),
  pct: (v: number) => `${Math.round(v * 100)}%`,
  sec: (v: number) => `${v}s`,
};
