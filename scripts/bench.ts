// Headless engine benchmark: wall-clock cost per tick at fixed population sizes.
// Usage: npm run bench            (or: npx tsx scripts/bench.ts 1000,5000,20000)
//
// Scenarios keep the population constant (no births, deaths, or starvation) so ms/tick is
// measured at exactly N creatures:
//   move   — all creatures always moving; prey/food and predator/prey collision tests
//   vision — as `move`, plus every creature senses (nearest food / predator / prey) each tick

import { Simulation } from '../src/sim/engine';
import { presetById } from '../src/sim/presets';
import type { SimConfig } from '../src/sim/types';
import { CREATURE_STRIDE } from '../src/worker/protocol';

const sizes = (process.argv[2] ?? '1000,2000,5000,10000,20000,50000').split(',').map(Number);

function scenario(n: number, vision: boolean): SimConfig {
  const c = presetById('C');
  // Scale the world so density matches preset C at ~1,000 creatures.
  const scale = Math.sqrt(n / 1000);
  c.world = { width: Math.round(1200 * scale), height: Math.round(800 * scale) };
  c.zones = [];
  c.prey.initialCount = Math.round(n * 0.9);
  c.predator.initialCount = n - c.prey.initialCount;
  c.food = { initialCount: Math.round(n / 2), spawnRate: 0, maxCount: n, radius: 2.5 };
  for (const s of [c.prey, c.predator]) {
    s.reproduction.mode = 'none';
    s.metabolism.enabled = false;
    s.lifespan = 0;
    s.genes.activity.initial = 1;
    s.genes.vision.initial = vision ? 50 : 0;
  }
  c.prey.behavior.seekFood = vision;
  c.prey.behavior.fleePredators = vision;
  c.predator.behavior.chasePrey = vision;
  // Predators catch prey — re-adding the victims keeps N constant (cheap, done between ticks).
  return c;
}

function bench(n: number, vision: boolean) {
  const cfg = scenario(n, vision);
  const sim = new Simulation(cfg);
  const refill = () => {
    while (sim.pop[0] < cfg.prey.initialCount) sim.spawnCreature(0, Math.random() * cfg.world.width, Math.random() * cfg.world.height);
    while (sim.foodN < cfg.food.initialCount) sim.placeFood(Math.random() * cfg.world.width, Math.random() * cfg.world.height);
  };
  for (let k = 0; k < 60; k++) { sim.step(1); refill(); }
  const ticks = n >= 20000 ? 150 : 300;
  let work = 0;
  for (let k = 0; k < ticks; k++) {
    const t0 = performance.now();
    sim.step(1);
    work += performance.now() - t0;
    refill();
  }
  const msPerTick = work / ticks;

  // Snapshot packing cost (what the worker does for each posted frame)
  const t1 = performance.now();
  const reps = 50;
  for (let r = 0; r < reps; r++) {
    const buf = new Float32Array(sim.n * CREATURE_STRIDE);
    for (let i = 0; i < sim.n; i++) {
      const o = i * CREATURE_STRIDE;
      buf[o] = sim.x[i]; buf[o + 1] = sim.y[i]; buf[o + 2] = sim.heading[i];
      buf[o + 3] = sim.genes[i * 5]; buf[o + 4] = sim.genes[i * 5 + 1]; buf[o + 5] = sim.species[i];
    }
  }
  const snapMs = (performance.now() - t1) / reps;
  return { msPerTick, snapMs, maxRealtime: 1000 / msPerTick / 30 };
}

console.log(`node ${process.version} · ${process.platform} ${process.arch}`);
console.log('creatures | scenario | ms/tick | ticks/s | max speed (×realtime @30 ticks/s) | snapshot ms');
for (const n of sizes) {
  for (const vision of [false, true]) {
    const r = bench(n, vision);
    console.log(
      `${String(n).padStart(9)} | ${(vision ? 'vision' : 'move').padEnd(8)} | ${r.msPerTick.toFixed(3).padStart(7)} | ${(1000 / r.msPerTick).toFixed(0).padStart(7)} | ${r.maxRealtime.toFixed(1).padStart(8)}× | ${r.snapMs.toFixed(3)}`,
    );
  }
}
