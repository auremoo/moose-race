import { describe, expect, it } from 'vitest';
import { balance, trackById } from '../src/data';
import { autopilot } from '../src/sim/autopilot';
import { createMooseState, NO_COMMANDS, stepMoose } from '../src/sim/moose';
import { createRace, stepRace } from '../src/sim/race';

const P = balance.moose;
const S = balance.surfaces;
const DT = 1 / 60;
const GO = { ...NO_COMMANDS, throttle: 1 };
const run = (s: ReturnType<typeof createMooseState>, cmd: typeof GO, seconds: number, surf = S.sentier) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) stepMoose(s, cmd, surf, P, DT);
};

describe('galop', () => {
  it('augmente la vitesse de pointe de 22 % et vide l\'endurance en 4 s', () => {
    const s = createMooseState(0, 0, 0, P.topSpeed);
    run(s, { ...GO, gallop: true }, 3.9);
    expect(s.galloping).toBe(true);
    expect(s.speed).toBeGreaterThan(P.topSpeed * 1.12);
    run(s, { ...GO, gallop: true }, 0.2);
    expect(s.exhausted).toBe(true);
    expect(s.galloping).toBe(false);
    expect(s.endurance).toBeLessThan(0.02);
  });

  it('l\'endurance remonte en 8 s hors galop', () => {
    const s = createMooseState(0, 0, 0, P.topSpeed);
    run(s, { ...GO, gallop: true }, 4.1);
    run(s, GO, 7.9);
    expect(s.endurance).toBeGreaterThan(0.95);
    expect(s.endurance).toBeLessThan(1);
    run(s, GO, 0.2);
    expect(s.endurance).toBe(1);
  });
});

describe('glissade', () => {
  const drift = (seconds: number) => {
    const s = createMooseState(0, 0, 0, 25);
    run(s, { ...GO, steer: 0.8, slide: true }, seconds);
    const speedDuring = s.speed;
    stepMoose(s, { ...GO, steer: 0.8 }, S.sentier, P, DT);
    return { s, speedDuring };
  };

  it('une glissade courte ne charge pas d\'élan et sert de frein', () => {
    const { s, speedDuring } = drift(0.25);
    expect(s.boostTime).toBe(0);
    expect(speedDuring).toBeLessThan(25);
  });

  it('une glissade longue libère jusqu\'à 1,5 s de poussée', () => {
    const { s } = drift(2);
    expect(s.boostTime).toBeGreaterThan(1.4);
    expect(s.boostTime).toBeLessThanOrEqual(1.5);
  });

  it('resserre la trajectoire par rapport à la même direction sans glisser', () => {
    const a = createMooseState(0, 0, 0, 25);
    const b = createMooseState(0, 0, 0, 25);
    run(a, { ...GO, steer: 0.8 }, 0.8);
    run(b, { ...GO, steer: 0.8, slide: true }, 0.8);
    expect(Math.abs(b.heading)).toBeGreaterThan(Math.abs(a.heading));
  });
});

describe('surfaces', () => {
  it('la glace réduit fortement l\'adhérence en virage', () => {
    const a = createMooseState(0, 0, 0, 25);
    const b = createMooseState(0, 0, 0, 25);
    run(a, { ...GO, steer: 0.6 }, 1);
    run(b, { ...GO, steer: 0.6 }, 1, S.glace);
    expect(Math.abs(b.heading)).toBeLessThan(Math.abs(a.heading));
  });
});

describe('corde et aspiration en course', () => {
  it('le pilote sur la ligne de course touche des cordes parfaites', () => {
    const race = createRace(trackById('boucle-grise')!, balance, { laps: 1 });
    for (let i = 0; i < 60 * 120 && race.phase !== 'finished'; i++)
      stepRace(race, [autopilot(race.track, race.racers[0], P, S.sentier, { line: race.line })]);
    expect(race.racers[0].cordeCount).toBeGreaterThanOrEqual(Math.floor(race.line.apexes.length * 0.6));
  });

  it('un orignal dans le sillage d\'un autre va plus vite', () => {
    const race = createRace(trackById('prairie-tranquille')!, balance, { racerCount: 2 });
    // Deux orignaux alignés sur la ligne droite, le second 8 m derrière.
    const s0 = race.track.samples[40];
    const h = Math.atan2(s0.ty, s0.tx);
    for (const [i, back] of [[0, 0], [1, 8]] as const) {
      const m = race.racers[i].moose;
      m.x = s0.x - s0.tx * back;
      m.y = s0.y - s0.ty * back;
      m.heading = h;
      m.speed = 25;
    }
    race.phase = 'running';
    race.tick = race.countdownTicks;
    stepRace(race, [GO, GO]);
    expect(race.racers[1].moose.drafting).toBe(true);
    expect(race.racers[0].moose.drafting).toBe(false);
  });
});

