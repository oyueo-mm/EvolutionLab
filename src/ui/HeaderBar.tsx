import { memo, type ReactNode } from 'react';
import type { SimClient } from '../client/simClient';
import { COLORS } from '../render/renderer';
import { usePoll } from './hooks';
import { formatTime } from './statsData';

interface Props {
  client: SimClient;
  fpsRef: React.MutableRefObject<number>;
  presetName: string;
  seed: number;
  dt: number;
  running: boolean;
  /** Requested speed (Infinity for MAX) – used to flag when the machine cannot keep up. */
  speed: number;
  settingsOpen: boolean;
  onToggleSettings: () => void;
}

export const HeaderBar = memo(function HeaderBar({ client, fpsRef, presetName, seed, dt, running, speed, settingsOpen, onToggleSettings }: Props) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-neutral-200 bg-white px-4 sm:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <Logo />
        <div className="min-w-0 leading-tight">
          <h1 className="m-0 truncate text-sm font-semibold tracking-tight text-neutral-900">Artificial Life Lab</h1>
          <button
            type="button"
            onClick={onToggleSettings}
            title="클릭하면 설정 패널이 열립니다. 프리셋은 설정의 '실험'에서 바꿀 수 있습니다."
            className="mt-0.5 block max-w-[min(46vw,22rem)] truncate rounded text-left text-[11px] text-neutral-500 hover:text-neutral-900"
          >
            {presetName} <span className="text-neutral-300">·</span> <span className="font-mono">seed {seed}</span>
          </button>
        </div>
      </div>

      <HeaderMetrics client={client} fpsRef={fpsRef} dt={dt} running={running} speed={speed} />

      <button
        id="settings-toggle"
        type="button"
        onClick={onToggleSettings}
        aria-expanded={settingsOpen}
        aria-controls="settings-panel"
        aria-keyshortcuts="S"
        title="설정 패널 열기/닫기 (S)"
        className={`ml-auto flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition-colors lg:ml-0 ${
          settingsOpen ? 'bg-neutral-900 text-white ring-neutral-900 hover:bg-black' : 'bg-white text-neutral-800 ring-neutral-200 hover:bg-neutral-50'
        }`}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
          <path d="M2 4.5h7M12 4.5h2M2 11.5h2M7 11.5h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
          <circle cx="10.5" cy="4.5" r="1.7" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="5.5" cy="11.5" r="1.7" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        {settingsOpen ? '설정 닫기' : '설정 열기'}
      </button>
    </header>
  );
});

/** Live numbers. Owns its 4 Hz poll so the rest of the UI does not re-render with it. */
const HeaderMetrics = memo(function HeaderMetrics({ client, fpsRef, dt, running, speed }: { client: SimClient; fpsRef: React.MutableRefObject<number>; dt: number; running: boolean; speed: number }) {
  const m = usePoll(() => {
    const f = client.latest;
    const last = client.history.samples[client.history.samples.length - 1];
    return {
      time: f?.time ?? 0,
      genPrey: last?.prey.maxGeneration ?? 0,
      genPred: last?.predator.maxGeneration ?? 0,
      prey: f?.prey ?? 0,
      predators: f?.predators ?? 0,
      food: f?.foodCount ?? 0,
      fps: Math.round(fpsRef.current),
      ups: Math.round(f?.ups ?? 0),
      msPerTick: Math.round((f?.msPerTick ?? 0) * 100) / 100,
      achieved: Math.round((f?.ups ?? 0) * dt * 10) / 10,
    };
  }, 250);

  const behind = running && Number.isFinite(speed) && m.achieved < speed * 0.9;

  return (
    <div className="ml-auto hidden min-w-0 items-stretch gap-5 lg:flex">
      <Group label="실험">
        <Metric label="시간" value={formatTime(m.time)} />
        <Metric label="최고 세대" value={`${m.genPrey} / ${m.genPred}`} title="피식자 / 포식자" className="hidden 2xl:block" />
      </Group>
      <Divider />
      <Group label="개체">
        <Metric label="피식자" value={m.prey} dot={COLORS.prey} />
        <Metric label="포식자" value={m.predators} dot={COLORS.predator} />
        <Metric label="먹이" value={m.food} dot={COLORS.food} />
        <Metric label="총 개체" value={m.prey + m.predators} title="피식자 + 포식자" className="hidden xl:block" />
      </Group>
      <Divider className="hidden xl:block" />
      <Group label="성능" muted className="hidden xl:flex">
        <Metric label="FPS" value={m.fps} title="화면 갱신 루프 횟수/초. 바뀐 것이 없는 프레임은 다시 그리지 않아 CPU를 아낍니다." subtle />
        <Metric label="UPS" value={m.ups} title="시뮬레이션 틱/초 (Worker)" subtle />
        <Metric label="틱" value={`${m.msPerTick.toFixed(2)}ms`} title="틱 하나의 평균 계산 시간" subtle className="hidden 2xl:block" />
        <Metric label="실속도" value={running ? `${m.achieved.toFixed(1)}×` : '—'} title={behind ? '요청한 속도를 따라가지 못하고 있습니다' : '실제로 달성한 시뮬레이션 속도'} subtle warn={behind} />
      </Group>
    </div>
  );
});

function Group({ children, label, muted, className = '' }: { children: ReactNode; label: string; muted?: boolean; className?: string }) {
  return (
    <div role="group" aria-label={label} className={`flex items-center gap-4 ${muted ? 'opacity-90' : ''} ${className}`}>
      {children}
    </div>
  );
}

function Divider({ className = '' }: { className?: string }) {
  return <span aria-hidden className={`my-2 w-px bg-neutral-200 ${className}`} />;
}

function Metric({ label, value, dot, title, subtle, warn, className = '' }: { label: string; value: string | number; dot?: string; title?: string; subtle?: boolean; warn?: boolean; className?: string }) {
  return (
    <div title={title} className={`min-w-[2.75rem] ${className}`}>
      <div className="flex items-center gap-1 text-[10px] leading-3 text-neutral-400">
        {dot && <span className="inline-block h-1.5 w-1.5 rounded-[2px]" style={{ background: dot }} />}
        {label}
      </div>
      <div className={`mt-0.5 font-mono tabular-nums leading-4 ${subtle ? 'text-xs text-neutral-500' : 'text-[13px] font-semibold text-neutral-900'} ${warn ? '!text-amber-600' : ''}`}>
        {value}
        {warn && <span className="sr-only"> (느림)</span>}
      </div>
    </div>
  );
}

function Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 26 26" aria-hidden className="shrink-0">
      <rect width="26" height="26" rx="7" fill="#171717" />
      <circle cx="13" cy="13" r="7.5" fill="none" stroke="#525252" strokeDasharray="2 2" />
      <rect x="7" y="9" width="4" height="4" fill="#f5f5f5" transform="rotate(20 9 11)" />
      <rect x="15" y="14" width="5" height="3" fill="#d9412e" transform="rotate(-30 17.5 15.5)" />
      <circle cx="16" cy="8.5" r="1.3" fill="#2f9e44" />
    </svg>
  );
}
