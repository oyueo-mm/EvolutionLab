import { memo, useEffect, useState } from 'react';
import type { SimClient } from '../client/simClient';
import type { CreatureInfo } from '../sim/engine';
import { GENE_KEYS } from '../sim/types';
import { GENE_LABEL } from './labels';
import { usePoll } from './hooks';

const GENE_FMT = [1, 1, 1, 2, 0];

/** Selected-creature card. Polls the latest frame itself (4 Hz) so the app shell never re-renders for it. */
export const SelectedCreature = memo(function SelectedCreature({ client, follow, onFollow, onClose }: { client: SimClient; follow: boolean; onFollow: (v: boolean) => void; onClose: () => void }) {
  const { info } = usePoll(() => ({ info: client.latest?.selected ?? null }), 120);
  // Right after a click the worker has not sent the creature yet; only call it dead after a grace period.
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setWaited(true), 900);
    return () => clearTimeout(id);
  }, []);
  return <Inspector info={info} loading={!waited} follow={follow} onFollow={onFollow} onClose={onClose} />;
});

function Inspector({ info, loading, follow, onFollow, onClose }: { info: CreatureInfo | null; loading: boolean; follow: boolean; onFollow: (v: boolean) => void; onClose: () => void }) {
  if (!info) {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-white/95 px-3.5 py-2.5 text-xs text-neutral-500 shadow-float ring-1 ring-black/5 backdrop-blur">
        {loading ? '개체 정보를 불러오는 중…' : '선택한 개체가 사망했습니다.'}
        <button type="button" onClick={onClose} className="rounded px-1 font-medium text-neutral-700 hover:text-neutral-900">닫기</button>
      </div>
    );
  }
  const isPrey = info.species === 0;
  const energyPct = info.maxEnergy > 0 ? Math.min(1, info.energy / info.maxEnergy) : 0;
  return (
    <div role="region" aria-label="선택한 개체" className="w-64 rounded-xl bg-white/95 text-xs shadow-float ring-1 ring-black/5 backdrop-blur">
      <div className="flex items-center justify-between px-3.5 pb-2 pt-3">
        <div className="flex items-center gap-2">
          <span className={`inline-block h-2.5 w-2.5 rounded-[3px] ${isPrey ? 'bg-neutral-900' : 'bg-[#d9412e]'}`} />
          <span className="text-[13px] font-semibold text-neutral-900">{isPrey ? '피식자' : '포식자'}</span>
          <span className="font-mono text-neutral-400">#{info.id}</span>
        </div>
        <button type="button" onClick={onClose} className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-800" aria-label="선택 해제">
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        </button>
      </div>
      <dl className="m-0 grid grid-cols-2 gap-x-3 gap-y-1 px-3.5 pb-2.5">
        <dt className="text-neutral-500">세대</dt><dd className="m-0 text-right font-mono">{info.generation}</dd>
        <dt className="text-neutral-500">부모</dt><dd className="m-0 text-right font-mono">{info.parentId ? `#${info.parentId}` : '시조'}</dd>
        <dt className="text-neutral-500">나이</dt><dd className="m-0 text-right font-mono">{info.age.toFixed(1)}s{info.maxAge > 0 ? ` / ${info.maxAge.toFixed(0)}s` : ''}</dd>
        <dt className="text-neutral-500" title="마지막 번식 이후 / 평생 누적">{isPrey ? '먹이' : '사냥'}</dt><dd className="m-0 text-right font-mono">{info.eaten} <span className="text-neutral-400">/ 누적 {info.totalEaten}</span></dd>
        <dt className="text-neutral-500">자손</dt><dd className="m-0 text-right font-mono">{info.children}</dd>
        <dt className="text-neutral-500">상태</dt><dd className="m-0 text-right">{info.moving ? '이동 중' : '휴식'}</dd>
      </dl>
      <div className="px-3.5 pb-3">
        <div className="mb-1 flex justify-between text-neutral-500">
          <span>에너지</span>
          <span className="font-mono text-neutral-900">{info.energy.toFixed(1)} <span className="text-neutral-400">−{info.energyCostPerSec.toFixed(2)}/s</span></span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100">
          <div className="h-full rounded-full bg-emerald-600" style={{ width: `${energyPct * 100}%` }} />
        </div>
      </div>
      <div className="border-t border-neutral-100 px-3.5 py-2.5">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-400">유전자 = 표현형</div>
        {GENE_KEYS.map((g, k) => (
          <div key={g} className="flex justify-between">
            <span className="text-neutral-500">{GENE_LABEL[g]}</span>
            <span className="font-mono">{info.genes[k].toFixed(GENE_FMT[k])}</span>
          </div>
        ))}
      </div>
      <label className="flex cursor-pointer items-center gap-2 border-t border-neutral-100 px-3.5 py-2.5 text-neutral-600">
        <input type="checkbox" checked={follow} onChange={(e) => onFollow(e.target.checked)} className="accent-neutral-900" />
        카메라로 따라가기
      </label>
    </div>
  );
}
