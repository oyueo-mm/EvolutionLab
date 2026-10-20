// Core configuration types for the simulation engine.
// The engine is pure TypeScript (no DOM) so it runs in a Web Worker, in Node (tests/benchmarks)
// and could later run headless at full speed.

export type Species = 0 | 1;
export const PREY: Species = 0;
export const PREDATOR: Species = 1;

/** Gene identifiers. Order defines the genome layout (stride = GENE_COUNT). */
export const GENE_KEYS = ['width', 'height', 'speed', 'activity', 'vision'] as const;
export type GeneKey = (typeof GENE_KEYS)[number];
export const GENE_COUNT = GENE_KEYS.length;
export const G_WIDTH = 0;
export const G_HEIGHT = 1;
export const G_SPEED = 2;
export const G_ACTIVITY = 3;
export const G_VISION = 4;

export interface GeneParams {
  /** Allowed range. Mutated values are clamped into [min, max]. */
  min: number;
  max: number;
  /** Mean value of the founding population. */
  initial: number;
  /** Founding population spread: uniform in initial ± initialSpread*(max-min). */
  initialSpread: number;
  /** If false the gene never mutates (stays at its inherited value). */
  evolvable: boolean;
  /** Per-gene multiplier on the species mutation probability. */
  rateMul: number;
  /** Per-gene multiplier on the species mutation strength. */
  strengthMul: number;
}

export type ReproductionMode = 'none' | 'timer' | 'eat' | 'energy';

export interface ReproductionConfig {
  mode: ReproductionMode;
  /** timer mode: seconds between divisions. */
  interval: number;
  /** eat mode: items eaten (food for prey, prey for predators) needed to divide. */
  eatThreshold: number;
  /** energy mode: energy level that triggers division. */
  energyThreshold: number;
  /** Energy handed from parent to child (only when metabolism is enabled). */
  offspringEnergy: number;
  /** Births are suppressed while the species population is at or above this. */
  maxPopulation: number;
}

export interface MetabolismConfig {
  /** If false, energy never drains and nobody starves. */
  enabled: boolean;
  initialEnergy: number;
  maxEnergy: number;
  /** Energy gained per item eaten (food for prey, prey for predators). */
  gainPerEat: number;
  /** Per-second costs. Each term is independent (see docs/RULES.md). */
  basalCost: number;
  sizeCost: number; // × mass
  speedCost: number; // × mass × (speed/refSpeed)^2, only while moving
  activityCost: number; // × activity
  visionCost: number; // × vision/refVision
}

export interface BehaviorConfig {
  /** Seconds between random move/rest decisions. */
  decisionInterval: number;
  /** Prey: steer towards the nearest visible food. */
  seekFood: boolean;
  /** Prey: steer away from the nearest visible predator. */
  fleePredators: boolean;
  /** Predator: steer towards the nearest visible prey. */
  chasePrey: boolean;
}

export interface MutationConfig {
  /** Probability that each gene mutates on reproduction (before per-gene multiplier). */
  rate: number;
  /** Mutation std-dev as a fraction of the gene range (before per-gene multiplier). */
  strength: number;
}

export interface SpeciesConfig {
  initialCount: number;
  /** If false offspring are exact clones (mutation disabled). */
  evolve: boolean;
  mutation: MutationConfig;
  genes: Record<GeneKey, GeneParams>;
  reproduction: ReproductionConfig;
  metabolism: MetabolismConfig;
  behavior: BehaviorConfig;
  /** Mean lifespan in seconds; 0 = immortal. Individual lifespans vary ±lifespanJitter. */
  lifespan: number;
  lifespanJitter: number;
}

export type ZoneAccess = 'prey' | 'predator' | 'all' | 'none';

export interface ZoneConfig {
  enabled: boolean;
  x: number;
  y: number;
  radius: number;
  /** Who may enter. Excluded species are pushed out; prey inside a zone that
   *  excludes predators cannot be caught. */
  access: ZoneAccess;
}

export interface FoodConfig {
  initialCount: number;
  /** Food items spawned per simulated second. */
  spawnRate: number;
  maxCount: number;
  radius: number;
}

export interface SimConfig {
  seed: number;
  world: { width: number; height: number };
  /** Fixed simulation time step in seconds. */
  dt: number;
  food: FoodConfig;
  zones: ZoneConfig[];
  prey: SpeciesConfig;
  predator: SpeciesConfig;
  /** Simulated seconds between statistics samples. */
  sampleInterval: number;
}

export type DeathCause = 'predation' | 'starvation' | 'age';

export interface SpeciesSample {
  count: number;
  births: number; // during the sample interval
  deathsPredation: number;
  deathsStarvation: number;
  deathsAge: number;
  mean: number[]; // per gene
  sd: number[]; // per gene
  meanEnergy: number;
  meanAge: number;
  meanGeneration: number;
  maxGeneration: number;
}

export interface StatsSample {
  t: number;
  food: number;
  prey: SpeciesSample;
  predator: SpeciesSample;
}
