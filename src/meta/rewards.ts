/**
 * Fin de course côté méta : compteurs d'objectifs, coffre éventuel, accessoires débloqués.
 */
import { chestCatalog, type ChestType } from '../data';
import { createRng } from '../sim/rng';
import { checkUnlocks } from './accessories';
import { awardChest, chestForRank } from './chests';
import type { SaveData } from './settings';

export interface RaceRewards {
  /** Coffre gagné (null : pas de podium) et s'il a trouvé une place. */
  chest: ChestType | null;
  chestStored: boolean;
  unlocked: string[];
}

export function recordRace(save: SaveData, rank: number, participants: number, dailyFirst: boolean): RaceRewards {
  const st = { ...save.stats };
  st.races++;
  if (participants > 1 && rank <= 3) st.podiums++;
  if (participants > 1 && rank === 1) st.wins++;
  if (dailyFirst) st.dailies++;
  save.stats = st;
  // Tirage du coffre propre à la course : même sauvegarde, même résultat.
  const r = createRng(0x51ed270b ^ (st.races * 2246822519)).next();
  let chest = chestForRank(rank, participants, r);
  // Premier défi du jour terminé : coffre doré garanti.
  if (dailyFirst) chest = chestCatalog.dailyChest;
  const chestStored = chest !== null && awardChest(save, chest);
  return { chest, chestStored, unlocked: checkUnlocks(save) };
}
