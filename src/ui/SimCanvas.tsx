import { useEffect, useRef } from 'react';
import type { SimClient } from '../client/simClient';
import { Camera, drawFrame, indexOf, pick } from '../render/renderer';
import type { SimConfig } from '../sim/types';
import { CREATURE_STRIDE } from '../worker/protocol';
import { G_VISION } from '../sim/types';

interface Props {
  client: SimClient;
  config: SimConfig;
  selectedId: number | null;
  follow: boolean;
  onSelect: (id: number | null) => void;
  /** Written every frame with the measured render FPS (no React state involved). */
  fpsRef: React.MutableRefObject<number>;
  /** Incremented by the parent to request "fit world to view". */
  fitSignal: number;
  zoomSignal: { n: number; factor: number };
}

export function SimCanvas({ client, config, selectedId, follow, onSelect, fpsRef, fitSignal, zoomSignal }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const camRef = useRef(new Camera());
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  // Mirror props into refs so the rAF loop never needs to restart.
  const propsRef = useRef({ config, selectedId, follow });
  propsRef.current = { config, selectedId, follow };

  // resize + initial fit
  useEffect(() => {
    const canvas = canvasRef.current!;
    let fitted = false;
    const ro = new ResizeObserver(() => {
      const r = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      sizeRef.current = { w: r.width, h: r.height, dpr };
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      if (!fitted && r.width > 0) {
        const { width, height } = propsRef.current.config.world;
        camRef.current.fit(width, height, r.width, r.height);
        fitted = true;
      }
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const { w, h } = sizeRef.current;
    if (w > 0) camRef.current.fit(config.world.width, config.world.height, w, h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitSignal]);

  useEffect(() => {
    if (zoomSignal.n === 0) return;
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
          camRef.current.cx = frame.creatures[i * CREATURE_STRIDE];
          camRef.current.cy = frame.creatures[i * CREATURE_STRIDE + 1];
        }
        if (frame.selected) vision = frame.selected.genes[G_VISION];
      }
      if (w > 0) drawFrame(ctx, w, h, dpr, camRef.current, cfg, frame, sel, vision);
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

  // input: wheel zoom, drag pan, click select
  useEffect(() => {
    const canvas = canvasRef.current!;
    let drag: { x: number; y: number; moved: boolean } | null = null;
    const local = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top] as const;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const [sx, sy] = local(e);
      const { w, h } = sizeRef.current;
      camRef.current.zoomAt(sx, sy, Math.exp(-e.deltaY * 0.0015), w, h);
    };
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      drag = { x: e.clientX, y: e.clientY, moved: false };
    };
    const onMove = (e: MouseEvent) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      drag.moved = true;
      const cam = camRef.current;
      cam.cx -= dx / cam.zoom;
      cam.cy -= dy / cam.zoom;
      drag.x = e.clientX;
      drag.y = e.clientY;
    };
    const onUp = (e: MouseEvent) => {
      if (!drag) return;
      const wasClick = !drag.moved;
      drag = null;
      if (!wasClick) return;
      const frame = client.latest;
      if (!frame) return;
      const [sx, sy] = local(e);
      const { w, h } = sizeRef.current;
      const cam = camRef.current;
      const [wx, wy] = cam.toWorld(sx, sy, w, h);
      onSelectRef.current(pick(frame, wx, wy, 10 / cam.zoom));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [client]);

  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  return <canvas ref={canvasRef} className="block h-full w-full cursor-crosshair" />;
}
