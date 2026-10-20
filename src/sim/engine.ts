// The simulation engine. Pure TypeScript, no DOM, deterministic for a given seed + config.
//
// Data layout: Structure-of-Arrays in TypedArrays (one array per field, index = creature slot).
// Dead creatures are flagged `alive=0` during a tick and compacted (order-preserving) at the
// end of the tick, so the live range is always [0, n). Newborns are appended after the
// interaction passes, so spatial-grid indices stay valid for the whole tick.
//
// Tick order (see docs/ARCHITECTURE.md):
//   1. spawn food           2. rebuild spatial grids
//   3. prey eat food        4. predators catch prey
//   5. age / decide / sense / move / metabolism / death
//   6. reproduction         7. compaction            8. statistics sampling

import { Rng } from './rng';
import { SpatialGrid } from './spatialGrid';
import { rectCircleOverlap, rectRectOverlap } from './geometry';
import { foundingGenome, inheritGenome } from './genome';
import {
  GENE_COUNT, GENE_KEYS, G_ACTIVITY, G_HEIGHT, G_SPEED, G_VISION, G_WIDTH, PREDATOR, PREY,
  type DeathCause, type GeneKey, type SimConfig, type Species, type SpeciesConfig, type SpeciesSample,
  type StatsSample, type ZoneAccess,
} from './types';

/** Reference values that normalise the energy-cost formula (a 6×6 body moving at 40 u/s). */
export const REF_AREA = 36;
export const REF_SPEED = 40;
export const REF_VISION = 50;

const TAU = Math.PI * 2;
const CELL_SIZE = 40;

export interface CreatureInfo {
  id: number;
  parentId: number;
  generation: number;
  species: Species;
  x: number;
  y: number;
  heading: number;
  energy: number;
  maxEnergy: number;
  age: number;
  maxAge: number;
  eaten: number;
  totalEaten: number;
  children: number;
  moving: boolean;
  genes: number[];
  /** Current energy drain per second (0 if metabolism is disabled). */
  energyCostPerSec: number;
}

export function zoneAllows(access: ZoneAccess, sp: Species): boolean {
  switch (access) {
    case 'all': return true;
    case 'none': return false;
    case 'prey': return sp === PREY;
    case 'predator': return sp === PREDATOR;
  }
}

/** Energy drained per second by a creature with the given phenotype. Pure, exported for tests/UI. */
export function energyCostPerSecond(cfg: SpeciesConfig, w: number, h: number, speed: number, activity: number, vision: number, moving: boolean): number {
  const m = cfg.metabolism;
  if (!m.enabled) return 0;
  const mass = (w * h) / REF_AREA;
  const sn = speed / REF_SPEED;
  return (
    m.basalCost +
    m.sizeCost * mass +
    (moving ? m.speedCost * mass * sn * sn : 0) +
    m.activityCost * activity +
    m.visionCost * (vision / REF_VISION)
  );
}

export class Simulation {
  config: SimConfig;
  rng: Rng;
  time = 0;
  tick = 0;
  nextId = 1;

  // ---- creatures (SoA) ----
  n = 0;
  cap = 0;
  id!: Uint32Array;
  parentId!: Uint32Array;
  generation!: Uint32Array;
  species!: Uint8Array;
  alive!: Uint8Array;
  moving!: Uint8Array;
  x!: Float64Array;
  y!: Float64Array;
  heading!: Float64Array;
  hc!: Float64Array; // cos(heading)
  hs!: Float64Array; // sin(heading)
  energy!: Float64Array;
  age!: Float64Array;
  maxAge!: Float64Array;
  reproTimer!: Float64Array;
  decisionTimer!: Float64Array;
  eaten!: Uint32Array;
  totalEaten!: Uint32Array;
  children!: Uint32Array;
  genes!: Float64Array;

  // ---- food ----
  foodN = 0;
  foodCap = 0;
  fx!: Float64Array;
  fy!: Float64Array;
  foodAlive!: Uint8Array;
  private foodAcc = 0;

  // ---- spatial indices ----
  readonly preyGrid: SpatialGrid;
  readonly predGrid: SpatialGrid;
  readonly foodGrid: SpatialGrid;
  private idxBuf = new Int32Array(64);
  private maxPreyHalfDiag = 0;

