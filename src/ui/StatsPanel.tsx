import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { SimClient } from '../client/simClient';
import { Button } from './controls';
import { formatTime, samplesToCsv, toChartRows, type ChartRow } from './statsData';

// Validated categorical pair (dataviz palette check, light surface): prey blue, predator red.
const PREY_C = '#3b63c4';
const PRED_C = '#d9412e';

export const STATS_BAR_HEIGHT = 44;
export const STATS_MIN_HEIGHT = 240;

interface Series { key: keyof ChartRow; label: string; color: string; dashed?: boolean; species: 'prey' | 'pred' }
interface ChartDef { title: string; unit?: string; series: Series[]; digits: number }

const CHARTS: ChartDef[] = [
  { title: '개체 수', digits: 0, series: [
    { key: 'prey', label: '피식자', color: PREY_C, species: 'prey' },
    { key: 'pred', label: '포식자', color: PRED_C, species: 'pred' },
  ] },
  { title: '평균 속도', unit: 'u/s', digits: 1, series: [
    { key: 'preySpeed', label: '피식자', color: PREY_C, species: 'prey' },
    { key: 'predSpeed', label: '포식자', color: PRED_C, species: 'pred' },
  ] },
  { title: '평균 활동성', unit: '0–1', digits: 3, series: [
    { key: 'preyAct', label: '피식자', color: PREY_C, species: 'prey' },
    { key: 'predAct', label: '포식자', color: PRED_C, species: 'pred' },
  ] },
  { title: '평균 몸 크기', unit: '실선 길이 · 점선 폭', digits: 2, series: [
    { key: 'preyW', label: '피식자 길이', color: PREY_C, species: 'prey' },
    { key: 'preyH', label: '피식자 폭', color: PREY_C, dashed: true, species: 'prey' },
    { key: 'predW', label: '포식자 길이', color: PRED_C, species: 'pred' },
    { key: 'predH', label: '포식자 폭', color: PRED_C, dashed: true, species: 'pred' },
  ] },
  { title: '출생 · 사망', unit: '/분 · 실선 출생 · 점선 사망', digits: 1, series: [
    { key: 'preyBirths', label: '피식자 출생', color: PREY_C, species: 'prey' },
    { key: 'preyDeaths', label: '피식자 사망', color: PREY_C, dashed: true, species: 'prey' },
    { key: 'predBirths', label: '포식자 출생', color: PRED_C, species: 'pred' },
    { key: 'predDeaths', label: '포식자 사망', color: PRED_C, dashed: true, species: 'pred' },
  ] },
  { title: '평균 세대', digits: 1, series: [
    { key: 'preyGen', label: '피식자', color: PREY_C, species: 'prey' },
    { key: 'predGen', label: '포식자', color: PRED_C, species: 'pred' },
  ] },
  { title: '평균 시야', unit: 'u', digits: 1, series: [
    { key: 'preyVision', label: '피식자', color: PREY_C, species: 'prey' },
    { key: 'predVision', label: '포식자', color: PRED_C, species: 'pred' },
  ] },
  { title: '속도 다양성', unit: '변이계수 σ/μ', digits: 3, series: [
    { key: 'preySpeedCv', label: '피식자', color: PREY_C, species: 'prey' },
    { key: 'predSpeedCv', label: '포식자', color: PRED_C, species: 'pred' },
  ] },
];

type Show = { prey: boolean; pred: boolean };

// ------------------------------------------------------------------ dock

interface DockProps {
  client: SimClient;
  presetId: string;
  /** Wide screens: the panel pushes the canvas up. Narrow: it is a bottom sheet over it. */
  wide: boolean;
  open: boolean;
  /** Total height of the panel (bar included) when open on wide screens. */
  height: number;
  maxHeight: number;
  onToggle: () => void;
  onHeightChange: (h: number) => void;
}

