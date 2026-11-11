/**
 * Fin de course côté méta : compteurs d'objectifs, coffre éventuel, accessoires débloqués.
 */
import { CHEST_ORDER, chestCatalog, type ChestType } from '../data';
import { createRng } from '../sim/rng';
import { checkUnlocks } from './accessories';
import { awardChest, chestForRank } from './chests';
import { isPodium } from './economy';
import type { SaveData } from './settings';

export interface RaceRewards {
  /** Coffre gagné (null : pas de podium) et s'il a trouvé une place. */
  chest: ChestType | null;
  chestStored: boolean;
  /** Pièces données à la place d'un coffre sans emplacement libre (0 sinon). */
  chestCoins: number;
  unlocked: string[];
}

export function recordRace(save: SaveData, rank: number, participants: number, dailyFirst: boolean): RaceRewards {
  const st = { ...save.stats };
  st.races++;
  if (isPodium(rank, participants)) st.podiums++;
  if (participants > 1 && rank === 1) st.wins++;
  if (dailyFirst) st.dailies++;
  save.stats = st;
  // Tirage du coffre propre à la course : même sauvegarde, même résultat.
  const r = createRng(0x51ed270b ^ (st.races * 2246822519)).next();
  let chest = chestForRank(rank, participants, r);
  // Premier défi du jour terminé : coffre doré garanti, ou le coffre du podium s'il est meilleur.
  if (dailyFirst && (chest === null || CHEST_ORDER.indexOf(chest) < CHEST_ORDER.indexOf(chestCatalog.dailyChest)))
    chest = chestCatalog.dailyChest;
  const chestStored = chest !== null && awardChest(save, chest);
  // Emplacements pleins : le coffre devient le minimum de pièces qu'il contient (rien n'est perdu,
  // mais l'ouvrir reste plus intéressant : fragments et accessoires en plus).
  const chestCoins = chest !== null && !chestStored ? chestCatalog.types[chest].coins[0] : 0;
  save.coins += chestCoins;
  return { chest, chestStored, chestCoins, unlocked: checkUnlocks(save) };
}