  // ---- bookkeeping ----
  /** Live population per species, kept exact during a tick. */
  pop = [0, 0];
  private deadThisTick = 0;
  private foodEatenThisTick = 0;
  private intervalBirths = [0, 0];
  private intervalDeaths = [[0, 0, 0], [0, 0, 0]];
  totalBirths = [0, 0];
  totalDeaths = [[0, 0, 0], [0, 0, 0]];
  private nextSampleTime = 0;
  private pendingSamples: StatsSample[] = [];

  constructor(config: SimConfig) {
    this.config = config;
    this.rng = new Rng(config.seed);
    const { width, height } = config.world;
    this.preyGrid = new SpatialGrid(width, height, CELL_SIZE);
    this.predGrid = new SpatialGrid(width, height, CELL_SIZE);
    this.foodGrid = new SpatialGrid(width, height, CELL_SIZE);
    this.allocCreatures(Math.max(256, (config.prey.initialCount + config.predator.initialCount) * 2));
    this.allocFood(Math.max(256, config.food.maxCount));
    this.populate();
    this.sample(); // t = 0 sample
  }

  // ------------------------------------------------------------------ setup

  private allocCreatures(cap: number): void {
    const old = this.cap > 0 ? this : null;
    const grow = <T extends Float64Array | Uint32Array | Uint8Array>(prev: T | undefined, ctor: new (n: number) => T, size: number): T => {
      const a = new ctor(size);
      if (old && prev) a.set(prev.subarray(0, Math.min(prev.length, size)) as never);
      return a;
    };
    this.id = grow(this.id, Uint32Array, cap);
    this.parentId = grow(this.parentId, Uint32Array, cap);
    this.generation = grow(this.generation, Uint32Array, cap);
    this.species = grow(this.species, Uint8Array, cap);
    this.alive = grow(this.alive, Uint8Array, cap);
    this.moving = grow(this.moving, Uint8Array, cap);
    this.x = grow(this.x, Float64Array, cap);
    this.y = grow(this.y, Float64Array, cap);
    this.heading = grow(this.heading, Float64Array, cap);
    this.hc = grow(this.hc, Float64Array, cap);
    this.hs = grow(this.hs, Float64Array, cap);
    this.energy = grow(this.energy, Float64Array, cap);
    this.age = grow(this.age, Float64Array, cap);
    this.maxAge = grow(this.maxAge, Float64Array, cap);
    this.reproTimer = grow(this.reproTimer, Float64Array, cap);
    this.decisionTimer = grow(this.decisionTimer, Float64Array, cap);
    this.eaten = grow(this.eaten, Uint32Array, cap);
    this.totalEaten = grow(this.totalEaten, Uint32Array, cap);
    this.children = grow(this.children, Uint32Array, cap);
    this.genes = grow(this.genes, Float64Array, cap * GENE_COUNT);
    this.cap = cap;
  }

  private ensureCreatureCapacity(needed: number): void {
    if (needed > this.cap) this.allocCreatures(Math.max(needed, this.cap * 2));
  }

  private allocFood(cap: number): void {
    const fx = new Float64Array(cap), fy = new Float64Array(cap), fa = new Uint8Array(cap);
    if (this.foodCap > 0) {
      fx.set(this.fx.subarray(0, this.foodN));
      fy.set(this.fy.subarray(0, this.foodN));
      fa.set(this.foodAlive.subarray(0, this.foodN));
    }
    this.fx = fx; this.fy = fy; this.foodAlive = fa;
    this.foodCap = cap;
  }

  private speciesConfig(sp: number): SpeciesConfig {
    return sp === PREY ? this.config.prey : this.config.predator;
  }

  private populate(): void {
    const c = this.config;
    for (let k = 0; k < c.food.initialCount; k++) this.spawnFood();
    for (const sp of [PREY, PREDATOR] as Species[]) {
      const sc = this.speciesConfig(sp);
      for (let k = 0; k < sc.initialCount; k++) {
        const i = this.addCreature(sp, -1);
        foundingGenome(sc, this.rng, this.genes, i * GENE_COUNT);
        this.placeRandomly(i);
        // Desynchronise division timers so founders do not all divide on the same tick.
        if (sc.reproduction.mode === 'timer') this.reproTimer[i] = this.rng.range(0, sc.reproduction.interval);
        this.decisionTimer[i] = this.rng.range(0, sc.behavior.decisionInterval);
      }
    }
  }

