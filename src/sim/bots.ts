/**
 * Bots : ils suivent la ligne de course avec une erreur propre selon leur talent,
 * ratent parfois un virage, dépassent, galopent dans les lignes droites.
 * Même physique que le joueur. Seule aide : un rattrapage léger (≤ 3 %) selon la difficulté.
 */
import { autopilot, targetSpeedFromProfile } from './autopilot';
import type { Commands } from './moose';
import { bearAvoidance } from './hazards';
import { forkApproachOffset, forkPursuit } from './fork';
import type { Race, Racer } from './race';
import type { Rng } from './rng';

export interface BotBrain {
  /** 0 = maladroit, 1 = parfait. */
  talent: number;
  phaseA: number;
  phaseB: number;
  /** Décalage de dépassement en cours (m) et sa cible. */
  lane: number;
  laneTarget: number;
  /** Point de corde pour lequel le tirage d'erreur a été fait, et résultat. */
  rolledApex: number;
  rolledLap: number;
  mistake: boolean;
  /** Le bot galope dans cette ligne droite. */
  gallopPlan: boolean;
  /** Tour pour lequel le choix de la bifurcation a été tiré, et choix. */
  forkLap: number;
  takeFork: boolean;
}

export function createBotBrain(talent: number, rng: Rng): BotBrain {
  return {
    talent,
    phaseA: rng.range(0, Math.PI * 2),
    phaseB: rng.range(0, Math.PI * 2),
    lane: 0,
    laneTarget: 0,
    rolledApex: -1,
    rolledLap: -1,
    mistake: false,
    gallopPlan: false,
    forkLap: -1,
    takeFork: false,
  };
}

