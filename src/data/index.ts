/**
 * Accès validé aux données d'équilibrage et aux parcours.
 * Tous les chiffres réglables vivent dans les JSON de ce dossier.
 */
import balanceJson from './balance.json';
import { trackJsons } from './tracks';
import coursesJson from './courses.json';
import mooseJson from './moose.json';
import botsJson from './bots.json';
import type { MooseParams, SurfaceParams } from '../sim/moose';
import type { SurfaceId, TrackDef } from '../sim/track';

export type DifficultyId = 'facile' | 'moyen' | 'difficile';

export interface DifficultyDef {
  /** Écart de cote des bots par rapport au joueur. */
  ratingOffset: number;
  /** Plage de talent des bots (0 = maladroit, 1 = parfait). */
  talent: [number, number];
  /** Rattrapage maximal (fraction de vitesse). */
  catchUp: number;
  coinMul: number;
  /** Ligne idéale affichée par défaut. */
  idealLine: boolean;
  /** Assistance de direction (0 = aucune). */
  assist: number;
}

export interface SpecialDef {
  coinMul: number;
  bears: Record<DifficultyId, { count: [number, number]; speedMul: number }>;
  bear: {
    warnSeconds: number;
    crossSpeed: number;
    chargeSpeed: number;
    guardSway: number;
    periodMin: number;
    periodMax: number;
    radius: number;
    /** Part de vitesse conservée après un contact avec un ours. */
    hitSpeedKeep: number;
    /** Espacement minimal entre deux ours le long de la piste (m). */
    minSpacing: number;
  };
  beaver: { perTrack: number; radius: number; respawnSeconds: number; lineOffset: number };
  items: { coupSeconds: number; barrageSeconds: number; barrageHalfWidth: number; barrageSpeedKeep: number; hutteSeconds: number };
}

export interface Balance {
  version: number;
  sim: { hz: number; laps: number; countdownSeconds: number };
  moose: MooseParams;
  surfaces: Record<SurfaceId, SurfaceParams>;
  barrier: { speedLossPerSecond: number; headingAlignRate: number };
  difficulties: Record<DifficultyId, DifficultyDef>;
  bots: {
    noiseAmplitude: number;
    mistakeChance: number;
    mistakeSpeedBonus: number;
    cornerMarginMin: number;
    overtakeDistance: number;
    overtakeShift: number;
    /** Écart latéral en dessous duquel un bot reste derrière plutôt que de percuter (m). */
    followLateral: number;
    catchUpRange: number;
  };
  contact: { halfLength: number; halfWidth: number; speedTransfer: number; stunClosingSpeed: number; stunFraction: number; minSpeedKeep: number; stunCooldown: number };
  special: SpecialDef;
  /** Plages stat 0 → stat 100 de chaque paramètre physique lié aux stats. */
  stats: Record<'topSpeed' | 'accel' | 'aLat' | 'enduranceSeconds' | 'stunSeconds' | 'mass', [number, number]>;
  /** Zone de corde : demi-longueur le long de la piste et tolérance latérale (m). */
  corde: { zoneHalfLength: number; lateralTolerance: number };
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
    'topSpeed', 'accel', 'aLat', 'maxSteerCurvature', 'steerGripMargin', 'steerRate', 'scrubFactor', 'slideGrip',
    'scrubMaxExcess', 'slideFlatDecel', 'overTopDecelRate', 'coastDecel', 'brakeDecel', 'startSpeed',
    'gallopSpeedMul', 'gallopAccelMul', 'enduranceSeconds', 'enduranceRecoverSeconds', 'gallopRestartMin',
    'driftMinSpeed', 'driftSteerMin', 'driftGripMul', 'driftDecel', 'driftChargeSeconds', 'driftMinCharge',
    'boostMinSeconds', 'boostMaxSeconds', 'boostSpeedMul', 'boostAccel', 'cordeSpeedMul', 'cordeSeconds',
    'draftSpeedMul', 'draftDistance', 'stunSeconds', 'mass',
  ]);
  for (const s of SURFACES) checkNumbers(o.surfaces?.[s], `balance.surfaces.${s}`, ['grip', 'vmax']);
  checkNumbers(o.barrier, 'balance.barrier', ['speedLossPerSecond', 'headingAlignRate']);
  checkNumbers(o.corde, 'balance.corde', ['zoneHalfLength', 'lateralTolerance']);
  for (const id of ['facile', 'moyen', 'difficile'] as DifficultyId[])
    checkNumbers(o.difficulties?.[id], `balance.difficulties.${id}`, ['ratingOffset', 'catchUp', 'coinMul', 'assist']);
  checkNumbers(o.bots, 'balance.bots', ['noiseAmplitude', 'mistakeChance', 'mistakeSpeedBonus', 'cornerMarginMin', 'overtakeDistance', 'overtakeShift', 'followLateral', 'catchUpRange']);
  checkNumbers(o.special, 'balance.special', ['coinMul']);
  checkNumbers(o.special.bear, 'balance.special.bear', ['warnSeconds', 'crossSpeed', 'chargeSpeed', 'guardSway', 'periodMin', 'periodMax', 'radius', 'hitSpeedKeep', 'minSpacing']);
  checkNumbers(o.special.beaver, 'balance.special.beaver', ['perTrack', 'radius', 'respawnSeconds', 'lineOffset']);
  checkNumbers(o.special.items, 'balance.special.items', ['coupSeconds', 'barrageSeconds', 'barrageHalfWidth', 'barrageSpeedKeep', 'hutteSeconds']);
  checkNumbers(o.contact, 'balance.contact', ['halfLength', 'halfWidth', 'speedTransfer', 'stunClosingSpeed', 'stunFraction', 'minSpeedKeep', 'stunCooldown']);
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
export const tracks: TrackDef[] = trackJsons.map(validateTrack);

