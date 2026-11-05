import { describe, expect, it } from 'vitest';
import { balance, tracks } from '../src/data';
import { autopilot } from '../src/sim/autopilot';
import { createMooseState, stepMoose, steerCurvatureRange, NO_COMMANDS } from '../src/sim/moose';
import { createRace, raceTime, stepRace } from '../src/sim/race';
import { buildTrack } from '../src/sim/track';

const P = balance.moose;
const SENTIER = balance.surfaces.sentier;
const DT = 1 / balance.sim.hz;

const FULL = { ...NO_COMMANDS, throttle: 1 };

function runRace(seed: number, opts: Parameters<typeof autopilot>[4] = {}, maxSeconds = 400, track = tracks[0]) {
  const race = createRace(track, balance, { seed, laps: 2 });
  const max = Math.round(maxSeconds / DT);
  for (let i = 0; i < max && race.phase !== 'finished'; i++) {
    stepRace(race, [autopilot(race.track, race.racers[0], P, SENTIER, opts)]);
  }
  return race;
}

describe('piste', () => {
  it('construit une boucle fermée échantillonnée à ~1 m', () => {
    const t = buildTrack(tracks[0], 1);
    expect(t.length).toBeGreaterThan(1000);
    expect(Math.abs(t.spacing - 1)).toBeLessThan(0.05);
    const a = t.samples[0];
    const b = t.samples[t.samples.length - 1];
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(1.5);
  });
});

describe('physique de l\'orignal', () => {
  it('sans accélérer, l\'orignal ralentit doucement (roue libre)', () => {
    const s = createMooseState(0, 0, 0, P.topSpeed);
    for (let i = 0; i < 60; i++) stepMoose(s, NO_COMMANDS, SENTIER, P, DT);
    expect(s.speed).toBeLessThan(P.topSpeed - 0.5);
    expect(s.speed).toBeGreaterThan(P.topSpeed - 3);
  });

  it('le frein arrête l\'orignal de 30 m/s en ~2 à 3 s, sans arrêt net', () => {
    const s = createMooseState(0, 0, 0, P.topSpeed);
    let t = 0;
    while (s.speed > 0.01 && t < 10) {
      stepMoose(s, { ...NO_COMMANDS, brake: 1 }, SENTIER, P, DT);
      t += DT;
    }
    expect(t).toBeGreaterThan(1.8);
    expect(t).toBeLessThan(3);
  });

  it('atteint la vitesse de pointe en ligne droite', () => {
    const s = createMooseState(0, 0, 0, 0);
    for (let i = 0; i < 60 * 20; i++) stepMoose(s, FULL, SENTIER, P, DT);
    expect(s.speed).toBeGreaterThan(P.topSpeed * 0.97);
    expect(s.speed).toBeLessThanOrEqual(P.topSpeed + 1e-9);
  });

  it.each([20, 40, 60])('en virage stabilisé de rayon %i m, v → sqrt(a_lat × R)', (R) => {
    const s = createMooseState(0, 0, 0, P.topSpeed);
    // Direction maintenue à fond : le rayon visé est le plus serré permis (borné par R).
    for (let i = 0; i < 60 * 30; i++) {
      const steer = Math.min(1, 1 / R / steerCurvatureRange(s.speed, SENTIER, P));
      stepMoose(s, { ...FULL, steer }, SENTIER, P, DT);
    }
    const expected = Math.min(P.topSpeed, Math.sqrt(P.aLat * R));
    expect(Math.abs(s.speed - expected) / expected).toBeLessThan(0.03);
  });

  it('un rayon plus large de 50 % donne environ 22 % de vitesse de passage', () => {
    const settle = (R: number) => {
      const s = createMooseState(0, 0, 0, 20);
      for (let i = 0; i < 60 * 30; i++) {
        const steer = Math.min(1, 1 / R / steerCurvatureRange(s.speed, SENTIER, P));
        stepMoose(s, { ...FULL, steer }, SENTIER, P, DT);
      }
      return s.speed;
    };
    const gain = settle(30) / settle(20) - 1;
    expect(gain).toBeGreaterThan(0.2);
    expect(gain).toBeLessThan(0.25);
  });

  it('à haute vitesse, un petit geste ne fait pas déraper', () => {
    const s = createMooseState(0, 0, 0, P.topSpeed);
    for (let i = 0; i < 30; i++) stepMoose(s, { ...FULL, steer: 0.4 }, SENTIER, P, DT);
    expect(s.sliding).toBe(false);
  });

  it('la survitesse fait élargir : le rayon suivi dépasse le rayon demandé', () => {
    const s = createMooseState(0, 0, 0, P.topSpeed);
    stepMoose(s, { ...FULL, steer: 1 }, SENTIER, P, DT);
    for (let i = 0; i < 10; i++) stepMoose(s, { ...FULL, steer: 1 }, SENTIER, P, DT);
    expect(s.sliding).toBe(true);
    expect(Math.abs(s.curvature)).toBeLessThan(Math.abs(s.commandedCurvature));
  });

  it('l\'herbe plafonne la vitesse à 75 %', () => {
    const s = createMooseState(0, 0, 0, P.topSpeed);
    for (let i = 0; i < 60 * 15; i++) stepMoose(s, FULL, balance.surfaces.herbe, P, DT);
    expect(s.speed).toBeLessThan(P.topSpeed * 0.76);
    expect(s.speed).toBeGreaterThan(P.topSpeed * 0.72);
  });
});

describe('course', () => {
  it('est déterministe : même graine, mêmes commandes, même résultat', () => {
    const a = runRace(42);
    const b = runRace(42);
    expect(a.racers[0].finishTime).toBe(b.racers[0].finishTime);
    expect(a.racers[0].moose.x).toBe(b.racers[0].moose.x);
    expect(a.racers[0].moose.y).toBe(b.racers[0].moose.y);
    expect(a.tick).toBe(b.tick);
  });

  it('un pilote automatique au centre termine 2 tours sans blocage', () => {
    const race = runRace(1);
    expect(race.phase).toBe('finished');
    expect(race.racers[0].lapTimes).toHaveLength(2);
    const t = raceTime(race);
    // 2 × 1,43 km à ~25 m/s de moyenne : entre 90 et 150 s.
    expect(t).toBeGreaterThan(80);
    expect(t).toBeLessThan(160);
  });

  it('freiner avant les virages est plus rapide que foncer sans freiner (critère du cahier)', () => {
    const smart = runRace(1);
    const naive = runRace(1, { brakes: false });
    expect(smart.phase).toBe('finished');
    expect(raceTime(smart)).toBeLessThan(naive.phase === 'finished' ? raceTime(naive) : Infinity);
  });

  it('le demi-tour ne compte pas de tour', () => {
    const race = createRace(tracks[0], balance, { laps: 1 });
    for (let i = 0; i < 60 * 60; i++) stepRace(race, [{ ...FULL, steer: 1 }]);
    expect(race.racers[0].lapsDone).toBe(0);
  });
});