describe('peloton', () => {
  it('11 orignaux terminent la course, de façon déterministe', async () => {
    const { buildEntrants } = await import('../src/sim/roster');
    const run = () => {
      const entrants = buildEntrants({ playerName: 'J', playerMooseId: 'bucheron', playerLevel: 1, difficulty: 'moyen', botCount: 10, seed: 9, balance });
      const race = createRace(trackById('cap-diamant')!, balance, { laps: 1, entrants, difficulty: 'moyen', seed: 9 });
      for (let i = 0; i < 60 * 200 && !race.racers.every((r) => r.finished); i++)
        stepRace(race, [autopilot(race.track, race.racers[0], race.racers[0].params, S.sentier, { line: { offset: race.line.offset, speed: race.racers[0].profile } })]);
      return race.racers.map((r) => r.finishTime);
    };
    const a = run();
    expect(a.every((t) => t > 0)).toBe(true);
    expect(run()).toEqual(a);
  });

  it('la cote des bots suit la difficulté', async () => {
    const { buildEntrants } = await import('../src/sim/roster');
    const mean = (d: 'facile' | 'moyen' | 'difficile') => {
      const e = buildEntrants({ playerName: 'J', playerMooseId: 'bucheron', playerLevel: 5, difficulty: d, botCount: 10, seed: 2, balance });
      return e.slice(1).reduce((a, x) => a + (x.rating ?? 0), 0) / 10;
    };
    expect(Math.abs(mean('facile') - 42)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(mean('moyen') - 48)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(mean('difficile') - 52)).toBeLessThanOrEqual(1.5);
  });
});

describe('vent de travers et racines', () => {
  it('le vent pousse un orignal qui ne corrige pas sa direction', () => {
    const drift = (id: string) => {
      const race = createRace(trackById(id)!, balance, { laps: 1 });
      race.phase = 'running';
      race.tick = race.countdownTicks;
      const m = race.racers[0].moose;
      m.speed = 20;
      const y0 = { x: m.x, y: m.y };
      for (let i = 0; i < 60 * 3; i++) stepRace(race, [{ ...GO, steer: 0 }]);
      // Écart latéral par rapport à la ligne droite suivie.
      const dx = m.x - y0.x;
      const dy = m.y - y0.y;
      return Math.abs(-dx * Math.sin(m.heading) + dy * Math.cos(m.heading));
    };
    expect(drift('crepuscule-manitoba')).toBeGreaterThan(1);
    expect(drift('prairie-tranquille')).toBeLessThan(0.01);
  });

  it('les racines ralentissent', () => {
    const a = createMooseState(0, 0, 0, 0);
    const b = createMooseState(0, 0, 0, 0);
    run(a, GO, 10);
    run(b, GO, 10, S.racines);
    expect(b.speed).toBeLessThan(a.speed * 0.9);
  });
});

describe('dénivelé', () => {
  it('on ralentit en montée et on prend de l\'élan en descente', () => {
    const flat = createMooseState(0, 0, 0, 20);
    const up = createMooseState(0, 0, 0, 20);
    const down = createMooseState(0, 0, 0, 20);
    for (let i = 0; i < 120; i++) {
      stepMoose(flat, NO_COMMANDS, S.sentier, P, DT, 0);
      stepMoose(up, NO_COMMANDS, S.sentier, P, DT, 0.1);
      stepMoose(down, NO_COMMANDS, S.sentier, P, DT, -0.1);
    }
    expect(up.speed).toBeLessThan(flat.speed - 0.5);
    expect(down.speed).toBeGreaterThan(flat.speed + 0.5);
  });

  it('les Lacs de Banff ont un fort dénivelé', () => {
    const race = createRace(trackById('lacs-banff')!, balance);
    const zs = race.track.samples.map((s) => s.z);
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(25);
  });
});
