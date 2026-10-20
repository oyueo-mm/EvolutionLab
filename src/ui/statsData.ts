// Converts raw statistics samples into chart rows and CSV. Pure functions (unit-tested).
import type { StatsSample } from '../sim/types';
import { GENE_KEYS } from '../sim/types';

export function formatTime(t: number): string {
  if (t < 120) return `${Math.round(t)}s`;
  const m = Math.floor(t / 60);
  if (m < 120) return `${m}m`;
  return `${(t / 3600).toFixed(1)}h`;
}

export interface ChartRow {
  t: number;
  prey: number;
  pred: number;
  food: number;
  preyW: number | null; preyH: number | null; predW: number | null; predH: number | null;
  preySpeed: number | null; predSpeed: number | null;
  preyAct: number | null; predAct: number | null;
  preyVision: number | null; predVision: number | null;
  /** Events per simulated minute over the bucket. */
  preyBirths: number; preyDeaths: number; predBirths: number; predDeaths: number;
  preyGen: number | null; predGen: number | null;
  /** Coefficient of variation of speed — a simple genetic-diversity index. */
  preySpeedCv: number | null; predSpeedCv: number | null;
}

const nn = (v: number) => (Number.isFinite(v) ? v : null);

/**
 * Buckets samples so at most `maxPoints` rows remain. Level values (counts, means) come from
 * the last sample of a bucket. Event counts become a per-minute rate over a trailing window of
 * at least `minRateSamples` samples (or the bucket, if larger), so rates are comparable at any
 * zoom level and not dominated by 1-second sampling noise.
 */
export function toChartRows(samples: StatsSample[], maxPoints = 400, minRateSamples = 10): ChartRow[] {
  if (samples.length === 0) return [];
  const bucket = Math.max(1, Math.ceil(samples.length / maxPoints));
  const win = Math.max(bucket, minRateSamples);
  // prefix sums of event counts → O(1) window sums
  const n = samples.length;
  const pb = new Float64Array(n + 1), pd = new Float64Array(n + 1), qb = new Float64Array(n + 1), qd = new Float64Array(n + 1);
  for (let k = 0; k < n; k++) {
    const s = samples[k];
    pb[k + 1] = pb[k] + s.prey.births;
    pd[k + 1] = pd[k] + s.prey.deathsPredation + s.prey.deathsStarvation + s.prey.deathsAge;
    qb[k + 1] = qb[k] + s.predator.births;
    qd[k + 1] = qd[k] + s.predator.deathsPredation + s.predator.deathsStarvation + s.predator.deathsAge;
  }
  const rows: ChartRow[] = [];
  for (let start = 0; start < n; start += bucket) {
    const end = Math.min(n, start + bucket);
    const last = samples[end - 1];
    // window (end - win, end]; sample k holds events in (t[k-1], t[k]]
    const from = Math.max(1, end - win);
    const span = last.t - samples[from - 1].t;
    const perMin = span > 0 ? 60 / span : 0;
    const winSum = (a: Float64Array) => a[end] - a[from];
    const P = last.prey, Q = last.predator;
    rows.push({
      t: last.t,
      prey: P.count,
      pred: Q.count,
      food: last.food,
      preyW: nn(P.mean[0]), preyH: nn(P.mean[1]), predW: nn(Q.mean[0]), predH: nn(Q.mean[1]),
      preySpeed: nn(P.mean[2]), predSpeed: nn(Q.mean[2]),
      preyAct: nn(P.mean[3]), predAct: nn(Q.mean[3]),
      preyVision: nn(P.mean[4]), predVision: nn(Q.mean[4]),
      preyBirths: winSum(pb) * perMin, preyDeaths: winSum(pd) * perMin, predBirths: winSum(qb) * perMin, predDeaths: winSum(qd) * perMin,
      preyGen: nn(P.meanGeneration), predGen: nn(Q.meanGeneration),
      preySpeedCv: nn(P.mean[2] > 0 ? P.sd[2] / P.mean[2] : NaN), predSpeedCv: nn(Q.mean[2] > 0 ? Q.sd[2] / Q.mean[2] : NaN),
    });
  }
  return rows;
}

export function samplesToCsv(samples: StatsSample[]): string {
  const sp = ['prey', 'predator'] as const;
  const head = ['t', 'food'];
  for (const s of sp) {
    head.push(`${s}_count`, `${s}_births`, `${s}_deaths_predation`, `${s}_deaths_starvation`, `${s}_deaths_age`);
    for (const g of GENE_KEYS) head.push(`${s}_${g}_mean`, `${s}_${g}_sd`);
    head.push(`${s}_energy_mean`, `${s}_age_mean`, `${s}_generation_mean`, `${s}_generation_max`);
  }
  const lines = [head.join(',')];
  const num = (v: number) => (Number.isFinite(v) ? String(+v.toFixed(6)) : '');
  for (const r of samples) {
    const row: string[] = [num(r.t), String(r.food)];
    for (const s of sp) {
      const x = r[s];
      row.push(String(x.count), String(x.births), String(x.deathsPredation), String(x.deathsStarvation), String(x.deathsAge));
      GENE_KEYS.forEach((_, g) => row.push(num(x.mean[g]), num(x.sd[g])));
      row.push(num(x.meanEnergy), num(x.meanAge), num(x.meanGeneration), String(x.maxGeneration));
    }
    lines.push(row.join(','));
  }
  return lines.join('\n');
}