  /** Places creature i uniformly at random outside every zone it may not enter. */
  private placeRandomly(i: number): void {
    const { width, height } = this.config.world;
    const sp = this.species[i] as Species;
    for (let attempt = 0; attempt < 50; attempt++) {
      const x = this.rng.range(0, width), y = this.rng.range(0, height);
      this.x[i] = x; this.y[i] = y;
      if (this.insideForbiddenZone(x, y, sp)) continue;
      return;
    }
  }

  private insideForbiddenZone(x: number, y: number, sp: Species): boolean {
    for (const z of this.config.zones) {
      if (!z.enabled || zoneAllows(z.access, sp)) continue;
      const dx = x - z.x, dy = y - z.y;
      if (dx * dx + dy * dy < z.radius * z.radius) return true;
    }
    return false;
  }

  /** Is (x,y) inside an enabled zone that excludes predators? Prey there cannot be caught. */
  isSafeForPrey(x: number, y: number): boolean {
    for (const z of this.config.zones) {
      if (!z.enabled || zoneAllows(z.access, PREDATOR)) continue;
      const dx = x - z.x, dy = y - z.y;
      if (dx * dx + dy * dy < z.radius * z.radius) return true;
    }
    return false;
  }

  /** Appends a creature slot. Genes and position must be written by the caller. */
  private addCreature(sp: Species, parent: number): number {
    this.ensureCreatureCapacity(this.n + 1);
    const i = this.n++;
    const sc = this.speciesConfig(sp);
    this.id[i] = this.nextId++;
    this.parentId[i] = parent >= 0 ? this.id[parent] : 0;
    this.generation[i] = parent >= 0 ? this.generation[parent] + 1 : 0;
    this.species[i] = sp;
    this.alive[i] = 1;
    this.moving[i] = 0;
    const h = this.rng.range(0, TAU);
    this.heading[i] = h;
    this.hc[i] = Math.cos(h);
    this.hs[i] = Math.sin(h);
    this.energy[i] = sc.metabolism.initialEnergy;
    this.age[i] = 0;
    this.maxAge[i] = sc.lifespan > 0 ? sc.lifespan * (1 + this.rng.range(-sc.lifespanJitter, sc.lifespanJitter)) : 0;
    this.reproTimer[i] = 0;
    this.decisionTimer[i] = 0;
    this.eaten[i] = 0;
    this.totalEaten[i] = 0;
    this.children[i] = 0;
    this.pop[sp]++;
    return i;
  }

  /**
   * Adds a founder (generation 0) at (x, y). Unspecified genes take the species' initial values.
   * Used by tests and intended for a future environment editor. Returns the new creature's id.
   */
  spawnCreature(sp: Species, x: number, y: number, genes: Partial<Record<GeneKey, number>> = {}, heading?: number): number {
    const sc = this.speciesConfig(sp);
    const i = this.addCreature(sp, -1);
    for (let g = 0; g < GENE_COUNT; g++) {
      const key = GENE_KEYS[g];
      this.genes[i * GENE_COUNT + g] = genes[key] ?? sc.genes[key].initial;
    }
    this.x[i] = x;
    this.y[i] = y;
    if (heading !== undefined) this.setHeading(i, heading);
    return this.id[i];
  }

  /** Places one food item at (x, y), ignoring the spawn cap. */
  placeFood(x: number, y: number): void {
    if (this.foodN >= this.foodCap) this.allocFood(this.foodCap * 2);
    const k = this.foodN++;
    this.fx[k] = x; this.fy[k] = y; this.foodAlive[k] = 1;
  }

  private spawnFood(): boolean {
    const f = this.config.food;
    if (this.foodN >= f.maxCount) return false;
    if (this.foodN >= this.foodCap) this.allocFood(this.foodCap * 2);
    const { width, height } = this.config.world;
    let x = 0, y = 0;
    for (let attempt = 0; attempt < 20; attempt++) {
      x = this.rng.range(0, width); y = this.rng.range(0, height);
      // Food never appears where no species can go.
      if (!this.insideNoEntryZone(x, y)) break;
    }
    const k = this.foodN++;
    this.fx[k] = x; this.fy[k] = y; this.foodAlive[k] = 1;
    return true;
  }

