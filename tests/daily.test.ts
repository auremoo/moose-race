import { describe, expect, it } from 'vitest';
import { dailyChallenge, dailyDifficultyCap, dailyFor, dailyRewardOpen, dayKey } from '../src/meta/daily';
import { courses } from '../src/data';
import { defaultSave } from '../src/meta/settings';

describe('défi du jour', () => {
  it("est identique pour une même date et change d'un jour à l'autre", () => {
    const a = dailyChallenge(new Date(2026, 10, 6, 9));
    const b = dailyChallenge(new Date(2026, 10, 6, 21));
    expect(a).toEqual(b);
    const days = new Set<string>();
    for (let d = 1; d <= 20; d++) {
      const c = dailyChallenge(new Date(2026, 10, d));
      days.add(`${c.course.id}|${c.mode}|${c.difficulty}`);
    }
    expect(days.size).toBeGreaterThan(10);
    expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('ne dépasse pas Facile pour un débutant, ni Moyen à mi-parcours', () => {
    expect(dailyDifficultyCap(2)).toBe('facile');
    expect(dailyDifficultyCap(7)).toBe('moyen');
    expect(dailyDifficultyCap(20)).toBe('difficile');
    const fresh = defaultSave();
    const veteran = defaultSave();
    veteran.podiumCourses = courses.map((c) => c.id);
    let hardSeen = false;
    for (let d = 1; d <= 30; d++) {
      const date = new Date(2026, 10, d);
      expect(dailyFor(fresh, date).difficulty).toBe('facile');
      const v = dailyFor(veteran, date);
      expect(v).toEqual(dailyChallenge(date));
      hardSeen ||= v.difficulty === 'difficile';
    }
    expect(hardSeen).toBe(true);
  });

  it('refuse le bonus déjà pris ou une date antérieure au dernier défi terminé (horloge reculée)', () => {
    const s = defaultSave();
    expect(dailyRewardOpen(s, '2026-11-10')).toBe(true);
    s.dailyDone = ['2026-11-12'];
    expect(dailyRewardOpen(s, '2026-11-12')).toBe(false);
    expect(dailyRewardOpen(s, '2026-11-10')).toBe(false);
    expect(dailyRewardOpen(s, '2026-11-13')).toBe(true);
  });
});
