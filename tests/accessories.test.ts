import { describe, expect, it } from 'vitest';
import { accessoryById, accessoryCatalog, balance, mooseCatalog } from '../src/data';
import { accessoryOf, buyAccessory, equipAccessory, ownedAccessories } from '../src/meta/accessories';
import { defaultSave, migrate, SCHEMA } from '../src/meta/settings';
import { createMooseView } from '../src/render/moose';
import { buildEntrants } from '../src/sim/roster';

describe('accessoires', () => {
  it("chaque orignal porte d'origine un accessoire de départ", () => {
    const s = defaultSave();
    for (const m of mooseCatalog.moose) {
      const a = accessoryOf(s, m.id);
      expect(a.kind, m.id).toBe(m.accessory);
      expect(accessoryCatalog.starters).toContain(a.id);
    }
  });

  it('achat : pièces débitées une fois, refus si trop cher ou déjà possédé', () => {
    const s = defaultSave();
    s.coins = 500;
    expect(buyAccessory(s, 'ceinture-flechee')).toBe(false);
    expect(buyAccessory(s, 'tuque-bleue')).toBe(true);
    expect(s.coins).toBe(350);
    expect(buyAccessory(s, 'tuque-bleue')).toBe(false);
    expect(s.coins).toBe(350);
    expect(ownedAccessories(s).map((a) => a.id)).toContain('tuque-bleue');
  });

  it("on ne porte que ce qu'on possède", () => {
    const s = defaultSave();
    expect(equipAccessory(s, 'bucheron', 'tuque-carreaux')).toBe(false);
    expect(equipAccessory(s, 'bucheron', 'foulard-rouge')).toBe(true);
    expect(accessoryOf(s, 'bucheron').id).toBe('foulard-rouge');
    expect(equipAccessory(s, 'bucheron', 'aucun')).toBe(true);
    expect(accessoryOf(s, 'bucheron').kind).toBe('aucun');
  });

  it('migration 2 → 3 : accessoires de départ, rien de porté', () => {
    const s = migrate({ schema: 2, coins: 40, owned: ['bucheron'], levels: { bucheron: 3 } });
    expect(s.schema).toBe(SCHEMA);
    expect(s.coins).toBe(40);
    expect(s.equipped).toEqual({});
    expect(s.accessories).toEqual(expect.arrayContaining(accessoryCatalog.starters));
  });

  it("l'accessoire du joueur suit en course, les bots gardent le leur", () => {
    const e = buildEntrants({
      playerName: 'J',
      playerMooseId: 'bucheron',
      playerLevel: 1,
      difficulty: 'moyen',
      botCount: 3,
      seed: 1,
      balance,
      playerAccessory: 'ceinture-flechee',
    });
    expect(e[0].accessory).toBe('ceinture-flechee');
    for (const b of e.slice(1)) expect(['tuque', 'foulard', 'clochette']).toContain(b.accessory);
  });

  it("un type seul donne l'accessoire de départ, un identifiant inconnu donne « rien »", () => {
    expect(accessoryById('tuque').id).toBe('tuque-rouge');
    expect(accessoryById('n-importe-quoi').id).toBe('aucun');
  });

  it("chaque accessoire se dessine sur l'orignal", () => {
    const count = (look: { accessory: string }) => {
      let n = 0;
      createMooseView(look).root.traverse(() => n++);
      return n;
    };
    const bare = count({ accessory: 'aucun' });
    for (const a of accessoryCatalog.accessories.filter((x) => x.kind !== 'aucun'))
      expect(count({ accessory: a.id }), a.id).toBeGreaterThan(bare);
  });
});
