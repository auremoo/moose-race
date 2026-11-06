/**
 * Composition du peloton : le joueur puis des bots dont la cote est calée sur celle
 * du joueur selon la difficulté (Facile −6, Moyen ±0, Difficile +4).
 */
import { botNames, mooseById, mooseCatalog, mooseParamsFor, mooseRating, type Balance, type DifficultyId, type MooseDef } from '../data';
import type { Entrant } from './race';
import { createRng } from './rng';

export interface RosterOptions {
  playerName: string;
  playerMooseId: string;
  playerLevel: number;
  difficulty: DifficultyId;
  botCount: number;
  seed: number;
  balance: Balance;
  /** Accessoire porté par l'orignal du joueur (identifiant du catalogue) ; sinon celui d'origine. */
  playerAccessory?: string;
}

function entrantFor(def: MooseDef, level: number, name: string, balance: Balance, talent?: number, statOffset = 0): Entrant {
  return {
    name,
    mooseId: def.id,
    coat: def.coat,
    size: def.size,
    accessory: def.accessory,
    rating: mooseRating(def, level) + statOffset,
    params: mooseParamsFor(def, level, balance, statOffset),
    botTalent: talent,
  };
}

export function buildEntrants(o: RosterOptions): Entrant[] {
  const rng = createRng(o.seed ^ 0x5bd1e995);
  const playerDef = mooseById(o.playerMooseId) ?? mooseCatalog.moose[0];
  const entrants: Entrant[] = [entrantFor(playerDef, o.playerLevel, o.playerName, o.balance)];
  if (o.playerAccessory) entrants[0].accessory = o.playerAccessory;
  const diff = o.balance.difficulties[o.difficulty];
  const target = mooseRating(playerDef, o.playerLevel) + diff.ratingOffset;
  const names = [...botNames];
  for (let i = 0; i < o.botCount; i++) {
    // Un orignal du catalogue dont la cote peut atteindre la cible (± quelques points).
    const candidates = mooseCatalog.moose.filter((m) => {
      const min = mooseRating(m, 1);
      const max = mooseRating(m, mooseCatalog.maxLevel);
      return target >= min - 3 && target <= max + 1;
    });
    // Cible sous la cote des communs : des communs, au niveau 1.
    const pool = candidates.length
      ? candidates
      : mooseCatalog.moose.filter((m) => m.rarity === (target < mooseRating(mooseCatalog.moose[0], 1) ? 'commun' : 'legendaire'));
    const def = pool[Math.floor(rng.next() * pool.length)];
    const jitter = Math.round(rng.range(-2, 2));
    const level = Math.max(
      1,
      Math.min(mooseCatalog.maxLevel, Math.round((target + jitter - mooseRating(def, 1)) / mooseCatalog.levelStatGain) + 1),
    );
    const ni = Math.floor(rng.next() * names.length);
    const name = names.splice(ni, 1)[0] ?? `Bot ${i + 1}`;
    const talent = rng.range(diff.talent[0], diff.talent[1]);
    // Reste d'écart (cible hors de portée du catalogue, en Facile surtout) : on décale les stats.
    const residual = target + jitter - mooseRating(def, level);
    entrants.push(entrantFor(def, level, name, o.balance, talent, Math.max(-12, Math.min(12, residual))));
  }
  return entrants;
}
