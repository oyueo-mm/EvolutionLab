import { describe, expect, it } from 'vitest';
import { SLIDER_STEPS, SPEED_MAX, SPEED_MIN, SPEED_TICKS, formatSpeed, posToSpeed, roundSpeed, speedToPos } from './speed';

describe('speed slider mapping', () => {
  it('maps the ends of the track to the speed limits', () => {
    expect(posToSpeed(0)).toBe(SPEED_MIN);
    expect(posToSpeed(1)).toBe(SPEED_MAX);
    expect(speedToPos(SPEED_MIN)).toBeCloseTo(0);
    expect(speedToPos(SPEED_MAX)).toBeCloseTo(1);
  });

  it('is logarithmic: equal ratios take equal distances', () => {
    const d1 = speedToPos(2) - speedToPos(1);
    const d2 = speedToPos(10) - speedToPos(5);
    expect(d1).toBeCloseTo(d2, 10);
  });

  it('every tick is reachable exactly and its position round-trips', () => {
    for (const t of SPEED_TICKS) expect(posToSpeed(speedToPos(t))).toBe(t);
  });

  it('snaps to ticks near them but not far from them', () => {
    const p5 = speedToPos(5);
    expect(posToSpeed(p5 + 0.005)).toBe(5);
    expect(posToSpeed(p5 - 0.005)).toBe(5);
    expect(posToSpeed(p5 + 0.05)).not.toBe(5);
  });

  it('is monotonic over the whole track, so dragging never moves backwards', () => {
    let prev = 0;
    for (let i = 0; i <= SLIDER_STEPS; i++) {
      const s = posToSpeed(i / SLIDER_STEPS);
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
  });

  it('clamps out-of-range input', () => {
    expect(posToSpeed(-1)).toBe(SPEED_MIN);
    expect(posToSpeed(2)).toBe(SPEED_MAX);
    expect(speedToPos(1000)).toBeCloseTo(1);
  });

  it('formats readable values', () => {
    expect(formatSpeed(1)).toBe('1×');
    expect(formatSpeed(0.25)).toBe('0.25×');
    expect(formatSpeed(3.14159)).toBe('3.1×');
    expect(formatSpeed(23.7)).toBe('24×');
    expect(formatSpeed(Infinity)).toBe('MAX');
    expect(roundSpeed(0.333)).toBe(0.33);
  });
});
