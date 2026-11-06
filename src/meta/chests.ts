/**
 * Coffres de récompense : gagnés sur le podium (et au défi du jour), rangés dans 4 emplacements.
 * Un seul se déverrouille à la fois, en temps réel ; on peut l'ouvrir tout de suite en payant en
 * pièces (jamais en argent réel). Contenu : pièces, fragments de panache, parfois un accessoire.
 */
import { accessoryCatalog, CHEST_ORDER, chestCatalog, type ChestType } from '../data';
import { createRng } from '../sim/rng';
import { checkUnlocks, ownsAccessory } from './accessories';
import type { SaveData } from './settings';

export type SavedChest = SaveData['chests'][number];
export type ChestState = 'locked' | 'unlocking' | 'ready';

export interface ChestReward {
  type: ChestType;
  coins: number;
  fragments: number;
  /** Accessoire obtenu, ou null. */
  accessory: string | null;
  /** Accessoires débloqués par les objectifs à cette occasion. */
  unlocked: string[];
}

/** Coffre gagné pour une place (1 à 3, avec au moins un adversaire), d'après un tirage r ∈ [0, 1). */
export function chestForRank(rank: number, participants: number, r: number): ChestType | null {
  if (participants < 2 || rank > 3) return null;
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
  save.chests = [...save.chests, { id: save.chestSeq, type, unlockEndsAt: null }];
  return true;
}

export function chestState(c: SavedChest, now: number): ChestState {
  if (c.unlockEndsAt === null) return 'locked';
  return now >= c.unlockEndsAt ? 'ready' : 'unlocking';
}

/** Millisecondes restantes (durée complète si le déverrouillage n'a pas commencé). */
export function remainingMs(c: SavedChest, now: number): number {
  if (c.unlockEndsAt === null) return chestCatalog.types[c.type].unlockMinutes * 60_000;
  return Math.max(0, c.unlockEndsAt - now);
}

/** Prix en pièces pour ouvrir tout de suite. */
export function skipCost(c: SavedChest, now: number): number {
  const ms = remainingMs(c, now);
  if (ms <= 0) return 0;
  return Math.max(chestCatalog.skipMin, Math.ceil((ms / 60_000) * chestCatalog.skipCoinsPerMinute));
}

/** Lance le déverrouillage ; faux si un autre coffre est déjà en cours. */
export function startUnlock(save: SaveData, id: number, now: number): boolean {
  const c = save.chests.find((x) => x.id === id);
  if (!c || c.unlockEndsAt !== null) return false;
  if (save.chests.some((x) => chestState(x, now) === 'unlocking')) return false;
  c.unlockEndsAt = now + chestCatalog.types[c.type].unlockMinutes * 60_000;
  return true;
}

/** Ouvre un coffre prêt, ou tout de suite contre des pièces si `pay`. Null si impossible. */
export function openChest(save: SaveData, id: number, now: number, pay = false): ChestReward | null {
  const c = save.chests.find((x) => x.id === id);
  if (!c) return null;
  if (chestState(c, now) !== 'ready') {
    if (!pay) return null;
    const cost = skipCost(c, now);
    if (save.coins < cost) return null;
    save.coins -= cost;
  }
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