  private insideNoEntryZone(x: number, y: number): boolean {
    for (const z of this.config.zones) {
      if (!z.enabled || z.access !== 'none') continue;
      const dx = x - z.x, dy = y - z.y;
      if (dx * dx + dy * dy < z.radius * z.radius) return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ tick

  /** Advances the world by `steps` fixed time steps. */
  step(steps = 1): void {
    for (let s = 0; s < steps; s++) this.stepOnce();
  }

  private stepOnce(): void {
    const dt = this.config.dt;
    this.deadThisTick = 0;
    this.foodEatenThisTick = 0;

    // 1. food
    this.foodAcc += this.config.food.spawnRate * dt;
    while (this.foodAcc >= 1) {
      this.foodAcc -= 1;
      if (!this.spawnFood()) { this.foodAcc = 0; break; }
    }

    // 2. spatial indices (built from positions at the start of the tick)
    this.buildGrids();

    // 3–4. interactions
    this.preyEatFood();
    this.predatorsHunt();

    // 5. per-creature update
    const n0 = this.n;
    for (let i = 0; i < n0; i++) if (this.alive[i]) this.updateCreature(i, dt);

    // 6. reproduction
    this.reproduce(n0);

    // 7. compaction
    if (this.deadThisTick > 0) this.compactCreatures();
    if (this.foodEatenThisTick > 0) this.compactFood();

    this.tick++;
    this.time = this.tick * dt;

    // 8. statistics
    if (this.time + 1e-9 >= this.nextSampleTime) this.sample();
  }

  private buildGrids(): void {
    const n = this.n;
    if (this.idxBuf.length < Math.max(n, this.foodN)) this.idxBuf = new Int32Array(Math.max(n, this.foodN) * 2);
    const idx = this.idxBuf;
    // prey
    let m = 0;
    let maxHd = 0;
    const G = GENE_COUNT;
    for (let i = 0; i < n; i++) {
      if (this.species[i] === PREY && this.alive[i]) {
        idx[m++] = i;
        const w = this.genes[i * G + G_WIDTH], h = this.genes[i * G + G_HEIGHT];
        const hd = 0.5 * Math.sqrt(w * w + h * h);
        if (hd > maxHd) maxHd = hd;
      }
    }
    this.maxPreyHalfDiag = maxHd;
    this.preyGrid.build(this.x, this.y, idx, m);
    // predators (needed for prey fleeing)
    m = 0;
    for (let i = 0; i < n; i++) if (this.species[i] === PREDATOR && this.alive[i]) idx[m++] = i;
    this.predGrid.build(this.x, this.y, idx, m);
    // food
    m = 0;
    for (let k = 0; k < this.foodN; k++) if (this.foodAlive[k]) idx[m++] = k;
    this.foodGrid.build(this.fx, this.fy, idx, m);
  }

  private preyEatFood(): void {
    const grid = this.foodGrid;
    if (grid.count === 0) return;
    const sc = this.config.prey;
    const met = sc.metabolism;
    const fr = this.config.food.radius;
    const G = GENE_COUNT;
    const cols = grid.cols;
    const start = grid.cellStart, items = grid.items;
    const fx = this.fx, fy = this.fy, fa = this.foodAlive;
    for (let i = 0, n = this.n; i < n; i++) {
      if (!this.alive[i] || this.species[i] !== PREY) continue;
      const px = this.x[i], py = this.y[i];
      const hw = 0.5 * this.genes[i * G + G_WIDTH], hh = 0.5 * this.genes[i * G + G_HEIGHT];
      const reach = Math.sqrt(hw * hw + hh * hh) + fr;
      const reach2 = reach * reach;
      const c = this.hc[i], s = this.hs[i];
      const x0 = grid.cellX(px - reach), x1 = grid.cellX(px + reach);
      const y0 = grid.cellY(py - reach), y1 = grid.cellY(py + reach);
      let ate = false;
      for (let cy = y0; cy <= y1 && !ate; cy++) {
        for (let cx = x0; cx <= x1 && !ate; cx++) {
          const cell = cy * cols + cx;
          for (let k = start[cell], end = start[cell + 1]; k < end; k++) {
            const f = items[k];
            if (!fa[f]) continue;
            const dx = fx[f] - px, dy = fy[f] - py;
            if (dx * dx + dy * dy > reach2) continue;
            if (!rectCircleOverlap(px, py, c, s, hw, hh, fx[f], fy[f], fr)) continue;
            fa[f] = 0;
            this.foodEatenThisTick++;
            this.eaten[i]++;
            this.totalEaten[i]++;
            if (met.enabled) this.energy[i] = Math.min(met.maxEnergy, this.energy[i] + met.gainPerEat);
            ate = true; // at most one item per tick
            break;
          }
        }
      }
    }
  }

  private predatorsHunt(): void {
    const grid = this.preyGrid;
    if (grid.count === 0 || this.pop[PREDATOR] === 0) return;
    const met = this.config.predator.metabolism;
    const G = GENE_COUNT;
    const cols = grid.cols;
    const start = grid.cellStart, items = grid.items;
    const genes = this.genes;
    const n = this.n;
    // Rotate the starting predator each tick so no slot index has a systematic first pick.
    const offset = n > 0 ? this.rng.int(n) : 0;
    for (let k0 = 0; k0 < n; k0++) {
      const p = (k0 + offset) % n;
      if (!this.alive[p] || this.species[p] !== PREDATOR) continue;
      const px = this.x[p], py = this.y[p];
      const phw = 0.5 * genes[p * G + G_WIDTH], phh = 0.5 * genes[p * G + G_HEIGHT];
      const reach = Math.sqrt(phw * phw + phh * phh) + this.maxPreyHalfDiag;
      const pc = this.hc[p], ps = this.hs[p];
      const x0 = grid.cellX(px - reach), x1 = grid.cellX(px + reach);
      const y0 = grid.cellY(py - reach), y1 = grid.cellY(py + reach);
      let ate = false;
      for (let cy = y0; cy <= y1 && !ate; cy++) {
        for (let cx = x0; cx <= x1 && !ate; cx++) {
          const cell = cy * cols + cx;
          for (let k = start[cell], end = start[cell + 1]; k < end; k++) {
            const q = items[k];
            if (!this.alive[q]) continue;
            const qx = this.x[q], qy = this.y[q];
            const qhw = 0.5 * genes[q * G + G_WIDTH], qhh = 0.5 * genes[q * G + G_HEIGHT];
            const dx = qx - px, dy = qy - py;
            const rr = Math.sqrt(phw * phw + phh * phh) + Math.sqrt(qhw * qhw + qhh * qhh);
            if (dx * dx + dy * dy > rr * rr) continue;
            if (!rectRectOverlap(px, py, pc, ps, phw, phh, qx, qy, this.hc[q], this.hs[q], qhw, qhh)) continue;
            if (this.isSafeForPrey(qx, qy)) continue;
            this.kill(q, 'predation');
            this.eaten[p]++;
            this.totalEaten[p]++;
            if (met.enabled) this.energy[p] = Math.min(met.maxEnergy, this.energy[p] + met.gainPerEat);
            ate = true; // at most one catch per tick
            break;
          }
        }
      }
    }
  }

  private kill(i: number, cause: DeathCause): void {
    if (!this.alive[i]) return;
    this.alive[i] = 0;
    const sp = this.species[i];
    this.pop[sp]--;
    this.deadThisTick++;
    const c = cause === 'predation' ? 0 : cause === 'starvation' ? 1 : 2;
    this.intervalDeaths[sp][c]++;
    this.totalDeaths[sp][c]++;
  }

  private setHeading(i: number, h: number): void {
    this.heading[i] = h;
    this.hc[i] = Math.cos(h);
    this.hs[i] = Math.sin(h);
  }

  private updateCreature(i: number, dt: number): void {
    const sp = this.species[i] as Species;
    const sc = this.speciesConfig(sp);
    const G = GENE_COUNT, o = i * G;
    const w = this.genes[o + G_WIDTH], h = this.genes[o + G_HEIGHT];
    const speed = this.genes[o + G_SPEED], activity = this.genes[o + G_ACTIVITY], vision = this.genes[o + G_VISION];

    // ageing
    this.age[i] += dt;
    if (this.maxAge[i] > 0 && this.age[i] >= this.maxAge[i]) { this.kill(i, 'age'); return; }

    // random move/rest decision; a moving creature picks a fresh random heading
    this.decisionTimer[i] -= dt;
    if (this.decisionTimer[i] <= 0) {
      this.decisionTimer[i] += sc.behavior.decisionInterval * (0.5 + this.rng.next());
      const mv = this.rng.next() < activity;
      this.moving[i] = mv ? 1 : 0;
      if (mv) this.setHeading(i, this.rng.range(0, TAU));
    }

    // sensing only steers a creature that is already moving (activity decides *whether* to move,
    // vision decides *where*), so the two genes stay independent.
    if (this.moving[i] && vision > 0) this.sense(i, sp, sc, vision);

    // movement
    if (this.moving[i]) {
      this.x[i] += this.hc[i] * speed * dt;
      this.y[i] += this.hs[i] * speed * dt;
      this.collideBounds(i, w, h);
      this.collideZones(i, sp, w, h);
    } else {
      // A resting creature can still be inside a zone it may no longer enter (rules changed live).
      this.collideZones(i, sp, w, h);
    }

    // metabolism
    if (sc.metabolism.enabled) {
      this.energy[i] -= energyCostPerSecond(sc, w, h, speed, activity, vision, this.moving[i] === 1) * dt;
      if (this.energy[i] <= 0) { this.energy[i] = 0; this.kill(i, 'starvation'); return; }
    }
    this.reproTimer[i] += dt;
  }

  private sense(i: number, sp: Species, sc: SpeciesConfig, vision: number): void {
    const b = sc.behavior;
    const px = this.x[i], py = this.y[i];
    if (sp === PREY) {
      if (b.fleePredators) {
        const t = this.nearest(this.predGrid, this.x, this.y, this.alive, px, py, vision);
        if (t >= 0) { this.setHeading(i, Math.atan2(py - this.y[t], px - this.x[t])); return; }
      }
      if (b.seekFood) {
        const f = this.nearest(this.foodGrid, this.fx, this.fy, this.foodAlive, px, py, vision);
        if (f >= 0) this.setHeading(i, Math.atan2(this.fy[f] - py, this.fx[f] - px));
      }
    } else if (b.chasePrey) {
      const t = this.nearest(this.preyGrid, this.x, this.y, this.alive, px, py, vision);
      if (t >= 0 && !this.isSafeForPrey(this.x[t], this.y[t])) this.setHeading(i, Math.atan2(this.y[t] - py, this.x[t] - px));
    }
  }

  private nearest(grid: SpatialGrid, xs: Float64Array, ys: Float64Array, alive: Uint8Array, px: number, py: number, r: number): number {
    if (grid.count === 0) return -1;
    const x0 = grid.cellX(px - r), x1 = grid.cellX(px + r);
    const y0 = grid.cellY(py - r), y1 = grid.cellY(py + r);
    let best = -1, bestD = r * r;
    const start = grid.cellStart, items = grid.items, cols = grid.cols;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const cell = cy * cols + cx;
        for (let k = start[cell], end = start[cell + 1]; k < end; k++) {
          const j = items[k];
          if (!alive[j]) continue;
          const dx = xs[j] - px, dy = ys[j] - py;
          const d = dx * dx + dy * dy;
          if (d < bestD) { bestD = d; best = j; }
        }
      }
    }
    return best;
  }

