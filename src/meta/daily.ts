/**
 * Défi du jour : un circuit, un mode, une difficulté et une graine tirés de la date (heure locale).
 * Même circuit et même mode pour tous les joueurs le même jour ; la difficulté est plafonnée selon la
 * progression du joueur. Bonus de pièces et coffre doré à la première arrivée du jour.
 */
import { courses, type CourseDef, type DifficultyId } from '../data';
import { createRng } from '../sim/rng';
import { isCourseUnlocked } from './progress';
import type { SaveData } from './settings';

export const DAILY_BONUS = 100;

export interface DailyChallenge {
  key: string;
  course: CourseDef;
  mode: 'classique' | 'special';
  difficulty: DifficultyId;
  botCount: number;
  seed: number;
}

export function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Difficulté maximale du défi selon le nombre de circuits ouverts : Facile tant qu'il y en a moins de
 * 5, Moyen jusqu'à 9, puis la difficulté tirée.
 */
export function dailyDifficultyCap(unlocked: number): DifficultyId {
  return unlocked < 5 ? 'facile' : unlocked < 10 ? 'moyen' : 'difficile';
}

const LEVELS: DifficultyId[] = ['facile', 'moyen', 'difficile'];

/** Défi du jour tel que ce joueur le court (difficulté plafonnée selon sa progression). */
export function dailyFor(save: SaveData, d: Date = new Date()): DailyChallenge {
  const c = dailyChallenge(d);
  const unlocked = courses.filter((x) => x.trackId && isCourseUnlocked(save, x.id)).length;
  const cap = dailyDifficultyCap(unlocked);
  return LEVELS.indexOf(c.difficulty) > LEVELS.indexOf(cap) ? { ...c, difficulty: cap } : c;
}

/**
 * Le bonus du jour est-il encore à prendre ? Non s'il a déjà été pris, ni si la date est antérieure au
 * dernier défi terminé (horloge reculée). Avancer l'horloge reste possible : seul un serveur pourra
 * l'empêcher (voir #4).
 */
export function dailyRewardOpen(save: SaveData, key: string): boolean {
  if (save.dailyDone.includes(key)) return false;
  return save.dailyDone.every((k) => k < key);
}

export function dailyChallenge(d: Date = new Date()): DailyChallenge {
  const key = dayKey(d);
  const seed = hash(`panache-${key}`);
  const rng = createRng(seed);
  const course = courses[Math.floor(rng.next() * courses.length)];
  const mode = rng.next() < 0.4 ? 'special' : 'classique';
  const difficulty: DifficultyId = course.stars <= 2 ? 'moyen' : rng.next() < 0.5 ? 'moyen' : 'difficile';
  return { key, course, mode, difficulty, botCount: 10, seed };
}
