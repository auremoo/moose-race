/**
 * Bifurcation risquée : une branche étroite qui quitte la piste par le bas-côté intérieur et la
 * rejoint plus loin. Plus courte, mais en surface lente (racines, boue) et sans marge d'erreur.
 * On y entre en franchissant l'embranchement sur le bas-côté, du côté de la branche : la ligne de
 * course ne passe jamais là, on ne s'y retrouve donc pas par accident.
 *
 * La progression sur la branche est ramenée à celle de la portion de piste évitée : finir la
 * branche compte comme avoir couvert cette portion.
 */
import { steerCurvatureRange, type Commands, type MooseParams, type SurfaceParams } from './moose';
import type { Racer } from './race';
import type { SurfaceId, Track } from './track';

export interface ForkDef {
  /** Fractions du tour de l'embranchement et de la jonction. */
  from: number;
  to: number;
  /** Largeur de la branche (m). */
  width: number;
  surface: SurfaceId;
  /** Courbure de la branche : longueur des tangentes de Bézier en fraction de la corde (0.4 par défaut). */
  bend?: number;
  /** Portions d'une autre surface, en fractions de la branche (par exemple une flaque de boue). */
  zones?: { from: number; to: number; surface: SurfaceId }[];
}

export interface ForkSample {
  x: number;
  y: number;
  tx: number;
  ty: number;
  nx: number;
  ny: number;
  /** Courbure signée (1/m). */
  k: number;
  s: number;
  z: number;
  surface: SurfaceId;
}

export interface Fork {
  def: ForkDef;
  /** Indices d'échantillon de la piste à l'embranchement et à la jonction. */
  from: number;
  to: number;
  /** Côté de la branche par rapport à la piste (+1 à gauche). */
  side: number;
  samples: ForkSample[];
  length: number;
  /** Longueur de la portion de piste évitée (m). */
  span: number;
  hw: number;
  /** Bas-côté de la branche (m), au-delà : barrière. */
  verge: number;
}

export interface ForkProjection {
  index: number;
  s: number;
  d: number;
}

/** Distance latérale minimale, au-delà du bord de piste, pour prendre la branche. */
export const FORK_ENTRY_MARGIN = 0.5;
/** Recul de l'axe de la branche par rapport au bord de piste, aux deux bouts. */
const MOUTH = 2.5;

const cache = new WeakMap<Track, Fork | null>();

export function getFork(track: Track): Fork | null {
  if (cache.has(track)) return cache.get(track)!;
  const f = track.def.fork ? buildFork(track, track.def.fork) : null;
  cache.set(track, f);
  return f;
}

function buildFork(track: Track, def: ForkDef): Fork {
  const S = track.samples;
  const n = S.length;
  const from = Math.round(def.from * n) % n;
  const to = Math.round(def.to * n) % n;
  const a = S[from];
  const b = S[to];
  // Côté intérieur : celui vers lequel se trouve la jonction.
  const side = (b.x - a.x) * a.nx + (b.y - a.y) * a.ny >= 0 ? 1 : -1;
  const ax = a.x + a.nx * side * (a.hw + MOUTH);
  const ay = a.y + a.ny * side * (a.hw + MOUTH);
  const bx = b.x + b.nx * side * (b.hw + MOUTH);
  const by = b.y + b.ny * side * (b.hw + MOUTH);
  const c = Math.hypot(bx - ax, by - ay) * (def.bend ?? 0.4);
  const p1x = ax + a.tx * c;
  const p1y = ay + a.ty * c;
  const p2x = bx - b.tx * c;
  const p2y = by - b.ty * c;
  // Bézier cubique échantillonnée finement, puis rééchantillonnée tous les mètres.
  const fine: [number, number][] = [];
  const N = 600;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const u = 1 - t;
    fine.push([
      u * u * u * ax + 3 * u * u * t * p1x + 3 * u * t * t * p2x + t * t * t * bx,
      u * u * u * ay + 3 * u * u * t * p1y + 3 * u * t * t * p2y + t * t * t * by,
    ]);
  }
  const cum = [0];
  for (let i = 1; i < fine.length; i++) cum.push(cum[i - 1] + Math.hypot(fine[i][0] - fine[i - 1][0], fine[i][1] - fine[i - 1][1]));
  const length = cum[cum.length - 1];
  const count = Math.max(2, Math.round(length));
  const pts: [number, number][] = [];
  let j = 0;
  for (let i = 0; i <= count; i++) {
    const s = (i / count) * length;
    while (j < cum.length - 2 && cum[j + 1] < s) j++;
    const f = (s - cum[j]) / Math.max(1e-9, cum[j + 1] - cum[j]);
    pts.push([fine[j][0] + (fine[j + 1][0] - fine[j][0]) * f, fine[j][1] + (fine[j + 1][1] - fine[j][1]) * f]);
  }
  const samples: ForkSample[] = pts.map((p, i) => {
    const q0 = pts[Math.max(0, i - 1)];
    const q1 = pts[Math.min(pts.length - 1, i + 1)];
    const h = Math.atan2(q1[1] - q0[1], q1[0] - q0[0]);
    const tx = Math.cos(h);
    const ty = Math.sin(h);
    const u = i / count;
    const zone = def.zones?.find((zz) => u >= zz.from && u < zz.to);
    return {
      x: p[0],
      y: p[1],
      tx,
      ty,
      nx: -ty,
      ny: tx,
      k: 0,
      s: (i / count) * length,
      z: a.z + (b.z - a.z) * u,
      surface: zone?.surface ?? def.surface,
    };
  });
  // Courbure par différence des caps.
  for (let i = 1; i < samples.length - 1; i++) {
    let dh = Math.atan2(samples[i + 1].ty, samples[i + 1].tx) - Math.atan2(samples[i - 1].ty, samples[i - 1].tx);
    while (dh > Math.PI) dh -= 2 * Math.PI;
    while (dh < -Math.PI) dh += 2 * Math.PI;
    samples[i].k = dh / (samples[i + 1].s - samples[i - 1].s);
  }
  let span = b.s - a.s;
  if (span < 0) span += track.length;
  return { def, from, to, side, samples, length, span, hw: def.width / 2, verge: 1.5 };
}

