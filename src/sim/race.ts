/**
 * Course : piste + participants + chronométrage, avancée à pas fixe.
 * Déterministe : même graine + mêmes commandes ⇒ même résultat.
 * Les bots font partie de la simulation (même physique que le joueur, sans triche de vitesse).
 */
import type { Balance, DifficultyId } from '../data';
import { botCommand, createBotBrain, type BotBrain } from './bots';
import { BIEF_SWIM_SPEED } from './bief';
import { botWantsItem, createHazards, stepHazards, useItem, type Hazards, type ItemId } from './hazards';
import { createMooseState, NO_COMMANDS, stepMoose, type Commands, type MooseParams, type MooseState } from './moose';
import { getRacingLine, speedProfile, type RacingLine } from './racingLine';
import { createRng, type Rng } from './rng';
import { pickWeather, wetSurfaces, type Weather } from './weather';
import { FORK_ENTRY_MARGIN, forkToTrackS, getFork, projectOnFork, type Fork, type ForkProjection } from './fork';
import { buildTrack, projectOnTrack, type SurfaceId, type Track, type TrackDef, type TrackProjection } from './track';

export type RacePhase = 'countdown' | 'running' | 'finished';
export type RaceMode = 'classique' | 'special';

/** Participant inscrit à une course. */
export interface Entrant {
  name: string;
  /** Identifiant de l'orignal (catalogue) pour le rendu. */
  mooseId?: string;
  coat?: string;
  size?: number;
  accessory?: string;
  rating?: number;
  params?: MooseParams;
  /** Absent : participant piloté de l'extérieur (joueur). Présent : bot de ce talent (0..1). */
  botTalent?: number;
}

export interface Racer {
  id: number;
  name: string;
  mooseId: string;
  coat: string;
  size: number;
  accessory: string;
  rating: number;
  params: MooseParams;
  /** Profil de vitesse de la ligne de course pour ces paramètres. */
  profile: Float64Array;
  bot: BotBrain | null;
  moose: MooseState;
  proj: TrackProjection;
  /** Distance parcourue depuis la ligne de départ (m), négative sur la grille. */
  distance: number;
  /** Nombre de tours complétés. */
  lapsDone: number;
  lapTimes: number[];
  finished: boolean;
  finishTime: number;
  onVerge: boolean;
  onBarrier: boolean;
  /** Tour (entier) où chaque point de corde a été touché pour la dernière fois, -1 sinon. */
  cordeHits: Int32Array;
  cordeCount: number;
  /** Pas de simulation de la dernière corde parfaite, -1 si aucune. */
  lastCordeTick: number;
  /** Pas du dernier choc, -1 si aucun (pour la secousse à l'écran). */
  lastContactTick: number;
  /** Pas du dernier étourdissement par choc (évite les étourdissements en chaîne). */
  lastStunTick: number;
  /** Aide de castor détenue (mode spécial). */
  item: ItemId | null;
  lastItemTick: number;
  lastItemUseTick: number;
  /** Bouton Castor tenu au pas précédent (déclenchement au front). */
  castorHeld: boolean;
  /** Engagé sur la bifurcation, et position sur la branche. */
  onFork: boolean;
  forkProj: ForkProjection;
  /** Pas où l'accélérateur a été enfoncé pendant le compte à rebours (-1 sinon), et départ parfait obtenu. */
  throttleTick: number;
  perfectStart: boolean;
  /** Bief ouvert pour ce participant (s restantes). */
  biefOpen: number;
  /** Distance nagée dans le canal (m), −1 hors du bief. */
  swim: number;
}

export interface Race {
  track: Track;
  balance: Balance;
  rng: Rng;
  seed: number;
  tick: number;
  dt: number;
  phase: RacePhase;
  countdownTicks: number;
  laps: number;
  racers: Racer[];
  difficulty: DifficultyId;
  mode: RaceMode;
  /** Biome du parcours. */
  biome?: string;
  weather: Weather;
  /** Bifurcation risquée du circuit, s'il en a une. */
  fork: Fork | null;
  /** Surfaces en vigueur (mouillées sous la pluie). */
  surfaces: Balance['surfaces'];
  /** Ours, castors et barrages : seulement en mode spécial. */
  hazards: Hazards | null;
  /** Ligne de course du circuit (ligne idéale, points de corde, profil de vitesse). */
  line: RacingLine;
}

