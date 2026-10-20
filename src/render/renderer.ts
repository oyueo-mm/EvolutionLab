// Canvas 2D renderer. Draws the latest worker snapshot; never touches React.
// Bodies are batched into one path per species (one fill call each), food into one path.

import { CREATURE_STRIDE, type FrameMessage } from '../worker/protocol';
import type { SimConfig, ZoneAccess } from '../sim/types';

export const COLORS = {
  background: '#e9e9e4',
  world: '#fbfbf8',
  worldBorder: '#c9c9c0',
  grid: '#efefe9',
  prey: '#26262b',
  predator: '#d9412e',
  food: '#2f9e44',
  select: '#2563eb',
};

const ZONE_STYLE: Record<ZoneAccess, { fill: string; stroke: string; label: string }> = {
  prey: { fill: 'rgba(59,99,196,0.08)', stroke: 'rgba(59,99,196,0.55)', label: '피식자 전용' },
  predator: { fill: 'rgba(217,65,46,0.07)', stroke: 'rgba(217,65,46,0.55)', label: '포식자 전용' },
  all: { fill: 'rgba(120,120,120,0.06)', stroke: 'rgba(110,110,110,0.5)', label: '모두 출입' },
  none: { fill: 'rgba(60,60,60,0.14)', stroke: 'rgba(60,60,60,0.6)', label: '출입 불가' },
};

export class Camera {
  /** World coordinate at the canvas centre. */
  cx = 0;
  cy = 0;
  /** Screen pixels per world unit. */
  zoom = 1;

  fit(worldW: number, worldH: number, viewW: number, viewH: number): void {
    this.cx = worldW / 2;
    this.cy = worldH / 2;
    this.zoom = Math.min(viewW / (worldW * 1.04), viewH / (worldH * 1.04));
  }

  toWorld(sx: number, sy: number, viewW: number, viewH: number): [number, number] {
    return [(sx - viewW / 2) / this.zoom + this.cx, (sy - viewH / 2) / this.zoom + this.cy];
  }

