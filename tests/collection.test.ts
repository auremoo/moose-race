import { describe, expect, it } from 'vitest';
import { mooseById, mooseCatalog } from '../src/data';
import { buyDirect, exchangeFragments, openLoot, rollRarity, totalUpgradeCost, upgrade, upgradeCost } from '../src/meta/collection';
import { defaultSave, exportSave, importSave, migrate, SCHEMA } from '../src/meta/settings';

describe('améliorations', () => {
  it('coûtent base × n × multiplicateur (base 60, valeur du cahier)', () => {
    const base = mooseCatalog.upgradeBase;
    for (const m of mooseCatalog.moose) {
      const mult = mooseCatalog.rarities[m.rarity].costMultiplier;
      expect(totalUpgradeCost(m)).toBe(
        Math.round(base * mult) * 0 + [1, 2, 3, 4, 5, 6, 7, 8, 9].reduce((a, n) => a + Math.round(base * n * mult), 0),
      );
    }
    // Avec la base du cahier (60), le Commun coûterait 2 700 au total.
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].reduce((a, n) => a + 60 * n, 0)).toBe(2700);
    expect(upgradeCost(mooseById('bucheron')!, 1)).toBe(base);
    expect(upgradeCost(mooseById('bucheron')!, 10)).toBeNull();
  });

  it("montent d'un niveau et débitent les pièces", () => {
    const s = defaultSave();
    s.coins = 100;
    expect(upgrade(s, 'bucheron')).toBe(true);
    expect(s.levels.bucheron).toBe(2);
    expect(s.coins).toBe(100 - mooseCatalog.upgradeBase);
    expect(upgrade(s, 'bucheron')).toBe(false);
  });
});

describe('Comptoir', () => {
  it('achat direct interdit pour les communs, permis pour les autres', () => {
    const s = defaultSave();
    s.coins = 100000;
    expect(buyDirect(s, 'ti-gus')).toBe(false);
    expect(buyDirect(s, 'sirop')).toBe(true);
    expect(s.coins).toBe(100000 - 500);
    expect(buyDirect(s, 'sirop')).toBe(false);
  });

  it('ravitaillement : chances conformes aux probabilités affichées', () => {
    const counts: Record<string, number> = {};
    const n = 200000;
    for (let i = 0; i < n; i++) {
      const r = rollRarity((i + 0.5) / n, false);
      counts[r] = (counts[r] ?? 0) + 1;
    }
    for (const [k, p] of Object.entries(mooseCatalog.loot.odds)) expect(Math.abs(counts[k] / n - p)).toBeLessThan(0.001);
  });

  it('garantit un Rare ou mieux tous les 10 ravitaillements', () => {
    const s = defaultSave();
    s.coins = 300 * 200;
    let sinceRare = 0;
    for (let i = 0; i < 200; i++) {
      const res = openLoot(s)!;
      const rareOrBetter = ['rare', 'epique', 'legendaire'].includes(res.moose.rarity);
      sinceRare = rareOrBetter ? 0 : sinceRare + 1;
      expect(sinceRare).toBeLessThan(10);
    }
    expect(s.fragments).toBeGreaterThan(0);
  });

  it("les fragments s'échangent contre un orignal au choix", () => {
    const s = defaultSave();
    s.fragments = 200;
    expect(exchangeFragments(s, 'panache-dor')).toBe(true);
    expect(s.owned).toContain('panache-dor');
    expect(s.fragments).toBe(0);
  });

  it('les 20 orignaux sont obtenables sans argent réel', () => {
    const s = defaultSave();
    s.coins = 10_000_000;
    for (const m of mooseCatalog.moose) if (!s.owned.includes(m.id) && m.rarity !== 'commun') buyDirect(s, m.id);
    for (let i = 0; i < 300 && mooseCatalog.moose.some((m) => !s.owned.includes(m.id)); i++) openLoot(s);
    expect(mooseCatalog.moose.every((m) => s.owned.includes(m.id))).toBe(true);
  });
});

describe('sauvegarde', () => {
  it('migre une sauvegarde du schéma 1', () => {
    const v1 = { schema: 1, sensitivity: 1.2, coins: 345, bestTimes: { 'boucle-grise': 100 }, owned: ['bucheron'] };
    const s = migrate(v1);
    expect(s.schema).toBe(SCHEMA);
    expect(s.coins).toBe(345);
    expect(s.sensitivity).toBe(1.2);
    expect(s.levels.bucheron).toBe(1);
    expect(s.fragments).toBe(0);
    expect(s.bestTimes['boucle-grise']).toBe(100);
  });

  it('survit à un export puis un import', () => {
    const s = defaultSave();
    s.coins = 1234;
    s.owned.push('sirop');
    const back = importSave(exportSave(s))!;
    expect(back.coins).toBe(1234);
    expect(back.owned).toContain('sirop');
    expect(importSave('{"pas":"une sauvegarde"}')).toBeNull();
  });
});

describe('records liés au tracé', () => {
  it("un record d'un ancien tracé est écarté, un record du tracé actuel est gardé", async () => {
    const { pruneStaleRecords } = await import('../src/meta/records');
    const { trackSignature } = await import('../src/sim/track');
    const { trackById } = await import('../src/data');
    const s = defaultSave();
    const def = trackById('boucle-grise')!;
    s.bestTimes = { 'boucle-grise': 100, 'cap-diamant': 120 };
    s.bestLaps = { 'boucle-grise': 50, 'cap-diamant': 60 };
    s.trackSigs = { 'boucle-grise': trackSignature(def), 'cap-diamant': 'ancien' };
    const stale = pruneStaleRecords(s, (id) => {
      const d = trackById(id);
      return d ? trackSignature(d) : undefined;
    });
    expect(stale).toEqual(['cap-diamant']);
    expect(s.bestTimes).toEqual({ 'boucle-grise': 100 });
    expect(s.bestLaps).toEqual({ 'boucle-grise': 50 });
  });

  it("la moindre retouche du tracé change l'empreinte", async () => {
    const { trackSignature } = await import('../src/sim/track');
    const { trackById } = await import('../src/data');
    const def = trackById('boucle-grise')!;
    const moved = { ...def, points: def.points.map((p, i) => (i === 3 ? ([p[0] + 0.5, p[1], p[2]] as typeof p) : p)) };
    expect(trackSignature(moved)).not.toBe(trackSignature(def));
    expect(trackSignature({ ...def })).toBe(trackSignature(def));
  });

  it("un fantôme d'un ancien tracé est ignoré", async () => {
    const { loadGhost, saveGhost } = await import('../src/meta/ghost');
    const store: Record<string, string> = {};
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => (store[k] = v),
    } as unknown as Storage;
    saveGhost({ trackId: 'x', laps: 2, time: 60, coat: '#000', sig: 'a', points: [0, 0, 0, 1, 1, 0] });
    expect(loadGhost('x', 2, 'a')).not.toBeNull();
    expect(loadGhost('x', 2, 'b')).toBeNull();
  });
});
