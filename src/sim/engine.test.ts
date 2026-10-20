import { describe, expect, it } from 'vitest';
import { Simulation, energyCostPerSecond, REF_AREA } from './engine';
import { presetById } from './presets';
import { GENE_COUNT, G_SPEED, PREDATOR, PREY, type SimConfig } from './types';

/** An empty world built from preset C (metabolism on for both species). */
function emptyWorld(mut?: (c: SimConfig) => void): Simulation {
  const c = presetById('C');
  c.prey.initialCount = 0;
  c.predator.initialCount = 0;
  c.food = { initialCount: 0, spawnRate: 0, maxCount: 0, radius: 2.5 };
  c.zones = [];
  mut?.(c);
  return new Simulation(c);
}

const STILL = { activity: 0 }; // never decides to move

describe('energy', () => {
  it('each cost term contributes independently', () => {
    const cfg = presetById('C').prey;
    const m = cfg.metabolism;
    m.basalCost = 1; m.sizeCost = 2; m.speedCost = 3; m.activityCost = 4; m.visionCost = 5;
    const base = energyCostPerSecond(cfg, 6, 6, 40, 0, 0, false);
    expect(base).toBeCloseTo(1 + 2 * (36 / REF_AREA));
    // doubling area doubles only the size term (and the speed term when moving)
    expect(energyCostPerSecond(cfg, 12, 6, 40, 0, 0, false) - base).toBeCloseTo(2);
    // speed only costs while moving, quadratic in speed
    expect(energyCostPerSecond(cfg, 6, 6, 40, 0, 0, true) - base).toBeCloseTo(3);
    expect(energyCostPerSecond(cfg, 6, 6, 80, 0, 0, true) - base).toBeCloseTo(12);
    expect(energyCostPerSecond(cfg, 6, 6, 80, 0, 0, false)).toBeCloseTo(base);
    expect(energyCostPerSecond(cfg, 6, 6, 40, 0.5, 0, false) - base).toBeCloseTo(2);
    expect(energyCostPerSecond(cfg, 6, 6, 40, 0, 50, false) - base).toBeCloseTo(5);
    m.enabled = false;
    expect(energyCostPerSecond(cfg, 6, 6, 40, 1, 50, true)).toBe(0);
  });

  it('a resting creature loses exactly cost × time and starves on schedule', () => {
    const sim = emptyWorld((c) => { c.prey.metabolism.initialEnergy = 10; });
    const id = sim.spawnCreature(PREY, 300, 300, STILL);
    const cost = energyCostPerSecond(sim.config.prey, 6, 6, 30, 0, 0, false);
    sim.step(30); // 1 s
    expect(sim.describe(id)!.energy).toBeCloseTo(10 - cost, 6);
    const ticksToDeath = Math.ceil(10 / (cost * sim.config.dt) - 1e-9);
    sim.step(ticksToDeath - 30 - 1);
    expect(sim.describe(id)).not.toBeNull();
    sim.step(1);
    expect(sim.describe(id)).toBeNull();
    expect(sim.totalDeaths[PREY][1]).toBe(1); // starvation
  });

  it('eating food adds energy, capped at maxEnergy', () => {
    const sim = emptyWorld((c) => {
      c.prey.metabolism.initialEnergy = 50;
      c.prey.metabolism.gainPerEat = 20;
      c.prey.metabolism.maxEnergy = 60;
      c.prey.reproduction.mode = 'none';
    });
    const id = sim.spawnCreature(PREY, 300, 300, STILL);
    sim.placeFood(300, 300);
    sim.placeFood(301, 300);
    const cost = energyCostPerSecond(sim.config.prey, 6, 6, 30, 0, 0, false) * sim.config.dt;
    sim.step(1);
    expect(sim.describe(id)!.energy).toBeCloseTo(60 - cost, 9); // 50+20 capped to 60, then drained
    expect(sim.foodN).toBe(1); // one item per tick
    sim.step(1);
    expect(sim.describe(id)!.totalEaten).toBe(2);
    expect(sim.foodN).toBe(0);
  });

  it('metabolism disabled → energy never changes and nobody starves', () => {
    const sim = emptyWorld((c) => { c.prey.metabolism.enabled = false; });
    const id = sim.spawnCreature(PREY, 300, 300, { activity: 1 });
    sim.step(30 * 120);
    expect(sim.describe(id)!.energy).toBe(sim.config.prey.metabolism.initialEnergy);
  });
});

