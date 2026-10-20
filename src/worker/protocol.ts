// Messages between the UI thread and the simulation worker.
import type { CreatureInfo } from '../sim/engine';
import type { SimConfig, StatsSample } from '../sim/types';

/** Floats per creature in a frame snapshot: x, y, heading, width, height, species. */
export const CREATURE_STRIDE = 6;

export type ToWorker =
  /** `epoch` tags later frames so the UI can drop frames from a world that no longer exists. */
  | { type: 'reset'; config: SimConfig; epoch: number }
  /** Live parameter change; does not reset the world. */
  | { type: 'config'; config: SimConfig }
  | { type: 'run'; running: boolean }
  /** Simulated seconds per real second; Infinity = as fast as possible. */
  | { type: 'speed'; speed: number }
  | { type: 'step'; steps: number }
  | { type: 'select'; id: number | null }
  /** Frame received; enables back-pressure so a slow UI never builds a message queue. */
  | { type: 'ack' };

export interface FrameMessage {
  type: 'frame';
  epoch: number;
  time: number;
  tick: number;
  running: boolean;
  count: number;
  /** count × CREATURE_STRIDE floats (transferred, not copied). */
  creatures: Float32Array;
  ids: Uint32Array;
  foodCount: number;
  /** foodCount × 2 floats. */
  food: Float32Array;
  prey: number;
  predators: number;
  selected: CreatureInfo | null;
  /** New statistics samples since the previous frame. */
  samples: StatsSample[];
  /** Measured simulation updates (ticks) per real second. */
  ups: number;
  /** Mean wall-clock milliseconds per tick over the last measurement window. */
  msPerTick: number;
  totalBirths: number[];
  totalDeaths: number[][];
}

export type FromWorker = FrameMessage | { type: 'error'; message: string };
