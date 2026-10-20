import { describe, expect, it } from 'vitest';
import { SpatialGrid } from './spatialGrid';
import { rectCircleOverlap, rectRectOverlap } from './geometry';
import { Rng } from './rng';

describe('SpatialGrid', () => {
  it('query returns a superset of brute-force neighbours', () => {
    const rng = new Rng(1);
    const N = 2000, W = 1000, H = 700;
    const xs = new Float64Array(N), ys = new Float64Array(N);
    const idx = new Int32Array(N);
    for (let i = 0; i < N; i++) { xs[i] = rng.range(0, W); ys[i] = rng.range(0, H); idx[i] = i; }
    const grid = new SpatialGrid(W, H, 40);
    grid.build(xs, ys, idx, N);
    for (let q = 0; q < 200; q++) {
      const qx = rng.range(-20, W + 20), qy = rng.range(-20, H + 20), r = rng.range(1, 90);
      const found = new Set<number>();
      grid.query(qx, qy, r, (i) => found.add(i));
      for (let i = 0; i < N; i++) {
        if ((xs[i] - qx) ** 2 + (ys[i] - qy) ** 2 <= r * r) expect(found.has(i)).toBe(true);
      }
    }
  });

  it('contains every built item exactly once', () => {
    const xs = [5, 500, 999, -10, 2000], ys = [5, 300, 699, -10, 2000];
    const grid = new SpatialGrid(1000, 700, 40);
    grid.build(xs, ys, new Int32Array([0, 1, 2, 3, 4]), 5);
    const seen: number[] = [];
    grid.query(500, 350, 2000, (i) => seen.push(i));
    expect(seen.sort()).toEqual([0, 1, 2, 3, 4]); // out-of-bounds items are clamped into edge cells
  });
});

describe('geometry', () => {
  it('rect/circle overlap respects orientation', () => {
    // 20×4 rect along +x at origin
    expect(rectCircleOverlap(0, 0, 1, 0, 10, 2, 9, 0, 1)).toBe(true);
    expect(rectCircleOverlap(0, 0, 1, 0, 10, 2, 0, 9, 1)).toBe(false);
    // rotated 90°: now long along y
    expect(rectCircleOverlap(0, 0, 0, 1, 10, 2, 0, 9, 1)).toBe(true);
    expect(rectCircleOverlap(0, 0, 0, 1, 10, 2, 9, 0, 1)).toBe(false);
  });

  it('rect/rect SAT detects separation and overlap', () => {
    const c45 = Math.SQRT1_2;
    expect(rectRectOverlap(0, 0, 1, 0, 5, 5, 9, 0, 1, 0, 5, 5)).toBe(true);
    expect(rectRectOverlap(0, 0, 1, 0, 5, 5, 11, 0, 1, 0, 5, 5)).toBe(false);
    // Thin rotated stick: bounding circles overlap but rectangles do not
    expect(rectRectOverlap(0, 0, 1, 0, 1, 1, 6, 6, c45, -c45, 10, 0.5)).toBe(false);
    expect(rectRectOverlap(0, 0, 1, 0, 1, 1, 6, 6, c45, c45, 10, 0.5)).toBe(true);
  });
});
