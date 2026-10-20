import { memo, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Button } from './controls';
import { SLIDER_STEPS, SPEED_TICKS, formatSpeed, posToSpeed, speedToPos } from './speed';

interface Props {
  running: boolean;
  /** Numeric speed (the slider value); remembered while MAX is on. */
  speed: number;
  maxMode: boolean;
  resetPending: boolean;
  onRun: (running: boolean) => void;
  onSpeed: (speed: number) => void;
  onMax: (on: boolean) => void;
  onStep: () => void;
  onReset: () => void;
  /** Reports the dock's occupied height (incl. margin) so the canvas can keep the world clear of it. */
  onHeight: (px: number) => void;
}

const Icon = {
  play: <path d="M4 2.5v11l9-5.5z" fill="currentColor" />,
  pause: <path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" fill="currentColor" />,
  step: <path d="M3 2.5v11l7-5.5zM11.5 2.5h2v11h-2z" fill="currentColor" />,
  reset: <path d="M13 8a5 5 0 1 1-1.6-3.7M13 2.5v3h-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />,
};

function Svg({ children }: { children: React.ReactNode }) {
  return <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>{children}</svg>;
}

export const TransportDock = memo(function TransportDock({ running, speed, maxMode, resetPending, onRun, onSpeed, onMax, onStep, onReset, onHeight }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const reported = useRef(0);

  useEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(() => {
      const h = Math.ceil(el.getBoundingClientRect().height) + 24; // bottom margin + breathing room
      if (h !== reported.current) { reported.current = h; onHeight(h); }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [onHeight]);

  // The thumb keeps its raw (unsnapped) position while the user drags or presses keys. Without this,
  // snapping to a tick would move the thumb back onto the tick and the next keypress would snap again,
  // so the slider could never leave 1×/2×/5×/10× with the keyboard.
  const [raw, setRaw] = useState(() => Math.round(speedToPos(speed) * SLIDER_STEPS));
  // If the speed was changed from outside (tick button, MAX toggle), follow it.
  const sliderValue = posToSpeed(raw / SLIDER_STEPS) === speed ? raw : Math.round(speedToPos(speed) * SLIDER_STEPS);
  const pos = sliderValue / SLIDER_STEPS;
  const label = maxMode ? 'MAX' : formatSpeed(speed);

  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label="시뮬레이션 제어"
      className="absolute bottom-3 left-1/2 z-10 flex w-max max-w-[calc(100%-24px)] -translate-x-1/2 flex-wrap items-center justify-center gap-x-5 gap-y-2 rounded-2xl bg-white/95 px-3.5 py-2.5 shadow-float ring-1 ring-black/5 backdrop-blur"
    >
      <div className="flex items-center gap-1.5">
        <Button variant="primary" onClick={() => onRun(!running)} className="w-[5.75rem] py-2 text-[13px]" title="시작 / 일시정지 (Space)" aria-keyshortcuts="Space">
          <Svg>{running ? Icon.pause : Icon.play}</Svg>
          {running ? '일시정지' : '시작'}
        </Button>
        <Button onClick={onStep} disabled={running} title="한 틱(1/30초) 진행. 일시정지 중에만 사용할 수 있습니다." aria-label="한 틱 진행" className="py-2">
          <Svg>{Icon.step}</Svg>1틱
        </Button>
        <Button variant={resetPending ? 'warn' : 'secondary'} onClick={onReset} title={resetPending ? '재시작이 필요한 설정이 바뀌었습니다. 초기화하면 적용됩니다.' : '현재 설정으로 세계를 다시 만듭니다'} className="py-2">
          <Svg>{Icon.reset}</Svg>초기화
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-[11px] font-medium text-neutral-500">속도</span>
        <div className="relative w-44 pb-4 sm:w-60">
          <input
            type="range"
            className="lab-range w-full"
            style={{ '--fill': `${(pos * 100).toFixed(2)}%` } as CSSProperties}
            min={0}
            max={SLIDER_STEPS}
            step={1}
            value={sliderValue}
            aria-label="시뮬레이션 속도"
            aria-valuetext={maxMode ? '제한 없음' : `${formatSpeed(speed)} 배속`}
            onChange={(e) => {
              const v = Number(e.target.value);
              setRaw(v);
              onSpeed(posToSpeed(v / SLIDER_STEPS));
            }}
          />
          {/* Tick buttons: positioned along the track, offset by half the 16px thumb so they line up with it. */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-4">
            {SPEED_TICKS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onSpeed(t)}
                aria-label={`${t}배속`}
                style={{ left: `calc(8px + (100% - 16px) * ${speedToPos(t)})` }}
                className={`pointer-events-auto absolute -translate-x-1/2 rounded px-1 text-[11px] font-medium leading-4 tabular-nums transition-colors ${
                  !maxMode && speed === t ? 'text-neutral-900' : 'text-neutral-500 hover:text-neutral-900'
                }`}
              >
                {t}×
              </button>
            ))}
          </div>
        </div>
        <output aria-live="off" className={`text-right text-[15px] font-semibold tabular-nums text-neutral-900 w-14`}>{label}</output>
        <Button variant={maxMode ? 'primary' : 'secondary'} onClick={() => onMax(!maxMode)} aria-pressed={maxMode} title="가능한 한 빠르게 계산합니다. 화면 갱신 속도는 유지됩니다." className="px-2.5">
          MAX
        </Button>
      </div>
    </div>
  );
});
