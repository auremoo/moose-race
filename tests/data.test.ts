import { describe, expect, it } from 'vitest';
import { mooseCatalog, mooseRating } from '../src/data';

describe('catalogue des orignaux', () => {
  it('contient 20 orignaux uniques', () => {
    expect(mooseCatalog.moose).toHaveLength(20);
    expect(new Set(mooseCatalog.moose.map((m) => m.id)).size).toBe(20);
  });

  it('respecte la moyenne de chaque rareté au niveau 1 et au niveau 10', () => {
    for (const m of mooseCatalog.moose) {
      const r = mooseCatalog.rarities[m.rarity];
      expect(mooseRating(m), m.name).toBe(r.avgLevel1);
      expect(mooseRating(m, 10), m.name).toBe(r.avgLevel1 + 18);
    }
  });
});
