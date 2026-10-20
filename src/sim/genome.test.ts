import { describe, expect, it } from 'vitest';
import { foundingGenome, inheritGenome } from './genome';
import { Rng } from './rng';
import { presetById } from './presets';
import { GENE_COUNT, GENE_KEYS, G_SPEED, G_VISION, type SpeciesConfig } from './types';

function species(): SpeciesConfig {
  return presetById('A').prey;
}

describe('Rng', () => {
  it('is deterministic for a seed and differs across seeds', () => {
    const a = new Rng(42), b = new Rng(42), c = new Rng(43);
    const sa = Array.from({ length: 10 }, () => a.next());
    const sb = Array.from({ length: 10 }, () => b.next());
    const sc = Array.from({ length: 10 }, () => c.next());
    expect(sa).toEqual(sb);
    expect(sa).not.toEqual(sc);
    for (const v of sa) expect(v >= 0 && v < 1).toBe(true);
  });

  it('normal() has mean ≈ 0 and sd ≈ 1', () => {
    const r = new Rng(1);
    const N = 100_000;
    let s = 0, s2 = 0;
    for (let i = 0; i < N; i++) { const v = r.normal(); s += v; s2 += v * v; }
    const mean = s / N;
    expect(Math.abs(mean)).toBeLessThan(0.02);
    expect(Math.sqrt(s2 / N - mean * mean)).toBeCloseTo(1, 1);
  });
});

describe('genome inheritance', () => {
  it('copies the parent exactly when evolution is off', () => {
    const cfg = species();
    cfg.evolve = false;
    cfg.mutation.rate = 1;
    const rng = new Rng(3);
    const genes = new Float64Array(GENE_COUNT * 2);
    foundingGenome(cfg, rng, genes, 0);
    genes[G_SPEED] = 77.7;
    for (let k = 0; k < 100; k++) {
      expect(inheritGenome(cfg, rng, genes, 0, GENE_COUNT)).toBe(0);
      expect(Array.from(genes.subarray(GENE_COUNT))).toEqual(Array.from(genes.subarray(0, GENE_COUNT)));
    }
  });

  it('copies the parent exactly when mutation rate is 0', () => {
    const cfg = species();
    cfg.mutation.rate = 0;
    const rng = new Rng(4);
    const genes = new Float64Array([5, 7, 33, 0.25, 0, 0, 0, 0, 0, 0]);
    inheritGenome(cfg, rng, genes, 0, GENE_COUNT);
    expect(Array.from(genes.subarray(GENE_COUNT))).toEqual([5, 7, 33, 0.25, 0]);
  });

  it('never mutates a non-evolvable gene', () => {
    const cfg = species();
    cfg.mutation.rate = 1;
    expect(cfg.genes.vision.evolvable).toBe(false);
    const rng = new Rng(5);
    const genes = new Float64Array(GENE_COUNT * 2);
    foundingGenome(cfg, rng, genes, 0);
    for (let k = 0; k < 1000; k++) {
      inheritGenome(cfg, rng, genes, 0, GENE_COUNT);
      expect(genes[GENE_COUNT + G_VISION]).toBe(genes[G_VISION]);
    }
  });

  it('mutates with the configured probability, stays in range, and is unbiased', () => {
    const cfg = species();
    cfg.mutation.rate = 0.25;
    cfg.mutation.strength = 0.05;
    const p = cfg.genes.speed;
    const range = p.max - p.min;
    const rng = new Rng(6);
    const genes = new Float64Array(GENE_COUNT * 2);
    const N = 40_000;
    let changed = 0, sum = 0, sum2 = 0;
    for (let k = 0; k < N; k++) {
      genes[G_SPEED] = 60; // middle of [0,120] so clamping is negligible
      inheritGenome(cfg, rng, genes, 0, GENE_COUNT);
      const v = genes[GENE_COUNT + G_SPEED];
      expect(v).toBeGreaterThanOrEqual(p.min);
      expect(v).toBeLessThanOrEqual(p.max);
      if (v !== 60) {
        changed++;
        sum += v - 60;
        sum2 += (v - 60) ** 2;
      }
    }
    const freq = changed / N;
    expect(Math.abs(freq - 0.25)).toBeLessThan(0.015);
    const mean = sum / changed;
    const sd = Math.sqrt(sum2 / changed - mean * mean);
    expect(Math.abs(mean)).toBeLessThan(0.1); // no directional bias
    expect(sd).toBeGreaterThan(0.05 * range * 0.95);
    expect(sd).toBeLessThan(0.05 * range * 1.05);
  });

  it('clamps mutations at the gene bounds', () => {
    const cfg = species();
    cfg.mutation.rate = 1;
    cfg.mutation.strength = 2; // huge, so most draws would leave the range
    const rng = new Rng(7);
    const genes = new Float64Array(GENE_COUNT * 2);
    foundingGenome(cfg, rng, genes, 0);
    for (let k = 0; k < 2000; k++) {
      inheritGenome(cfg, rng, genes, 0, GENE_COUNT);
      for (let g = 0; g < GENE_COUNT; g++) {
        const p = cfg.genes[GENE_KEYS[g]];
        expect(genes[GENE_COUNT + g]).toBeGreaterThanOrEqual(p.min);
        expect(genes[GENE_COUNT + g]).toBeLessThanOrEqual(p.max);
      }
    }
  });

  it('applies per-gene rate multipliers', () => {
    const cfg = species();
    cfg.mutation.rate = 0.5;
    cfg.genes.width.rateMul = 0;
    cfg.genes.height.rateMul = 2; // 0.5*2 = 1 → always
    const rng = new Rng(8);
    const genes = new Float64Array(GENE_COUNT * 2);
    let wChanged = 0, hChanged = 0;
    for (let k = 0; k < 2000; k++) {
      genes[0] = 6; genes[1] = 6;
      inheritGenome(cfg, rng, genes, 0, GENE_COUNT);
      if (genes[GENE_COUNT] !== 6) wChanged++;
      if (genes[GENE_COUNT + 1] !== 6) hChanged++;
    }
    expect(wChanged).toBe(0);
    expect(hChanged).toBe(2000);
  });

  it('founding genomes respect initialSpread and bounds', () => {
    const cfg = species();
    cfg.genes.speed.initialSpread = 0.1;
    const rng = new Rng(9);
    const genes = new Float64Array(GENE_COUNT);
    for (let k = 0; k < 1000; k++) {
      foundingGenome(cfg, rng, genes, 0);
      expect(Math.abs(genes[G_SPEED] - 30)).toBeLessThanOrEqual(12 + 1e-9);
      expect(genes[0]).toBe(6);
    }
  });
});
