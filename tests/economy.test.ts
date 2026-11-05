import { describe, expect, it } from 'vitest';
import { coinsFor } from '../src/meta/economy';

describe('pièces', () => {
  it('correspond aux exemples du cahier (11 participants, classique, Facile)', () => {
    expect(coinsFor(1, 11, 1, 1)).toBe(100);
    expect(coinsFor(6, 11, 1, 1)).toBe(40);
    expect(coinsFor(11, 11, 1, 1)).toBe(5);
  });

  it('suit la formule sur tous les rangs, difficultés et modes', () => {
    for (const N of [1, 2, 6, 11])
      for (let r = 1; r <= N; r++)
        for (const dm of [1, 1.5, 2])
          for (const mm of [1, 1.25]) {
            const expected = Math.max(5, Math.round((20 + 8 * (N - 1)) * Math.pow((N - r + 1) / N, 1.5) * dm * mm));
            expect(coinsFor(r, N, dm, mm)).toBe(expected);
          }
  });

  it('ne descend jamais sous 5 pièces et décroît avec le rang', () => {
    let prev = Infinity;
    for (let r = 1; r <= 11; r++) {
      const c = coinsFor(r, 11, 1.5, 1);
      expect(c).toBeGreaterThanOrEqual(5);
      expect(c).toBeLessThanOrEqual(prev);
      prev = c;
    }
  });
});