export interface RaceOptions {
  seed?: number;
  laps?: number;
  /** Raccourci : n participants pilotés de l'extérieur, paramètres de base. */
  racerCount?: number;
  /** Participants : le premier est le joueur. */
  entrants?: Entrant[];
  /** Place du joueur sur la grille (0 = pole). Par défaut au milieu. */
  playerGridSlot?: number;
  difficulty?: DifficultyId;
  mode?: RaceMode;
  biome?: string;
  /** Météo imposée ; par défaut tirée de la graine selon le biome. */
  weather?: Weather;
}

export function createRace(def: TrackDef, balance: Balance, opts: RaceOptions = {}): Race {
  const track = buildTrack(def, 1);
  const line = getRacingLine(track, balance.moose, balance.surfaces);
  const seed = opts.seed ?? 1;
  const rng = createRng(seed);
  const weather = opts.weather ?? pickWeather(createRng(seed ^ 0x6a09e667), opts.biome, def.surface === 'neige');
  const surfaces = weather === 'pluie' ? wetSurfaces(balance.surfaces) : balance.surfaces;
  // Sous la pluie, la vitesse cible de la ligne de course baisse (même trajectoire).
  const lineUsed =
    surfaces === balance.surfaces ? line : { ...line, speed: speedProfile(track, line.x, line.y, line.k, balance.moose, surfaces) };
  const entrants: Entrant[] =
    opts.entrants ?? Array.from({ length: opts.racerCount ?? 1 }, (_, i) => ({ name: i === 0 ? 'Joueur' : `Bot ${i}` }));
  const count = entrants.length;
  const playerSlot = Math.min(count - 1, opts.playerGridSlot ?? Math.floor(count / 2));
  // Places sur la grille : le joueur à sa place, les autres dans l'ordre.
  const slots: number[] = [];
  for (let i = 0, s = 0; i < count; i++) {
    if (i === 0) slots.push(playerSlot);
    else {
      if (s === playerSlot) s++;
      slots.push(s++);
    }
  }
  const profiles = new Map<string, Float64Array>();
  const racers: Racer[] = entrants.map((e, i) => {
    const slot = slots[i];
    // Grille en quinconce derrière la ligne : 2 colonnes, 8 m entre rangées.
    const row = Math.floor(slot / 2);
    const col = slot % 2;
    const back = 6 + row * 8 + col * 4;
    const s0 = track.samples[track.samples.length - Math.round(back / track.spacing)];
    const lateral = count === 1 ? 0 : (col === 0 ? 1 : -1) * s0.hw * 0.4;
    const x = s0.x + s0.nx * lateral;
    const y = s0.y + s0.ny * lateral;
    const heading = Math.atan2(s0.ty, s0.tx);
    const params = e.params ?? balance.moose;
    const key = `${params.topSpeed.toFixed(3)}|${params.accel.toFixed(3)}|${params.aLat.toFixed(3)}`;
    let profile = profiles.get(key);
    if (!profile) {
      profile = params === balance.moose ? lineUsed.speed : speedProfile(track, line.x, line.y, line.k, params, surfaces);
      profiles.set(key, profile);
    }
    return {
      id: i,
      name: e.name,
      mooseId: e.mooseId ?? 'bucheron',
      coat: e.coat ?? '#5B3A29',
      size: e.size ?? 1,
      accessory: e.accessory ?? 'tuque',
      rating: e.rating ?? 40,
      params,
      profile,
      bot: e.botTalent !== undefined ? createBotBrain(e.botTalent, rng) : null,
      moose: createMooseState(x, y, heading, balance.moose.startSpeed),
      proj: projectOnTrack(track, x, y),
      distance: -back,
      lapsDone: 0,
      lapTimes: [],
      finished: false,
      finishTime: 0,
      onVerge: false,
      onBarrier: false,
      cordeHits: new Int32Array(line.apexes.length).fill(-1),
      cordeCount: 0,
      lastCordeTick: -1,
      lastContactTick: -1,
      lastStunTick: -100000,
      item: null,
      lastItemTick: -1,
      lastItemUseTick: -1,
      castorHeld: false,
      biefOpen: 0,
      swim: -1,
      onFork: false,
      forkProj: { index: 0, s: 0, d: 0 },
      throttleTick: -1,
      perfectStart: false,
    };
  });
  const race: Race = {
    track,
    balance,
    rng,
    seed,
    tick: 0,
    dt: 1 / balance.sim.hz,
    phase: 'countdown',
    countdownTicks: Math.round(balance.sim.countdownSeconds * balance.sim.hz),
    laps: opts.laps ?? balance.sim.laps,
    racers,
    difficulty: opts.difficulty ?? 'moyen',
    mode: opts.mode ?? 'classique',
    biome: opts.biome,
    weather,
    fork: getFork(track),
    surfaces,
    hazards: null,
    line: lineUsed,
  };
  if (race.mode === 'special') race.hazards = createHazards(race, createRng(seed ^ 0x2545f491));
  return race;
}

