import type { CreatureInfo } from '../sim/engine';
import { GENE_KEYS } from '../sim/types';
import { GENE_LABEL } from './ControlPanel';

const GENE_FMT = [1, 1, 1, 2, 0];

export function Inspector({ info, follow, onFollow, onClose }: { info: CreatureInfo | null; follow: boolean; onFollow: (v: boolean) => void; onClose: () => void }) {
  if (!info) {
    return (
      <div className="rounded-lg border border-stone-200 bg-white/95 px-3 py-2 text-xs text-stone-500 shadow-sm backdrop-blur">
        선택한 개체가 사망했습니다.
        <button type="button" onClick={onClose} className="ml-2 text-stone-400 hover:text-stone-700">닫기</button>
      </div>
    );
  }
  const isPrey = info.species === 0;
  const energyPct = info.maxEnergy > 0 ? Math.min(1, info.energy / info.maxEnergy) : 0;
  return (
    <div className="w-64 rounded-lg border border-stone-200 bg-white/95 text-xs shadow-md backdrop-blur">
      <div className="flex items-center justify-between border-b border-stone-100 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className={`inline-block h-2.5 w-2.5 rounded-sm ${isPrey ? 'bg-stone-800' : 'bg-[#d9412e]'}`} />
          <span className="font-semibold text-stone-800">{isPrey ? '피식자' : '포식자'}</span>
          <span className="font-mono text-stone-400">#{info.id}</span>
        </div>
        <button type="button" onClick={onClose} className="text-stone-400 hover:text-stone-800" aria-label="닫기">✕</button>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 px-3 py-2">
        <dt className="text-stone-500">세대</dt><dd className="text-right font-mono">{info.generation}</dd>
        <dt className="text-stone-500">부모</dt><dd className="text-right font-mono">{info.parentId ? `#${info.parentId}` : '시조'}</dd>
        <dt className="text-stone-500">나이</dt><dd className="text-right font-mono">{info.age.toFixed(1)}s{info.maxAge > 0 ? ` / ${info.maxAge.toFixed(0)}s` : ''}</dd>
        <dt className="text-stone-500" title="마지막 번식 이후 / 평생 누적">{isPrey ? '먹이' : '사냥'}</dt><dd className="text-right font-mono">{info.eaten} <span className="text-stone-400">/ 누적 {info.totalEaten}</span></dd>
        <dt className="text-stone-500">자손</dt><dd className="text-right font-mono">{info.children}</dd>
        <dt className="text-stone-500">상태</dt><dd className="text-right">{info.moving ? '이동 중' : '휴식'}</dd>
      </dl>
      <div className="px-3 pb-2">
        <div className="mb-1 flex justify-between text-stone-500">
          <span>에너지</span>
          <span className="font-mono text-stone-800">{info.energy.toFixed(1)} <span className="text-stone-400">−{info.energyCostPerSec.toFixed(2)}/s</span></span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-stone-200">
          <div className="h-full rounded-full bg-emerald-600" style={{ width: `${energyPct * 100}%` }} />
        </div>
      </div>
      <div className="border-t border-stone-100 px-3 py-2">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-stone-400">유전자 = 표현형</div>
        {GENE_KEYS.map((g, k) => (
          <div key={g} className="flex justify-between">
            <span className="text-stone-500">{GENE_LABEL[g]}</span>
            <span className="font-mono">{info.genes[k].toFixed(GENE_FMT[k])}</span>
          </div>
        ))}
      </div>
      <label className="flex cursor-pointer items-center gap-2 border-t border-stone-100 px-3 py-2 text-stone-600">
        <input type="checkbox" checked={follow} onChange={(e) => onFollow(e.target.checked)} />
        카메라로 따라가기
      </label>
    </div>
  );
}
