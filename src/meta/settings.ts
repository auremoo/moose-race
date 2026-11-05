/**
 * Réglages et records locaux (localStorage), schéma versionné.
 * Toute lecture/écriture est protégée : le jeu fonctionne sans stockage.
 */
const KEY = 'panache.v1';

export interface SaveData {
  schema: 1;
  sensitivity: number;
  debug: boolean;
  /** Langue choisie ; absente = langue du téléphone. */
  lang?: 'fr' | 'en';
  bestTimes: Record<string, number>;
  bestLaps: Record<string, number>;
}

const DEFAULTS: SaveData = { schema: 1, sensitivity: 1, debug: false, bestTimes: {}, bestLaps: {} };

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    return { ...structuredClone(DEFAULTS), ...parsed, schema: 1 };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

export function writeSave(s: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* stockage indisponible : on ignore */
  }
}
