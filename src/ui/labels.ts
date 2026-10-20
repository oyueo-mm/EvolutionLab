import type { GeneKey } from '../sim/types';

export const GENE_LABEL: Record<GeneKey, string> = {
  width: '길이 (진행 방향)',
  height: '폭 (측면)',
  speed: '속도',
  activity: '활동성',
  vision: '시야',
};

export const ACCESS_LABEL = {
  prey: '피식자만',
  predator: '포식자만',
  all: '모두 출입',
  none: '출입 불가',
} as const;

export const REPRO_LABEL = {
  none: '번식 없음',
  timer: '주기',
  eat: '섭취 수',
  energy: '에너지',
} as const;