/** Projection sur l'axe de la branche (segment le plus proche, recherche autour de `hint`). */
export function projectOnFork(f: Fork, x: number, y: number, hint = -1): ForkProjection {
  const S = f.samples;
  const lo = hint < 0 ? 0 : Math.max(0, hint - 25);
  const hi = hint < 0 ? S.length - 2 : Math.min(S.length - 2, hint + 25);
  let best = { index: 0, s: 0, d: 0 };
  let bestD2 = Infinity;
  for (let i = lo; i <= hi; i++) {
    const a = S[i];
    const b = S[i + 1];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const len2 = ex * ex + ey * ey || 1;
    const u = Math.max(0, Math.min(1, ((x - a.x) * ex + (y - a.y) * ey) / len2));
    const px = a.x + ex * u;
    const py = a.y + ey * u;
    const d2 = (x - px) ** 2 + (y - py) ** 2;
    if (d2 < bestD2) {
      bestD2 = d2;
      const d = (x - px) * a.nx + (y - py) * a.ny;
      best = { index: u > 0.5 ? i + 1 : i, s: a.s + (b.s - a.s) * u, d };
    }
  }
  return best;
}

/** Abscisse de piste équivalente à l'abscisse `s` sur la branche. */
export function forkToTrackS(track: Track, f: Fork, s: number): number {
  const s0 = track.samples[f.from].s;
  return (s0 + (Math.min(s, f.length) / f.length) * f.span) % track.length;
}

/**
 * Pilotage « poursuite pure » sur l'axe de la branche, avec freinage avant les courbes et les
 * changements de surface. Sert aux bots et aux tests.
 */
export function forkPursuit(f: Fork, racer: Racer, p: MooseParams, surfaces: Record<SurfaceId, SurfaceParams>, margin = 1): Commands {
  const m = racer.moose;
  const S = f.samples;
  const i0 = racer.forkProj.index;
  const L = 5 + 0.45 * m.speed;
  const tgt = S[Math.min(S.length - 1, i0 + Math.round(L))];
  const dx = tgt.x - m.x;
  const dy = tgt.y - m.y;
  const ch = Math.cos(m.heading);
  const sh = Math.sin(m.heading);
  const left = -dx * sh + dy * ch;
  const range = steerCurvatureRange(m.speed, surfaces[S[i0].surface], p);
  const steer = Math.max(-1, Math.min(1, (2 * left) / Math.max(dx * dx + dy * dy, 1) / range));
  const decel = p.brakeDecel * 0.75;
  let vt = Infinity;
  for (let j = 0; j <= 80 && i0 + j < S.length; j += 2) {
    const s = S[i0 + j];
    const sf = surfaces[s.surface];
    const k = Math.abs(s.k);
    const vLim = Math.min(p.topSpeed * sf.vmax, k > 1e-4 ? Math.sqrt((p.aLat * sf.grip * margin) / k) : Infinity);
    vt = Math.min(vt, Math.sqrt(vLim * vLim + 2 * decel * Math.max(0, j - 3)));
  }
  let throttle = 1;
  let brake = 0;
  if (m.speed > vt + 0.3) {
    throttle = 0;
    brake = Math.min(1, (m.speed - vt) / 3);
  } else if (m.speed > vt - 1) throttle = 0.4;
  return { steer, throttle, brake, gallop: false, slide: false, castor: false };
}

/** Décalage latéral (m) qui mène à l'embouchure de la branche, ou null si elle est loin devant. */
export function forkApproachOffset(track: Track, f: Fork, s: number, lineOffset: number): number | null {
  const sFrom = track.samples[f.from].s;
  const ahead = (sFrom - s + track.length) % track.length;
  // Approche courte (45 m) : plus longue, elle commençait dans la chicane qui précède, où le bas-côté
  // étroit empêche de se décaler, et les bots arrivaient trop près de la piste pour s'engager.
  if (ahead > 45) return null;
  const mouth = f.side * (track.samples[f.from].hw + 3);
  const u = Math.min(1, (45 - ahead) / 30);
  return lineOffset + (mouth - lineOffset) * u * u * (3 - 2 * u);
}