describe('predation and death', () => {
  it('a caught prey dies once even when two predators touch it', () => {
    const sim = emptyWorld();
    sim.spawnCreature(PREY, 300, 300, STILL);
    const p1 = sim.spawnCreature(PREDATOR, 303, 300, STILL);
    const p2 = sim.spawnCreature(PREDATOR, 297, 300, STILL);
    sim.step(1);
    expect(sim.pop[PREY]).toBe(0);
    expect(sim.totalDeaths[PREY][0]).toBe(1);
    expect(sim.describe(p1)!.totalEaten + sim.describe(p2)!.totalEaten).toBe(1);
  });

  it('a prey killed this tick does not reproduce, even if it was ready', () => {
    const sim = emptyWorld((c) => { c.prey.reproduction.eatThreshold = 1; });
    sim.spawnCreature(PREY, 300, 300, STILL);
    sim.placeFood(300, 300);
    sim.spawnCreature(PREDATOR, 300, 300, STILL);
    sim.step(1);
    expect(sim.totalBirths[PREY]).toBe(0);
    expect(sim.n).toBe(1);
  });

  it('dead creatures are removed from the arrays and stop interacting', () => {
    const sim = emptyWorld();
    sim.spawnCreature(PREY, 300, 300, STILL);
    sim.spawnCreature(PREDATOR, 300, 300, STILL);
    sim.placeFood(300, 300);
    sim.step(1); // prey eats the food, then gets eaten in the same tick
    sim.placeFood(300, 300);
    sim.step(30);
    expect(sim.foodN).toBe(1); // nobody ate the new food
    expect(sim.n).toBe(1);
    expect(sim.species[0]).toBe(PREDATOR);
  });

  it('creatures die of old age at their lifespan', () => {
    const sim = emptyWorld((c) => { c.prey.lifespan = 2; c.prey.lifespanJitter = 0; c.prey.metabolism.enabled = false; });
    sim.spawnCreature(PREY, 300, 300, STILL);
    sim.step(59);
    expect(sim.pop[PREY]).toBe(1);
    sim.step(2);
    expect(sim.pop[PREY]).toBe(0);
    expect(sim.totalDeaths[PREY][2]).toBe(1);
  });
});

describe('reproduction', () => {
  it('eat mode: divides after N items, child inherits genes, energy is transferred', () => {
    const sim = emptyWorld((c) => {
      c.prey.evolve = false;
      c.prey.reproduction.eatThreshold = 2;
      c.prey.reproduction.offspringEnergy = 30;
      c.prey.metabolism.initialEnergy = 50;
      c.prey.metabolism.gainPerEat = 10;
    });
    const id = sim.spawnCreature(PREY, 300, 300, { activity: 0, width: 7.5, height: 4.25, speed: 12.5 });
    sim.placeFood(300, 300);
    sim.placeFood(300, 301);
    sim.step(1);
    expect(sim.pop[PREY]).toBe(1);
    sim.step(1);
    expect(sim.pop[PREY]).toBe(2);
    const parent = sim.describe(id)!;
    const child = sim.describe(sim.id[1])!;
    expect(child.parentId).toBe(id);
    expect(child.generation).toBe(1);
    expect(child.genes).toEqual(parent.genes);
    expect(child.energy).toBe(30);
    const cost = energyCostPerSecond(sim.config.prey, 7.5, 4.25, 12.5, 0, 0, false) * sim.config.dt;
    expect(parent.energy).toBeCloseTo(50 + 20 - 2 * cost - 30, 9);
    expect(parent.eaten).toBe(0);
    expect(parent.children).toBe(1);
  });

  it('eat mode: does not divide below the threshold', () => {
    const sim = emptyWorld((c) => { c.prey.reproduction.eatThreshold = 3; });
    sim.spawnCreature(PREY, 300, 300, STILL);
    sim.placeFood(300, 300);
    sim.placeFood(300, 300);
    sim.step(10);
    expect(sim.totalBirths[PREY]).toBe(0);
  });

  it('a parent that cannot afford the offspring energy waits', () => {
    const sim = emptyWorld((c) => {
      c.prey.reproduction.eatThreshold = 1;
      c.prey.reproduction.offspringEnergy = 80;
      c.prey.metabolism.initialEnergy = 30;
      c.prey.metabolism.gainPerEat = 10;
    });
    sim.spawnCreature(PREY, 300, 300, STILL);
    sim.placeFood(300, 300);
    sim.step(5);
    expect(sim.totalBirths[PREY]).toBe(0);
  });

  it('timer mode divides on schedule and respects maxPopulation', () => {
    const sim = emptyWorld((c) => {
      c.prey.metabolism.enabled = false;
      c.prey.reproduction = { ...c.prey.reproduction, mode: 'timer', interval: 1, maxPopulation: 5 };
    });
    sim.spawnCreature(PREY, 300, 300, STILL);
    sim.step(29);
    expect(sim.pop[PREY]).toBe(1);
    sim.step(1);
    expect(sim.pop[PREY]).toBe(2);
    sim.step(30 * 10);
    expect(sim.pop[PREY]).toBe(5);
  });

  it('mode "none" never reproduces', () => {
    const sim = emptyWorld((c) => { c.predator.reproduction.mode = 'none'; c.predator.metabolism.enabled = false; });
    sim.spawnCreature(PREDATOR, 300, 300, STILL);
    for (let k = 0; k < 20; k++) { sim.spawnCreature(PREY, 300, 300, STILL); sim.step(1); }
    expect(sim.pop[PREDATOR]).toBe(1);
  });
});

