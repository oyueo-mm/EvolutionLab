// Headless replicate runs: the same preset over many seeds, reporting final mean traits.
// A consistent direction across seeds suggests selection; scattered directions suggest drift.
// Usage: npx tsx scripts/replicate.ts <presetId> [simSeconds=1500] [seeds=8] [--no-evolve-control]
import { Simulation } from '../src/sim/engine';
import { presetById } from '../src/sim/presets';
import { GENE_KEYS, type StatsSample } from '../src/sim/types';

const [id = 'A', secArg = '1500', seedsArg = '8'] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const seconds = Number(secArg), seeds = Number(seedsArg);

function run(seed: number, mutate: boolean) {
  const cfg = presetById(id);
  cfg.seed = seed;
  if (!mutate) { cfg.prey.evolve = false; cfg.predator.evolve = false; }
  const sim = new Simulation(cfg);
  sim.step(Math.round(seconds / cfg.dt));
  const s = sim.drainSamples();
  return { first: s[0], last: s[s.length - 1] };
}

const fmtRow = (x: StatsSample['prey']) =>
  x.count === 0 ? 'extinct' : `n=${String(x.count).padStart(4)} ` + GENE_KEYS.map((g, k) => `${g}=${x.mean[k].toFixed(2)}`).join(' ');

const deltas: number[][] = [];
const predDeltas: number[][] = [];
console.log(`preset ${id}, ${seconds}s, ${seeds} seeds — prey mean traits`);
for (let seed = 1; seed <= seeds; seed++) {
  const { first, last } = run(seed, true);
  console.log(`seed ${seed}: ${fmtRow(last.prey)} | predators n=${last.predator.count}`);
  if (last.prey.count > 0) deltas.push(last.prey.mean.map((v, k) => v - first.prey.mean[k]));
  if (last.predator.count > 0 && first.predator.count > 0) predDeltas.push(last.predator.mean.map((v, k) => v - first.predator.mean[k]));
  if (last.predator.count > 0) console.log(`         predators: ${fmtRow(last.predator)}`);
}
const summarize = (label: string, rows: number[][]) => {
console.log(`\n${label}: change from founders across surviving replicates (mean ± sd, # seeds that decreased):`);
GENE_KEYS.forEach((g, k) => {
  const d = rows.map((x) => x[k]);
  const m = d.reduce((a, b) => a + b, 0) / d.length;
  const sd = Math.sqrt(d.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, d.length - 1));
  console.log(`  ${g.padEnd(8)} ${m >= 0 ? '+' : ''}${m.toFixed(3)} ± ${sd.toFixed(3)}   decreased in ${d.filter((x) => x < 0).length}/${d.length}`);
});
};
summarize('prey', deltas);
if (predDeltas.length && predDeltas.some((r) => r.some((v) => v !== 0))) summarize('predators', predDeltas);

if (process.argv.includes('--no-evolve-control')) {
  const { last } = run(1, false);
  console.log(`\ncontrol (mutation off, seed 1): ${fmtRow(last.prey)}`);
}
