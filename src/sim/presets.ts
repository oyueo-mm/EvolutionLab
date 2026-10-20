// Experiment presets. All numbers are design assumptions of this project, chosen by running
// headless simulations (scripts/tune.ts) so populations persist. See docs/RULES.md.

import type { GeneKey, GeneParams, SimConfig, SpeciesConfig, ZoneConfig } from './types';

export const WORLD_W = 1200;
export const WORLD_H = 800;

function gene(min: number, max: number, initial: number, evolvable = true, extra: Partial<GeneParams> = {}): GeneParams {
  return { min, max, initial, initialSpread: 0, evolvable, rateMul: 1, strengthMul: 1, ...extra };
}

function preyGenes(): Record<GeneKey, GeneParams> {
  return {
    width: gene(1.5, 20, 6),
    height: gene(1.5, 20, 6),
    speed: gene(0, 120, 30),
    activity: gene(0, 1, 0.5),
    vision: gene(0, 150, 0, false),
  };
}

function predatorGenes(): Record<GeneKey, GeneParams> {
  return {
    width: gene(2, 30, 12),
    height: gene(2, 30, 12),
    speed: gene(0, 150, 60),
    activity: gene(0, 1, 1),
    vision: gene(0, 200, 0, false),
  };
}

function baseSpecies(genes: Record<GeneKey, GeneParams>): SpeciesConfig {
  return {
    initialCount: 100,
    evolve: true,
    mutation: { rate: 0.3, strength: 0.05 },
    genes,
    reproduction: { mode: 'none', interval: 8, eatThreshold: 5, energyThreshold: 100, offspringEnergy: 40, maxPopulation: 1000 },
    metabolism: {
      enabled: false, initialEnergy: 60, maxEnergy: 100, gainPerEat: 20,
      basalCost: 1, sizeCost: 1, speedCost: 1, activityCost: 0.5, visionCost: 0,
    },
    behavior: { decisionInterval: 0.8, seekFood: false, fleePredators: false, chasePrey: false },
    lifespan: 0,
    lifespanJitter: 0.2,
  };
}

function centralZone(enabled: boolean): ZoneConfig {
  return { enabled, x: WORLD_W / 2, y: WORLD_H / 2, radius: 140, access: 'prey' };
}

function baseConfig(): SimConfig {
  return {
    seed: 2019,
    world: { width: WORLD_W, height: WORLD_H },
    dt: 1 / 30,
    food: { initialCount: 0, spawnRate: 0, maxCount: 0, radius: 2.5 },
    zones: [centralZone(false)],
    prey: baseSpecies(preyGenes()),
    predator: baseSpecies(predatorGenes()),
    sampleInterval: 1,
  };
}

/** Experiment A — prey divide on a timer; a fixed number of non-evolving predators wander randomly. */
function experimentA(zone: boolean): SimConfig {
  const c = baseConfig();
  c.zones = [centralZone(zone)];
  c.prey.initialCount = 200;
  c.prey.reproduction = { ...c.prey.reproduction, mode: 'timer', interval: 3, maxPopulation: 500 };
  c.prey.lifespan = 0; // immortal: predation is the only cause of death
  c.predator.initialCount = 25;
  c.predator.genes.speed.initial = 80;
  c.predator.genes.width.initial = 14;
  c.predator.genes.height.initial = 14;
  c.predator.evolve = false;
  c.predator.reproduction.mode = 'none';
  return c;
}

/** Experiment B — prey divide after eating 5 food; metabolism makes starvation possible. */
function experimentB(): SimConfig {
  const c = baseConfig();
  c.food = { initialCount: 600, spawnRate: 40, maxCount: 1500, radius: 2.5 };
  c.prey.initialCount = 150;
  c.prey.reproduction = { ...c.prey.reproduction, mode: 'eat', eatThreshold: 5, offspringEnergy: 40, maxPopulation: 1500 };
  c.prey.metabolism = { ...c.prey.metabolism, enabled: true, initialEnergy: 60, maxEnergy: 100, gainPerEat: 20, basalCost: 1, sizeCost: 1, speedCost: 1, activityCost: 0.5 };
  c.prey.lifespan = 120;
  c.predator.initialCount = 4;
  c.predator.evolve = false;
  c.predator.reproduction.mode = 'none';
  return c;
}