/** Temps de course écoulé (s), 0 pendant le compte à rebours. */
export function raceTime(r: Race): number {
  return Math.max(0, r.tick - r.countdownTicks) * r.dt;
}

/** Secondes restantes du compte à rebours. */
export function countdownRemaining(r: Race): number {
  return Math.max(0, r.countdownTicks - r.tick) * r.dt;
}

/**
 * Vent de travers au temps t : vecteur de dérive (m/s) dans le plan de piste.
 * Rafales régulières et direction qui oscille doucement ; même valeur pour tous les participants.
 */
export function windAt(r: Race): { x: number; y: number; gust: number } {
  const w = r.track.def.wind;
  if (!w) return { x: 0, y: 0, gust: 0 };
  const t = raceTime(r);
  const s = Math.sin((2 * Math.PI * t) / w.period);
  const gust = 0.25 + 0.75 * Math.max(0, s) * Math.max(0, s);
  const dir = w.direction + 0.35 * Math.sin(t / 23);
  return { x: Math.cos(dir) * w.strength * gust, y: Math.sin(dir) * w.strength * gust, gust };
}

/** Traversée du bief à la nage, en ligne droite de l'embouchure à la sortie. */
function stepSwim(r: Race, racer: Racer): void {
  const b = r.hazards!.bief!;
  const m = racer.moose;
  racer.swim += BIEF_SWIM_SPEED * r.dt;
  const u = Math.min(1, racer.swim / b.length);
  m.x = b.ax + (b.bx - b.ax) * u;
  m.y = b.ay + (b.by - b.ay) * u;
  m.speed = BIEF_SWIM_SPEED;
  m.sliding = false;
  m.drifting = false;
  if (u >= 1) {
    racer.swim = -1;
    // Sortie : on retrouve la piste à l'embouchure aval, la progression saute la portion évitée.
    const exit = r.track.samples[b.to];
    m.heading = Math.atan2(exit.ty, exit.tx);
    updateProgress(r, racer, projectOnTrack(r.track, m.x, m.y, b.to, 20));
  }
}

/** Surface sous les sabots (piste, bas-côté ou branche de la bifurcation). */
export function surfaceUnder(r: Race, racer: Racer): SurfaceId {
  if (racer.onVerge) return r.track.def.vergeSurface;
  if (racer.onFork && r.fork) return r.fork.samples[racer.forkProj.index].surface;
  return r.track.samples[racer.proj.index].surface;
}

/**
 * Bas-côté : l'herbe freine (l'orignal s'y enfonce), d'autant plus qu'on va vite et qu'on s'éloigne du
 * bord (pleine résistance à 2 m : mordre le bord coûte peu, couper franchement coûte cher). Sans ça, couper un virage par l'herbe intérieure était plus rapide que
 * la ligne de course : l'herbe ne bornait que la vitesse de pointe, bien au-dessus de la vitesse en virage.
 */
function vergeDrag(r: Race, m: MooseState, depth: number): void {
  if (depth <= 0 || m.speed <= 5) return;
  const f = Math.min(1, depth / 2);
  m.speed = Math.max(5, m.speed * (1 - r.balance.barrier.vergeDragPerSecond * f * r.dt));
}

