import { memo, useEffect, useRef } from 'react';
import type { SimClient } from '../client/simClient';
import { Camera, drawFrame, indexOf, pick, type Inset } from '../render/renderer';
import { G_VISION, type SimConfig } from '../sim/types';
import { CREATURE_STRIDE } from '../worker/protocol';

interface Props {
  client: SimClient;
  config: SimConfig;
  selectedId: number | null;
  follow: boolean;
  onSelect: (id: number | null) => void;
  /** Written every frame with the measured render FPS (no React state involved). */
  fpsRef: React.MutableRefObject<number>;
  /** Incremented by the parent to request "fit world to view" (and resume auto-fit). */
  fitSignal: number;
  zoomSignal: { n: number; factor: number };
  /** Pixels at the bottom reserved for the floating control dock when fitting the world. */
  insetBottom: number;
}

const SIDE_INSET = 16;
const TOP_INSET = 16;

export const SimCanvas = memo(function SimCanvas({ client, config, selectedId, follow, onSelect, fpsRef, fitSignal, zoomSignal, insetBottom }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const camRef = useRef(new Camera());
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  /**
   * While true the camera keeps the whole world fitted, so opening or closing a panel
   * (which resizes the canvas) automatically uses the new space. Any manual pan/zoom
   * turns it off so the user's viewpoint is never yanked away; "전체" turns it back on.
   */
  const autoFit = useRef(true);
  const insetRef = useRef<Inset>({ top: TOP_INSET, right: SIDE_INSET, bottom: insetBottom, left: SIDE_INSET });
  // Mirror props into refs so the rAF loop and handlers never need to restart.
  const propsRef = useRef({ config, selectedId, follow });
  propsRef.current = { config, selectedId, follow };
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  /** Everything the last painted bitmap depended on; a frame is repainted only when one of these changed. */
  const painted = useRef<{ frame: unknown; cx: number; cy: number; zoom: number; cw: number; ch: number; cfg: unknown; sel: number | null; vision: number } | null>(null);

  const refit = () => {
    const { w, h } = sizeRef.current;
    if (w <= 0) return;
    const { width, height } = propsRef.current.config.world;
    camRef.current.fit(width, height, w, h, insetRef.current);
  };

  // size tracking
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ro = new ResizeObserver(() => {
      const r = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const cw = Math.round(r.width * dpr), ch = Math.round(r.height * dpr);
      sizeRef.current = { w: r.width, h: r.height, dpr };
      // Assigning width/height clears the bitmap, so only do it when it really changed.
      if (canvas.width !== cw) canvas.width = cw;
      if (canvas.height !== ch) canvas.height = ch;
      if (autoFit.current) refit();
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  // dock height changed → keep the world clear of it (only while auto-fitting)
  useEffect(() => {
    insetRef.current = { ...insetRef.current, bottom: insetBottom };
    if (autoFit.current) refit();
  }, [insetBottom]);

  useEffect(() => {
    autoFit.current = true;
    refit();
  }, [fitSignal]);

  useEffect(() => {
    if (zoomSignal.n === 0) return;
    autoFit.current = false;
    const { w, h } = sizeRef.current;
    camRef.current.zoomAt(w / 2, h / 2, zoomSignal.factor, w, h);
  }, [zoomSignal]);

  // render loop
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d', { alpha: false })!;
    let raf = 0;
    let frames = 0;
    let fpsStart = performance.now();
    const render = () => {
      const { w, h, dpr } = sizeRef.current;
      const { config: cfg, selectedId: sel, follow: fol } = propsRef.current;
      const frame = client.latest;
      let vision = 0;
      if (frame && sel !== null) {
        const i = indexOf(frame, sel);
        if (i >= 0 && fol) {
          autoFit.current = false;
          camRef.current.cx = frame.creatures[i * CREATURE_STRIDE];
          camRef.current.cy = frame.creatures[i * CREATURE_STRIDE + 1];
        }
        if (frame.selected) vision = frame.selected.genes[G_VISION];
      }
      const cam = camRef.current;
      const p = painted.current;
      const unchanged = p !== null && p.frame === frame && p.cx === cam.cx && p.cy === cam.cy && p.zoom === cam.zoom
        && p.cw === canvas.width && p.ch === canvas.height && p.cfg === cfg && p.sel === sel && p.vision === vision;
      // The worker posts snapshots at ~30 Hz and nothing moves while paused, so most rAF ticks have
      // nothing new to show. Skipping the repaint keeps the main thread free for the UI.
      if (w > 0 && !unchanged) {
        drawFrame(ctx, w, h, dpr, cam, cfg, frame, sel, vision);
        painted.current = { frame, cx: cam.cx, cy: cam.cy, zoom: cam.zoom, cw: canvas.width, ch: canvas.height, cfg, sel, vision };
      }
      frames++;
      const now = performance.now();
      if (now - fpsStart >= 500) {
        fpsRef.current = (frames * 1000) / (now - fpsStart);
        frames = 0;
        fpsStart = now;
      }
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [client, fpsRef]);

  // input: wheel zoom, drag pan, click/tap select (pointer events cover mouse, pen and touch)
  useEffect(() => {
    const canvas = canvasRef.current!;
    let drag: { id: number; x: number; y: number; moved: boolean } | null = null;
    const local = (e: PointerEvent | WheelEvent) => {
      const r = canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top] as const;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      autoFit.current = false;
      const [sx, sy] = local(e);
      const { w, h } = sizeRef.current;
      camRef.current.zoomAt(sx, sy, Math.exp(-e.deltaY * 0.0015), w, h);
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!drag || drag.id !== e.pointerId) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      drag.moved = true;
      autoFit.current = false;
      const cam = camRef.current;
      cam.cx -= dx / cam.zoom;
      cam.cy -= dy / cam.zoom;
      drag.x = e.clientX;
      drag.y = e.clientY;
    };
    const onUp = (e: PointerEvent) => {
      if (!drag || drag.id !== e.pointerId) return;
      const wasClick = !drag.moved;
      drag = null;
      if (!wasClick) return;
      const frame = client.latest;
      if (!frame) return;
      const [sx, sy] = local(e);
      const { w, h } = sizeRef.current;
      const cam = camRef.current;
      const [wx, wy] = cam.toWorld(sx, sy, w, h);
      // touch needs a more generous hit radius than a mouse pointer
      const slop = (e.pointerType === 'touch' ? 20 : 10) / cam.zoom;
      onSelectRef.current(pick(frame, wx, wy, slop));
    };
    const onCancel = () => { drag = null; };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onCancel);
    return () => {
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onCancel);
    };
  }, [client]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="시뮬레이션 화면. 클릭하면 개체를 선택하고, 드래그로 이동하고, 휠로 확대합니다."
      className="block h-full w-full cursor-crosshair touch-none"
    />
  );
});
