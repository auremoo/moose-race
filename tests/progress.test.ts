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
