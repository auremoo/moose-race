/**
 * Défi du jour : un circuit, un mode, une difficulté et une graine tirés de la date (heure locale).
 * Même défi pour tous les joueurs le même jour ; bonus de pièces à la première arrivée du jour.
 */
import { courses, type CourseDef, type DifficultyId } from '../data';
import { createRng } from '../sim/rng';

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

export function dailyChallenge(d: Date = new Date()): DailyChallenge {
  const key = dayKey(d);
  const seed = hash(`panache-${key}`);
  const rng = createRng(seed);
  const course = courses[Math.floor(rng.next() * courses.length)];
  const mode = rng.next() < 0.4 ? 'special' : 'classique';
  const difficulty: DifficultyId = course.stars <= 2 ? 'moyen' : rng.next() < 0.5 ? 'moyen' : 'difficile';
  return { key, course, mode, difficulty, botCount: 10, seed };
}
