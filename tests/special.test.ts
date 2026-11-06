import { describe, expect, it } from 'vitest';
import { balance, courses, trackById } from '../src/data';
import { autopilot } from '../src/sim/autopilot';
import { pickItem } from '../src/sim/hazards';
import { NO_COMMANDS } from '../src/sim/moose';
import { createRace, stepRace, type RaceMode } from '../src/sim/race';
import { buildEntrants } from '../src/sim/roster';
import { projectOnTrack } from '../src/sim/track';
import type { DifficultyId } from '../src/data';

const S = balance.surfaces.sentier;

function race(trackId: string, mode: RaceMode, difficulty: DifficultyId, bots: number, seed = 3) {
  const entrants = buildEntrants({ playerName: 'J', playerMooseId: 'bucheron', playerLevel: 1, difficulty, botCount: bots, seed, balance });
  return createRace(trackById(trackId)!, balance, { laps: 1, entrants, difficulty, mode, seed });
}

function run(r: ReturnType<typeof race>, maxS = 300) {
  for (let i = 0; i < 60 * maxS && !r.racers.every((x) => x.finished); i++)
    stepRace(r, [autopilot(r.track, r.racers[0], r.racers[0].params, S, { line: { offset: r.line.offset, speed: r.racers[0].profile } })]);
  return r;
}

describe('mode spécial', () => {
  it('aucun ours ni castor en mode classique', () => {
    expect(race('boucle-grise', 'classique', 'difficile', 10).hazards).toBeNull();
  });

  it("nombre d'ours selon la difficulté", () => {
    for (const d of ['facile', 'moyen', 'difficile'] as DifficultyId[]) {
      const [lo, hi] = balance.special.bears[d].count;
      for (const id of ['boucle-grise', 'cap-diamant', 'ble-saskatchewan']) {
        const n = race(id, 'special', d, 3).hazards!.bears.length;
        expect(n, `${id} ${d}`).toBeLessThanOrEqual(hi);
        expect(n, `${id} ${d}`).toBeGreaterThanOrEqual(Math.min(lo, 2));
      }
    }
  });

  it("un signal précède chaque passage d'ours d'environ 2 s", () => {
    const r = race('boucle-grise', 'special', 'moyen', 0);
    const b = r.hazards!.bears.find((x) => x.kind !== 'garde')!;
    let warnStart = -1;
    let activeStart = -1;
    for (let i = 0; i < 60 * 30 && activeStart < 0; i++) {
      stepRace(r, [NO_COMMANDS]);
      const t = i / 60;
      if (b.warning && warnStart < 0) warnStart = t;
      if (b.active && warnStart >= 0) activeStart = t;
    }
    expect(activeStart - warnStart).toBeGreaterThan(1.9);
    expect(activeStart - warnStart).toBeLessThan(2.1);
  });

  it("les dernières places reçoivent plus d'aides offensives", () => {
    const share = (rank: number) => {
      let coup = 0;
      for (let i = 0; i < 1000; i++) if (pickItem(rank, 11, (i + 0.5) / 1000) === 'coup') coup++;
      return coup / 1000;
    };
    expect(share(11)).toBeGreaterThan(share(1) + 0.2);
  });

  it('un ours étourdit, la hutte protège', () => {
    const hit = (shield: number) => {
      const r = race('boucle-grise', 'special', 'difficile', 0);
      const m = r.racers[0].moose;
      const b = r.hazards!.bears.find((x) => x.kind === 'garde') ?? r.hazards!.bears[0];
      b.kind = 'garde';
      r.phase = 'running';
      r.tick = r.countdownTicks + 60;
      stepRace(r, [NO_COMMANDS]);
      m.x = b.x;
      m.y = b.y;
      m.speed = 0;
      r.racers[0].proj = projectOnTrack(r.track, m.x, m.y);
      m.shieldTime = shield;
      stepRace(r, [NO_COMMANDS]);
      return m.stunTime;
    };
    expect(hit(0)).toBeGreaterThan(0);
    expect(hit(5)).toBe(0);
  });
});

describe('jeu complet : tous les circuits, 2 modes, 3 difficultés, 1 à 10 bots', () => {
  const cases: [string, RaceMode, DifficultyId, number][] = [];
  courses.forEach((c, i) => {
    for (const mode of ['classique', 'special'] as RaceMode[])
      for (const d of ['facile', 'moyen', 'difficile'] as DifficultyId[])
        cases.push([c.trackId!, mode, d, 1 + ((i * 3 + cases.length) % 10)]);
  });
  it.each(cases)('%s %s %s, %i bot(s)', (id, mode, d, bots) => {
    const r = run(race(id, mode, d, bots));
    expect(r.racers.every((x) => x.finished)).toBe(true);
  });
});

describe('bief', () => {
  it('un orignal qui prend le bief gagne de la distance, sans en sauter trop', async () => {
    const { findBief, BIEF_MAX_GAIN } = await import('../src/sim/bief');
    const { useItem } = await import('../src/sim/hazards');
    const r = race('serpent-temiscamingue', 'special', 'facile', 0);
    const b = r.hazards!.bief!;
    expect(b).toBeTruthy();
    expect(findBief(r.track)!.gain).toBeLessThanOrEqual(BIEF_MAX_GAIN);
    const me = r.racers[0];
    // On place l'orignal juste avant l'embouchure, avec l'aide Bief.
    const n = r.track.samples.length;
    const i = (b.from - 15 + n) % n;
    const s = r.track.samples[i];
    me.moose.x = s.x;
    me.moose.y = s.y;
    me.moose.heading = Math.atan2(s.ty, s.tx);
    me.moose.speed = 15;
    me.proj = projectOnTrack(r.track, s.x, s.y);
    const d0 = me.distance;
    r.phase = 'running';
    r.tick = r.countdownTicks + 1;
    me.item = 'bief';
    useItem(r, r.hazards!, me);
    let swam = false;
    for (let k = 0; k < 60 * 12; k++) {
      stepRace(r, [autopilot(r.track, me, me.params, S, { line: { offset: r.line.offset, speed: me.profile } })]);
      if (me.swim >= 0) swam = true;
    }
    expect(swam).toBe(true);
    expect(me.swim).toBe(-1);
    // Distance de piste comptée : le canal fait sauter la portion évitée.
    expect(me.distance - d0).toBeGreaterThan(60);
  });

  it('aucun bief en mode classique', () => {
    expect(race('serpent-temiscamingue', 'classique', 'moyen', 0).hazards).toBeNull();
  });
});
