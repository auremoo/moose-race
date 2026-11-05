/**
 * Accès validé aux données d'équilibrage et aux parcours.
 * Tous les chiffres réglables vivent dans les JSON de ce dossier.
 */
import balanceJson from './balance.json';
import boucleGrise from './tracks/boucle-grise.json';
import coursesJson from './courses.json';
import mooseJson from './moose.json';
import type { MooseParams, SurfaceParams } from '../sim/moose';
import type { SurfaceId, TrackDef } from '../sim/track';

export interface Balance {
  version: number;
  sim: { hz: number; laps: number; countdownSeconds: number };
  moose: MooseParams;
  surfaces: Record<SurfaceId, SurfaceParams>;
  barrier: { speedLossPerSecond: number; headingAlignRate: number };
  hud: {
    /** Vitesse affichée quand l'orignal est à sa vitesse de pointe en course (km/h « réels »). */
    realTopKmh: number;
    gaugeMaxKmh: number;
    /** Allures : [seuil km/h affiché, clé de texte], dans l'ordre croissant. */
    gaits: [number, string][];
    slideMessageSlip: number;
    slideMessageDelay: number;
  };
  input: { touchRangePx: number; touchCurve: number; keyboardRampPerSecond: number; sensitivity: number };
  camera: {
    distance: number;
    height: number;
    lookAhead: number;
    lookHeight: number;
    fov: number;
    followRate: number;
    yawRate: number;
    galopFovBoost: number;
  };
}

function fail(path: string, msg: string): never {
  throw new Error(`Données invalides (${path}) : ${msg}`);
}

function checkNumbers(obj: unknown, path: string, keys: string[]): void {
  if (typeof obj !== 'object' || obj === null) fail(path, 'objet attendu');
  for (const k of keys) {
    const v = (obj as Record<string, unknown>)[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${path}.${k}`, 'nombre fini attendu');
  }
}

const SURFACES: SurfaceId[] = ['sentier', 'herbe', 'boue', 'neige', 'glace'];

export function validateBalance(b: unknown): Balance {
  const o = b as Balance;
  checkNumbers(o, 'balance', ['version']);
  checkNumbers(o.sim, 'balance.sim', ['hz', 'laps', 'countdownSeconds']);
  checkNumbers(o.moose, 'balance.moose', [
    'topSpeed', 'accel', 'aLat', 'maxSteerCurvature', 'steerGripMargin', 'steerRate', 'scrubFactor',
    'scrubMaxExcess', 'slideFlatDecel', 'overTopDecelRate', 'startSpeed',
  ]);
  for (const s of SURFACES) checkNumbers(o.surfaces?.[s], `balance.surfaces.${s}`, ['grip', 'vmax']);
  checkNumbers(o.barrier, 'balance.barrier', ['speedLossPerSecond', 'headingAlignRate']);
  checkNumbers(o.hud, 'balance.hud', ['realTopKmh', 'gaugeMaxKmh', 'slideMessageSlip', 'slideMessageDelay']);
  if (!Array.isArray(o.hud.gaits) || o.hud.gaits.some((g) => typeof g[0] !== 'number' || typeof g[1] !== 'string'))
    fail('balance.hud.gaits', '[seuil, clé] attendus');
  checkNumbers(o.input, 'balance.input', ['touchRangePx', 'touchCurve', 'keyboardRampPerSecond', 'sensitivity']);
  checkNumbers(o.camera, 'balance.camera', ['distance', 'height', 'lookAhead', 'lookHeight', 'fov', 'followRate', 'yawRate', 'galopFovBoost']);
  if (o.sim.hz <= 0 || o.moose.aLat <= 0 || o.moose.topSpeed <= 0) fail('balance', 'valeurs strictement positives attendues');
  return o;
}

export function validateTrack(t: unknown): TrackDef {
  const o = t as TrackDef;
  if (typeof o?.id !== 'string' || typeof o.name !== 'string') fail('track', 'id et name requis');
  checkNumbers(o, `track ${o.id}`, ['width', 'verge', 'startOffset']);
  if (!Array.isArray(o.points) || o.points.length < 4) fail(`track ${o.id}.points`, 'au moins 4 points');
  o.points.forEach((p, i) => {
    if (!Array.isArray(p) || (p.length !== 2 && p.length !== 3) || !p.every((v) => typeof v === 'number' && Number.isFinite(v)))
      fail(`track ${o.id}.points[${i}]`, '[x, y] ou [x, y, largeur] attendu');
    if (p.length === 3 && (p[2] < 6 || p[2] > 40)) fail(`track ${o.id}.points[${i}]`, 'largeur entre 6 et 40 m');
  });
  if (!SURFACES.includes(o.surface) || !SURFACES.includes(o.vergeSurface)) fail(`track ${o.id}`, 'surface inconnue');
  return o;
}

export const balance: Balance = validateBalance(balanceJson);
export const tracks: TrackDef[] = [validateTrack(boucleGrise)];

// ---------- Orignaux ----------

export type RarityId = 'commun' | 'peu-commun' | 'rare' | 'epique' | 'legendaire';

export interface MooseDef {
  id: string;
  name: string;
  rarity: RarityId;
  /** Stats au niveau 1 : Vitesse, Accélération, Virage, Endurance, Robustesse. */
  stats: [number, number, number, number, number];
  starter?: boolean;
}

export interface MooseCatalog {
  rarities: Record<RarityId, { avgLevel1: number; costMultiplier: number; price: number; fragments: number; color: string }>;
  levelStatGain: number;
  maxLevel: number;
  moose: MooseDef[];
}

export function validateMooseCatalog(c: unknown): MooseCatalog {
  const o = c as MooseCatalog;
  checkNumbers(o, 'moose', ['levelStatGain', 'maxLevel']);
  const ids = new Set<string>();
  for (const m of o.moose) {
    if (ids.has(m.id)) fail(`moose.${m.id}`, 'identifiant en double');
    ids.add(m.id);
    if (!o.rarities[m.rarity]) fail(`moose.${m.id}`, `rareté inconnue ${m.rarity}`);
    if (m.stats.length !== 5 || m.stats.some((v) => v < 1 || v > 100)) fail(`moose.${m.id}`, '5 stats de 1 à 100');
  }
  return o;
}

export const mooseCatalog: MooseCatalog = validateMooseCatalog(mooseJson);

/** Cote : moyenne arrondie des 5 stats au niveau donné. */
export function mooseRating(m: MooseDef, level = 1): number {
  const gain = mooseCatalog.levelStatGain * (level - 1);
  return Math.round(m.stats.reduce((a, b) => a + Math.min(100, b + gain), 0) / 5);
}

// ---------- Parcours et fonctionnalités ----------

export interface CourseDef {
  id: string;
  trackId?: string;
  name: string;
  biome: string;
  province: string;
  lengthKm: number;
  /** Jalon où ce parcours devient jouable. */
  milestone: number;
}

export type FeatureId = 'enclos' | 'comptoir' | 'didacticiel' | 'multijoueur' | 'modeSpecial' | 'difficulte' | 'bots' | 'pieces';

/** Jalon actuellement livré : tout ce qui arrive plus tard est grisé. */
export const CURRENT_MILESTONE = 1;

export const courses: CourseDef[] = (coursesJson as { courses: CourseDef[] }).courses;
export const featureMilestones = (coursesJson as { features: Record<FeatureId, number> }).features;

export function isAvailable(milestone: number): boolean {
  return milestone <= CURRENT_MILESTONE;
}