export function botCommand(r: Race, racer: Racer): Commands {
  const brain = racer.bot!;
  const { track, balance, line } = r;
  const cfg = balance.bots;
  const n = track.samples.length;
  const m = racer.moose;
  const t = brain.talent;

  // Après l'arrivée : le bot finit au trot.
  if (racer.finished) {
    const cmd = autopilot(track, racer, racer.params, balance.surfaces.sentier, {
      line: { offset: line.offset, speed: racer.profile },
      speedTarget: 12,
    });
    return cmd;
  }

  // Bifurcation : sur la branche, poursuite de son axe ; avant l'embranchement, un tirage par tour
  // (les plus talentueux la prennent plus souvent).
  const fork = r.fork;
  if (fork && racer.onFork) return forkPursuit(fork, racer, racer.params, r.surfaces, cfg.cornerMarginMin + (1 - cfg.cornerMarginMin) * t);
  if (fork) {
    const lapF = Math.floor(racer.distance / track.length);
    const ahead = (track.samples[fork.from].s - racer.proj.s + track.length) % track.length;
    if (ahead < 150 && brain.forkLap !== lapF) {
      brain.forkLap = lapF;
      brain.takeFork = r.rng.next() < 0.2 + 0.5 * t;
    }
  }

  // Dépassement : un orignal juste devant, presque dans l'axe → on se décale du côté libre.
  // S'il n'y a pas encore la place, on reste derrière sans le percuter.
  brain.laneTarget = 0;
  let followSpeed = Infinity;
  for (const o of r.racers) {
    if (o === racer || o.onFork) continue;
    const gap = o.distance - racer.distance;
    if (gap <= 0 || gap > cfg.overtakeDistance) continue;
    const lat = o.proj.d - racer.proj.d;
    if (Math.abs(lat) > 3) continue;
    const s = track.samples[racer.proj.index];
    const roomLeft = s.hw - o.proj.d;
    const roomRight = o.proj.d + s.hw;
    const side = roomLeft > roomRight ? 1 : -1;
    // Décalage visé par rapport à l'orignal à doubler, pas par rapport à la ligne.
    const want = o.proj.d + side * cfg.overtakeShift;
    brain.laneTarget = Math.max(-8, Math.min(8, want - line.offset[racer.proj.index]));
    // Plancher à 3 m/s : derrière un orignal arrêté (joueur immobile sur la grille), le bot avance
    // au pas le temps de se décaler, au lieu de rester bloqué (un orignal ne se déplace pas de côté à l'arrêt).
    if (gap < 5 && Math.abs(lat) < cfg.followLateral) followSpeed = Math.min(followSpeed, Math.max(3, o.moose.speed + (gap - 3.5) * 0.5));
  }
  // Évitement : un orignal à côté (même hauteur) → on s'écarte de lui.
  for (const o of r.racers) {
    if (o === racer || o.onFork) continue;
    const gap = Math.abs(o.distance - racer.distance);
    if (gap > 5) continue;
    const lat = racer.proj.d - o.proj.d;
    if (Math.abs(lat) > 3.6) continue;
    const away = (lat >= 0 ? 1 : -1) * (3.6 - Math.abs(lat));
    brain.laneTarget = Math.max(-8, Math.min(8, brain.laneTarget + away));
  }
  // Mode spécial : on s'écarte d'un ours annoncé, d'autant mieux qu'on est talentueux.
  if (r.hazards) brain.laneTarget = Math.max(-8, Math.min(8, brain.laneTarget + bearAvoidance(r, r.hazards, racer) * (0.5 + 0.5 * t)));
  const laneRate = 2.5 * r.dt;
  brain.lane += Math.max(-laneRate, Math.min(laneRate, brain.laneTarget - brain.lane));

  // Erreur de trajectoire propre au bot : bruit lent le long de la piste.
  const amp = cfg.noiseAmplitude * (1 - t);
  const lineOffsetAt = (i: number) => {
    const s = track.samples[i];
    const sPos = s.s;
    const noise = (Math.sin(brain.phaseA + sPos * 0.013) + 0.5 * Math.sin(brain.phaseB + sPos * 0.031)) / 1.5;
    const o = line.offset[i] + noise * amp + brain.lane;
    const lim = Math.max(0, s.hw - 1.6);
    return Math.max(-lim, Math.min(lim, o));
  };
  // Vers l'embouchure de la branche si le bot a choisi de la prendre (hors des limites de la piste).
  const offsetAt = (i: number) => {
    const base = lineOffsetAt(i);
    if (!fork || !brain.takeFork) return base;
    return forkApproachOffset(track, fork, track.samples[i].s, base) ?? base;
  };

  // Tirage d'erreur une fois par virage et par tour : entrer trop vite.
  const lap = Math.floor(racer.distance / track.length);
  let nextApex = -1;
  let best = Infinity;
  line.apexes.forEach((ap, ai) => {
    let di = ap.index - racer.proj.index;
    if (di < 0) di += n;
    if (di < best) {
      best = di;
      nextApex = ai;
    }
  });
  if (nextApex >= 0 && best * track.spacing < 70 && (brain.rolledApex !== nextApex || brain.rolledLap !== lap)) {
    brain.rolledApex = nextApex;
    brain.rolledLap = lap;
    brain.mistake = r.rng.next() < cfg.mistakeChance * (1 - t);
  }

  // Vitesse visée : profil de la ligne, avec une marge selon le talent, et l'erreur éventuelle.
  let margin = cfg.cornerMarginMin + (1 - cfg.cornerMarginMin) * t;
  if (brain.mistake) margin += cfg.mistakeSpeedBonus;
  const target = Math.min(followSpeed, targetSpeedFromProfile(track, racer, racer.params, racer.profile) * margin);

  // Rattrapage léger, nul en Difficile.
  const catchUp = balance.difficulties[r.difficulty].catchUp;
  const player = r.racers[0];
  if (catchUp > 0 && player && player !== racer) {
    const behind = (player.distance - racer.distance) / cfg.catchUpRange;
    m.extraSpeedMul = 1 + Math.max(-1, Math.min(1, behind)) * catchUp;
  } else m.extraSpeedMul = 1;

  const cmd = autopilot(track, racer, racer.params, balance.surfaces.sentier, {
    offsetAt,
    speedTarget: target,
  });

  // Galop : dans une ligne droite, endurance pleine, si le profil reste au maximum devant.
  if (!brain.gallopPlan && m.endurance >= 0.99 && m.speed > racer.params.topSpeed * 0.9) {
    let straight = true;
    const steps = Math.round(90 / track.spacing);
    for (let j = 0; j <= steps && straight; j += 3)
      if (racer.profile[(racer.proj.index + j) % n] < racer.params.topSpeed * 0.97) straight = false;
    brain.gallopPlan = straight && r.rng.next() < 0.02 + 0.08 * t;
  }
  if (brain.gallopPlan) {
    const ahead = racer.profile[(racer.proj.index + Math.round(40 / track.spacing)) % n];
    if (m.exhausted || ahead < racer.params.topSpeed * 0.9) brain.gallopPlan = false;
  }
  cmd.gallop = brain.gallopPlan;
  return cmd;
}
