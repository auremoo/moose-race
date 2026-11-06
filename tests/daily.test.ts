import { describe, expect, it } from 'vitest';
import { dailyChallenge, dayKey } from '../src/meta/daily';

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
});