export const StatsDock = memo(function StatsDock({ client, presetId, wide, open, height, maxHeight, onToggle, onHeightChange }: DockProps) {
  const [show, setShow] = useState<Show>({ prey: true, pred: true });
  const [dragging, setDragging] = useState(false);

  const exportCsv = () => {
    const blob = new Blob([samplesToCsv(client.history.samples)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `alife-stats-${presetId}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const bar = (
    <StatsBar client={client} open={open} show={show} onShow={setShow} onToggle={onToggle} onExport={exportCsv} />
  );

  if (!wide) {
    return (
      <>
        <section aria-label="통계" className="shrink-0 border-t border-neutral-200 bg-white">{bar}</section>
        <div
          aria-hidden={!open}
          onClick={onToggle}
          className={`fixed inset-0 z-30 bg-neutral-900/25 transition-opacity duration-200 ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        />
        <div
          id="stats-panel"
          role="dialog"
          aria-label="통계 그래프"
          inert={!open}
          className={`fixed inset-x-0 bottom-0 z-40 flex h-[78dvh] flex-col rounded-t-2xl bg-white shadow-sheet transition-transform duration-200 ease-out ${open ? 'translate-y-0' : 'translate-y-full'}`}
        >
          <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-2.5">
            <h2 className="m-0 text-sm font-semibold">통계</h2>
            <div className="flex items-center gap-2">
              <Legend show={show} onShow={setShow} />
              <Button variant="secondary" onClick={onToggle}>통계 닫기</Button>
            </div>
          </div>
          {open && <StatsBody client={client} show={show} />}
        </div>
      </>
    );
  }

  const h = Math.min(maxHeight, Math.max(STATS_MIN_HEIGHT, height));
  return (
    <section
      id="stats-panel"
      aria-label="통계"
      style={{ height: open ? h : STATS_BAR_HEIGHT }}
      className={`relative shrink-0 overflow-hidden border-t border-neutral-200 bg-white ${dragging ? '' : 'transition-[height] duration-200 ease-out'}`}
    >
      {open && <ResizeHandle height={h} maxHeight={maxHeight} onChange={onHeightChange} onDragging={setDragging} />}
      {bar}
      {open && (
        <div className="absolute inset-x-0 bottom-0 top-11 flex flex-col">
          <StatsBody client={client} show={show} />
        </div>
      )}
    </section>
  );
});

function ResizeHandle({ height, maxHeight, onChange, onDragging }: { height: number; maxHeight: number; onChange: (h: number) => void; onDragging: (d: boolean) => void }) {
  const start = useRef<{ y: number; h: number } | null>(null);
  const clamp = (v: number) => Math.min(maxHeight, Math.max(STATS_MIN_HEIGHT, v));
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="통계 패널 높이 조절 (위아래 화살표 키)"
      aria-valuenow={Math.round(height)}
      aria-valuemin={STATS_MIN_HEIGHT}
      aria-valuemax={Math.round(maxHeight)}
      tabIndex={0}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); start.current = { y: e.clientY, h: height }; onDragging(true); }}
      onPointerMove={(e) => { if (start.current) onChange(clamp(start.current.h + (start.current.y - e.clientY))); }}
      onPointerUp={() => { start.current = null; onDragging(false); }}
      onPointerCancel={() => { start.current = null; onDragging(false); }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp') { e.preventDefault(); onChange(clamp(height + 24)); }
        if (e.key === 'ArrowDown') { e.preventDefault(); onChange(clamp(height - 24)); }
      }}
      className="group absolute inset-x-0 top-0 z-10 flex h-2 cursor-ns-resize touch-none items-start justify-center"
    >
      <span className="mt-0.5 h-1 w-10 rounded-full bg-neutral-200 transition-colors group-hover:bg-neutral-400 group-focus-visible:bg-blue-500" />
    </div>
  );
}

// ------------------------------------------------------------------ bar

function Legend({ show, onShow }: { show: Show; onShow: (s: Show) => void }) {
  return (
    <div className="flex items-center gap-3 text-xs text-neutral-600">
      {(['prey', 'pred'] as const).map((k) => (
        <label key={k} className="flex cursor-pointer items-center gap-1.5">
          <input type="checkbox" checked={show[k]} onChange={(e) => onShow({ ...show, [k]: e.target.checked })} className="accent-neutral-900" />
          <span className="inline-block h-0.5 w-4 rounded" style={{ background: k === 'prey' ? PREY_C : PRED_C }} />
          {k === 'prey' ? '피식자' : '포식자'}
        </label>
      ))}
    </div>
  );
}

function StatsBar({ client, open, show, onShow, onToggle, onExport }: { client: SimClient; open: boolean; show: Show; onShow: (s: Show) => void; onToggle: () => void; onExport: () => void }) {
  return (
    <div className="flex h-11 items-center gap-4 px-4">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls="stats-panel"
        aria-keyshortcuts="G"
        title="통계 패널 열기/닫기 (G)"
        className="flex shrink-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-neutral-800 ring-1 ring-inset ring-neutral-200 transition-colors hover:bg-neutral-50"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
          <path d="M2 7.5 6 3.5l4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {open ? '통계 닫기' : '통계 열기'}
      </button>
      {open ? (
        <>
          <Legend show={show} onShow={onShow} />
          <span className="hidden text-[11px] text-neutral-400 md:inline">그래프에 마우스를 올리면 값을 볼 수 있습니다</span>
          <Button variant="ghost" onClick={onExport} className="ml-auto" title="전체 통계 이력을 CSV 파일로 저장">CSV 내보내기</Button>
        </>
      ) : (
        <PopulationSparks client={client} />
      )}
    </div>
  );
}

/** Collapsed-state summary: two tiny population trends, each on its own scale (never a dual axis). */
function PopulationSparks({ client }: { client: SimClient }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const samples = client.history.samples;
  const tail = samples.slice(-90);
  const last = tail[tail.length - 1];
  return (
    <div className="flex min-w-0 items-center gap-6 text-xs text-neutral-500">
      <span className="hidden text-[11px] text-neutral-400 sm:inline">개체 수 추이</span>
      <Spark label="피식자" color={PREY_C} values={tail.map((s) => s.prey.count)} current={last?.prey.count} />
      <Spark label="포식자" color={PRED_C} values={tail.map((s) => s.predator.count)} current={last?.predator.count} />
    </div>
  );
}

