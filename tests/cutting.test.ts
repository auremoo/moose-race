import { describe, expect, it } from 'vitest';
import { balance, trackById } from '../src/data';
import { autopilot } from '../src/sim/autopilot';
import { createRace, stepRace } from '../src/sim/race';
import { buildEntrants } from '../src/sim/roster';

/** Temps du 2e tour en suivant la ligne de course, ou en coupant les virages par l'herbe intérieure. */
function lap(trackId: string, cut: boolean): number {
  const entrants = buildEntrants({
    playerName: 'J',
    playerMooseId: 'bucheron',
    playerLevel: 1,
    difficulty: 'moyen',
    botCount: 0,
    seed: 1,
    balance,
  });
  const r = createRace(trackById(trackId)!, balance, { laps: 2, entrants, difficulty: 'moyen', seed: 1, weather: 'clair' });
  const p = r.racers[0];
  const n = r.track.samples.length;
  const off = (i: number) => {
    let o = r.line.offset[i];
    for (const ap of r.line.apexes) {
      let di = Math.abs(i - ap.index);
      di = Math.min(di, n - di);
      const w = Math.max(0, 1 - (di * r.track.spacing) / 25);
      if (w > 0) {
        const s = r.track.samples[ap.index];
        o += (ap.side * (s.hw + s.verge - 1) - o) * w;
      }
    }
    return o;
  };
  for (let i = 0; i < 60 * 300 && !p.finished; i++)
    stepRace(r, [
      autopilot(
        r.track,
        p,
        p.params,
        r.surfaces.sentier,
        cut ? { offsetAt: off, cornerMargin: 0.95 } : { line: { offset: r.line.offset, speed: p.profile } },
      ),
    ]);
  return p.lapTimes[1];
}

describe("couper par l'herbe", () => {
  // Circuits où couper payait jusqu'à 5 s par tour avant la résistance de l'herbe et les épingles bordées.
  for (const id of ['grand-nord', 'tempete-yukon', 'cap-diamant', 'sentiers-algonquin', 'route-baleines']) {
    it(`ne paie pas sur ${id}`, () => {
      expect(lap(id, true)).toBeGreaterThan(lap(id, false));
    });
  }
});
