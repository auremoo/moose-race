/**
 * Collection : niveaux, améliorations, achat direct, ravitaillement aléatoire, fragments.
 * Toutes les valeurs viennent de data/moose.json. Fonctions pures sur la sauvegarde.
 */
import { mooseById, mooseCatalog, type MooseDef, type RarityId } from '../data';
import { createRng } from '../sim/rng';
import type { SaveData } from './settings';

export const RARITY_ORDER: RarityId[] = ['commun', 'peu-commun', 'rare', 'epique', 'legendaire'];

export function owns(save: SaveData, id: string): boolean {
  return save.owned.includes(id);
}

export function levelOf(save: SaveData, id: string): number {
  return save.levels[id] ?? 1;
}

/** Coût pour passer du niveau `level` au suivant, ou null au niveau maximal. */
export function upgradeCost(def: MooseDef, level: number): number | null {
  if (level >= mooseCatalog.maxLevel) return null;
  return Math.round(mooseCatalog.upgradeBase * level * mooseCatalog.rarities[def.rarity].costMultiplier);
}

/** Coût total du niveau 1 au niveau maximal. */
export function totalUpgradeCost(def: MooseDef): number {
  let t = 0;
  for (let l = 1; l < mooseCatalog.maxLevel; l++) t += upgradeCost(def, l)!;
  return t;
}

export function upgrade(save: SaveData, id: string): boolean {
  const def = mooseById(id);
  if (!def || !owns(save, id)) return false;
  const cost = upgradeCost(def, levelOf(save, id));
  if (cost === null || save.coins < cost) return false;
  save.coins -= cost;
  save.levels[id] = levelOf(save, id) + 1;
  return true;
}

/** Achat direct : tous les orignaux sauf les communs (offerts ou obtenus au ravitaillement). */
export function directPrice(def: MooseDef): number | null {
  if (def.rarity === 'commun') return null;
  return mooseCatalog.rarities[def.rarity].price;
}

function grant(save: SaveData, id: string): void {
  if (!owns(save, id)) {
    save.owned.push(id);
    save.levels[id] = 1;
  }
}

export function buyDirect(save: SaveData, id: string): boolean {
  const def = mooseById(id);
  if (!def || owns(save, id)) return false;
  const price = directPrice(def);
  if (price === null || save.coins < price) return false;
  save.coins -= price;
  grant(save, id);
  return true;
}

export interface LootResult {
  moose: MooseDef;
  duplicate: boolean;
  fragments: number;
  pity: boolean;
}

/** Tirage de rareté avec les chances affichées ; garantie Rare ou mieux tous les pityEvery tirages. */
export function rollRarity(r: number, forceRareOrBetter: boolean): RarityId {
  const odds = mooseCatalog.loot.odds;
  if (forceRareOrBetter) {
    const pool: RarityId[] = ['rare', 'epique', 'legendaire'];
    const total = pool.reduce((a, k) => a + odds[k], 0);
    let acc = 0;
    for (const k of pool) {
      acc += odds[k] / total;
      if (r < acc) return k;
    }
    return 'rare';
  }
  let acc = 0;
  for (const k of RARITY_ORDER) {
    acc += odds[k];
    if (r < acc) return k;
  }
  return 'commun';
}

export function openLoot(save: SaveData): LootResult | null {
  const cfg = mooseCatalog.loot;
  if (save.coins < cfg.cost) return null;
  save.coins -= cfg.cost;
  const rng = createRng(0x9e3779b9 ^ (save.lootCount * 2654435761));
  save.lootCount++;
  save.pityCounter++;
  const pity = save.pityCounter >= cfg.pityEvery;
  const rarity = rollRarity(rng.next(), pity);
  if (RARITY_ORDER.indexOf(rarity) >= RARITY_ORDER.indexOf('rare')) save.pityCounter = 0;
  const pool = mooseCatalog.moose.filter((m) => m.rarity === rarity);
  const moose = pool[Math.floor(rng.next() * pool.length)];
  const duplicate = owns(save, moose.id);
  let fragments = 0;
  if (duplicate) {
    fragments = cfg.duplicateFragments[rarity];
    save.fragments += fragments;
  } else grant(save, moose.id);
  return { moose, duplicate, fragments, pity };
}

/** Échange de fragments de panache contre un orignal au choix. */
export function fragmentCost(def: MooseDef): number {
  return mooseCatalog.rarities[def.rarity].fragments;
}

export function exchangeFragments(save: SaveData, id: string): boolean {
  const def = mooseById(id);
  if (!def || owns(save, id)) return false;
  const cost = fragmentCost(def);
  if (save.fragments < cost) return false;
  save.fragments -= cost;
  grant(save, id);
  return true;
}

/** Ravitaillements restants avant la garantie Rare ou mieux. */
export function pityRemaining(save: SaveData): number {
  return mooseCatalog.loot.pityEvery - save.pityCounter;
}