  zoomAt(sx: number, sy: number, factor: number, viewW: number, viewH: number): void {
    const [wx, wy] = this.toWorld(sx, sy, viewW, viewH);
    this.zoom = Math.min(40, Math.max(0.1, this.zoom * factor));
    // keep the world point under the cursor fixed
    this.cx = wx - (sx - viewW / 2) / this.zoom;
    this.cy = wy - (sy - viewH / 2) / this.zoom;
  }
}

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  viewW: number,
  viewH: number,
  dpr: number,
  cam: Camera,
  config: SimConfig,
  frame: FrameMessage | null,
  selectedId: number | null,
  selectedVision: number,
): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, viewW, viewH);

  const z = cam.zoom;
  ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (viewW / 2 - cam.cx * z), dpr * (viewH / 2 - cam.cy * z));
  const { width: W, height: H } = config.world;

  ctx.fillStyle = COLORS.world;
  ctx.fillRect(0, 0, W, H);

  // grid every 100 units (only when it is not visually noisy)
  if (z * 100 > 24) {
    ctx.beginPath();
    for (let x = 100; x < W; x += 100) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = 100; y < H; y += 100) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1 / z;
    ctx.stroke();
  }

  // zones
  for (const zone of config.zones) {
    if (!zone.enabled) continue;
    const st = ZONE_STYLE[zone.access];
    ctx.beginPath();
    ctx.arc(zone.x, zone.y, zone.radius, 0, Math.PI * 2);
    ctx.fillStyle = st.fill;
    ctx.fill();
    ctx.setLineDash([6 / z, 4 / z]);
    ctx.strokeStyle = st.stroke;
    ctx.lineWidth = 1.5 / z;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = st.stroke;
    ctx.font = `${11 / z}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(st.label, zone.x, zone.y - zone.radius - 6 / z);
  }

  ctx.strokeStyle = COLORS.worldBorder;
  ctx.lineWidth = 1 / z;
  ctx.strokeRect(0, 0, W, H);

  if (!frame) return;

  // Paths are filled in chunks: one giant path with tens of thousands of sub-paths makes the
  // rasteriser superlinear (measured: 20k bodies in one path ≈ 1.6 s/frame).
  const CHUNK = 512;

  // food: small squares
  const fr = Math.max(config.food.radius, 1.2 / z);
  const food = frame.food;
  ctx.fillStyle = COLORS.food;
  ctx.beginPath();
  for (let k = 0; k < frame.foodCount; k++) {
    ctx.rect(food[k * 2] - fr, food[k * 2 + 1] - fr, fr * 2, fr * 2);
    if ((k + 1) % CHUNK === 0) { ctx.fill(); ctx.beginPath(); }
  }
  ctx.fill();

  // bodies: oriented rectangles, batched per species. Tiny bodies get a minimum on-screen size.
  const minHalf = 0.9 / z;
  const c = frame.creatures;
  // visible world rectangle (+ margin for the largest body) for culling when zoomed in
  const margin = 20;
  const vx0 = cam.cx - viewW / 2 / z - margin, vx1 = cam.cx + viewW / 2 / z + margin;
  const vy0 = cam.cy - viewH / 2 / z - margin, vy1 = cam.cy + viewH / 2 / z + margin;
  for (const sp of [0, 1]) {
    ctx.fillStyle = sp === 0 ? COLORS.prey : COLORS.predator;
    ctx.beginPath();
    let inPath = 0;
    for (let i = 0; i < frame.count; i++) {
      const o = i * CREATURE_STRIDE;
      if (c[o + 5] !== sp) continue;
      const x = c[o], y = c[o + 1], a = c[o + 2];
      if (x < vx0 || x > vx1 || y < vy0 || y > vy1) continue;
      const hw = Math.max(c[o + 3] * 0.5, minHalf), hh = Math.max(c[o + 4] * 0.5, minHalf);
      if ((hw > hh ? hw : hh) * z < 1.5) {
        // under ~3 px orientation is invisible: one axis-aligned square, no trig
        const r = (hw + hh) * 0.5;
        ctx.rect(x - r, y - r, r * 2, r * 2);
      } else {
        const cs = Math.cos(a), sn = Math.sin(a);
        const ax = cs * hw, ay = sn * hw; // along heading
        const bx = -sn * hh, by = cs * hh; // across heading
        ctx.moveTo(x + ax + bx, y + ay + by);
        ctx.lineTo(x + ax - bx, y + ay - by);
        ctx.lineTo(x - ax - bx, y - ay - by);
        ctx.lineTo(x - ax + bx, y - ay + by);
        ctx.closePath();
      }
      if (++inPath === CHUNK) { ctx.fill(); ctx.beginPath(); inPath = 0; }
    }
    ctx.fill();
  }

  // selection marker
  if (selectedId !== null) {
    const i = indexOf(frame, selectedId);
    if (i >= 0) {
      const o = i * CREATURE_STRIDE;
      const x = c[o], y = c[o + 1];
      const r = Math.max(c[o + 3], c[o + 4]) * 0.5 + 5 / z;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.strokeStyle = COLORS.select;
      ctx.lineWidth = 2 / z;
      ctx.stroke();
      if (selectedVision > 0) {
        ctx.beginPath();
        ctx.arc(x, y, selectedVision, 0, Math.PI * 2);
        ctx.setLineDash([3 / z, 3 / z]);
        ctx.lineWidth = 1 / z;
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }
}

export function indexOf(frame: FrameMessage, id: number): number {
  const ids = frame.ids;
  for (let i = 0; i < frame.count; i++) if (ids[i] === id) return i;
  return -1;
}

/** Nearest creature to a world point within `maxDist` world units, or null. */
export function pick(frame: FrameMessage, wx: number, wy: number, maxDist: number): number | null {
  let best: number | null = null;
  let bestD = maxDist * maxDist;
  const c = frame.creatures;
  for (let i = 0; i < frame.count; i++) {
    const o = i * CREATURE_STRIDE;
    const r = Math.max(c[o + 3], c[o + 4]) * 0.5;
    const dx = c[o] - wx, dy = c[o + 1] - wy;
    const d = Math.max(0, Math.sqrt(dx * dx + dy * dy) - r);
    if (d * d <= bestD) { bestD = d * d; best = frame.ids[i]; }
  }
  return best;
}