  private collideBounds(i: number, w: number, h: number): void {
    const r = 0.5 * Math.max(w, h);
    const W = this.config.world.width, H = this.config.world.height;
    let hd = this.heading[i];
    let changed = false;
    if (this.x[i] < r) { this.x[i] = r; hd = Math.PI - hd; changed = true; }
    else if (this.x[i] > W - r) { this.x[i] = W - r; hd = Math.PI - hd; changed = true; }
    if (this.y[i] < r) { this.y[i] = r; hd = -hd; changed = true; }
    else if (this.y[i] > H - r) { this.y[i] = H - r; hd = -hd; changed = true; }
    if (changed) this.setHeading(i, hd);
  }

  private collideZones(i: number, sp: Species, w: number, h: number): void {
    const zones = this.config.zones;
    for (let z = 0; z < zones.length; z++) {
      const zone = zones[z];
      if (!zone.enabled || zoneAllows(zone.access, sp)) continue;
      const r = zone.radius + 0.5 * Math.max(w, h);
      const dx = this.x[i] - zone.x, dy = this.y[i] - zone.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;
      // Push out radially and turn to face away from the zone (± 90°).
      const d = Math.sqrt(d2);
      const a = d > 1e-9 ? Math.atan2(dy, dx) : this.rng.range(0, TAU);
      this.x[i] = zone.x + Math.cos(a) * r;
      this.y[i] = zone.y + Math.sin(a) * r;
      if (this.moving[i]) this.setHeading(i, a + this.rng.range(-Math.PI / 2, Math.PI / 2));
    }
  }

