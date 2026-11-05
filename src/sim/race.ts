/**
 * Course : piste + participants + chronométrage, avancée à pas fixe.
 * Déterministe : même graine + mêmes commandes ⇒ même résultat.
 */
import type { Balance } from '../data';
import { createMooseState, NO_COMMANDS, stepMoose, type Commands, type MooseState } from './moose';
import { getRacingLine, type RacingLine } from './racingLine';
import { createRng, type Rng } from './rng';
import { buildTrack, projectOnTrack, type Track, type TrackDef, type TrackProjection } from './track';

export type RacePhase = 'countdown' | 'running' | 'finished';

export interface Racer {
  id: number;
  name: string;
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
  /** Ligne de course du circuit (ligne idéale, points de corde, profil de vitesse). */
  line: RacingLine;
}

export interface RaceOptions {
  seed?: number;
  laps?: number;
  racerCount?: number;
}

export function createRace(def: TrackDef, balance: Balance, opts: RaceOptions = {}): Race {
  const track = buildTrack(def, 1);
  const line = getRacingLine(track, balance.moose, balance.surfaces);
  const seed = opts.seed ?? 1;
  const count = opts.racerCount ?? 1;
  const racers: Racer[] = [];
  for (let i = 0; i < count; i++) {
    // Grille en quinconce derrière la ligne : 2 colonnes, 8 m entre rangées.
    const row = Math.floor(i / 2);
    const col = i % 2;
    const back = 6 + row * 8 + col * 4;
    const lateral = count === 1 ? 0 : (col === 0 ? 1 : -1) * track.samples[track.samples.length - Math.round(back / track.spacing)].hw * 0.4;
    const s0 = track.samples[track.samples.length - Math.round(back / track.spacing)];
    const x = s0.x + s0.nx * lateral;
    const y = s0.y + s0.ny * lateral;
    const heading = Math.atan2(s0.ty, s0.tx);
    const moose = createMooseState(x, y, heading, balance.moose.startSpeed);
    const proj = projectOnTrack(track, x, y);
    racers.push({
      id: i,
      name: i === 0 ? 'Joueur' : `Bot ${i}`,
      moose,
      proj,
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
    });
  }
  return {
    track,
    balance,
    rng: createRng(seed),
    seed,
    tick: 0,
    dt: 1 / balance.sim.hz,
    phase: 'countdown',
    countdownTicks: Math.round(balance.sim.countdownSeconds * balance.sim.hz),
    laps: opts.laps ?? balance.sim.laps,
    racers,
    line,
  };
}

/** Temps de course écoulé (s), 0 pendant le compte à rebours. */
export function raceTime(r: Race): number {
  return Math.max(0, r.tick - r.countdownTicks) * r.dt;
}

/** Secondes restantes du compte à rebours. */
export function countdownRemaining(r: Race): number {
  return Math.max(0, r.countdownTicks - r.tick) * r.dt;
}

function stepRacer(r: Race, racer: Racer, cmd: Commands): void {
  const { track, balance } = r;
  const m = racer.moose;
  const absD = Math.abs(racer.proj.d);
  racer.onVerge = absD > track.samples[racer.proj.index].hw;
  const surfaceId = racer.onVerge ? track.def.vergeSurface : track.samples[racer.proj.index].surface;
  stepMoose(m, cmd, balance.surfaces[surfaceId], balance.moose, r.dt);

  let proj = projectOnTrack(track, m.x, m.y, racer.proj.index);

  // Barrière souple au bord du bas-côté : repousse et ralentit, n'arrête jamais net.
  const limit = track.samples[proj.index].hw + track.def.verge;
  racer.onBarrier = false;
  if (Math.abs(proj.d) > limit) {
    racer.onBarrier = true;
    const sm = track.samples[proj.index];
    const over = Math.abs(proj.d) - limit;
    const sign = Math.sign(proj.d);
    m.x -= sm.nx * over * sign;
    m.y -= sm.ny * over * sign;
    m.speed *= Math.max(0, 1 - balance.barrier.speedLossPerSecond * r.dt);
    // Ramène le cap vers la tangente si l'orignal pointe vers l'extérieur.
    const outward = (Math.cos(m.heading) * sm.nx + Math.sin(m.heading) * sm.ny) * sign;
    if (outward > 0) {
      const tangentHeading = Math.atan2(sm.ty, sm.tx);
      let dh = tangentHeading - m.heading;
      while (dh > Math.PI) dh -= 2 * Math.PI;
      while (dh < -Math.PI) dh += 2 * Math.PI;
      m.heading += dh * Math.min(1, balance.barrier.headingAlignRate * r.dt);
    }
    proj = projectOnTrack(track, m.x, m.y, proj.index);
  }

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
      m.cordeTime = balance.moose.cordeSeconds;
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

/** Avance la course d'un pas. `commands[i]` pilote `racers[i]`. */
export function stepRace(r: Race, commands: Commands[]): void {
  r.tick++;
  if (r.phase === 'countdown') {
    if (r.tick >= r.countdownTicks) r.phase = 'running';
    return;
  }
  if (r.phase === 'finished') {
    // Après l'arrivée, les orignaux continuent en roue libre (pour le rendu).
    for (let i = 0; i < r.racers.length; i++) stepRacer(r, r.racers[i], { ...NO_COMMANDS, steer: commands[i]?.steer ?? 0, brake: 0.3 });
    return;
  }
  updateDrafting(r);
  for (let i = 0; i < r.racers.length; i++) {
    const racer = r.racers[i];
    stepRacer(r, racer, commands[i] ?? NO_COMMANDS);
  }
  if (r.racers[0].finished) r.phase = 'finished';
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