/** Voie d'accès de la bifurcation : 30 m avant l'embranchement et après la jonction, côté branche (pas de résistance). */
function inForkMouth(r: Race, racer: Racer): boolean {
  const f = r.fork;
  if (!f || racer.proj.d * f.side <= 0) return false;
  const L = r.track.length;
  const s = racer.proj.s;
  const toEntry = (r.track.samples[f.from].s - s + L) % L;
  const fromExit = (s - r.track.samples[f.to].s + L) % L;
  return toEntry < 30 || fromExit < 30;
}

/** Départ parfait : fenêtre (s) avant le « Partez ! » et durée de l'élan (s). */
export const PERFECT_START_WINDOW = 0.5;
export const PERFECT_START_BOOST = 1.0;

/** Vent de travers : il pousse l'orignal sur le côté, d'autant plus qu'il court vite et à découvert. */
function applyWind(r: Race, m: MooseState): void {
  if (!r.track.def.wind || r.phase === 'countdown' || m.speed <= 2) return;
  const w = windAt(r);
  const exposure = Math.min(1, m.speed / 15);
  const lat = -w.x * Math.sin(m.heading) + w.y * Math.cos(m.heading);
  m.x += -Math.sin(m.heading) * lat * exposure * r.dt;
  m.y += Math.cos(m.heading) * lat * exposure * r.dt;
}

function stepRacer(r: Race, racer: Racer, cmd: Commands): void {
  const { track } = r;
  const m = racer.moose;
  if (racer.swim >= 0 && r.hazards?.bief) {
    stepSwim(r, racer);
    return;
  }
  if (racer.onFork && r.fork) {
    stepFork(r, racer, cmd);
    return;
  }
  const absD = Math.abs(racer.proj.d);
  racer.onVerge = absD > track.samples[racer.proj.index].hw;
  const surfaceId = racer.onVerge ? track.def.vergeSurface : track.samples[racer.proj.index].surface;
  // Pente vue par l'orignal : celle de la piste, projetée sur son cap.
  const smp = track.samples[racer.proj.index];
  const slope = smp.slope * (Math.cos(m.heading) * smp.tx + Math.sin(m.heading) * smp.ty);
  stepMoose(m, cmd, r.surfaces[surfaceId], racer.params, r.dt, slope);
  if (!inForkMouth(r, racer)) vergeDrag(r, m, absD - track.samples[racer.proj.index].hw);
  applyWind(r, m);

  let proj = projectOnTrack(track, m.x, m.y, racer.proj.index);

  // Barrière souple au bord du bas-côté : repousse et ralentit, n'arrête jamais net.
  const limit = track.samples[proj.index].hw + track.samples[proj.index].verge;
  racer.onBarrier = false;
  if (Math.abs(proj.d) > limit) {
    racer.onBarrier = true;
    pushFromBarrier(r, m, track.samples[proj.index], Math.abs(proj.d) - limit, Math.sign(proj.d));
    proj = projectOnTrack(track, m.x, m.y, proj.index);
  }
  if (r.fork) maybeEnterFork(r, racer, proj);
  updateProgress(r, racer, proj);
}

/** Barrière souple : repousse de `over` vers l'axe, ralentit, ramène le cap vers la tangente. */
function pushFromBarrier(r: Race, m: MooseState, sm: { nx: number; ny: number; tx: number; ty: number }, over: number, sign: number): void {
  m.x -= sm.nx * over * sign;
  m.y -= sm.ny * over * sign;
  m.speed *= Math.max(0, 1 - r.balance.barrier.speedLossPerSecond * r.dt);
  // Ramène le cap vers la tangente si l'orignal pointe vers l'extérieur.
  const outward = (Math.cos(m.heading) * sm.nx + Math.sin(m.heading) * sm.ny) * sign;
  if (outward > 0) {
    const tangentHeading = Math.atan2(sm.ty, sm.tx);
    let dh = tangentHeading - m.heading;
    while (dh > Math.PI) dh -= 2 * Math.PI;
    while (dh < -Math.PI) dh += 2 * Math.PI;
    m.heading += dh * Math.min(1, r.balance.barrier.headingAlignRate * r.dt);
  }
}

