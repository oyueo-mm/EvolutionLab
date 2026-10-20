import { describe, expect, it } from 'vitest';
import { DEFAULT_DISPLAY_SCALE, MIN_HALF_PX, bodyShape, drawnHalfExtents, effectiveDisplayScale, noseDepth } from './sizing';

const AREA = 1200 * 800; // default world

describe('display sizing (render only)', () => {
  it('default scale enlarges bodies in a normally populated world', () => {
    expect(DEFAULT_DISPLAY_SCALE).toBeGreaterThanOrEqual(1.3);
    expect(effectiveDisplayScale(DEFAULT_DISPLAY_SCALE, 225, AREA)).toBe(DEFAULT_DISPLAY_SCALE);
    expect(effectiveDisplayScale(DEFAULT_DISPLAY_SCALE, 2000, AREA)).toBe(DEFAULT_DISPLAY_SCALE);
  });

  it('shrinks the scale towards 1 in crowded worlds but never below 1', () => {
    const s5k = effectiveDisplayScale(1.5, 5000, AREA);
    expect(s5k).toBeLessThan(1.5);
    expect(s5k).toBeGreaterThan(1);
    expect(effectiveDisplayScale(1.5, 20000, AREA)).toBe(1);
    expect(effectiveDisplayScale(3, 100000, AREA)).toBe(1);
  });

  it('limits the scale for very large populations even in a sparse world (drawing cost)', () => {
    const huge = 1e9; // so sparse that the crowding limit never applies
    expect(effectiveDisplayScale(1.5, 5000, huge)).toBe(1.5);
    expect(effectiveDisplayScale(1.5, 10000, huge)).toBeCloseTo(1.25);
    expect(effectiveDisplayScale(1.5, 15000, huge)).toBe(1);
    expect(effectiveDisplayScale(3, 50000, huge)).toBe(1);
  });

  it('scale 1 is the physical size, and the requested scale is clamped to [1, 3]', () => {
    expect(effectiveDisplayScale(1, 10, AREA)).toBe(1);
    expect(effectiveDisplayScale(0.2, 10, AREA)).toBe(1);
    expect(effectiveDisplayScale(9, 10, AREA)).toBe(3);
  });

  it('does not depend on the camera zoom (no size jumps while zooming)', () => {
    // effectiveDisplayScale has no zoom input; drawn size in world units is zoom-independent above the minimum
    const [a] = drawnHalfExtents(6, 6, 1.5, 1);
    const [b] = drawnHalfExtents(6, 6, 1.5, 4);
    expect(a).toBe(4.5);
    expect(b).toBe(4.5);
  });

  it('applies a minimum on-screen size at low zoom, per axis', () => {
    const zoom = 0.1; // 1 world unit = 0.1 px
    const [hw, hh] = drawnHalfExtents(6, 2, 1, zoom);
    expect(hw * zoom).toBeCloseTo(MIN_HALF_PX);
    expect(hh * zoom).toBeCloseTo(MIN_HALF_PX);
    // above the minimum the aspect ratio is preserved
    const [w2, h2] = drawnHalfExtents(12, 4, 1.5, 2);
    expect(w2 / h2).toBeCloseTo(3);
  });

  it('chooses simpler shapes for tiny bodies and a nose inside the body for larger ones', () => {
    expect(bodyShape(1, 1, 1)).toBe('square');
    expect(bodyShape(2, 1, 1)).toBe('square');
    expect(bodyShape(3, 1, 1)).toBe('rect');
    expect(bodyShape(4.5, 4.5, 1)).toBe('arrow');
    for (const [hw, hh] of [[4, 4], [10, 2], [1, 6]]) {
      const n = noseDepth(hw, hh);
      expect(n).toBeGreaterThan(0);
      expect(n).toBeLessThanOrEqual(hw); // shoulders never behind the back edge
    }
  });
});
