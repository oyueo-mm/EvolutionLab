// UI-thread handle to the simulation worker. Holds the latest frame in a plain field
// (read by the canvas render loop) and the statistics history; neither lives in React
// state, so a frame never re-renders the component tree.

import type { FrameMessage, FromWorker, ToWorker } from '../worker/protocol';
import type { SimConfig, StatsSample } from '../sim/types';

const MAX_SAMPLES = 20_000;

export class StatsHistory {
  samples: StatsSample[] = [];
  /** Bumped on every change so consumers can memoise. */
  version = 0;
  /** Raw samples merged into one stored sample; doubles each time the cap is hit. */
  private stride = 1;
  private acc: StatsSample | null = null;
  private accN = 0;

  push(batch: StatsSample[]): void {
    if (batch.length === 0) return;
    for (const s of batch) {
      // Merge `stride` raw samples into one: levels from the newest, event counts summed.
      this.acc = this.acc ? mergeCounts(this.acc, s) : s;
      if (++this.accN < this.stride) continue;
      this.samples.push(this.acc);
      this.acc = null;
      this.accN = 0;
      if (this.samples.length >= MAX_SAMPLES) {
        // Halve resolution: keep every other sample. Interval counts (births/deaths) of
        // dropped samples are folded into the kept neighbour so totals stay correct.
        const kept: StatsSample[] = [];
        for (let i = 0; i < this.samples.length; i += 2) {
          const a = this.samples[i], b = this.samples[i + 1];
          kept.push(b ? mergeCounts(a, b) : a);
        }
        this.samples = kept;
        this.stride *= 2;
      }
    }
    this.version++;
  }

  clear(): void {
    this.samples = [];
    this.stride = 1;
    this.acc = null;
    this.accN = 0;
    this.version++;
  }
}

function mergeCounts(a: StatsSample, b: StatsSample): StatsSample {
  const m = (x: StatsSample['prey'], y: StatsSample['prey']) => ({
    ...y,
    births: x.births + y.births,
    deathsPredation: x.deathsPredation + y.deathsPredation,
    deathsStarvation: x.deathsStarvation + y.deathsStarvation,
    deathsAge: x.deathsAge + y.deathsAge,
  });
  return { ...b, prey: m(a.prey, b.prey), predator: m(a.predator, b.predator) };
}

export class SimClient {
  private worker: Worker;
  private epoch = 0;
  latest: FrameMessage | null = null;
  readonly history = new StatsHistory();
  onError: ((message: string) => void) | null = null;

  constructor() {
    this.worker = new Worker(new URL('../worker/sim.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<FromWorker>) => {
      const m = e.data;
      if (m.type === 'error') { this.onError?.(m.message); return; }
      this.post({ type: 'ack' });
      if (m.epoch !== this.epoch) return; // stale frame from before a reset
      this.latest = m;
      this.history.push(m.samples);
    };
  }

  private post(m: ToWorker): void {
    this.worker.postMessage(m);
  }

  reset(config: SimConfig): void {
    this.epoch++;
    this.latest = null;
    this.history.clear();
    this.post({ type: 'reset', config, epoch: this.epoch });
  }

  setConfig(config: SimConfig): void { this.post({ type: 'config', config }); }
  setRunning(running: boolean): void { this.post({ type: 'run', running }); }
  setSpeed(speed: number): void { this.post({ type: 'speed', speed }); }
  step(steps: number): void { this.post({ type: 'step', steps }); }
  select(id: number | null): void { this.post({ type: 'select', id }); }
  dispose(): void { this.worker.terminate(); }
}