/** Embranchement franchi sur le bas-côté, du côté de la branche : l'orignal s'y engage. */
function maybeEnterFork(r: Race, racer: Racer, proj: TrackProjection): void {
  const f = r.fork!;
  const L = r.track.length;
  const sFrom = r.track.samples[f.from].s;
  const before = (sFrom - racer.proj.s + L) % L;
  const step = (proj.s - racer.proj.s + L) % L;
  if (step > L / 2 || before >= step) return;
  if (proj.d * f.side <= r.track.samples[proj.index].hw + FORK_ENTRY_MARGIN) return;
  racer.onFork = true;
  racer.forkProj = projectOnFork(f, racer.moose.x, racer.moose.y);
}

/** Pas d'un orignal engagé sur la branche. */
function stepFork(r: Race, racer: Racer, cmd: Commands): void {
  const { track } = r;
  const f = r.fork!;
  const m = racer.moose;
  const fs = f.samples[racer.forkProj.index];
  racer.onVerge = Math.abs(racer.forkProj.d) > f.hw;
  const surfaceId = racer.onVerge ? track.def.vergeSurface : fs.surface;
  const slope =
    ((f.samples[f.samples.length - 1].z - f.samples[0].z) / f.length) * (Math.cos(m.heading) * fs.tx + Math.sin(m.heading) * fs.ty);
  stepMoose(m, cmd, r.surfaces[surfaceId], racer.params, r.dt, slope);
  vergeDrag(r, m, Math.abs(racer.forkProj.d) - f.hw);
  applyWind(r, m);
  let p = projectOnFork(f, m.x, m.y, racer.forkProj.index);
  const limit = f.hw + f.verge;
  racer.onBarrier = false;
  if (Math.abs(p.d) > limit) {
    racer.onBarrier = true;
    pushFromBarrier(r, m, f.samples[p.index], Math.abs(p.d) - limit, Math.sign(p.d));
    p = projectOnFork(f, m.x, m.y, p.index);
  }
  racer.forkProj = p;
  // Bout de la branche (ou demi-tour jusqu'à l'embranchement) : retour sur la piste.
  if (p.s >= f.length - 0.5 || p.s <= 0.05) {
    racer.onFork = false;
    updateProgress(r, racer, projectOnTrack(track, m.x, m.y, p.s <= 0.05 ? f.from : f.to, 30));
    return;
  }
  const sMain = forkToTrackS(track, f, p.s);
  updateProgress(r, racer, { index: Math.round(sMain / track.spacing) % track.samples.length, s: sMain, d: 0 });
}

function updateProgress(r: Race, racer: Racer, proj: TrackProjection): void {
  const { track, balance } = r;
  const m = racer.moose;
  // Progression le long de la piste, robuste au demi-tour.
  let ds = proj.s - racer.proj.s;
  const L = track.length;
  if (ds < -L / 2) ds += L;
  else if (ds > L / 2) ds -= L;
  racer.distance += ds;
  racer.proj = proj;

  // Corde parfaite : passer dans la zone du point de corde sans déraper.
  if (!m.sliding && m.speed > 5) {
    const n = track.samples.length;
    const half = Math.round(balance.corde.zoneHalfLength / track.spacing);
    const lapNow = Math.floor(racer.distance / L);
    r.line.apexes.forEach((ap, ai) => {
      let di = proj.index - ap.index;
      if (di > n / 2) di -= n;
      else if (di < -n / 2) di += n;
      if (Math.abs(di) > half || racer.cordeHits[ai] === lapNow) return;
      if (Math.abs(proj.d - ap.offset) > balance.corde.lateralTolerance) return;
      racer.cordeHits[ai] = lapNow;
      racer.cordeCount++;
      racer.lastCordeTick = r.tick;
      m.cordeTime = racer.params.cordeSeconds;
    });
  }

  const lapsNow = Math.max(0, Math.floor(racer.distance / L));
  const t = raceTime(r);
  while (lapsNow > racer.lapsDone && !racer.finished) {
    racer.lapsDone++;
    const prev = racer.lapTimes.reduce((a, b) => a + b, 0);
    racer.lapTimes.push(t - prev);
    if (racer.lapsDone >= r.laps) {
      racer.finished = true;
      racer.finishTime = t;
    }
  }
}

