// Genome handling: founding values, inheritance and mutation.
// Pure functions over Float64Array slices so they can be unit-tested in isolation.
//
// Genotype → phenotype mapping is the identity for every gene (documented in docs/RULES.md):
//   width/height = body extent in world units (width is along the heading),
//   speed = world units / second while moving,
//   activity = probability of choosing to move at each decision,
//   vision = sensing radius in world units.

import { GENE_COUNT, GENE_KEYS, type SpeciesConfig } from './types';
import type { Rng } from './rng';

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** Writes a founding genome into out[offset .. offset+GENE_COUNT). */
export function foundingGenome(cfg: SpeciesConfig, rng: Rng, out: Float64Array, offset: number): void {
  for (let g = 0; g < GENE_COUNT; g++) {
    const p = cfg.genes[GENE_KEYS[g]];
    const spread = p.initialSpread * (p.max - p.min);
    const v = spread > 0 ? p.initial + rng.range(-spread, spread) : p.initial;
    out[offset + g] = clamp(v, p.min, p.max);
  }
}

/**
 * Copies the parent genome to the child slot and applies mutation.
 * Each gene independently mutates with probability rate*rateMul, adding
 * N(0, (strength*strengthMul*(max-min))²) and clamping into [min, max].
 * Returns the number of genes that mutated.
 */
export function inheritGenome(
  cfg: SpeciesConfig,
  rng: Rng,
  genes: Float64Array,
  parentOffset: number,
  childOffset: number,
): number {
  let mutated = 0;
  for (let g = 0; g < GENE_COUNT; g++) {
    let v = genes[parentOffset + g];
    const p = cfg.genes[GENE_KEYS[g]];
    if (cfg.evolve && p.evolvable) {
      const rate = clamp(cfg.mutation.rate * p.rateMul, 0, 1);
      if (rate > 0 && rng.next() < rate) {
        const sigma = cfg.mutation.strength * p.strengthMul * (p.max - p.min);
        v = clamp(v + rng.normal() * sigma, p.min, p.max);
        mutated++;
      }
    }
    genes[childOffset + g] = v;
  }
  return mutated;
}
