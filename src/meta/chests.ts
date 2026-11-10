/**
 * Coffres de récompense : gagnés sur le podium (et au défi du jour), rangés dans 4 emplacements,
 * ouverts d'un toucher, sans attente ni coût. Contenu : pièces, fragments de panache, parfois un
 * accessoire. Jamais d'argent réel.
 */
import { accessoryCatalog, CHEST_ORDER, chestCatalog, type ChestType } from '../data';
import { createRng } from '../sim/rng';
import { checkUnlocks, ownsAccessory } from './accessories';
import { isPodium } from './economy';
import type { SaveData } from './settings';

export type SavedChest = SaveData['chests'][number];

export interface ChestReward {
  type: ChestType;
  coins: number;
  fragments: number;
  /** Accessoire obtenu, ou null. */
  accessory: string | null;
  /** Accessoires débloqués par les objectifs à cette occasion. */
  unlocked: string[];
}

/** Coffre gagné pour un podium (1 à 3, avec au moins 3 adversaires), d'après un tirage r ∈ [0, 1). */
export function chestForRank(rank: number, participants: number, r: number): ChestType | null {
  if (!isPodium(rank, participants)) return null;
  const odds = chestCatalog.dropByRank[String(rank)];
  let acc = 0;
  for (const t of CHEST_ORDER) {
    acc += odds[t] ?? 0;
    if (r < acc) return t;
  }
  return 'bois';
}

/** Range un coffre ; faux si les emplacements sont pleins. */
export function awardChest(save: SaveData, type: ChestType): boolean {
  if (save.chests.length >= chestCatalog.slots) return false;
  save.chestSeq++;
  save.chests = [...save.chests, { id: save.chestSeq, type }];
  return true;
}

/** Ouvre un coffre (tout de suite, sans attente). Null s'il n'existe pas. */
export function openChest(save: SaveData, id: number): ChestReward | null {
  const c = save.chests.find((x) => x.id === id);
  if (!c) return null;
  const def = chestCatalog.types[c.type];
  // Contenu tiré d'une graine propre au coffre : rouvrir la même sauvegarde donne le même contenu.
  const rng = createRng(0x9e3779b9 ^ (c.id * 2654435761));
  const coins = Math.round(rng.range(def.coins[0], def.coins[1]));
  const fragments = Math.round(rng.range(def.fragments[0], def.fragments[1]));
  let accessory: string | null = null;
  let extraCoins = 0;
  if (rng.next() < def.accessoryChance) {
    const missing = accessoryCatalog.accessories.filter((a) => !ownsAccessory(save, a.id));
    if (missing.length) accessory = missing[Math.floor(rng.next() * missing.length)].id;
    else extraCoins = chestCatalog.duplicateAccessoryCoins;
  }
  save.chests = save.chests.filter((x) => x.id !== id);
  save.coins += coins + extraCoins;
  save.fragments += fragments;
  if (accessory) save.accessories = [...save.accessories, accessory];
  save.stats = { ...save.stats, chests: save.stats.chests + 1 };
  return { type: c.type, coins: coins + extraCoins, fragments, accessory, unlocked: checkUnlocks(save) };
}