  private reproduce(n0: number): void {
    if (n0 === 0) return;
    // At most one child per parent per tick → reserve capacity once so arrays never move mid-loop.
    this.ensureCreatureCapacity(this.n + n0);
    const offset = this.rng.int(n0);
    const G = GENE_COUNT;
    for (let k = 0; k < n0; k++) {
      const i = (k + offset) % n0;
      if (!this.alive[i]) continue;
      const sp = this.species[i] as Species;
      const sc = this.speciesConfig(sp);
      const rc = sc.reproduction;
      if (rc.mode === 'none' || this.pop[sp] >= rc.maxPopulation) continue;
      let ready = false;
      // epsilon: the timer is a sum of dt's, so 30 × (1/30) can land just below 1
      if (rc.mode === 'timer') ready = this.reproTimer[i] >= rc.interval - 1e-9;
      else if (rc.mode === 'eat') ready = this.eaten[i] >= rc.eatThreshold;
      else if (rc.mode === 'energy') ready = this.energy[i] >= rc.energyThreshold;
      if (!ready) continue;
      const met = sc.metabolism;
      // The parent must be able to afford the child's starting energy and survive.
      if (met.enabled && this.energy[i] <= rc.offspringEnergy) continue;

      const c = this.addCreature(sp, i);
      inheritGenome(sc, this.rng, this.genes, i * G, c * G);
      const w = this.genes[c * G + G_WIDTH], h = this.genes[c * G + G_HEIGHT];
      const off = 0.5 * Math.max(w, h);
      const a = this.rng.range(0, TAU);
      this.x[c] = Math.min(this.config.world.width, Math.max(0, this.x[i] + Math.cos(a) * off));
      this.y[c] = Math.min(this.config.world.height, Math.max(0, this.y[i] + Math.sin(a) * off));
      this.decisionTimer[c] = this.rng.range(0, sc.behavior.decisionInterval);
      if (met.enabled) {
        this.energy[i] -= rc.offspringEnergy;
        this.energy[c] = rc.offspringEnergy;
      }
      if (rc.mode === 'eat') this.eaten[i] -= rc.eatThreshold;
      this.reproTimer[i] = 0;
      this.children[i]++;
      this.intervalBirths[sp]++;
      this.totalBirths[sp]++;
    }
  }

