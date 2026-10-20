import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { SimClient } from './client/simClient';
import { PRESETS, presetById } from './sim/presets';
import type { SimConfig } from './sim/types';
import { COLORS } from './render/renderer';
import { ControlPanel } from './ui/ControlPanel';
import { HeaderBar } from './ui/HeaderBar';
import { SelectedCreature } from './ui/Inspector';
import { SimCanvas } from './ui/SimCanvas';
import { STATS_MIN_HEIGHT, StatsDock } from './ui/StatsPanel';
import { TransportDock } from './ui/TransportDock';
import { loadLayout, saveLayout, useMediaQuery, usePoll } from './ui/hooks';
import { DEFAULT_DISPLAY_SCALE, DISPLAY_SCALE_MAX, DISPLAY_SCALE_MIN } from './render/sizing';

/** Settings panel width on wide screens (px). */
const SETTINGS_W = 360;
/** Below this width panels become overlays (drawer / bottom sheet) instead of pushing the canvas. */
const WIDE_QUERY = '(min-width: 1024px)';

// One worker for the app's lifetime (created outside React so HMR cannot duplicate it).
const client = new SimClient();

const defaultStatsHeight = () => Math.round(Math.min(360, window.innerHeight * 0.4));

export default function App() {
  const wide = useMediaQuery(WIDE_QUERY);

  // ---- experiment state
  const [presetId, setPresetId] = useState('A');
  const [config, setConfig] = useState<SimConfig>(() => presetById('A'));
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [maxMode, setMaxMode] = useState(false);
  const [resetPending, setResetPending] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [follow, setFollow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fitSignal, setFitSignal] = useState(0);
  const [zoomSignal, setZoomSignal] = useState({ n: 0, factor: 1 });
  const [dockHeight, setDockHeight] = useState(84);
  const fpsRef = useRef(0);
  const configRef = useRef(config);
  configRef.current = config;
  const speedRef = useRef(speed);
  speedRef.current = speed;

  // ---- layout state (remembered on wide screens; overlays on narrow screens always start closed)
  const [settingsOpen, setSettingsOpen] = useState(() => {
    if (!window.matchMedia(WIDE_QUERY).matches) return false;
    return loadLayout().settings ?? window.innerWidth >= 1280;
  });
  const [statsOpen, setStatsOpen] = useState(() => window.matchMedia(WIDE_QUERY).matches && (loadLayout().stats ?? false));
  const [statsHeight, setStatsHeight] = useState(() => loadLayout().statsHeight ?? defaultStatsHeight());
  const [viewportH, setViewportH] = useState(window.innerHeight);
  const [displayScale, setDisplayScale] = useState(() => {
    const v = loadLayout().displayScale;
    return typeof v === 'number' && v >= DISPLAY_SCALE_MIN && v <= DISPLAY_SCALE_MAX ? v : DEFAULT_DISPLAY_SCALE;
  });
  useEffect(() => { saveLayout({ displayScale }); }, [displayScale]);

  const firstLayoutEffect = useRef(true);
  useEffect(() => {
    // crossing the breakpoint: restore the desktop preference, or close overlays on small screens
    if (firstLayoutEffect.current) { firstLayoutEffect.current = false; return; }
    const stored = loadLayout();
    if (wide) {
      setSettingsOpen(stored.settings ?? window.innerWidth >= 1280);
      setStatsOpen(stored.stats ?? false);
    } else {
      setSettingsOpen(false);
      setStatsOpen(false);
    }
  }, [wide]);

  useEffect(() => {
    if (wide) saveLayout({ settings: settingsOpen, stats: statsOpen, statsHeight });
  }, [wide, settingsOpen, statsOpen, statsHeight]);

  useEffect(() => {
    const on = () => setViewportH(window.innerHeight);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);

  useEffect(() => {
    client.onError = setError;
    client.reset(configRef.current);
    client.setSpeed(1);
  }, []);

  // ---- experiment actions (stable identities so memoised panels do not re-render needlessly)
  const update = useCallback((mut: (c: SimConfig) => void, opts?: { resetOnly?: boolean }) => {
    const next = structuredClone(configRef.current);
    mut(next);
    setConfig(next);
    // Reset-only fields (initial counts, seed…) are harmless to send live: the engine reads them only at construction.
    client.setConfig(next);
    if (opts?.resetOnly) setResetPending(true);
  }, []);

  const resetWith = useCallback((next: SimConfig) => {
    setConfig(next);
    client.reset(next);
    setResetPending(false);
    setSelectedId(null);
    client.select(null);
    setFollow(false);
  }, []);

  const onPreset = useCallback((id: string) => {
    setPresetId(id);
    resetWith(presetById(id));
    setFitSignal((n) => n + 1);
  }, [resetWith]);

  const onReset = useCallback(() => resetWith(structuredClone(configRef.current)), [resetWith]);

  const onLoadConfig = useCallback((c: SimConfig) => {
    setPresetId('custom');
    resetWith(c);
    setFitSignal((n) => n + 1);
  }, [resetWith]);

  const onRun = useCallback((r: boolean) => { setRunning(r); client.setRunning(r); }, []);
  const onStep = useCallback(() => client.step(1), []);
  const onSpeed = useCallback((s: number) => {
    setSpeed(s);
    setMaxMode(false);
    client.setSpeed(s);
  }, []);
  const onMax = useCallback((on: boolean) => {
    setMaxMode(on);
    client.setSpeed(on ? Infinity : speedRef.current);
  }, []);

  const onSelect = useCallback((id: number | null) => {
    setSelectedId(id);
    client.select(id);
    if (id === null) setFollow(false);
  }, []);
  const onCloseSelection = useCallback(() => onSelect(null), [onSelect]);

  const toggleSettings = useCallback(() => setSettingsOpen((o) => !o), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const toggleStats = useCallback(() => setStatsOpen((o) => !o), []);

  // ---- keyboard: Space = run/pause, S = settings, G = graphs/stats, Esc = close an overlay
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Escape' && !wide) {
        if (settingsOpen) { setSettingsOpen(false); document.getElementById('settings-toggle')?.focus(); }
        else if (statsOpen) setStatsOpen(false);
        return;
      }
      // never hijack keys while the user is operating a control
      if ((e.target as HTMLElement).closest('button, input, select, textarea, [role="separator"], [role="switch"]')) return;
      if (e.code === 'Space') { e.preventDefault(); onRun(!running); }
      else if (e.key === 's' || e.key === 'S') { e.preventDefault(); toggleSettings(); }
      else if (e.key === 'g' || e.key === 'G') { e.preventDefault(); toggleStats(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [running, wide, settingsOpen, statsOpen, onRun, toggleSettings, toggleStats]);

  const preset = PRESETS.find((p) => p.id === presetId);
  const effectiveSpeed = maxMode ? Infinity : speed;
  const maxStatsHeight = Math.max(STATS_MIN_HEIGHT, Math.round(viewportH * 0.7));

  return (
    <div className="flex h-dvh flex-col bg-white text-neutral-900">
      <HeaderBar
        client={client}
        fpsRef={fpsRef}
        presetName={preset?.name ?? '사용자 정의 설정'}
        seed={config.seed}
        dt={config.dt}
        running={running}
        speed={effectiveSpeed}
        settingsOpen={settingsOpen}
        onToggleSettings={toggleSettings}
      />

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <main className="relative min-h-0 flex-1 overflow-hidden bg-[#f5f6f8]" aria-label="시뮬레이션">
            <SimCanvas
              client={client}
              config={config}
              selectedId={selectedId}
              follow={follow}
              onSelect={onSelect}
              fpsRef={fpsRef}
              fitSignal={fitSignal}
              zoomSignal={zoomSignal}
              insetBottom={dockHeight}
              displayScale={displayScale}
            />

            <div className="pointer-events-none absolute left-3 top-3 flex max-w-[calc(100%-6rem)] flex-col items-start gap-2">
              <Legend displayScale={displayScale} />
              {selectedId !== null && (
                <div className="pointer-events-auto">
                  <SelectedCreature key={selectedId} client={client} follow={follow} onFollow={setFollow} onClose={onCloseSelection} />
                </div>
              )}
            </div>

            <ViewControls
              onZoom={(factor) => setZoomSignal((z) => ({ n: z.n + 1, factor }))}
              onFit={() => { setFollow(false); setFitSignal((n) => n + 1); }}
            />

            <StageBanners client={client} error={error} predatorsExpected={config.predator.initialCount > 0} />

            <TransportDock
              running={running}
              speed={speed}
              maxMode={maxMode}
              resetPending={resetPending}
              onRun={onRun}
              onSpeed={onSpeed}
              onMax={onMax}
              onStep={onStep}
              onReset={onReset}
              onHeight={setDockHeight}
            />
          </main>

          <StatsDock
            client={client}
            presetId={presetId}
            wide={wide}
            open={statsOpen}
            height={statsHeight}
            maxHeight={maxStatsHeight}
            onToggle={toggleStats}
            onHeightChange={setStatsHeight}
          />
        </div>

        <SettingsShell wide={wide} open={settingsOpen} onClose={closeSettings}>
          <ControlPanel
            config={config}
            presetId={presetId}
            resetPending={resetPending}
            onUpdate={update}
            onPreset={onPreset}
            onReset={onReset}
            onLoadConfig={onLoadConfig}
            onClose={closeSettings}
            displayScale={displayScale}
            onDisplayScale={setDisplayScale}
          />
        </SettingsShell>
      </div>
    </div>
  );
}

/**
 * Settings container. Wide: an in-flow sidebar whose width animates, so the canvas grows and
 * shrinks with it. Narrow: an overlay drawer with a backdrop. The content stays mounted when
 * closed (inert) so scroll position and open sections survive.
 */
function SettingsShell({ wide, open, onClose, children }: { wide: boolean; open: boolean; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);

  // overlay: move focus into the drawer when it opens, back to its toggle when it closes
  const wasOpen = useRef(open);
  useEffect(() => {
    if (wide) { wasOpen.current = open; return; }
    if (open) ref.current?.focus();
    else if (wasOpen.current) document.getElementById('settings-toggle')?.focus();
    wasOpen.current = open;
  }, [open, wide]);

  if (wide) {
    return (
      <aside
        id="settings-panel"
        ref={ref}
        aria-label="설정"
        inert={!open}
        style={{ width: open ? SETTINGS_W : 0 }}
        className="shrink-0 overflow-hidden bg-white transition-[width] duration-200 ease-out"
      >
        <div style={{ width: SETTINGS_W }} className="h-full border-l border-neutral-200">{children}</div>
      </aside>
    );
  }
  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        className={`fixed inset-0 z-30 bg-neutral-900/25 transition-opacity duration-200 ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
      />
      <aside
        id="settings-panel"
        ref={ref}
        role="dialog"
        aria-label="설정"
        aria-modal={open}
        tabIndex={-1}
        inert={!open}
        className={`fixed inset-y-0 right-0 z-40 w-[min(24rem,92vw)] bg-white shadow-panel outline-none transition-transform duration-200 ease-out ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {children}
      </aside>
    </>
  );
}

const Legend = memo(function Legend({ displayScale }: { displayScale: number }) {
  return (
    <div className="pointer-events-auto flex items-center gap-3 rounded-full bg-white/90 px-3 py-1 text-[11px] text-neutral-600 shadow-sm ring-1 ring-black/5 backdrop-blur">
      <Swatch color={COLORS.prey} label="피식자" />
      <Swatch color={COLORS.predator} label="포식자" />
      <Swatch color={COLORS.food} label="먹이" />
      {displayScale !== 1 && (
        <span className="text-neutral-400" title="개체를 실제 크기보다 크게 그립니다. 충돌, 에너지, 유전자 값에는 영향이 없습니다. 개체를 선택하면 실제 충돌 크기가 파란 사각형으로 표시됩니다. 설정 › 화면 표시에서 바꿀 수 있습니다.">
          표시 ×{displayScale.toFixed(1)}
        </span>
      )}
      <span className="hidden text-neutral-400 2xl:inline">클릭: 선택 · 드래그: 이동 · 휠: 확대 · Space: 시작/정지</span>
    </div>
  );
});

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-2 w-2 rounded-[2px]" style={{ background: color }} />
      {label}
    </span>
  );
}

