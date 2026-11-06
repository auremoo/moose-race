import { describe, expect, it } from 'vitest';
import { balance, courses, trackById } from '../src/data';
import { autopilot } from '../src/sim/autopilot';
import { createRace, raceTime, stepRace } from '../src/sim/race';
import { centerSpeedProfile, getRacingLine } from '../src/sim/racingLine';

// Critère du cahier : comparaison sans le bonus de corde.
const NO_BONUS = { ...balance, moose: { ...balance.moose, cordeSpeedMul: 1 } };
const P = NO_BONUS.moose;
const SENTIER = balance.surfaces.sentier;

function lap(trackId: string, useLine: boolean): number {
  const def = trackById(trackId)!;
  const race = createRace(def, NO_BONUS, { laps: 1 });
  const line = useLine
    ? getRacingLine(race.track, P, balance.surfaces)
    : { offset: new Float64Array(race.track.samples.length), speed: centerSpeedProfile(race.track, P, balance.surfaces) };
  for (let i = 0; i < 60 * 300 && race.phase !== 'finished'; i++)
    stepRace(race, [autopilot(race.track, race.racers[0], P, SENTIER, { line })]);
  return race.phase === 'finished' ? raceTime(race) : Infinity;
}

describe('ligne de course', () => {
  it('reste dans le sentier et trouve des points de corde', () => {
    const race = createRace(trackById('boucle-grise')!, balance);
    const line = getRacingLine(race.track, P, balance.surfaces);
    race.track.samples.forEach((s, i) => expect(Math.abs(line.offset[i])).toBeLessThanOrEqual(s.hw));
    expect(line.apexes.length).toBeGreaterThanOrEqual(8);
  });

  const results = courses.map((c) => {
    const center = lap(c.trackId!, false);
    const racing = lap(c.trackId!, true);
    return { name: c.name, center, racing, gain: center / racing - 1 };
  });

  it.each(results.map((r) => [r.name, r] as const))('%s : la ligne de course bat le centre (sans bonus de corde)', (_n, r) => {
    expect(Number.isFinite(r.racing)).toBe(true);
    expect(r.gain).toBeGreaterThan(0);
  });

  it('critère du cahier : gain moyen ≥ 3 % sur les 20 circuits', () => {
    const mean = results.reduce((a, r) => a + r.gain, 0) / results.length;
    console.table(
      results.map((r) => ({
        circuit: r.name,
        centre: r.center.toFixed(2),
        ligne: r.racing.toFixed(2),
        gain: `${(r.gain * 100).toFixed(1)} %`,
      })),
    );
    expect(mean).toBeGreaterThanOrEqual(0.03);
  });
});