export function trackById(id: string): TrackDef | undefined {
  return tracks.find((t) => t.id === id);
}

// ---------- Orignaux ----------

export type RarityId = 'commun' | 'peu-commun' | 'rare' | 'epique' | 'legendaire';

export interface MooseDef {
  id: string;
  name: string;
  rarity: RarityId;
  /** Stats au niveau 1 : Vitesse, Accélération, Virage, Endurance, Robustesse. */
  stats: [number, number, number, number, number];
  starter?: boolean;
  /** Style de course, en une phrase courte (français). */
  style?: string;
  /** Couleur de la robe. */
  coat: string;
  accessory: 'tuque' | 'foulard' | 'clochette';
  /** Gabarit relatif. */
  size: number;
}

export interface MooseCatalog {
  rarities: Record<RarityId, { avgLevel1: number; costMultiplier: number; price: number; fragments: number; color: string }>;
  levelStatGain: number;
  maxLevel: number;
  /** Coût de passage du niveau n à n + 1 : upgradeBase × n × multiplicateur de rareté. */
  upgradeBase: number;
  loot: {
    cost: number;
    odds: Record<RarityId, number>;
    /** Un Rare ou mieux est garanti tous les pityEvery ravitaillements. */
    pityEvery: number;
    duplicateFragments: Record<RarityId, number>;
  };
  moose: MooseDef[];
}

export function validateMooseCatalog(c: unknown): MooseCatalog {
  const o = c as MooseCatalog;
  checkNumbers(o, 'moose', ['levelStatGain', 'maxLevel']);
  const oddsSum = Object.values(o.loot.odds).reduce((a, b) => a + b, 0);
  if (Math.abs(oddsSum - 1) > 1e-9) fail('moose.loot.odds', `la somme des chances doit faire 1 (${oddsSum})`);
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
  /** Difficulté de 1 à 5 étoiles. */
  stars: number;
  /** Nombre de tours pour une course d'environ 90 s. */
  laps: number;
  /** Jalon où ce parcours devient jouable. */
  milestone: number;
}

export type FeatureId = 'enclos' | 'comptoir' | 'didacticiel' | 'multijoueur' | 'modeSpecial' | 'difficulte' | 'bots' | 'pieces';

/** Jalon actuellement livré : tout ce qui arrive plus tard est grisé. */
export const CURRENT_MILESTONE = 3;

export const courses: CourseDef[] = (coursesJson as { courses: CourseDef[] }).courses;
export const featureMilestones = (coursesJson as { features: Record<FeatureId, number> }).features;

export function isAvailable(milestone: number): boolean {
  return milestone <= CURRENT_MILESTONE;
}

/** Stats au niveau donné : +levelStatGain par niveau, plafonnées à 100. */
export function mooseStats(m: MooseDef, level = 1): [number, number, number, number, number] {
  const gain = mooseCatalog.levelStatGain * (level - 1);
  return m.stats.map((v) => Math.min(100, v + gain)) as [number, number, number, number, number];
}

/** Paramètres physiques d'un orignal : les stats déplacent les valeurs de base dans les plages du cahier. */
export function mooseParamsFor(m: MooseDef, level = 1, b: Balance = balance, statOffset = 0): MooseParams {
  const [V, A, Vi, E, R] = mooseStats(m, level).map((v) => Math.max(0, Math.min(100, v + statOffset)));
  const lerp = (r: [number, number], t: number) => r[0] + (r[1] - r[0]) * (t / 100);
  return {
    ...b.moose,
    topSpeed: lerp(b.stats.topSpeed, V),
    accel: lerp(b.stats.accel, A),
    aLat: lerp(b.stats.aLat, Vi),
    enduranceSeconds: lerp(b.stats.enduranceSeconds, E),
    stunSeconds: lerp(b.stats.stunSeconds, R),
    mass: lerp(b.stats.mass, R),
  };
}

export function mooseById(id: string): MooseDef | undefined {
  return mooseCatalog.moose.find((m) => m.id === id);
}

export const botNames: string[] = (botsJson as { names: string[] }).names;