const ViewControls = memo(function ViewControls({ onZoom, onFit }: { onZoom: (factor: number) => void; onFit: () => void }) {
  const btn = 'flex h-8 w-8 items-center justify-center text-neutral-700 transition-colors hover:bg-neutral-50';
  return (
    <div role="group" aria-label="화면 확대와 이동" className="absolute right-3 top-3 flex flex-col overflow-hidden rounded-xl bg-white/95 shadow-float ring-1 ring-black/5 backdrop-blur">
      <button type="button" className={btn} aria-label="확대" title="확대" onClick={() => onZoom(1.4)}>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
      </button>
      <button type="button" className={`${btn} border-t border-neutral-100`} aria-label="축소" title="축소" onClick={() => onZoom(1 / 1.4)}>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><path d="M2 7h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
      </button>
      <button type="button" className={`${btn} h-auto w-8 border-t border-neutral-100 py-1.5 text-[10px] font-medium`} aria-label="전체 보기" title="전체 보기 (월드 전체를 화면에 맞춥니다)" onClick={onFit}>
        맞춤
      </button>
    </div>
  );
});

/** Extinction notice and worker errors. Polls on its own so the app shell stays still. */
function StageBanners({ client: c, error, predatorsExpected }: { client: SimClient; error: string | null; predatorsExpected: boolean }) {
  const s = usePoll(() => ({ t: c.latest?.time ?? 0, prey: c.latest?.prey ?? 0, pred: c.latest?.predators ?? 0, has: !!c.latest }), 500);
  const preyGone = s.has && s.t > 0 && s.prey === 0;
  const predGone = s.has && s.t > 0 && predatorsExpected && s.pred === 0 && s.prey > 0;
  if (!error && !preyGone && !predGone) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center px-16">
      {error ? (
        <div role="alert" className="rounded-lg bg-red-600 px-3.5 py-2 text-xs text-white shadow-float">시뮬레이션 오류: {error}</div>
      ) : (
        <div role="status" className="rounded-lg bg-amber-50 px-3.5 py-2 text-xs text-amber-900 shadow-float ring-1 ring-amber-200">
          {preyGone ? '피식자가 멸종했습니다.' : '포식자가 멸종했습니다.'} 다른 시드나 설정으로 다시 시도해 보세요.
        </div>
      )}
    </div>
  );
}
