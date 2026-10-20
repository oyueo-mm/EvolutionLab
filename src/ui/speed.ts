// Speed slider mapping. Speed is multiplicative (2× is "twice as fast", 0.5× "half as fast"),
// so the slider is logarithmic: equal distances on the track are equal speed ratios.

export const SPEED_MIN = 0.25;
export const SPEED_MAX = 50;
/** Frequently used values: shown as ticks under the slider and snapped to while dragging. */
export const SPEED_TICKS = [1, 2, 5, 10] as const;
/** Slider resolution: positions are integers in [0, SLIDER_STEPS]. */
export const SLIDER_STEPS = 1000;
/** Fraction of the track within which dragging snaps to a tick. */
const SNAP = 0.012;

const LN_RATIO = Math.log(SPEED_MAX / SPEED_MIN);

/** Speed → position in [0, 1]. */
export function speedToPos(speed: number): number {
  const s = Math.min(SPEED_MAX, Math.max(SPEED_MIN, speed));
  return Math.log(s / SPEED_MIN) / LN_RATIO;
}

/** Position in [0, 1] → speed, snapped to a tick when close, otherwise rounded for display. */
export function posToSpeed(pos: number): number {
  const p = Math.min(1, Math.max(0, pos));
  for (const t of SPEED_TICKS) if (Math.abs(p - speedToPos(t)) <= SNAP) return t;
  return roundSpeed(SPEED_MIN * Math.exp(p * LN_RATIO));
}

/** Rounds to a readable precision: 0.25–1 → 2 decimals, 1–10 → 1 decimal, ≥10 → integer. */
export function roundSpeed(s: number): number {
  if (s < 1) return Math.round(s * 100) / 100;
  if (s < 10) return Math.round(s * 10) / 10;
  return Math.round(s);
}

export function formatSpeed(s: number): string {
  if (!Number.isFinite(s)) return 'MAX';
  return `${roundSpeed(s)}×`;
}