  private compactCreatures(): void {
    const G = GENE_COUNT;
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      if (!this.alive[i]) continue;
      if (w !== i) {
        this.id[w] = this.id[i];
        this.parentId[w] = this.parentId[i];
        this.generation[w] = this.generation[i];
        this.species[w] = this.species[i];
        this.alive[w] = 1;
        this.moving[w] = this.moving[i];
        this.x[w] = this.x[i];
        this.y[w] = this.y[i];
        this.heading[w] = this.heading[i];
        this.hc[w] = this.hc[i];
        this.hs[w] = this.hs[i];
        this.energy[w] = this.energy[i];
        this.age[w] = this.age[i];
        this.maxAge[w] = this.maxAge[i];
        this.reproTimer[w] = this.reproTimer[i];
        this.decisionTimer[w] = this.decisionTimer[i];
        this.eaten[w] = this.eaten[i];
        this.totalEaten[w] = this.totalEaten[i];
        this.children[w] = this.children[i];
        this.genes.copyWithin(w * G, i * G, i * G + G);
      }
      w++;
    }
    for (let i = w; i < this.n; i++) this.alive[i] = 0;
    this.n = w;
  }

  private compactFood(): void {
    let w = 0;
    for (let k = 0; k < this.foodN; k++) {
      if (!this.foodAlive[k]) continue;
      if (w !== k) { this.fx[w] = this.fx[k]; this.fy[w] = this.fy[k]; this.foodAlive[w] = 1; }
      w++;
    }
    this.foodN = w;
  }

  // ------------------------------------------------------------------ statistics & queries

  private sample(): void {
    const s: StatsSample = {
      t: this.time,
      food: this.foodN,
      prey: this.speciesSample(PREY),
      predator: this.speciesSample(PREDATOR),
    };
    this.intervalBirths = [0, 0];
    this.intervalDeaths = [[0, 0, 0], [0, 0, 0]];
    this.nextSampleTime = this.time + this.config.sampleInterval;
    this.pendingSamples.push(s);
  }

  private speciesSample(sp: Species): SpeciesSample {
    const G = GENE_COUNT;
    const sum = new Array<number>(G).fill(0);
    const sum2 = new Array<number>(G).fill(0);
    let count = 0, energy = 0, age = 0, gen = 0, maxGen = 0;
    for (let i = 0; i < this.n; i++) {
      if (!this.alive[i] || this.species[i] !== sp) continue;
      count++;
      for (let g = 0; g < G; g++) {
        const v = this.genes[i * G + g];
        sum[g] += v;
        sum2[g] += v * v;
      }
      energy += this.energy[i];
      age += this.age[i];
      gen += this.generation[i];
      if (this.generation[i] > maxGen) maxGen = this.generation[i];
    }
    const mean = sum.map((v) => (count ? v / count : NaN));
    const sd = sum2.map((v, g) => (count ? Math.sqrt(Math.max(0, v / count - mean[g] * mean[g])) : NaN));
    return {
      count,
      births: this.intervalBirths[sp],
      deathsPredation: this.intervalDeaths[sp][0],
      deathsStarvation: this.intervalDeaths[sp][1],
      deathsAge: this.intervalDeaths[sp][2],
      mean,
      sd,
      meanEnergy: count ? energy / count : NaN,
      meanAge: count ? age / count : NaN,
      meanGeneration: count ? gen / count : NaN,
      maxGeneration: maxGen,
    };
  }

  /** Returns and clears statistics samples recorded since the last call. */
  drainSamples(): StatsSample[] {
    const s = this.pendingSamples;
    this.pendingSamples = [];
    return s;
  }

  indexOfId(id: number): number {
    for (let i = 0; i < this.n; i++) if (this.id[i] === id) return i;
    return -1;
  }

  describe(id: number): CreatureInfo | null {
    const i = this.indexOfId(id);
    if (i < 0 || !this.alive[i]) return null;
    const sp = this.species[i] as Species;
    const sc = this.speciesConfig(sp);
    const G = GENE_COUNT;
    const genes = Array.from(this.genes.subarray(i * G, i * G + G));
    return {
      id: this.id[i],
      parentId: this.parentId[i],
      generation: this.generation[i],
      species: sp,
      x: this.x[i],
      y: this.y[i],
      heading: this.heading[i],
      energy: this.energy[i],
      maxEnergy: sc.metabolism.maxEnergy,
      age: this.age[i],
      maxAge: this.maxAge[i],
      eaten: this.eaten[i],
      totalEaten: this.totalEaten[i],
      children: this.children[i],
      moving: this.moving[i] === 1,
      genes,
      energyCostPerSec: energyCostPerSecond(sc, genes[G_WIDTH], genes[G_HEIGHT], genes[G_SPEED], genes[G_ACTIVITY], genes[G_VISION], this.moving[i] === 1),
    };
  }

  /** Order-sensitive FNV-1a hash of the full observable state (for reproducibility tests). */
  stateHash(): number {
    let h = 0x811c9dc5;
    const mix = (v: number) => {
      // quantise to avoid relying on the textual float format
      const q = Math.round(v * 1e6) | 0;
      h = Math.imul(h ^ q, 0x01000193) >>> 0;
    };
    mix(this.n); mix(this.foodN); mix(this.tick);
    for (let i = 0; i < this.n; i++) {
      mix(this.id[i]); mix(this.x[i]); mix(this.y[i]); mix(this.energy[i]);
      for (let g = 0; g < GENE_COUNT; g++) mix(this.genes[i * GENE_COUNT + g]);
    }
    for (let k = 0; k < this.foodN; k++) { mix(this.fx[k]); mix(this.fy[k]); }
    return h >>> 0;
  }
}
