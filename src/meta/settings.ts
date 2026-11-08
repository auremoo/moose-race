/**
 * Réglages et records locaux (localStorage), schéma versionné.
 * Toute lecture/écriture est protégée : le jeu fonctionne sans stockage.
 */
const KEY = 'panache.v1';
/** Version actuelle du schéma. Chaque hausse ajoute une étape à MIGRATIONS. */
export const SCHEMA = 6;

export interface SaveData {
  schema: number;
  sensitivity: number;
  debug: boolean;
  /** Ligne idéale affichée au sol. */
  idealLine: boolean;
  /** Commandes inversées pour les gauchers. */
  lefty: boolean;
  soundOn: boolean;
  musicOn: boolean;
  hapticsOn: boolean;
  reduceMotion: boolean;
  tutorialDone: boolean;
  /** Fantôme du meilleur temps affiché en course. */
  ghostOn: boolean;
  /** Jours où le défi du jour a été terminé (clés AAAA-MM-JJ, les 30 derniers). */
  dailyDone: string[];
  /** Échelle de l'interface (texte et boutons) : 1, 1,15 ou 1,3. */
  uiScale: number;
  highContrast: boolean;
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
  /** Empreinte du tracé au moment de chaque record (voir trackSignature). */
  trackSigs: Record<string, string>;
  /** Circuits où le joueur a fini sur le podium (déblocage du suivant). */
  podiumCourses: string[];
  /** Accessoires possédés (tuques, foulards…) et accessoire porté par chaque orignal. */
  accessories: string[];
  equipped: Record<string, string>;
  /** Coffres gagnés pas encore ouverts (4 emplacements au plus). */
  chests: { id: number; type: 'bois' | 'erable' | 'or' | 'aurore' }[];
  /** Compteur de coffres gagnés (identifiants et graine du contenu). */
  chestSeq: number;
  /** Compteurs des objectifs. */
  stats: { races: number; wins: number; podiums: number; dailies: number; chests: number };
}

const DEFAULTS: SaveData = {
  schema: SCHEMA,
  sensitivity: 1,
  debug: false,
  idealLine: true,
  lefty: false,
  soundOn: true,
  musicOn: true,
  hapticsOn: true,
  reduceMotion: false,
  tutorialDone: false,
  ghostOn: true,
  dailyDone: [],
  uiScale: 1,
  highContrast: false,
  coins: 0,
  activeMoose: 'bucheron',
  owned: ['bucheron'],
  levels: { bucheron: 1 },
  // Nouveaux joueurs en Facile : les premières courses doivent donner envie de revenir.
  difficulty: 'facile',
  botCount: 10,
  mode: 'classique',
  firstWins: [],
  raceCount: 0,
  fragments: 0,
  lootCount: 0,
  pityCounter: 0,
  bestTimes: {},
  bestLaps: {},
  trackSigs: {},
  podiumCourses: [],
  accessories: ['tuque-rouge', 'foulard-rouge', 'clochette-doree', 'aucun'],
  equipped: {},
  chests: [],
  chestSeq: 0,
  stats: { races: 0, wins: 0, podiums: 0, dailies: 0, chests: 0 },
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
  // 2 → 3 : accessoires à collectionner ; chacun garde l'accessoire d'origine de son orignal.
  2: (s) => ({ ...s, accessories: ['tuque-rouge', 'foulard-rouge', 'clochette-doree', 'aucun'], equipped: {}, schema: 3 }),
  // 3 → 4 : coffres et objectifs. Compteurs repris de l'historique connu (victoires : au moins une par
  // couple circuit-difficulté déjà gagné ; les podiums ne sont pas connus, on prend la même valeur).
  3: (s) => {
    const wins = Array.isArray(s.firstWins) ? s.firstWins.length : 0;
    const dailies = Array.isArray(s.dailyDone) ? s.dailyDone.length : 0;
    const races = typeof s.raceCount === 'number' ? s.raceCount : 0;
    return { ...s, chests: [], chestSeq: 0, stats: { races, wins, podiums: wins, dailies, chests: 0 }, schema: 4 };
  },
  // 4 → 5 : records liés à l'empreinte du tracé. Les anciens records n'en ont pas : ils seront écartés
  // au chargement (les circuits ont été régénérés pour les nouvelles chicanes).
  4: (s) => ({ ...s, trackSigs: {}, schema: 5 }),
  // 5 → 6 : déblocage progressif. Les circuits déjà gagnés (firstWins) comptent comme podiums, pour ne
  // pas reverrouiller ce qu'un joueur a déjà parcouru.
  5: (s) => {
    const won = Array.isArray(s.firstWins) ? (s.firstWins as string[]).map((k) => k.split('|')[0]) : [];
    return { ...s, podiumCourses: [...new Set(won)], schema: 6 };
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
