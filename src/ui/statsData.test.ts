import { describe, expect, it } from 'vitest';
import { samplesToCsv, toChartRows } from './statsData';
import { StatsHistory } from '../client/simClient';
import type { SpeciesSample, StatsSample } from '../sim/types';

function sp(count: number, births: number, deaths: number): SpeciesSample {
  return { count, births, deathsPredation: deaths, deathsStarvation: 0, deathsAge: 0, mean: [6, 6, 30, 0.5, 0], sd: [0, 0, 3, 0, 0], meanEnergy: 50, meanAge: 1, meanGeneration: 2, maxGeneration: 3 };
}

function series(n: number, births = 2, deaths = 1): StatsSample[] {
  return Array.from({ length: n }, (_, k) => ({ t: k, food: 10, prey: sp(100, k === 0 ? 0 : births, k === 0 ? 0 : deaths), predator: sp(5, 0, 0) }));
}

describe('toChartRows', () => {
  it('limits the number of points and converts events to per-minute rates', () => {
    const rows = toChartRows(series(1000), 100);
    expect(rows.length).toBe(100);
    for (const r of rows.slice(1)) {
      expect(r.preyBirths).toBeCloseTo(120); // 2 per second
      expect(r.preyDeaths).toBeCloseTo(60);
    }
    expect(rows[rows.length - 1].t).toBe(999);
    expect(rows[0].preySpeedCv).toBeCloseTo(0.1);
  });

  it('maps empty populations to null (gaps), not NaN', () => {
    const s = series(3);
    s[2].predator = { ...sp(0, 0, 0), mean: [NaN, NaN, NaN, NaN, NaN], sd: [NaN, NaN, NaN, NaN, NaN], meanGeneration: NaN };
    const rows = toChartRows(s);
    expect(rows[2].predSpeed).toBeNull();
    expect(rows[2].pred).toBe(0);
  });
});

describe('StatsHistory', () => {
  it('halves resolution at the cap while preserving event totals', () => {
    const h = new StatsHistory();
    const all = series(20_001, 1, 1);
    for (let k = 0; k < all.length; k += 500) h.push(all.slice(k, k + 500));
    expect(h.samples.length).toBeLessThan(20_000);
    const births = h.samples.reduce((a, s) => a + s.prey.births, 0);
    // 20,000 events (sample 0 has none); after halving the stride is 2, so at most one
    // raw sample can still be waiting in the accumulator.
    expect(births).toBeGreaterThanOrEqual(19_999);
    expect(births).toBeLessThanOrEqual(20_000);
    expect(h.samples[h.samples.length - 1].t).toBeGreaterThanOrEqual(19_999);
  });
});

describe('samplesToCsv', () => {
  it('writes one header and one row per sample with matching column counts', () => {
    const csv = samplesToCsv(series(5)).split('\n');
    expect(csv.length).toBe(6);
    const cols = csv[0].split(',').length;
    for (const line of csv) expect(line.split(',').length).toBe(cols);
    expect(csv[0].startsWith('t,food,prey_count')).toBe(true);
  });
});
