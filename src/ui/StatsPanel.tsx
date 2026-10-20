import { memo, useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { SimClient } from '../client/simClient';
import { samplesToCsv, toChartRows, type ChartRow } from './statsData';

// Validated categorical pair (dataviz validator, light surface): prey blue, predator red.
const PREY_C = '#3b63c4';
const PRED_C = '#d9412e';

interface Series { key: keyof ChartRow; label: string; color: string; dashed?: boolean; species: 'prey' | 'pred' }

interface ChartDef { title: string; unit?: string; series: Series[]; digits: number }

const CHARTS: ChartDef[] = [
  { title: '개체 수', digits: 0, series: [
    { key: 'prey', label: '피식자', color: PREY_C, species: 'prey' },
    { key: 'pred', label: '포식자', color: PRED_C, species: 'pred' },
  ] },
  { title: '평균 몸 크기', unit: '길이 실선 · 폭 점선', digits: 2, series: [
    { key: 'preyW', label: '피식자 길이', color: PREY_C, species: 'prey' },
    { key: 'preyH', label: '피식자 폭', color: PREY_C, dashed: true, species: 'prey' },
    { key: 'predW', label: '포식자 길이', color: PRED_C, species: 'pred' },
    { key: 'predH', label: '포식자 폭', color: PRED_C, dashed: true, species: 'pred' },
  ] },
  { title: '평균 속도', unit: 'u/s', digits: 1, series: [
    { key: 'preySpeed', label: '피식자', color: PREY_C, species: 'prey' },
    { key: 'predSpeed', label: '포식자', color: PRED_C, species: 'pred' },
  ] },
  { title: '평균 활동성', unit: '0–1', digits: 3, series: [
    { key: 'preyAct', label: '피식자', color: PREY_C, species: 'prey' },
    { key: 'predAct', label: '포식자', color: PRED_C, species: 'pred' },
  ] },
  { title: '출생 · 사망', unit: '/분 · 출생 실선 · 사망 점선', digits: 1, series: [
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

export function formatTime(t: number): string {
  if (t < 120) return `${Math.round(t)}s`;
  const m = Math.floor(t / 60);
  if (m < 120) return `${m}m`;
  return `${(t / 3600).toFixed(1)}h`;
}

const MiniChart = memo(function MiniChart({ def, rows, show }: { def: ChartDef; rows: ChartRow[]; show: { prey: boolean; pred: boolean } }) {
  const series = def.series.filter((s) => show[s.species]);
  return (
    <div className="flex min-h-0 min-w-0 flex-col rounded-md border border-stone-200 bg-white">
      <div className="flex items-baseline justify-between gap-2 px-2.5 pt-1.5">
        <div className="truncate text-[11px] font-semibold text-stone-700">
          {def.title}
          {def.unit && <span className="ml-1 font-normal text-stone-400">{def.unit}</span>}
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 6, right: 10, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#f0efea" vertical={false} />
            <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={formatTime} tick={{ fontSize: 10, fill: '#8a877f' }} stroke="#d6d3cb" minTickGap={30} />
            <YAxis tick={{ fontSize: 10, fill: '#8a877f' }} stroke="#d6d3cb" width={40} tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(+v.toFixed(def.digits > 1 ? 2 : def.digits)))} domain={['auto', 'auto']} />
            <Tooltip
              isAnimationActive={false}
              labelFormatter={(t) => `t = ${formatTime(Number(t))}`}
              formatter={(v, name) => [typeof v === 'number' ? v.toFixed(def.digits) : '—', name]}
              contentStyle={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, borderColor: '#d6d3cb' }}
            />
            {series.map((s) => (
              <Line key={s.key} dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? '4 3' : undefined} dot={false} isAnimationActive={false} connectNulls={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});

export function StatsPanel({ client, presetId }: { client: SimClient; presetId: string }) {
  const [version, setVersion] = useState(0);
  const [show, setShow] = useState({ prey: true, pred: true });

  // Charts refresh at 1 Hz regardless of simulation speed.
  useEffect(() => {
    const id = setInterval(() => setVersion(client.history.version), 1000);
    return () => clearInterval(id);
  }, [client]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rows = useMemo(() => toChartRows(client.history.samples), [version, client]);

  const exportCsv = () => {
    const blob = new Blob([samplesToCsv(client.history.samples)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `alife-stats-${presetId}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3 py-1.5">
        <div className="flex items-center gap-4 text-[11px] text-stone-600">
          <span className="font-semibold uppercase tracking-wider text-stone-500">통계</span>
          {(['prey', 'pred'] as const).map((k) => (
            <label key={k} className="flex cursor-pointer items-center gap-1.5">
              <input type="checkbox" checked={show[k]} onChange={(e) => setShow((s) => ({ ...s, [k]: e.target.checked }))} />
              <span className="inline-block h-0.5 w-4 rounded" style={{ background: k === 'prey' ? PREY_C : PRED_C }} />
              {k === 'prey' ? '피식자' : '포식자'}
            </label>
          ))}
          <span className="text-stone-400">실선과 점선은 각 그래프 제목에 표시 · 표본 {client.history.samples.length}개</span>
        </div>
        <button type="button" onClick={exportCsv} className="rounded border border-stone-300 bg-white px-2 py-0.5 text-[11px] text-stone-700 hover:bg-stone-50">CSV 내보내기</button>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-4 grid-rows-2 gap-2 px-3 pb-3">
        {CHARTS.map((def) => <MiniChart key={def.title} def={def} rows={rows} show={show} />)}
      </div>
    </div>
  );
}
