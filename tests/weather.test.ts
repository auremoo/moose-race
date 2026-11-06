import { describe, expect, it } from 'vitest';
import { balance, trackById } from '../src/data';
import { autopilot } from '../src/sim/autopilot';
import { createRace, stepRace } from '../src/sim/race';
import { buildEntrants } from '../src/sim/roster';
import { createRng } from '../src/sim/rng';
import { pickWeather, wetSurfaces } from '../src/sim/weather';

function race(weather?: 'clair' | 'pluie' | 'brouillard', biome?: string, seed = 5) {
  const entrants = buildEntrants({ playerName: 'J', playerMooseId: 'bucheron', playerLevel: 1, difficulty: 'moyen', botCount: 0, seed, balance });
  return createRace(trackById('boucle-grise')!, balance, { laps: 1, entrants, difficulty: 'moyen', seed, weather, biome });
}

function lapTime(r: ReturnType<typeof race>) {
  const p = r.racers[0];
  for (let i = 0; i < 60 * 300 && !p.finished; i++)
    stepRace(r, [autopilot(r.track, p, p.params, r.surfaces.sentier, { line: { offset: r.line.offset, speed: p.profile } })]);
  return p.finishTime!;
}

describe('météo', () => {
  it('sans biome : toujours clair', () => {
    for (let s = 0; s < 50; s++) expect(pickWeather(createRng(s), undefined, false)).toBe('clair');
  });

  it('pas de pluie sur la neige', () => {
    for (let s = 0; s < 300; s++) expect(pickWeather(createRng(s), 'foret', true)).not.toBe('pluie');
  });

  it('fréquences proches des chances annoncées en forêt', () => {
    let rain = 0;
    let fog = 0;
    const N = 4000;
    for (let s = 0; s < N; s++) {
      const w = pickWeather(createRng(s * 7919 + 1), 'foret', false);
      if (w === 'pluie') rain++;
      if (w === 'brouillard') fog++;
    }
    expect(rain / N).toBeGreaterThan(0.25);
    expect(rain / N).toBeLessThan(0.35);
    expect(fog / N).toBeGreaterThan(0.06);
    expect(fog / N).toBeLessThan(0.14);
  });

  it('la pluie réduit l\'adhérence sans toucher la glace ni le rocher', () => {
    const w = wetSurfaces(balance.surfaces);
    expect(w.sentier.grip).toBeLessThan(balance.surfaces.sentier.grip);
    expect(w.boue.vmax).toBeLessThan(balance.surfaces.boue.vmax);
    for (const k of Object.keys(balance.surfaces) as (keyof typeof w)[])
      if (!['sentier', 'herbe', 'racines', 'boue'].includes(k)) expect(w[k]).toEqual(balance.surfaces[k]);
  });

  it('même graine et même biome : même météo', () => {
    expect(race(undefined, 'foret', 11).weather).toBe(race(undefined, 'foret', 11).weather);
  });

  it('un tour sous la pluie est plus lent, mais de moins de 10 %', () => {
    const dry = lapTime(race('clair'));
    const wet = lapTime(race('pluie'));
    expect(wet).toBeGreaterThan(dry);
    expect(wet / dry).toBeLessThan(1.1);
  });
});
