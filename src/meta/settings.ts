/**
 * Réglages et records locaux (localStorage), schéma versionné.
 * Toute lecture/écriture est protégée : le jeu fonctionne sans stockage.
 */
const KEY = 'panache.v1';
/** Version actuelle du schéma. Chaque hausse ajoute une étape à MIGRATIONS. */
export const SCHEMA = 2;

export interface SaveData {
  schema: number;
  sensitivity: number;
  debug: boolean;
  /** Ligne idéale affichée au sol. */
  idealLine: boolean;
  /** Commandes inversées pour les gauchers. */
  lefty: boolean;
  /** Langue choisie ; absente = langue du téléphone. */
  lang?: 'fr' | 'en';
  /** Solde de pièces à feuille d'érable (l'économie arrive au jalon 7). */
  coins: number;
  activeMoose: string;
  owned: string[];
  /** Niveau de chaque orignal possédé. */
  levels: Record<string, number>;
  difficulty: 'facile' | 'moyen' | 'difficile';
  botCount: number;
  mode: 'classique' | 'special';
  /** Couples parcours|difficulté déjà gagnés (bonification de première victoire). */
  firstWins: string[];
  /** Nombre de courses lancées (sert de graine). */
  raceCount: number;
  /** Fragments de panache (doublons du ravitaillement). */
  fragments: number;
  lootCount: number;
  /** Ravitaillements depuis le dernier Rare ou mieux. */
  pityCounter: number;
  bestTimes: Record<string, number>;
  bestLaps: Record<string, number>;
}

const DEFAULTS: SaveData = {
  schema: SCHEMA,
  sensitivity: 1,
  debug: false,
  idealLine: true,
  lefty: false,
  coins: 0,
  activeMoose: 'bucheron',
  owned: ['bucheron'],
  levels: { bucheron: 1 },
  difficulty: 'moyen',
  botCount: 10,
  mode: 'classique',
  firstWins: [],
  raceCount: 0,
  fragments: 0,
  lootCount: 0,
  pityCounter: 0,
  bestTimes: {},
  bestLaps: {},
};

type Raw = Record<string, unknown> & { schema?: number };

/** Étapes de migration : MIGRATIONS[n] passe du schéma n au schéma n + 1. */
const MIGRATIONS: Record<number, (s: Raw) => Raw> = {
  // 1 → 2 : collection (niveaux, fragments, ravitaillement) ; Bûcheron toujours possédé.
  1: (s) => {
    const owned = Array.isArray(s.owned) ? (s.owned as string[]) : ['bucheron'];
    if (!owned.includes('bucheron')) owned.unshift('bucheron');
    const levels = (s.levels as Record<string, number>) ?? {};
    for (const id of owned) levels[id] ??= 1;
    return { ...s, owned, levels, fragments: 0, lootCount: 0, pityCounter: 0, schema: 2 };
  },
};

/** Applique les migrations et complète les champs manquants. */
export function migrate(input: Raw): SaveData {
  let s: Raw = { ...input };
  let v = typeof s.schema === 'number' ? s.schema : 1;
  while (v < SCHEMA) {
    const step = MIGRATIONS[v];
    if (!step) break;
    s = step(s);
    v++;
  }
  return { ...structuredClone(DEFAULTS), ...(s as Partial<SaveData>), schema: SCHEMA };
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    return migrate(JSON.parse(raw) as Raw);
  } catch {
    return structuredClone(DEFAULTS);
  }
}

/** Export de la sauvegarde en texte JSON (le navigateur peut effacer le stockage local). */
export function exportSave(s: SaveData): string {
  return JSON.stringify({ game: 'panache', ...s }, null, 1);
}

/** Import : renvoie la sauvegarde migrée, ou null si le texte n'est pas une sauvegarde Panache. */
export function importSave(text: string): SaveData | null {
  try {
    const o = JSON.parse(text) as Raw;
    if (o.game !== 'panache') return null;
    delete o.game;
    return migrate(o);
  } catch {
    return null;
  }
}

export function defaultSave(): SaveData {
  return structuredClone(DEFAULTS);
}

export function writeSave(s: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* stockage indisponible : on ignore */
  }
}
