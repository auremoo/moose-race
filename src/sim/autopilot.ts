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
  const off = opts.offsetAt ? opts.offsetAt(idx) : (opts.offset ?? 0);
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
  return { steer, gallop: false, slide: false, castor: false };
}