/** Aspiration : un orignal juste devant, dans l'axe, à moins de draftDistance mètres. */
function updateDrafting(r: Race): void {
  const dist = r.balance.moose.draftDistance;
  for (const a of r.racers) {
    const ma = a.moose;
    ma.drafting = false;
    if (ma.speed < 10) continue;
    const ch = Math.cos(ma.heading);
    const sh = Math.sin(ma.heading);
    for (const b of r.racers) {
      if (b === a) continue;
      const dx = b.moose.x - ma.x;
      const dy = b.moose.y - ma.y;
      const fwd = dx * ch + dy * sh;
      const lat = -dx * sh + dy * ch;
      if (fwd > 2 && fwd < dist && Math.abs(lat) < 2.5) {
        ma.drafting = true;
        break;
      }
    }
  }
}

/**
 * Contacts entre orignaux : on les sépare selon leur masse (Robustesse), celui qui arrive
 * par derrière perd de la vitesse, l'autre est un peu poussé. Gros choc : étourdissement bref.
 * Jamais d'arrêt net.
 */
function resolveContacts(r: Race): void {
  const c = r.balance.contact;
  const racers = r.racers;
  for (let i = 0; i < racers.length; i++) {
    for (let j = i + 1; j < racers.length; j++) {
      const A = racers[i];
      const B = racers[j];
      if (A.swim >= 0 || B.swim >= 0) continue;
      const a = A.moose;
      const b = B.moose;
      // Gabarit elliptique (long et étroit) dans le repère du cap moyen des deux orignaux.
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      const hx = Math.cos(a.heading) + Math.cos(b.heading);
      const hy = Math.sin(a.heading) + Math.sin(b.heading);
      const hl = Math.hypot(hx, hy) || 1;
      const fx = hx / hl;
      const fy = hy / hl;
      const lon = dx * fx + dy * fy;
      const lat = -dx * fy + dy * fx;
      const L = c.halfLength * (A.size + B.size);
      const W = c.halfWidth * (A.size + B.size);
      const e2 = (lon / L) * (lon / L) + (lat / W) * (lat / W);
      if (e2 >= 1) continue;
      const e = Math.sqrt(e2) || 0.001;
      // Normale de séparation : gradient de l'ellipse, ramené en coordonnées du monde.
      const gl = lon / (L * L);
      const gt = lat / (W * W);
      let nx = gl * fx - gt * fy;
      let ny = gl * fy + gt * fx;
      const nl = Math.hypot(nx, ny) || 1;
      nx /= nl;
      ny /= nl;
      const d = Math.hypot(dx, dy) || 0.001;
      const overlap = d * (1 / e - 1);
      dx = nx;
      dy = ny;
      const ma = A.params.mass;
      const mb = B.params.mass;
      const wa = mb / (ma + mb);
      const wb = ma / (ma + mb);
      a.x -= dx * overlap * wa;
      a.y -= dy * overlap * wa;
      b.x += dx * overlap * wb;
      b.y += dy * overlap * wb;
      // Vitesse de rapprochement le long de la normale.
      const vax = a.speed * Math.cos(a.heading);
      const vay = a.speed * Math.sin(a.heading);
      const vbx = b.speed * Math.cos(b.heading);
      const vby = b.speed * Math.sin(b.heading);
      const closing = (vax - vbx) * dx + (vay - vby) * dy;
      if (closing <= 0) continue;
      const keepA = a.speed * c.minSpeedKeep;
      const keepB = b.speed * c.minSpeedKeep;
      // Projection de la normale sur le cap de chacun : qui pousse, qui est poussé.
      const pa = Math.cos(a.heading) * dx + Math.sin(a.heading) * dy;
      const pb = Math.cos(b.heading) * dx + Math.sin(b.heading) * dy;
      a.speed = Math.max(keepA, a.speed - closing * c.speedTransfer * wa * Math.max(0.2, pa));
      b.speed = Math.max(keepB, b.speed + closing * c.speedTransfer * wb * 0.5 * Math.max(0, pb));
      if (closing > c.stunClosingSpeed) {
        const cooldown = Math.round(c.stunCooldown / r.dt);
        for (const [R, M] of [
          [A, a],
          [B, b],
        ] as const) {
          if (M.shieldTime > 0) {
            // La hutte repousse le choc.
            M.shieldTime = 0;
            continue;
          }
          if (r.tick - R.lastStunTick < cooldown) continue;
          M.stunTime = Math.max(M.stunTime, R.params.stunSeconds * c.stunFraction);
          R.lastStunTick = r.tick;
        }
      }
      A.lastContactTick = r.tick;
      B.lastContactTick = r.tick;
    }
  }
  // Les positions ont bougé : on met à jour la projection sur la piste.
  for (const R of racers) {
    if (R.lastContactTick !== r.tick) continue;
    const proj = projectOnTrack(r.track, R.moose.x, R.moose.y, R.proj.index);
    updateProgress(r, R, proj);
  }
}

