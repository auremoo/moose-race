import { describe, expect, it } from 'vitest';
import { accessoryCatalog, chestCatalog } from '../src/data';
import { objectiveProgress } from '../src/meta/accessories';
import { awardChest, chestForRank, openChest } from '../src/meta/chests';
import { recordRace } from '../src/meta/rewards';
import { defaultSave, migrate, SCHEMA } from '../src/meta/settings';

describe('coffres', () => {
  it("seuls les trois premiers d'une course à plusieurs en gagnent un", () => {
    expect(chestForRank(1, 1, 0.5)).toBeNull();
    expect(chestForRank(4, 11, 0.1)).toBeNull();
    for (const r of [1, 2, 3]) expect(chestForRank(r, 11, 0.5)).not.toBeNull();
  });

  it('les meilleures places donnent de meilleurs coffres en moyenne', () => {
    const value = { bois: 1, erable: 2, or: 3, aurore: 4 };
    const avg = (rank: number) => {
      let s = 0;
      for (let i = 0; i < 1000; i++) s += value[chestForRank(rank, 11, i / 1000)!];
      return s / 1000;
    };
    expect(avg(1)).toBeGreaterThan(avg(2));
    expect(avg(2)).toBeGreaterThan(avg(3));
  });

  it('quatre emplacements au plus', () => {
    const s = defaultSave();
    for (let i = 0; i < 4; i++) expect(awardChest(s, 'bois')).toBe(true);
    expect(awardChest(s, 'aurore')).toBe(false);
    expect(s.chests).toHaveLength(chestCatalog.slots);
  });

  it("un coffre s'ouvre tout de suite, gratuitement", () => {
    const s = defaultSave();
    awardChest(s, 'aurore');
    const res = openChest(s, s.chests[0].id);
    expect(res).not.toBeNull();
    expect(s.chests).toHaveLength(0);
    expect(s.coins).toBe(res!.coins);
    expect(openChest(s, 999)).toBeNull();
  });

  it('contenu dans les fourchettes, crédité, sans accessoire en double', () => {
    for (const type of ['bois', 'erable', 'or', 'aurore'] as const) {
      const def = chestCatalog.types[type];
      for (let k = 0; k < 30; k++) {
        const s = defaultSave();
        s.chestSeq = k * 7;
        awardChest(s, type);
        const before = new Set(s.accessories);
        const res = openChest(s, s.chests[0].id)!;
        expect(res.coins).toBeGreaterThanOrEqual(def.coins[0]);
        expect(res.coins).toBeLessThanOrEqual(def.coins[1] + chestCatalog.duplicateAccessoryCoins);
        expect(res.fragments).toBeGreaterThanOrEqual(def.fragments[0]);
        expect(s.coins).toBe(res.coins);
        expect(s.fragments).toBe(res.fragments);
        if (res.accessory) expect(before.has(res.accessory)).toBe(false);
        if (type === 'aurore') expect(res.accessory).not.toBeNull();
        expect(new Set(s.accessories).size).toBe(s.accessories.length);
      }
    }
  });

  it('même coffre, même contenu', () => {
    const open = () => {
      const s = defaultSave();
      awardChest(s, 'or');
      return openChest(s, s.chests[0].id);
    };
    expect(open()).toEqual(open());
  });
});

describe('objectifs et fin de course', () => {
  it('compteurs et coffre au podium, rien en solo', () => {
    const s = defaultSave();
    const solo = recordRace(s, 1, 1, false);
    expect(solo.chest).toBeNull();
    expect(s.stats).toMatchObject({ races: 1, wins: 0, podiums: 0 });
    const win = recordRace(s, 1, 11, false);
    expect(win.chest).not.toBeNull();
    expect(win.chestStored).toBe(true);
    expect(s.stats).toMatchObject({ races: 2, wins: 1, podiums: 1 });
    recordRace(s, 7, 11, false);
    expect(s.chests).toHaveLength(1);
  });

  it('emplacements pleins : le coffre devient son minimum de pièces', () => {
    const s = defaultSave();
    for (let i = 0; i < chestCatalog.slots; i++) awardChest(s, 'bois');
    const res = recordRace(s, 1, 11, false);
    expect(res.chestStored).toBe(false);
    expect(res.chestCoins).toBe(chestCatalog.types[res.chest!].coins[0]);
    expect(s.coins).toBe(res.chestCoins);
    expect(s.chests).toHaveLength(chestCatalog.slots);
    // Avec une place libre, pas de conversion.
    s.chests = s.chests.slice(1);
    expect(recordRace(s, 1, 11, false).chestCoins).toBe(0);
  });

  it('le défi du jour donne un coffre doré', () => {
    const s = defaultSave();
    expect(recordRace(s, 9, 11, true).chest).toBe(chestCatalog.dailyChest);
    expect(s.stats.dailies).toBe(1);
  });

  it("un objectif atteint offre l'accessoire", () => {
    const s = defaultSave();
    const blue = accessoryCatalog.accessories.find((a) => a.id === 'tuque-bleue')!;
    expect(objectiveProgress(s, blue)).toEqual({ have: 0, need: 5 });
    let got: string[] = [];
    for (let i = 0; i < 5; i++) got = got.concat(recordRace(s, 8, 11, false).unlocked);
    expect(got).toContain('tuque-bleue');
    expect(s.accessories).toContain('tuque-bleue');
  });

  it('chaque accessoire payant a aussi un objectif', () => {
    for (const a of accessoryCatalog.accessories.filter((x) => x.price > 0)) expect(a.unlock, a.id).toBeDefined();
  });

  it("migration 3 → 4 : compteurs repris de l'historique", () => {
    const s = migrate({ schema: 3, raceCount: 12, firstWins: ['a|moyen', 'b|facile'], dailyDone: ['2026-11-01'] });
    expect(s.schema).toBe(SCHEMA);
    expect(s.stats).toEqual({ races: 12, wins: 2, podiums: 2, dailies: 1, chests: 0 });
    expect(s.chests).toEqual([]);
  });
});
