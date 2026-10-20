// How large bodies are *drawn*. Pure functions, unit-tested.
//
// Three things are kept independent:
//   1. physical size  – the width/height genes. Used for collisions, energy and selection; never
//                       changed by anything in this file.
//   2. display scale  – a viewing preference (default ×1.5) that enlarges the drawn body around its
//                       centre so individuals, their shape and heading are easy to see.
//   3. camera zoom    – screen pixels per world unit.
// On top of that a minimum on-screen size keeps bodies from vanishing at low zoom.

/** Smallest half-extent a body is drawn with, in screen pixels. */
export const MIN_HALF_PX = 1;
/** Display scale used until the viewer changes it. */
export const DEFAULT_DISPLAY_SCALE = 1.5;
export const DISPLAY_SCALE_MIN = 1;
export const DISPLAY_SCALE_MAX = 3;
/** Typical body length (world units) used by the crowding limit: a 6×6 prey. */
const TYPICAL_BODY = 6;
/** A drawn body may span at most this fraction of the mean spacing between creatures. */
const CROWD_LIMIT = 0.55;
/**
 * Performance guard: drawing cost grows with drawn area, and with tens of thousands of creatures
 * individuals are not what one looks at. Full scale up to PERF_FULL creatures, linearly down to 1
 * at PERF_NONE.
 */
const PERF_FULL = 5000;
const PERF_NONE = 15000;

/**
 * Display scale actually applied. In crowded worlds enlarged bodies would merge into a
 * carpet, and with very many creatures the extra drawn area costs frame time, so the scale is
 * reduced towards 1 (never below: bodies are never drawn smaller than they physically are).
 * Depends on the world and the population, not the camera, so zooming does not make bodies
 * jump in size.
 */
export function effectiveDisplayScale(requested: number, creatureCount: number, worldArea: number): number {
  const s = Math.min(DISPLAY_SCALE_MAX, Math.max(DISPLAY_SCALE_MIN, requested));
  if (s === 1 || creatureCount <= 0 || worldArea <= 0) return s;
  const meanSpacing = Math.sqrt(worldArea / creatureCount);
  const crowdCap = (CROWD_LIMIT * meanSpacing) / TYPICAL_BODY;
  const t = Math.min(1, Math.max(0, (creatureCount - PERF_FULL) / (PERF_NONE - PERF_FULL)));
  const perfCap = s - (s - 1) * t;
  return Math.max(1, Math.min(s, crowdCap, perfCap));
}

/** Drawn half extents (world units) for a body of physical size w×h. */
export function drawnHalfExtents(w: number, h: number, scale: number, zoom: number): [number, number] {
  const min = MIN_HALF_PX / zoom;
  return [Math.max(w * 0.5 * scale, min), Math.max(h * 0.5 * scale, min)];
}

/**
 * Body outline in local coordinates (x = heading). Large enough bodies get a blunt "nose"
 * so the heading is visible even for square bodies; the nose is cut from inside the drawn
 * rectangle, so the shape never extends beyond it.
 */
export type BodyShape = 'square' | 'rect' | 'arrow';

export function bodyShape(hw: number, hh: number, zoom: number): BodyShape {
  const px = Math.max(hw, hh) * zoom;
  // Below ~5 px across, heading is not readable anyway, and axis-aligned squares are far cheaper
  // to rasterise than rotated polygons (measured: 5,000 bodies ≈10× main-thread cost otherwise).
  if (px < 2.5) return 'square';
  if (px < 3.5) return 'rect';
  return 'arrow';
}

/**
 * Depth of the nose cut, as used by the 'arrow' shape: the front tapers over one half-width,
 * so a square body reads as a "house" pointing forward. Never deeper than the half-length,
 * so the shoulders stay inside the body.
 */
export function noseDepth(hw: number, hh: number): number {
  return Math.min(hh, hw);
}
