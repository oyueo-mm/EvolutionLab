import { useRef, useState } from 'react';
import { PRESETS } from '../sim/presets';
import { GENE_KEYS, type GeneKey, type ReproductionMode, type SimConfig, type SpeciesConfig, type ZoneAccess } from '../sim/types';
import { Field, fmt, ResetBadge, Section, Segmented, Slider, Toggle } from './controls';

export const SPEEDS: { value: number; label: string }[] = [
  { value: 1, label: '1×' },
  { value: 2, label: '2×' },
  { value: 5, label: '5×' },
  { value: 10, label: '10×' },
  { value: Infinity, label: 'MAX' },
];

export const GENE_LABEL: Record<GeneKey, string> = {
  width: '길이 (진행 방향)',
  height: '폭 (측면)',
  speed: '속도',
  activity: '활동성',
  vision: '시야',
};

interface Props {
  config: SimConfig;
  presetId: string;
  running: boolean;
  speed: number;
  resetPending: boolean;
  onUpdate: (mut: (c: SimConfig) => void, opts?: { resetOnly?: boolean }) => void;
  onPreset: (id: string) => void;
  onRun: (running: boolean) => void;
  onSpeed: (speed: number) => void;
  onReset: () => void;
  onStep: () => void;
  onLoadConfig: (c: SimConfig) => void;
}

type SpKey = 'prey' | 'predator';