/** Avance la course d'un pas. `commands[i]` pilote `racers[i]` (ignoré pour les bots). */
export function stepRace(r: Race, commands: Commands[]): void {
  r.tick++;
  if (r.phase === 'countdown') {
    // Départ parfait : accélérateur enfoncé dans la dernière demi-seconde (pas avant) → élan au départ.
    for (let i = 0; i < r.racers.length; i++) {
      const racer = r.racers[i];
      if (racer.bot) continue;
      if ((commands[i]?.throttle ?? 0) > 0) {
        if (racer.throttleTick < 0) racer.throttleTick = r.tick;
      } else racer.throttleTick = -1;
    }
    if (r.tick >= r.countdownTicks) {
      r.phase = 'running';
      const window = PERFECT_START_WINDOW * r.balance.sim.hz;
      for (const racer of r.racers) {
        const perfect = racer.bot
          ? r.rng.next() < 0.1 + 0.4 * racer.bot.talent
          : racer.throttleTick >= 0 && r.countdownTicks - racer.throttleTick <= window;
        if (perfect) {
          racer.perfectStart = true;
          racer.moose.boostTime = Math.max(racer.moose.boostTime, PERFECT_START_BOOST);
        }
      }
    }
    return;
  }
  updateDrafting(r);
  const finishedPhase = r.phase === 'finished';
  for (let i = 0; i < r.racers.length; i++) {
    const racer = r.racers[i];
    let cmd: Commands;
    if (racer.bot) cmd = botCommand(r, racer);
    else if (finishedPhase) cmd = { ...NO_COMMANDS, steer: commands[i]?.steer ?? 0, brake: 0.3 };
    else cmd = commands[i] ?? NO_COMMANDS;
    if (r.hazards) {
      const wants = racer.bot ? botWantsItem(r, r.hazards, racer) : cmd.castor && !racer.castorHeld;
      racer.castorHeld = cmd.castor;
      if (wants) useItem(r, r.hazards, racer);
    }
    stepRacer(r, racer, cmd);
  }
  if (r.hazards) stepHazards(r, r.hazards);
  if (r.racers.length > 1) resolveContacts(r);
  if (!finishedPhase && r.racers[0].finished) r.phase = 'finished';
}

/** Classement courant : indices des participants, du premier au dernier. */
export function standings(r: Race): number[] {
  return r.racers
    .map((_, i) => i)
    .sort((a, b) => {
      const A = r.racers[a];
      const B = r.racers[b];
      if (A.finished && B.finished) return A.finishTime - B.finishTime;
      if (A.finished) return -1;
      if (B.finished) return 1;
      return B.distance - A.distance;
    });
}

/** Rang (1 = premier) du participant d'indice i. */
export function rankOf(r: Race, i: number): number {
  return standings(r).indexOf(i) + 1;
}

/**
 * Temps final estimé pour un participant qui n'a pas encore fini : distance restante
 * à sa vitesse moyenne jusqu'ici (sert à afficher le classement à l'arrivée du joueur).
 */
export function estimatedFinishTime(r: Race, racer: Racer): number {
  if (racer.finished) return racer.finishTime;
  const t = raceTime(r);
  const total = r.laps * r.track.length;
  const avg = racer.distance > 0 && t > 0 ? racer.distance / t : 20;
  return t + Math.max(0, total - racer.distance) / Math.max(5, avg);
}
