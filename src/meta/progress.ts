/**
 * Déblocage progressif des circuits : les deux premiers sont ouverts, chaque suivant s'ouvre avec un
 * podium sur le précédent (n'importe quelle difficulté). Le défi du jour reste jouable sur n'importe
 * quel circuit, même verrouillé ; un podium au défi du jour sur un circuit verrouillé ne compte pas.
 */
import { courses, type CourseDef } from '../data';
import type { SaveData } from './settings';

/** Nombre de circuits ouverts d'office. */
export const OPEN_AT_START = 2;

const playable = (): CourseDef[] => courses.filter((c) => c.trackId);

export function isCourseUnlocked(save: SaveData, courseId: string): boolean {
  const list = playable();
  const i = list.findIndex((c) => c.id === courseId);
  if (i < 0) return false;
  if (i < OPEN_AT_START) return true;
  return save.podiumCourses.includes(list[i - 1].id);
}

/** Circuit dont il faut faire le podium pour débloquer celui-ci (null s'il est ouvert d'office). */
export function unlockRequirement(courseId: string): CourseDef | null {
  const list = playable();
  const i = list.findIndex((c) => c.id === courseId);
  return i >= OPEN_AT_START ? list[i - 1] : null;
}

/**
 * Enregistre un podium ; renvoie le circuit nouvellement débloqué, s'il y en a un. Ne compte que sur un
 * circuit déjà ouvert (le défi du jour peut tomber sur un circuit verrouillé).
 */
export function recordPodium(save: SaveData, courseId: string): CourseDef | null {
  if (!isCourseUnlocked(save, courseId) || save.podiumCourses.includes(courseId)) return null;
  save.podiumCourses = [...save.podiumCourses, courseId];
  const list = playable();
  const next = list[list.findIndex((c) => c.id === courseId) + 1];
  return next && isCourseUnlocked(save, next.id) ? next : null;
}