/** Experiment C — co-evolution: prey divide after 3 food, predators after 10 prey; both pay energy for size and speed. */
function experimentC(): SimConfig {
  const c = baseConfig();
  c.food = { initialCount: 600, spawnRate: 40, maxCount: 1500, radius: 2.5 };
  c.prey.initialCount = 200;
  c.prey.reproduction = { ...c.prey.reproduction, mode: 'eat', eatThreshold: 3, offspringEnergy: 30, maxPopulation: 2000 };
  c.prey.metabolism = { ...c.prey.metabolism, enabled: true, initialEnergy: 50, maxEnergy: 100, gainPerEat: 20, basalCost: 0.5, sizeCost: 1, speedCost: 1, activityCost: 0.5 };
  c.prey.lifespan = 120;
  c.predator.initialCount = 10;
  c.predator.genes.width.initial = 10;
  c.predator.genes.height.initial = 10;
  c.predator.genes.speed.initial = 50;
  c.predator.reproduction = { ...c.predator.reproduction, mode: 'eat', eatThreshold: 10, offspringEnergy: 50, maxPopulation: 300 };
  c.predator.metabolism = { ...c.predator.metabolism, enabled: true, initialEnergy: 100, maxEnergy: 200, gainPerEat: 25, basalCost: 0.5, sizeCost: 0.3, speedCost: 0.5, activityCost: 0.3 };
  c.predator.lifespan = 300;
  return c;
}

/** Sandbox — vision-driven behaviour: prey seek food & flee, predators chase; vision evolves and costs energy. */
function experimentVision(): SimConfig {
  const c = experimentC();
  c.prey.genes.vision = gene(0, 150, 30);
  c.predator.genes.vision = gene(0, 200, 40);
  c.prey.metabolism.visionCost = 0.5;
  c.predator.metabolism.visionCost = 0.5;
  c.prey.behavior = { ...c.prey.behavior, seekFood: true, fleePredators: true };
  c.predator.behavior = { ...c.predator.behavior, chasePrey: true };
  return c;
}

export interface Preset {
  id: string;
  name: string;
  description: string;
  build: () => SimConfig;
}

export const PRESETS: Preset[] = [
  { id: 'A', name: 'A · 기초 자연선택', description: '피식자는 일정 주기로 분열합니다. 고정된 수의 포식자가 무작위로 돌아다닙니다. 크기, 속도, 활동성이 유전됩니다.', build: () => experimentA(false) },
  { id: 'A-zone', name: 'A′ · 기초 + 안전구역', description: '실험 A에 피식자만 들어갈 수 있는 중앙 안전구역을 더한 설정입니다.', build: () => experimentA(true) },
  { id: 'B', name: 'B · 먹이 기반 번식', description: '피식자는 먹이 5개를 먹으면 분열합니다. 에너지가 바닥나면 굶어 죽습니다.', build: experimentB },
  { id: 'C', name: 'C · 포식자-피식자 공진화', description: '피식자는 먹이 3개, 포식자는 피식자 10마리를 먹으면 번식합니다. 두 종 모두 진화하며 크기와 속도에 에너지 비용이 듭니다.', build: experimentC },
  { id: 'V', name: 'V · 시야와 행동 (확장)', description: '실험 C에 시야 유전자를 더했습니다. 피식자는 먹이를 찾고 포식자를 피하며, 포식자는 피식자를 쫓습니다. 시야가 넓을수록 에너지 비용이 큽니다.', build: experimentVision },
];

export function presetById(id: string): SimConfig {
  return (PRESETS.find((p) => p.id === id) ?? PRESETS[0]).build();
}
