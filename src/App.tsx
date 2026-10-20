import { useCallback, useEffect, useRef, useState } from 'react';
import { SimClient } from './client/simClient';
import { PRESETS, presetById } from './sim/presets';
import type { CreatureInfo } from './sim/engine';
import type { SimConfig } from './sim/types';
import { ControlPanel } from './ui/ControlPanel';
import { Inspector } from './ui/Inspector';
import { SimCanvas } from './ui/SimCanvas';
import { StatsPanel, formatTime } from './ui/StatsPanel';
import { COLORS } from './render/renderer';

interface Hud {
  time: number;
  prey: number;
  predators: number;
  food: number;
  entities: number;
  fps: number;
  ups: number;
  msPerTick: number;
  achieved: number;
  maxGenPrey: number;
  maxGenPred: number;
  selected: CreatureInfo | null;
  hasFrame: boolean;
}

const EMPTY_HUD: Hud = { time: 0, prey: 0, predators: 0, food: 0, entities: 0, fps: 0, ups: 0, msPerTick: 0, achieved: 0, maxGenPrey: 0, maxGenPred: 0, selected: null, hasFrame: false };

// One worker for the app's lifetime (created outside React so StrictMode/HMR cannot duplicate it).
const client = new SimClient();

export default function App() {
  const [presetId, setPresetId] = useState('A');
  const [config, setConfig] = useState<SimConfig>(() => presetById('A'));
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [resetPending, setResetPending] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [follow, setFollow] = useState(false);
  const [hud, setHud] = useState<Hud>(EMPTY_HUD);
  const [error, setError] = useState<string | null>(null);
  const [fitSignal, setFitSignal] = useState(0);
  const [zoomSignal, setZoomSignal] = useState({ n: 0, factor: 1 });
  const fpsRef = useRef(0);
  const configRef = useRef(config);
  configRef.current = config;

  useEffect(() => {
    client.onError = setError;
    client.reset(configRef.current);
    client.setSpeed(1);
  }, []);

  // HUD polling at 4 Hz — the only React update driven by the running simulation (besides 1 Hz charts).
  useEffect(() => {
    const id = setInterval(() => {
      const f = client.latest;
      const last = client.history.samples[client.history.samples.length - 1];
      setHud({
        time: f?.time ?? 0,
        prey: f?.prey ?? 0,
        predators: f?.predators ?? 0,
        food: f?.foodCount ?? 0,
        entities: (f?.count ?? 0) + (f?.foodCount ?? 0),
        fps: fpsRef.current,
        ups: f?.ups ?? 0,
        msPerTick: f?.msPerTick ?? 0,
        achieved: (f?.ups ?? 0) * configRef.current.dt,
        maxGenPrey: last?.prey.maxGeneration ?? 0,
        maxGenPred: last?.predator.maxGeneration ?? 0,
        selected: f?.selected ?? null,
        hasFrame: !!f,
      });
    }, 250);
    return () => clearInterval(id);
  }, []);

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

  const onPreset = (id: string) => {
    setPresetId(id);
    resetWith(presetById(id));
    setFitSignal((n) => n + 1);
  };

  const onRun = useCallback((r: boolean) => {
    setRunning(r);
    client.setRunning(r);
  }, []);

  const onSelect = useCallback((id: number | null) => {
    setSelectedId(id);
    client.select(id);
    if (id === null) setFollow(false);
  }, []);

  // keyboard: space = start/pause
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA') return;
      e.preventDefault();
      onRun(!running);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [running, onRun]);

  const preset = PRESETS.find((p) => p.id === presetId);
  const extinct = hud.hasFrame && hud.time > 0 && (hud.prey === 0 || (config.predator.initialCount > 0 && hud.predators === 0));

  return (
    <div className="flex h-screen flex-col bg-stone-100 text-stone-900">
      <header className="flex h-12 shrink-0 items-center gap-6 border-b border-stone-200 bg-white px-4">
        <div className="flex items-center gap-2.5">
          <Logo />
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">Artificial Life Lab</div>
            <div className="text-[10px] text-stone-500">{preset?.name ?? '사용자 정의 설정'} · seed {config.seed}</div>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1 font-mono text-[11px] tabular-nums">
          <Metric label="시간" value={formatTime(hud.time)} />
          <Metric label="피식자" value={hud.prey} dot={COLORS.prey} />
          <Metric label="포식자" value={hud.predators} dot={COLORS.predator} />
          <Metric label="먹이" value={hud.food} dot={COLORS.food} />
          <Metric label="최고 세대" value={`${hud.maxGenPrey} / ${hud.maxGenPred}`} title="피식자 / 포식자" />
          <span className="mx-2 h-6 w-px bg-stone-200" />
          <Metric label="FPS" value={hud.fps.toFixed(0)} title="렌더링 프레임/초 (메인 스레드)" />
          <Metric label="UPS" value={hud.ups.toFixed(0)} title="시뮬레이션 틱/초 (Worker)" />
          <Metric label="틱" value={`${hud.msPerTick.toFixed(2)}ms`} title="틱 하나에 드는 평균 계산 시간" />
          <Metric label="실속도" value={running ? `${hud.achieved.toFixed(1)}×` : '—'} title="실제로 달성한 시뮬레이션 속도 (실시간 대비)" warn={running && Number.isFinite(speed) && hud.achieved < speed * 0.9} />
          <Metric label="개체" value={hud.entities} title="생물 + 먹이" />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1">
            <SimCanvas client={client} config={config} selectedId={selectedId} follow={follow} onSelect={onSelect} fpsRef={fpsRef} fitSignal={fitSignal} zoomSignal={zoomSignal} />
            {selectedId !== null && (
              <div className="absolute left-3 top-3">
                <Inspector info={hud.selected} follow={follow} onFollow={setFollow} onClose={() => onSelect(null)} />
              </div>
            )}
            {error && (
              <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-md bg-red-600 px-3 py-1.5 text-xs text-white shadow">
                시뮬레이션 오류: {error}
              </div>
            )}
            {extinct && (
              <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-800 shadow-sm">
                {hud.prey === 0 ? '피식자가 멸종했습니다.' : '포식자가 멸종했습니다.'} 다른 시드나 설정으로 다시 시도해 보세요.
              </div>
            )}
            <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-3 rounded-md bg-white/85 px-2.5 py-1 text-[11px] text-stone-600 shadow-sm backdrop-blur">
              <Swatch color={COLORS.prey} label="피식자" />
              <Swatch color={COLORS.predator} label="포식자" />
              <Swatch color={COLORS.food} label="먹이" />
              <span className="text-stone-400">클릭: 선택 · 드래그: 이동 · 휠: 확대 · Space: 시작/정지</span>
            </div>
            <div className="absolute bottom-3 right-3 flex overflow-hidden rounded-md border border-stone-200 bg-white text-sm shadow-sm">
              <button type="button" className="px-2.5 py-1 hover:bg-stone-100" title="확대" onClick={() => setZoomSignal((z) => ({ n: z.n + 1, factor: 1.4 }))}>＋</button>
              <button type="button" className="border-l border-stone-200 px-2.5 py-1 hover:bg-stone-100" title="축소" onClick={() => setZoomSignal((z) => ({ n: z.n + 1, factor: 1 / 1.4 }))}>－</button>
              <button type="button" className="border-l border-stone-200 px-2.5 py-1 text-xs hover:bg-stone-100" title="전체 보기" onClick={() => { setFollow(false); setFitSignal((n) => n + 1); }}>전체</button>
            </div>
          </div>
          <div className="h-[300px] shrink-0 border-t border-stone-200 bg-stone-50">
            <StatsPanel client={client} presetId={presetId} />
          </div>
        </main>

        <aside className="w-[340px] shrink-0 border-l border-stone-200 bg-stone-50">
          <ControlPanel
            config={config}
            presetId={presetId}
            running={running}
            speed={speed}
            resetPending={resetPending}
            onUpdate={update}
            onPreset={onPreset}
            onRun={onRun}
            onSpeed={(s) => { setSpeed(s); client.setSpeed(s); }}
            onReset={() => resetWith(structuredClone(config))}
            onStep={() => client.step(1)}
            onLoadConfig={(c) => { setPresetId('custom'); resetWith(c); setFitSignal((n) => n + 1); }}
          />
        </aside>
      </div>
    </div>
  );
}

function Metric({ label, value, dot, title, warn }: { label: string; value: string | number; dot?: string; title?: string; warn?: boolean }) {
  return (
    <div title={title} className={`flex items-center gap-1.5 rounded px-2 py-1 ${warn ? 'bg-amber-50 text-amber-800' : ''}`}>
      {dot && <span className="inline-block h-2 w-2 rounded-sm" style={{ background: dot }} />}
      <span className="font-sans text-[10px] text-stone-400">{label}</span>
      <span className="text-stone-800">{value}</span>
    </div>
  );
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="inline-block h-2 w-2 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}

function Logo() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden>
      <rect width="26" height="26" rx="6" fill="#1c1917" />
      <circle cx="13" cy="13" r="7.5" fill="none" stroke="#57534e" strokeDasharray="2 2" />
      <rect x="7" y="9" width="4" height="4" fill="#e7e5e4" transform="rotate(20 9 11)" />
      <rect x="15" y="14" width="5" height="3" fill="#d9412e" transform="rotate(-30 17.5 15.5)" />
      <circle cx="16" cy="8.5" r="1.3" fill="#2f9e44" />
    </svg>
  );
}
