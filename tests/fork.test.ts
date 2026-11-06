import { describe, expect, it } from 'vitest';
import { balance, trackById, tracks } from '../src/data';
import { autopilot } from '../src/sim/autopilot';
import { forkApproachOffset, forkPursuit, getFork } from '../src/sim/fork';
import { createRace, stepRace, type Race } from '../src/sim/race';
import { buildEntrants } from '../src/sim/roster';
import { buildTrack, projectOnTrack } from '../src/sim/track';

const DEF = trackById('automne-mauricie')!;

function solo(bots = 0, seed = 1): Race {
  const entrants = buildEntrants({
    playerName: 'J',
    playerMooseId: 'bucheron',
    playerLevel: 1,
    difficulty: 'moyen',
    botCount: bots,
    seed,
    balance,
  });
  return createRace(DEF, balance, { laps: 2, entrants, difficulty: 'moyen', seed, weather: 'clair' });
}

/** Pilote du joueur : ligne de course, ou branche si `take`. */
function drive(r: Race, take: boolean) {
  const p = r.racers[0];
  let entered = 0;
  let wasOn = false;
  let maxJump = 0;
  for (let i = 0; i < 60 * 300 && !r.racers.every((x) => x.finished); i++) {
    let cmd;
    if (p.onFork) cmd = forkPursuit(r.fork!, p, p.params, r.surfaces);
    else {
      const off = take ? forkApproachOffset(r.track, r.fork!, p.proj.s, r.line.offset[p.proj.index]) : null;
      cmd =
        off === null
          ? autopilot(r.track, p, p.params, r.surfaces.sentier, { line: { offset: r.line.offset, speed: p.profile } })
          : autopilot(r.track, p, p.params, r.surfaces.sentier, { offsetAt: () => off });
    }
    const before = p.distance;
    stepRace(r, [cmd]);
    if (!p.finished) maxJump = Math.max(maxJump, Math.abs(p.distance - before));
    if (p.onFork && !wasOn) entered++;
    wasOn = p.onFork;
  }
  return { entered, laps: p.lapTimes, finished: p.finished, maxJump };
}

describe('bifurcation risquée', () => {
  it("seule l'Automne en Mauricie en a une", () => {
    const withFork = tracks.filter((t) => getFork(buildTrack(t)));
    expect(withFork.map((t) => t.id)).toEqual(['automne-mauricie']);
  });

  it("la branche est plus courte que la portion évitée et s'écarte nettement de la piste", () => {
    const track = buildTrack(DEF);
    const f = getFork(track)!;
    expect(f.length).toBeLessThan(f.span);
    let far = 0;
    for (const s of f.samples.slice(Math.round(f.samples.length * 0.3), Math.round(f.samples.length * 0.5))) {
      const p = projectOnTrack(track, s.x, s.y);
      far = Math.max(far, Math.abs(p.d) - track.samples[p.index].hw);
    }
    expect(far).toBeGreaterThan(track.def.verge + f.hw);
  });

  it('en suivant la ligne de course, on ne prend jamais la branche', () => {
    const res = drive(solo(), false);
    expect(res.entered).toBe(0);
    expect(res.finished).toBe(true);
  });

  it('la branche fait gagner un peu de temps à un pilotage propre, sans saut de progression', () => {
    const main = drive(solo(), false);
    const fork = drive(solo(), true);
    expect(fork.entered).toBe(2);
    expect(fork.finished).toBe(true);
    // Tour lancé (le 2e) : gain positif mais limité.
    const gain = main.laps[1] - fork.laps[1];
    expect(gain).toBeGreaterThan(0);
    expect(gain).toBeLessThan(1);
    // Progression continue : jamais plus d'un demi-mètre par pas (60 Hz).
    expect(fork.maxJump).toBeLessThan(1);
  });

  it('une partie des bots la prend, et tous finissent', () => {
    let takes = 0;
    for (const seed of [1, 2, 3]) {
      const r = solo(10, seed);
      const was = r.racers.map(() => false);
      for (let i = 0; i < 60 * 300 && !r.racers.every((x) => x.finished); i++) {
        const p = r.racers[0];
        stepRace(r, [autopilot(r.track, p, p.params, r.surfaces.sentier, { line: { offset: r.line.offset, speed: p.profile } })]);
        r.racers.forEach((x, k) => {
          if (x.onFork && !was[k]) takes++;
          was[k] = x.onFork;
        });
      }
      expect(r.racers.every((x) => x.finished)).toBe(true);
    }
    expect(takes).toBeGreaterThan(3);
    expect(takes).toBeLessThan(45);
  });
});