export function ControlPanel(p: Props) {
  const { config: c, onUpdate } = p;
  const [sp, setSp] = useState<SpKey>('prey');
  const fileRef = useRef<HTMLInputElement>(null);
  const s = c[sp];
  const upS = (mut: (s: SpeciesConfig) => void, resetOnly = false) => onUpdate((cfg) => mut(cfg[sp]), { resetOnly });
  const preset = PRESETS.find((x) => x.id === p.presetId);
  const zone = c.zones[0];
  const isPrey = sp === 'prey';

  const saveConfig = () => {
    const blob = new Blob([JSON.stringify(c, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `alife-config-${p.presetId}-seed${c.seed}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const loadConfig = async (f: File) => {
    try {
      p.onLoadConfig(JSON.parse(await f.text()) as SimConfig);
    } catch {
      alert('설정 파일을 읽을 수 없습니다.');
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Run controls */}
      <div className="space-y-3 border-b border-stone-200 p-4">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => p.onRun(!p.running)}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors ${p.running ? 'bg-stone-600 hover:bg-stone-700' : 'bg-stone-900 hover:bg-black'}`}
          >
            {p.running ? '❚❚ 일시정지' : '▶ 시작'}
          </button>
          <button type="button" onClick={p.onStep} disabled={p.running} title="한 틱 진행 (1/30초)" className="rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-700 hover:bg-stone-50 disabled:opacity-40">
            ⏭
          </button>
          <button
            type="button"
            onClick={p.onReset}
            title="현재 설정으로 세계를 다시 만듭니다"
            className={`rounded-md border px-3 text-sm font-medium transition-colors ${p.resetPending ? 'border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100' : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'}`}
          >
            ↺ 초기화
          </button>
        </div>
        {p.resetPending && <p className="text-[11px] text-amber-700">재시작이 필요한 설정이 바뀌었습니다. 초기화하면 적용됩니다.</p>}
        <div>
          <div className="mb-1 text-[11px] text-stone-500">시뮬레이션 속도 (실시간 대비)</div>
          <Segmented options={SPEEDS} value={p.speed} onChange={p.onSpeed} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <Section title="실험 프리셋">
          <select
            value={p.presetId}
            onChange={(e) => p.onPreset(e.target.value)}
            className="w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-800"
          >
            {PRESETS.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            {!preset && <option value={p.presetId}>사용자 정의</option>}
          </select>
          {preset && <p className="text-xs leading-relaxed text-stone-500">{preset.description}</p>}
          <Field label="난수 시드" resetOnly>
            <div className="flex gap-1">
              <input
                type="number"
                value={c.seed}
                onChange={(e) => onUpdate((cfg) => { cfg.seed = Math.max(0, Math.floor(Number(e.target.value) || 0)); }, { resetOnly: true })}
                className="w-24 rounded border border-stone-300 bg-white px-1.5 py-0.5 text-right font-mono text-xs"
              />
              <button type="button" title="무작위 시드" onClick={() => onUpdate((cfg) => { cfg.seed = Math.floor(Math.random() * 1e9); }, { resetOnly: true })} className="rounded border border-stone-300 bg-white px-1.5 text-xs hover:bg-stone-50">🎲</button>
            </div>
          </Field>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={saveConfig} className="flex-1 rounded border border-stone-300 bg-white py-1 text-xs text-stone-700 hover:bg-stone-50">설정 저장</button>
            <button type="button" onClick={() => fileRef.current?.click()} className="flex-1 rounded border border-stone-300 bg-white py-1 text-xs text-stone-700 hover:bg-stone-50">설정 불러오기</button>
            <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadConfig(f); e.target.value = ''; }} />
          </div>
        </Section>

        <Section title="먹이">
          <Slider label="생성 속도 (개/초)" value={c.food.spawnRate} min={0} max={200} onChange={(v) => onUpdate((cfg) => { cfg.food.spawnRate = v; })} />
          <Slider label="최대 개수" value={c.food.maxCount} min={0} max={5000} step={50} onChange={(v) => onUpdate((cfg) => { cfg.food.maxCount = v; })} />
          <Slider label="초기 개수" value={c.food.initialCount} min={0} max={5000} step={50} resetOnly onChange={(v) => onUpdate((cfg) => { cfg.food.initialCount = v; }, { resetOnly: true })} />
        </Section>

        <Section title="안전구역">
          <Toggle label="활성화" checked={zone?.enabled ?? false} onChange={(v) => onUpdate((cfg) => { cfg.zones[0].enabled = v; })} />
          <div className={zone?.enabled ? '' : 'pointer-events-none opacity-40'}>
            <div className="mb-1 text-[11px] text-stone-500">출입 규칙</div>
            <Segmented<ZoneAccess>
              size="xs"
              value={zone.access}
              onChange={(v) => onUpdate((cfg) => { cfg.zones[0].access = v; })}
              options={[
                { value: 'prey', label: '피식자만' },
                { value: 'predator', label: '포식자만' },
                { value: 'all', label: '모두' },
                { value: 'none', label: '불가' },
              ]}
            />
            <div className="mt-3">
              <Slider label="반지름" value={zone.radius} min={20} max={400} step={5} onChange={(v) => onUpdate((cfg) => { cfg.zones[0].radius = v; })} />
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-stone-500">진입이 금지된 종은 경계 밖으로 밀려납니다. 포식자가 들어갈 수 없는 구역 안의 피식자는 잡히지 않습니다.</p>
          </div>
        </Section>

        {/* Species-specific settings */}
        <div className="sticky top-0 z-10 border-b border-stone-200 bg-stone-50/95 px-4 py-2 backdrop-blur">
          <Segmented<SpKey>
            value={sp}
            onChange={setSp}
            options={[
              { value: 'prey', label: '● 피식자 설정' },
              { value: 'predator', label: '● 포식자 설정' },
            ]}
          />
        </div>

        <Section title="개체군">
          <Slider label="초기 개체 수" value={s.initialCount} min={0} max={isPrey ? 5000 : 500} step={isPrey ? 10 : 1} resetOnly onChange={(v) => upS((x) => { x.initialCount = v; }, true)} />
          <Slider label="최대 개체 수 (번식 상한)" value={s.reproduction.maxPopulation} min={1} max={isPrey ? 20000 : 2000} step={isPrey ? 50 : 5} onChange={(v) => upS((x) => { x.reproduction.maxPopulation = v; })} />
          <Slider label="수명 (0 = 불멸)" value={s.lifespan} min={0} max={600} step={5} format={(v) => (v === 0 ? '∞' : `${v}s`)} onChange={(v) => upS((x) => { x.lifespan = v; })} hint="새로 태어나는 개체부터 적용됩니다" />
        </Section>

        <Section title="번식">
          <Segmented<ReproductionMode>
            size="xs"
            value={s.reproduction.mode}
            onChange={(v) => upS((x) => { x.reproduction.mode = v; })}
            options={[
              { value: 'none', label: '없음' },
              { value: 'timer', label: '주기' },
              { value: 'eat', label: isPrey ? '먹이 수' : '사냥 수' },
              { value: 'energy', label: '에너지' },
            ]}
          />
          {s.reproduction.mode === 'timer' && (
            <Slider label="분열 주기" value={s.reproduction.interval} min={0.5} max={60} step={0.5} format={fmt.sec} onChange={(v) => upS((x) => { x.reproduction.interval = v; })} />
          )}
          {s.reproduction.mode === 'eat' && (
            <Slider label={isPrey ? '번식에 필요한 먹이' : '번식에 필요한 사냥'} value={s.reproduction.eatThreshold} min={1} max={30} onChange={(v) => upS((x) => { x.reproduction.eatThreshold = v; })} />
          )}
          {s.reproduction.mode === 'energy' && (
            <Slider label="번식 에너지 기준" value={s.reproduction.energyThreshold} min={1} max={s.metabolism.maxEnergy} onChange={(v) => upS((x) => { x.reproduction.energyThreshold = v; })} />
          )}
          <Slider label="자손에게 주는 에너지" value={s.reproduction.offspringEnergy} min={1} max={s.metabolism.maxEnergy} disabled={!s.metabolism.enabled} onChange={(v) => upS((x) => { x.reproduction.offspringEnergy = v; })} hint="대사가 켜져 있을 때만 적용" />
        </Section>

        <Section title="유전과 돌연변이">
          <Toggle label="진화 (돌연변이 허용)" checked={s.evolve} onChange={(v) => upS((x) => { x.evolve = v; })} />
          <Slider label="돌연변이 확률 (유전자별)" value={s.mutation.rate} min={0} max={1} step={0.01} format={fmt.pct} disabled={!s.evolve} onChange={(v) => upS((x) => { x.mutation.rate = v; })} />
          <Slider label="변이 강도 (σ / 범위)" value={s.mutation.strength} min={0} max={0.3} step={0.005} format={(v) => `${(v * 100).toFixed(1)}%`} disabled={!s.evolve} onChange={(v) => upS((x) => { x.mutation.strength = v; })} />
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-stone-400">
                <th className="py-1 text-left font-normal">유전자</th>
                <th className="text-right font-normal">범위</th>
                <th className="text-right font-normal">초기값<ResetBadge /></th>
                <th className="text-right font-normal">진화</th>
              </tr>
            </thead>
            <tbody>
              {GENE_KEYS.map((g) => {
                const gp = s.genes[g];
                return (
                  <tr key={g} className="border-t border-stone-100">
                    <td className="py-1 text-stone-600">{GENE_LABEL[g]}</td>
                    <td className="text-right font-mono text-stone-400">{gp.min}–{gp.max}</td>
                    <td className="text-right">
                      <input
                        type="number"
                        value={gp.initial}
                        min={gp.min}
                        max={gp.max}
                        step={g === 'activity' ? 0.05 : 1}
                        onChange={(e) => upS((x) => { x.genes[g].initial = Math.min(gp.max, Math.max(gp.min, Number(e.target.value))); }, true)}
                        className="w-14 rounded border border-stone-200 bg-white px-1 text-right font-mono"
                      />
                    </td>
                    <td className="text-right">
                      <input type="checkbox" checked={gp.evolvable} onChange={(e) => upS((x) => { x.genes[g].evolvable = e.target.checked; })} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>

        <Section title="에너지 대사" defaultOpen={false}>
          <Toggle label="대사 (굶주림) 사용" checked={s.metabolism.enabled} onChange={(v) => upS((x) => { x.metabolism.enabled = v; })} />
          <div className={s.metabolism.enabled ? 'space-y-3' : 'pointer-events-none space-y-3 opacity-40'}>
            <Slider label={isPrey ? '먹이 1개당 에너지' : '사냥 1회당 에너지'} value={s.metabolism.gainPerEat} min={1} max={100} onChange={(v) => upS((x) => { x.metabolism.gainPerEat = v; })} />
            <Slider label="최대 에너지" value={s.metabolism.maxEnergy} min={10} max={500} step={5} onChange={(v) => upS((x) => { x.metabolism.maxEnergy = v; })} />
            <Slider label="초기 에너지" value={s.metabolism.initialEnergy} min={1} max={s.metabolism.maxEnergy} resetOnly onChange={(v) => upS((x) => { x.metabolism.initialEnergy = v; }, true)} />
            <div className="rounded bg-stone-100 px-2 py-1.5 font-mono text-[10px] leading-relaxed text-stone-600">
              비용/초 = 기초 + 크기·m + 속도·m·(v/40)²<sub>이동 중</sub> + 활동성·a + 시야·(r/50)
              <br />m = 가로×세로/36
            </div>
            <Slider label="기초 대사" value={s.metabolism.basalCost} min={0} max={5} step={0.05} format={fmt.f2} onChange={(v) => upS((x) => { x.metabolism.basalCost = v; })} />
            <Slider label="크기 비용" value={s.metabolism.sizeCost} min={0} max={5} step={0.05} format={fmt.f2} onChange={(v) => upS((x) => { x.metabolism.sizeCost = v; })} />
            <Slider label="속도 비용" value={s.metabolism.speedCost} min={0} max={5} step={0.05} format={fmt.f2} onChange={(v) => upS((x) => { x.metabolism.speedCost = v; })} />
            <Slider label="활동성 비용" value={s.metabolism.activityCost} min={0} max={5} step={0.05} format={fmt.f2} onChange={(v) => upS((x) => { x.metabolism.activityCost = v; })} />
            <Slider label="시야 비용" value={s.metabolism.visionCost} min={0} max={5} step={0.05} format={fmt.f2} onChange={(v) => upS((x) => { x.metabolism.visionCost = v; })} />
          </div>
        </Section>

        <Section title="행동" defaultOpen={false}>
          <Slider label="이동/휴식 결정 간격" value={s.behavior.decisionInterval} min={0.1} max={5} step={0.1} format={(v) => `${v.toFixed(1)}s`} onChange={(v) => upS((x) => { x.behavior.decisionInterval = v; })} />
          {isPrey ? (
            <>
              <Toggle label="시야 안의 먹이 쫓기" checked={s.behavior.seekFood} onChange={(v) => upS((x) => { x.behavior.seekFood = v; })} />
              <Toggle label="시야 안의 포식자 피하기" checked={s.behavior.fleePredators} onChange={(v) => upS((x) => { x.behavior.fleePredators = v; })} />
            </>
          ) : (
            <Toggle label="시야 안의 피식자 추적" checked={s.behavior.chasePrey} onChange={(v) => upS((x) => { x.behavior.chasePrey = v; })} />
          )}
          <p className="text-[11px] leading-relaxed text-stone-500">활동성은 결정할 때마다 <i>움직일지</i>를 정하는 확률입니다. 시야는 이미 움직이는 개체가 <i>어디로</i> 갈지만 바꿉니다. 시야 유전자가 0이면 감지 행동이 일어나지 않습니다.</p>
        </Section>
      </div>
    </div>
  );
}