function Spark({ label, color, values, current }: { label: string; color: string; values: number[]; current?: number }) {
  const W = 88, H = 20;
  let d = '';
  if (values.length > 1) {
    const min = Math.min(...values), max = Math.max(...values);
    const span = max - min || 1;
    d = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${((i / (values.length - 1)) * W).toFixed(1)},${(H - 2 - ((v - min) / span) * (H - 4)).toFixed(1)}`).join('');
  }
  return (
    <div className="flex items-center gap-2">
      <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-3 rounded" style={{ background: color }} />{label}</span>
      <svg width={W} height={H} aria-hidden className="hidden sm:block">
        <path d={d || `M0,${H / 2}L${W},${H / 2}`} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" opacity={d ? 1 : 0.3} />
      </svg>
      <span className="w-8 font-mono tabular-nums text-neutral-900">{current ?? '—'}</span>
    </div>
  );
}

// ------------------------------------------------------------------ charts

function StatsBody({ client, show }: { client: SimClient; show: Show }) {
  const [version, setVersion] = useState(client.history.version);
  // Charts refresh at 1 Hz regardless of simulation speed.
  useEffect(() => {
    const id = setInterval(() => setVersion(client.history.version), 1000);
    return () => clearInterval(id);
  }, [client]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rows = useMemo(() => toChartRows(client.history.samples), [version, client]);

  // Mount the charts one per animation frame. Mounting all eight Recharts trees at once is a single
  // 100–200 ms main-thread task (measured), which stalls the canvas right when the panel opens.
  const [mounted, setMounted] = useState(1);
  useEffect(() => {
    if (mounted >= CHARTS.length) return;
    const id = requestAnimationFrame(() => setMounted((m) => m + 1));
    return () => cancelAnimationFrame(id);
  }, [mounted]);

  return (
    <div className="thin-scroll min-h-0 flex-1 overflow-y-auto">
      <div className="grid min-h-full auto-rows-[minmax(150px,1fr)] grid-cols-1 gap-x-8 gap-y-4 px-5 pb-4 pt-3 sm:grid-cols-2 xl:grid-cols-4">
        {CHARTS.map((def, i) => (i < mounted ? <MiniChart key={def.title} def={def} rows={rows} show={show} /> : <div key={def.title} aria-hidden className="min-w-0" />))}
      </div>
    </div>
  );
}

const MiniChart = memo(function MiniChart({ def, rows, show }: { def: ChartDef; rows: ChartRow[]; show: Show }) {
  const series = def.series.filter((s) => show[s.species]);
  const lastRow = rows[rows.length - 1];
  const showLatest = def.series.length <= 2 && lastRow;
  return (
    <figure className="m-0 flex min-w-0 flex-col">
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate">
          <span className="text-xs font-semibold text-neutral-900">{def.title}</span>
          {def.unit && <span className="ml-1.5 text-[11px] text-neutral-400">{def.unit}</span>}
        </span>
        {showLatest && (
          <span className="flex shrink-0 items-center gap-2.5 font-mono text-[11px] tabular-nums text-neutral-700">
            {series.map((s) => {
              const v = lastRow[s.key];
              return (
                <span key={s.key} className="flex items-center gap-1">
                  <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
                  {typeof v === 'number' ? v.toFixed(def.digits) : '—'}
                </span>
              );
            })}
          </span>
        )}
      </figcaption>
      <div className="relative mt-1 min-h-[110px] flex-1">
        <div className="absolute inset-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 6, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={formatTime} tick={{ fontSize: 10, fill: '#a3a3a3' }} axisLine={false} tickLine={false} minTickGap={36} tickMargin={4} />
              <YAxis
                tick={{ fontSize: 10, fill: '#a3a3a3' }}
                axisLine={false}
                tickLine={false}
                width={34}
                tickCount={4}
                domain={['auto', 'auto']}
                tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(+v.toFixed(def.digits > 1 ? 2 : def.digits)))}
              />
              <Tooltip
                isAnimationActive={false}
                cursor={{ stroke: '#d4d4d4' }}
                labelFormatter={(t) => `t = ${formatTime(Number(t))}`}
                formatter={(v, name) => [typeof v === 'number' ? v.toFixed(def.digits) : '—', name]}
                contentStyle={{ fontSize: 11, padding: '4px 8px', borderRadius: 8, border: '1px solid #e5e5e5', boxShadow: '0 4px 16px rgb(16 24 40 / 0.1)' }}
              />
              {series.map((s) => (
                <Line key={s.key} dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={1.75} strokeDasharray={s.dashed ? '4 3' : undefined} dot={false} isAnimationActive={false} connectNulls={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </figure>
  );
});
