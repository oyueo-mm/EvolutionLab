/// <reference lib="webworker" />
// Runs the simulation off the UI thread with a fixed time step.
// Simulation speed (ticks/s) is independent of the render rate: the loop accumulates
// real time × speed, runs whole ticks inside a time budget, and posts a snapshot at most
// ~30 times per second (only when the UI has acknowledged the previous frames).

import { Simulation } from '../sim/engine';
import { GENE_COUNT } from '../sim/types';
import { CREATURE_STRIDE, type FrameMessage, type ToWorker } from './protocol';

declare const self: DedicatedWorkerGlobalScope;

const BUDGET_MS = 14; // max contiguous simulation work before yielding
const FRAME_INTERVAL_MS = 33;
const MAX_IN_FLIGHT = 2;

let sim: Simulation | null = null;
let running = false;
let speed = 1;
let acc = 0; // simulated seconds owed
let last = performance.now();
let lastFrame = 0;
let inFlight = 0;
let selectedId: number | null = null;
let epoch = 0;
let dirty = true;
let scheduled = false;

// performance window
let winStart = performance.now();
let winTicks = 0;
let winWork = 0;
let ups = 0;
let msPerTick = 0;

const channel = new MessageChannel();
channel.port1.onmessage = () => { scheduled = false; loop(); };

function schedule(immediate: boolean) {
  if (scheduled) return;
  scheduled = true;
  if (immediate) channel.port2.postMessage(0);
  else setTimeout(() => { scheduled = false; loop(); }, running ? 4 : 16);
}

function runTicks(n: number, deadline: number): number {
  let done = 0;
  const s = sim!;
  while (done < n) {
    s.step(1);
    done++;
    if ((done & 3) === 0 && performance.now() >= deadline) break;
  }
  return done;
}

function loop() {
  const now = performance.now();
  const real = Math.min(now - last, 250) / 1000;
  last = now;
  let budgetHit = false;

  if (sim && running) {
    const dt = sim.config.dt;
    acc += real * speed;
    const wanted = Number.isFinite(speed) ? Math.floor(acc / dt + 1e-9) : Number.MAX_SAFE_INTEGER;
    if (wanted > 0) {
      const t0 = performance.now();
      const done = runTicks(wanted, t0 + BUDGET_MS);
      winWork += performance.now() - t0;
      winTicks += done;
      if (done < wanted) {
        budgetHit = true;
        acc = 0; // drop the backlog instead of spiralling; the HUD shows the achieved rate
      } else {
        acc -= done * dt;
      }
      if (done > 0) dirty = true;
    }
  } else {
    acc = 0;
  }

  const t = performance.now();
  if (t - winStart >= 500) {
    ups = (winTicks * 1000) / (t - winStart);
    msPerTick = winTicks > 0 ? winWork / winTicks : 0;
    winStart = t; winTicks = 0; winWork = 0;
  }

  if (sim && (dirty || selectedId !== null) && t - lastFrame >= FRAME_INTERVAL_MS && inFlight < MAX_IN_FLIGHT) {
    postFrame();
    lastFrame = t;
    dirty = false;
  }
  schedule(budgetHit);
}

function postFrame() {
  const s = sim!;
  const n = s.n;
  const creatures = new Float32Array(n * CREATURE_STRIDE);
  const ids = new Uint32Array(n);
  const G = GENE_COUNT;
  for (let i = 0; i < n; i++) {
    const o = i * CREATURE_STRIDE;
    creatures[o] = s.x[i];
    creatures[o + 1] = s.y[i];
    creatures[o + 2] = s.heading[i];
    creatures[o + 3] = s.genes[i * G];
    creatures[o + 4] = s.genes[i * G + 1];
    creatures[o + 5] = s.species[i];
    ids[i] = s.id[i];
  }
  const food = new Float32Array(s.foodN * 2);
  for (let k = 0; k < s.foodN; k++) { food[k * 2] = s.fx[k]; food[k * 2 + 1] = s.fy[k]; }
  const msg: FrameMessage = {
    type: 'frame',
    epoch,
    time: s.time,
    tick: s.tick,
    running,
    count: n,
    creatures,
    ids,
    foodCount: s.foodN,
    food,
    prey: s.pop[0],
    predators: s.pop[1],
    selected: selectedId !== null ? s.describe(selectedId) : null,
    samples: s.drainSamples(),
    ups: running ? ups : 0,
    msPerTick,
    totalBirths: s.totalBirths.slice(),
    totalDeaths: s.totalDeaths.map((d) => d.slice()),
  };
  inFlight++;
  self.postMessage(msg, [creatures.buffer, ids.buffer, food.buffer]);
}

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  try {
    switch (m.type) {
      case 'reset':
        sim = new Simulation(m.config);
        epoch = m.epoch;
        acc = 0;
        dirty = true;
        break;
      case 'config':
        if (sim) sim.config = m.config;
        dirty = true;
        break;
      case 'run':
        running = m.running;
        last = performance.now();
        dirty = true;
        break;
      case 'speed':
        speed = m.speed;
        break;
      case 'step':
        if (sim) { sim.step(m.steps); dirty = true; }
        break;
      case 'select':
        selectedId = m.id;
        dirty = true;
        break;
      case 'ack':
        inFlight = Math.max(0, inFlight - 1);
        break;
    }
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err) });
  }
  schedule(false);
};

schedule(false);
