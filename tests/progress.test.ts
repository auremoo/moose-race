import { describe, expect, it } from 'vitest';
import { courses } from '../src/data';
import { isCourseUnlocked, OPEN_AT_START, recordPodium, unlockRequirement } from '../src/meta/progress';
import { defaultSave, migrate, SCHEMA } from '../src/meta/settings';

const list = courses.filter((c) => c.trackId);

describe('déblocage progressif des circuits', () => {
  it('au départ, seuls les premiers circuits sont ouverts', () => {
    const s = defaultSave();
    list.forEach((c, i) => expect(isCourseUnlocked(s, c.id), c.id).toBe(i < OPEN_AT_START));
  });

  it('un podium sur un circuit ouvre le suivant', () => {
    const s = defaultSave();
    const last = list[OPEN_AT_START - 1];
    const next = list[OPEN_AT_START];
    expect(unlockRequirement(next.id)?.id).toBe(last.id);
    expect(recordPodium(s, last.id)?.id).toBe(next.id);
    expect(isCourseUnlocked(s, next.id)).toBe(true);
    // Un deuxième podium au même endroit ne débloque rien de plus.
    expect(recordPodium(s, last.id)).toBeNull();
  });

  it('un podium sur un circuit verrouillé (défi du jour) ne compte pas', () => {
    const s = defaultSave();
    const far = list[10];
    expect(recordPodium(s, far.id)).toBeNull();
    expect(isCourseUnlocked(s, list[11].id)).toBe(false);
    expect(s.podiumCourses).toEqual([]);
  });

  it('tout se débloque en enchaînant les podiums', () => {
    const s = defaultSave();
    for (const c of list) recordPodium(s, c.id);
    expect(list.every((c) => isCourseUnlocked(s, c.id))).toBe(true);
  });

  it('migration 5 → 6 : les circuits déjà gagnés comptent comme podiums', () => {
    const s = migrate({ schema: 5, firstWins: [`${list[3].id}|facile`, `${list[3].id}|moyen`] });
    expect(s.schema).toBe(SCHEMA);
    expect(s.podiumCourses).toEqual([list[3].id]);
    expect(isCourseUnlocked(s, list[4].id)).toBe(true);
  });
});

describe('migrations non destructives', () => {
  it('un champ récent déjà présent dans une vieille sauvegarde est gardé', () => {
    const s = migrate({ schema: 2, podiumCourses: ['crepuscule-manitoba'], chests: [{ id: 3, type: 'or' }], accessories: ['tuque-bleue'] });
    expect(s.podiumCourses).toContain('crepuscule-manitoba');
    expect(s.chests).toEqual([{ id: 3, type: 'or' }]);
    expect(s.accessories).toEqual(['tuque-bleue']);
  });
});

describe('podium à partir de 3 adversaires', () => {
  it('dernier sur 2 ou sur 3 : ni podium, ni coffre', async () => {
    const { isPodium, PODIUM_MIN_RACERS } = await import('../src/meta/economy');
    const { chestForRank } = await import('../src/meta/chests');
    const { recordRace } = await import('../src/meta/rewards');
    expect(PODIUM_MIN_RACERS).toBe(4);
    expect(isPodium(2, 2)).toBe(false);
    expect(isPodium(1, 3)).toBe(false);
    expect(isPodium(3, 4)).toBe(true);
    expect(isPodium(4, 4)).toBe(false);
    for (const r of [0.1, 0.5, 0.9]) {
      expect(chestForRank(2, 2, r)).toBeNull();
      expect(chestForRank(3, 3, r)).toBeNull();
      expect(chestForRank(3, 4, r)).not.toBeNull();
    }
    const s = defaultSave();
    const res = recordRace(s, 1, 2, false);
    expect(res.chest).toBeNull();
    expect(s.stats.podiums).toBe(0);
    // La victoire, elle, reste une victoire.
    expect(s.stats.wins).toBe(1);
  });
});

describe('record impossible (ancien défaut du didacticiel)', () => {
  it('un temps total plus court que tours × meilleur tour est écarté, le meilleur tour est gardé', async () => {
    const { pruneStaleRecords } = await import('../src/meta/records');
    const s = defaultSave();
    s.bestTimes = { a: 55, b: 110 };
    s.bestLaps = { a: 54, b: 54 };
    s.trackSigs = { a: 'x', b: 'x' };
    const stale = pruneStaleRecords(
      s,
      () => 'x',
      () => 2,
    );
    expect(stale).toEqual(['a']);
    expect(s.bestTimes).toEqual({ b: 110 });
    expect(s.bestLaps).toEqual({ a: 54, b: 54 });
  });
});