describe('safe zones', () => {
  it('prey inside a prey-only zone cannot be caught; in an open zone they can', () => {
    for (const [access, expected] of [['prey', 1], ['all', 0]] as const) {
      const sim = emptyWorld((c) => { c.zones = [{ enabled: true, x: 300, y: 300, radius: 50, access }]; });
      sim.spawnCreature(PREY, 300, 300, STILL);
      sim.spawnCreature(PREDATOR, 300, 300, STILL);
      sim.step(1);
      expect(sim.pop[PREY]).toBe(expected);
    }
  });

  it('excluded species are pushed out, and live rule changes take effect', () => {
    const sim = emptyWorld((c) => {
      c.zones = [{ enabled: true, x: 300, y: 300, radius: 60, access: 'prey' }];
      c.prey.metabolism.enabled = false;
      c.predator.metabolism.enabled = false;
    });
    const pred = sim.spawnCreature(PREDATOR, 310, 300, { activity: 1 });
    const prey = sim.spawnCreature(PREY, 300, 310, STILL);
    const dist = (id: number) => { const d = sim.describe(id)!; return Math.hypot(d.x - 300, d.y - 300); };
    for (let k = 0; k < 300; k++) { sim.step(1); expect(dist(pred)).toBeGreaterThanOrEqual(60); }
    expect(dist(prey)).toBeLessThan(60);
    sim.config.zones[0].access = 'none';
    sim.step(1);
    expect(dist(prey)).toBeGreaterThanOrEqual(60);
  });
});

describe('reproducibility', () => {
  it('same seed + config → identical state; different seed → different state', () => {
    const run = (seed: number, chunks: number[]) => {
      const c = presetById('C');
      c.seed = seed;
      const sim = new Simulation(c);
      for (const k of chunks) sim.step(k);
      return sim.stateHash();
    };
    const a = run(7, [3000]);
    expect(run(7, [3000])).toBe(a);
    expect(run(7, [1000, 1, 1999])).toBe(a); // chunking does not matter
    expect(run(8, [3000])).not.toBe(a);
  });
});

describe('natural selection (emergent, not coded)', () => {
  it('with predators, prey speed evolves downward; without heritable variation it cannot', () => {
    const meanSpeed = (sim: Simulation) => {
      let s = 0, k = 0;
      for (let i = 0; i < sim.n; i++) if (sim.species[i] === PREY) { s += sim.genes[i * GENE_COUNT + G_SPEED]; k++; }
      return s / k;
    };
    const evolving = new Simulation(presetById('A'));
    evolving.step(30 * 1500);
    expect(meanSpeed(evolving)).toBeLessThan(30 * 0.6);

    const control = presetById('A');
    control.prey.evolve = false;
    const clones = new Simulation(control);
    clones.step(30 * 1500);
    expect(meanSpeed(clones)).toBe(30);
  }, 30_000);

  it('a prey-only safe zone reduces predation deaths', () => {
    const deaths = (id: string) => {
      const sim = new Simulation(presetById(id));
      sim.step(30 * 600);
      return sim.totalDeaths[PREY][0];
    };
    expect(deaths('A-zone')).toBeLessThan(deaths('A') * 0.8);
  }, 30_000);
});
