import { memo, useRef, useState } from 'react';
import { PRESETS } from '../sim/presets';
import { GENE_KEYS, type ReproductionMode, type SimConfig, type SpeciesConfig, type ZoneAccess } from '../sim/types';
import { Button, Field, fmt, GroupLabel, ResetBadge, Section, Segmented, Slider, Toggle } from './controls';
import { ACCESS_LABEL, GENE_LABEL, REPRO_LABEL } from './labels';
import { DISPLAY_SCALE_MAX, DISPLAY_SCALE_MIN } from '../render/sizing';

interface Props {
  config: SimConfig;
  presetId: string;
  resetPending: boolean;
  onUpdate: (mut: (c: SimConfig) => void, opts?: { resetOnly?: boolean }) => void;
  onPreset: (id: string) => void;
  onReset: () => void;
  onLoadConfig: (c: SimConfig) => void;
  onClose: () => void;
  displayScale: number;
  onDisplayScale: (v: number) => void;
}

type SpKey = 'prey' | 'predator';

/**
 * Settings content. Ordered by how often people reach for things: the experiment itself first,
 * then the environment, then per-species rules, and finally advanced parameters. Collapsed
 * sections still show their current values.
 */
export const ControlPanel = memo(function ControlPanel({ config: c, presetId, resetPending, onUpdate, onPreset, onReset, onLoadConfig, onClose, displayScale, onDisplayScale }: Props) {
  const [sp, setSp] = useState<SpKey>('prey');
  const fileRef = useRef<HTMLInputElement>(null);
  const s = c[sp];
  const upS = (mut: (s: SpeciesConfig) => void, resetOnly = false) => onUpdate((cfg) => mut(cfg[sp]), { resetOnly });
  const preset = PRESETS.find((x) => x.id === presetId);
  const zone = c.zones[0];
  const isPrey = sp === 'prey';

  const saveConfig = () => {
    const blob = new Blob([JSON.stringify(c, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `alife-config-${presetId}-seed${c.seed}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const loadConfig = async (f: File) => {
    try {
      onLoadConfig(JSON.parse(await f.text()) as SimConfig);
    } catch {
      alert('설정 파일을 읽을 수 없습니다.');
    }
  };

  const reproSummary = s.reproduction.mode === 'none'
    ? REPRO_LABEL.none
    : s.reproduction.mode === 'timer' ? `${s.reproduction.interval}초마다`
    : s.reproduction.mode === 'eat' ? `${s.reproduction.eatThreshold}${isPrey ? '개 먹으면' : '마리 잡으면'}`
    : `에너지 ${s.reproduction.energyThreshold}`;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-neutral-100 px-5 py-3">
        <h2 className="m-0 text-sm font-semibold text-neutral-900">설정</h2>
        <Button variant="ghost" onClick={onClose} title="설정 패널 닫기 (S)" className="-mr-2">설정 닫기</Button>
      </div>

      <div className="thin-scroll min-h-0 flex-1 overflow-y-auto pb-8">
        <GroupLabel>실험</GroupLabel>
        <Section title="프리셋과 시드" defaultOpen summary={preset?.name ?? '사용자 정의'}>
          <div>
            <label htmlFor="preset-select" className="mb-1 block text-xs text-neutral-600">실험 프리셋</label>
            <select
              id="preset-select"
              value={presetId}
              onChange={(e) => onPreset(e.target.value)}
              className="w-full rounded-lg border-0 bg-white px-2.5 py-2 text-[13px] text-neutral-900 ring-1 ring-inset ring-neutral-200 hover:ring-neutral-300"
            >
              {PRESETS.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              {!preset && <option value={presetId}>사용자 정의</option>}
            </select>
            {preset && <p className="mb-0 mt-2 text-xs leading-relaxed text-neutral-500">{preset.description}</p>}
          </div>
          <Field label="난수 시드" resetOnly>
            <div className="flex gap-1">
              <input
                type="number"
                aria-label="난수 시드"
                value={c.seed}
                onChange={(e) => onUpdate((cfg) => { cfg.seed = Math.max(0, Math.floor(Number(e.target.value) || 0)); }, { resetOnly: true })}
                className="w-24 rounded-md border-0 px-2 py-1 text-right font-mono text-xs ring-1 ring-inset ring-neutral-200"
              />
              <Button variant="secondary" title="무작위 시드" aria-label="무작위 시드" className="px-2 py-1" onClick={() => onUpdate((cfg) => { cfg.seed = Math.floor(Math.random() * 1e9); }, { resetOnly: true })}>🎲</Button>
            </div>
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button variant={resetPending ? 'warn' : 'secondary'} onClick={onReset} className="flex-1" title="현재 설정으로 세계를 다시 만듭니다">
              {resetPending ? '초기화하여 적용' : '초기화'}
            </Button>
            <Button onClick={saveConfig} className="flex-1">설정 저장</Button>
            <Button onClick={() => fileRef.current?.click()} className="flex-1">설정 불러오기</Button>
            <input ref={fileRef} type="file" accept="application/json" className="hidden" aria-label="설정 파일 선택" onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadConfig(f); e.target.value = ''; }} />
          </div>
          {resetPending && <p className="m-0 text-[11px] text-amber-700">재시작이 필요한 설정이 바뀌었습니다. 초기화하면 적용됩니다.</p>}
        </Section>

        <GroupLabel>화면</GroupLabel>
        <Section title="화면 표시" summary={displayScale === 1 ? '실제 크기' : `개체 ×${displayScale.toFixed(1)}`}>
          <Slider
            label="개체 표시 크기"
            value={displayScale}
            min={DISPLAY_SCALE_MIN}
            max={DISPLAY_SCALE_MAX}
            step={0.1}
            format={(v) => (v === 1 ? '실제 크기' : `×${v.toFixed(1)}`)}
            onChange={onDisplayScale}
          />
          <p className="m-0 text-[11px] leading-relaxed text-neutral-500">
            화면에 그리는 크기만 바뀝니다. 충돌 판정, 에너지, 유전자 값은 그대로입니다. 개체를 선택하면 실제 충돌 크기가 파란 사각형으로 표시됩니다.
            개체가 아주 많으면 서로 덮이지 않도록 자동으로 실제 크기 쪽으로 줄어듭니다.
          </p>
          {displayScale !== 1 && (
            <Button variant="ghost" onClick={() => onDisplayScale(1)} className="-ml-2">실제 크기로 보기</Button>
          )}
        </Section>

        <GroupLabel>환경</GroupLabel>
        <Section title="먹이" summary={`${c.food.spawnRate}개/초 · 최대 ${c.food.maxCount}`}>
          <Slider label="생성 속도 (개/초)" value={c.food.spawnRate} min={0} max={200} onChange={(v) => onUpdate((cfg) => { cfg.food.spawnRate = v; })} />
          <Slider label="최대 개수" value={c.food.maxCount} min={0} max={5000} step={50} onChange={(v) => onUpdate((cfg) => { cfg.food.maxCount = v; })} />
          <Slider label="초기 개수" value={c.food.initialCount} min={0} max={5000} step={50} resetOnly onChange={(v) => onUpdate((cfg) => { cfg.food.initialCount = v; }, { resetOnly: true })} />
        </Section>
        <Section title="안전구역" summary={zone?.enabled ? `${ACCESS_LABEL[zone.access]} · 반지름 ${zone.radius}` : '꺼짐'}>
          <Toggle label="안전구역 사용" checked={zone?.enabled ?? false} onChange={(v) => onUpdate((cfg) => { cfg.zones[0].enabled = v; })} />
          <div className={`space-y-4 transition-opacity ${zone?.enabled ? '' : 'pointer-events-none opacity-40'}`} aria-disabled={!zone?.enabled}>
            <div>
              <div className="mb-1 text-xs text-neutral-600">출입 규칙</div>
              <Segmented<ZoneAccess>
                size="xs"
                label="안전구역 출입 규칙"
                value={zone.access}
                onChange={(v) => onUpdate((cfg) => { cfg.zones[0].access = v; })}
                options={[
                  { value: 'prey', label: '피식자만' },
                  { value: 'predator', label: '포식자만' },
                  { value: 'all', label: '모두' },
                  { value: 'none', label: '불가' },
                ]}
              />
            </div>
            <Slider label="반지름" value={zone.radius} min={20} max={400} step={5} onChange={(v) => onUpdate((cfg) => { cfg.zones[0].radius = v; })} />
            <p className="m-0 text-[11px] leading-relaxed text-neutral-500">진입이 금지된 종은 경계 밖으로 밀려납니다. 포식자가 들어갈 수 없는 구역 안의 피식자는 잡히지 않습니다.</p>
          </div>
        </Section>

        <GroupLabel>생물 종</GroupLabel>
        <div className="sticky top-0 z-10 bg-white/95 px-5 py-2 backdrop-blur">
          <Segmented<SpKey>
            value={sp}
            label="설정할 종"
            onChange={setSp}
            options={[
              { value: 'prey', label: '피식자' },
              { value: 'predator', label: '포식자' },
            ]}
          />
        </div>
        <Section title="개체군과 수명" summary={`초기 ${s.initialCount} · 상한 ${s.reproduction.maxPopulation}`}>
          <Slider label="초기 개체 수" value={s.initialCount} min={0} max={isPrey ? 5000 : 500} step={isPrey ? 10 : 1} resetOnly onChange={(v) => upS((x) => { x.initialCount = v; }, true)} />
          <Slider label="최대 개체 수 (번식 상한)" value={s.reproduction.maxPopulation} min={1} max={isPrey ? 20000 : 2000} step={isPrey ? 50 : 5} onChange={(v) => upS((x) => { x.reproduction.maxPopulation = v; })} />
          <Slider label="수명 (0 = 불멸)" value={s.lifespan} min={0} max={600} step={5} format={(v) => (v === 0 ? '∞' : `${v}s`)} onChange={(v) => upS((x) => { x.lifespan = v; })} hint="새로 태어나는 개체부터 적용됩니다" />
        </Section>
        <Section title="번식" summary={reproSummary}>
          <Segmented<ReproductionMode>
            size="xs"
            label="번식 방식"
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
        <Section title="유전과 돌연변이" summary={s.evolve ? `확률 ${fmt.pct(s.mutation.rate)} · 강도 ${(s.mutation.strength * 100).toFixed(1)}%` : '진화 꺼짐'}>
          <Toggle label="진화 (돌연변이 허용)" checked={s.evolve} onChange={(v) => upS((x) => { x.evolve = v; })} />
          <Slider label="돌연변이 확률 (유전자별)" value={s.mutation.rate} min={0} max={1} step={0.01} format={fmt.pct} disabled={!s.evolve} onChange={(v) => upS((x) => { x.mutation.rate = v; })} />
          <Slider label="변이 강도 (σ / 범위)" value={s.mutation.strength} min={0} max={0.3} step={0.005} format={(v) => `${(v * 100).toFixed(1)}%`} disabled={!s.evolve} onChange={(v) => upS((x) => { x.mutation.strength = v; })} />
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-neutral-400">
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
                  <tr key={g} className="border-t border-neutral-100">
                    <td className="py-1.5 text-neutral-600">{GENE_LABEL[g]}</td>
                    <td className="text-right font-mono text-neutral-400">{gp.min}–{gp.max}</td>
                    <td className="text-right">
                      <input
                        type="number"
                        aria-label={`${GENE_LABEL[g]} 초기값`}
                        value={gp.initial}
                        min={gp.min}
                        max={gp.max}
                        step={g === 'activity' ? 0.05 : 1}
                        onChange={(e) => upS((x) => { x.genes[g].initial = Math.min(gp.max, Math.max(gp.min, Number(e.target.value))); }, true)}
                        className="w-14 rounded border-0 px-1 py-0.5 text-right font-mono ring-1 ring-inset ring-neutral-200"
                      />
                    </td>
                    <td className="text-right">
                      <input type="checkbox" aria-label={`${GENE_LABEL[g]} 진화 허용`} checked={gp.evolvable} onChange={(e) => upS((x) => { x.genes[g].evolvable = e.target.checked; })} className="accent-neutral-900" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>

        <GroupLabel>고급 파라미터</GroupLabel>
        <Section title="에너지 대사" summary={s.metabolism.enabled ? `먹이당 +${s.metabolism.gainPerEat}` : '꺼짐'}>
          <Toggle label="대사 (굶주림) 사용" checked={s.metabolism.enabled} onChange={(v) => upS((x) => { x.metabolism.enabled = v; })} />
          <div className={`space-y-4 transition-opacity ${s.metabolism.enabled ? '' : 'pointer-events-none opacity-40'}`} aria-disabled={!s.metabolism.enabled}>
            <Slider label={isPrey ? '먹이 1개당 에너지' : '사냥 1회당 에너지'} value={s.metabolism.gainPerEat} min={1} max={100} onChange={(v) => upS((x) => { x.metabolism.gainPerEat = v; })} />
            <Slider label="최대 에너지" value={s.metabolism.maxEnergy} min={10} max={500} step={5} onChange={(v) => upS((x) => { x.metabolism.maxEnergy = v; })} />
            <Slider label="초기 에너지" value={s.metabolism.initialEnergy} min={1} max={s.metabolism.maxEnergy} resetOnly onChange={(v) => upS((x) => { x.metabolism.initialEnergy = v; }, true)} />
            <div className="rounded-lg bg-neutral-50 px-3 py-2 font-mono text-[10px] leading-relaxed text-neutral-600">
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
        <Section title="행동" summary={isPrey ? (s.behavior.seekFood || s.behavior.fleePredators ? '시야 사용' : '무작위 이동') : (s.behavior.chasePrey ? '추적' : '무작위 이동')}>
          <Slider label="이동/휴식 결정 간격" value={s.behavior.decisionInterval} min={0.1} max={5} step={0.1} format={(v) => `${v.toFixed(1)}s`} onChange={(v) => upS((x) => { x.behavior.decisionInterval = v; })} />
          {isPrey ? (
            <>
              <Toggle label="시야 안의 먹이 쫓기" checked={s.behavior.seekFood} onChange={(v) => upS((x) => { x.behavior.seekFood = v; })} />
              <Toggle label="시야 안의 포식자 피하기" checked={s.behavior.fleePredators} onChange={(v) => upS((x) => { x.behavior.fleePredators = v; })} />
            </>
          ) : (
            <Toggle label="시야 안의 피식자 추적" checked={s.behavior.chasePrey} onChange={(v) => upS((x) => { x.behavior.chasePrey = v; })} />
          )}
          <p className="m-0 text-[11px] leading-relaxed text-neutral-500">활동성은 결정할 때마다 <i>움직일지</i>를 정하는 확률입니다. 시야는 이미 움직이는 개체가 <i>어디로</i> 갈지만 바꿉니다. 시야 유전자가 0이면 감지 행동이 일어나지 않습니다.</p>
        </Section>
      </div>
    </div>
  );
});
