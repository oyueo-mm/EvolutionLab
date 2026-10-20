// Headless run of each preset, printing population and mean traits over time.
// Usage: npx tsx scripts/tune.ts [presetId] [simSeconds] [seed]
import { Simulation } from '../src/sim/engine';
import { PRESETS, presetById } from '../src/sim/presets';
import type { SpeciesSample } from '../src/sim/types';

const [idArg, secArg, seedArg] = process.argv.slice(2);
const ids = idArg && idArg !== 'all' ? [idArg] : PRESETS.map((p) => p.id);
const seconds = Number(secArg ?? 600);

const fmt = (s: SpeciesSample) =>
  s.count === 0
    ? '   0'.padEnd(52)
    : `${String(s.count).padStart(4)} w${s.mean[0].toFixed(1).padStart(5)} h${s.mean[1].toFixed(1).padStart(5)} v${s.mean[2].toFixed(0).padStart(4)} a${s.mean[3].toFixed(2)} vis${s.mean[4].toFixed(0).padStart(4)} g${s.meanGeneration.toFixed(0).padStart(4)}`;

for (const id of ids) {
  const cfg = presetById(id);
  if (seedArg) cfg.seed = Number(seedArg);
  const sim = new Simulation(cfg);
  const steps = Math.round(seconds / cfg.dt);
  const every = Math.round(60 / cfg.dt);
  const t0 = performance.now();
  console.log(`\n=== ${id} (seed ${cfg.seed}) ===`);
  for (let s = 0; s < steps; s += every) {
    sim.step(every);
    const all = sim.drainSamples();
    const last = all[all.length - 1];
    const dP = all.reduce((a, x) => a + x.prey.deathsPredation, 0);
    const dS = all.reduce((a, x) => a + x.prey.deathsStarvation, 0);
    const dA = all.reduce((a, x) => a + x.prey.deathsAge, 0);
    const pS = all.reduce((a, x) => a + x.predator.deathsStarvation, 0);
    console.log(
      `t=${String(Math.round(sim.time)).padStart(5)} food ${String(last.food).padStart(4)} | prey ${fmt(last.prey)} dP${dP} dS${dS} dA${dA} | pred ${fmt(last.predator)} starve${pS}`,
    );
  }
  console.log(`wall ${(performance.now() - t0).toFixed(0)} ms for ${seconds}s sim`);
}
