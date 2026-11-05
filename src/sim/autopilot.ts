/**
 * Pilote automatique « poursuite pure » sur une ligne décalée de la ligne centrale.
 * Sert aux tests, à l'équilibrage sans rendu et, plus tard, de base aux bots.
 */
import { steerCurvatureRange, type Commands, type MooseParams, type SurfaceParams } from './moose';
import type { Racer } from './race';
import type { Track } from './track';

export interface AutopilotOptions {
  /** Décalage latéral constant de la ligne visée (m), positif à gauche. */
  offset?: number;
  /** Fonction de décalage selon l'indice d'échantillon (prioritaire sur offset). */
  offsetAt?: (index: number) => number;
  lookAheadBase?: number;
  lookAheadPerSpeed?: number;
  /** Faux : accélère tout le temps, sans jamais freiner (pilote « naïf » des tests). */
  brakes?: boolean;
  /** Part de l'adhérence visée en virage (1 = à la limite). */
  cornerMargin?: number;
  /** Ligne et profil de vitesse à suivre (par exemple la ligne de course). */
  line?: { offset: Float64Array; speed: Float64Array };
}

/** Vitesse cible d'après un profil précalculé : on freine à temps pour chaque point à venir. */
export function targetSpeedFromProfile(track: Track, racer: Racer, p: MooseParams, profile: Float64Array): number {
  const n = track.samples.length;
  const decel = p.brakeDecel * 0.75;
  let target = Infinity;
  const steps = Math.round(150 / track.spacing);
  for (let j = 0; j <= steps; j += 2) {
    const v = profile[(racer.proj.index + j) % n];
    const dist = Math.max(0, j * track.spacing - 3);
    const vNow = Math.sqrt(v * v + 2 * decel * dist);
    if (vNow < target) target = vNow;
  }
  return target;
}

/**
 * Vitesse cible : la plus faible, sur les 150 m à venir, des vitesses qui permettent encore
 * de passer chaque point à sa vitesse limite sqrt(a_lat × R) en freinant à temps.
 */
export function targetSpeed(track: Track, racer: Racer, p: MooseParams, surface: SurfaceParams, margin = 1): number {
  const n = track.samples.length;
  const aLat = p.aLat * surface.grip * margin;
  const decel = p.brakeDecel * 0.75;
  let target = Infinity;
  const steps = Math.round(150 / track.spacing);
  for (let j = 0; j <= steps; j += 2) {
    const s = track.samples[(racer.proj.index + j) % n];
    const k = Math.abs(s.k);
    if (k < 1e-4) continue;
    const vLimit = Math.sqrt(aLat / k);
    const dist = Math.max(0, j * track.spacing - 4);
    const vNow = Math.sqrt(vLimit * vLimit + 2 * decel * dist);
    if (vNow < target) target = vNow;
  }
  return target;
}

export function autopilot(
  track: Track,
  racer: Racer,
  p: MooseParams,
  surface: SurfaceParams,
  opts: AutopilotOptions = {},
): Commands {
  const m = racer.moose;
  const n = track.samples.length;
  const L = (opts.lookAheadBase ?? 6) + (opts.lookAheadPerSpeed ?? 0.45) * m.speed;
  const idx = (racer.proj.index + Math.round(L / track.spacing)) % n;
  const s = track.samples[idx];
  const off = opts.line ? opts.line.offset[idx] : opts.offsetAt ? opts.offsetAt(idx) : (opts.offset ?? 0);
  const tx = s.x + s.nx * off;
  const ty = s.y + s.ny * off;
  const dx = tx - m.x;
  const dy = ty - m.y;
  const ch = Math.cos(m.heading);
  const sh = Math.sin(m.heading);
  const fwd = dx * ch + dy * sh;
  const left = -dx * sh + dy * ch;
  const d2 = dx * dx + dy * dy;
  // Courbure de l'arc qui rejoint le point visé : 2·y / d².
  const range = steerCurvatureRange(m.speed, surface, p);
  const k = fwd < -1 ? Math.sign(left || 1) * range : (2 * left) / Math.max(d2, 1);
  const steer = Math.max(-1, Math.min(1, k / range));

  let throttle = 1;
  let brake = 0;
  if (opts.brakes !== false) {
    const vt = opts.line ? targetSpeedFromProfile(track, racer, p, opts.line.speed) : targetSpeed(track, racer, p, surface, opts.cornerMargin);
    if (m.speed > vt + 0.3) {
      throttle = 0;
      brake = Math.min(1, (m.speed - vt) / 3);
    } else if (m.speed > vt - 1) {
      throttle = 0.4;
    }
  }
  return { steer, throttle, brake, gallop: false, slide: false, castor: false };
}
