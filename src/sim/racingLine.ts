/**
 * Ligne de course : trajectoire à courbure minimale dans les limites du sentier
 * (entrée large, corde, sortie large), et profil de vitesse associé.
 * Calculée une fois par circuit, sans aléa : sert à la ligne idéale affichée, aux zones
 * de corde, au pilote automatique et plus tard aux bots.
 */
import type { MooseParams, SurfaceParams } from './moose';
import type { SurfaceId, Track } from './track';

export interface Apex {
  /** Indice d'échantillon du point de corde. */
  index: number;
  /** Écart latéral du point de corde (m), côté intérieur. */
  offset: number;
  /** +1 virage à gauche, -1 à droite. */
  side: number;
}

export interface RacingLine {
  /** Écart latéral de la ligne par échantillon (m), positif à gauche. */
  offset: Float64Array;
  x: Float64Array;
  y: Float64Array;
  /** Courbure de la ligne (1/m). */
  k: Float64Array;
  /** Vitesse cible par échantillon (m/s). */
  speed: Float64Array;
  apexes: Apex[];
}

/** Demi-largeur de l'orignal plus une petite marge : la ligne ne frôle pas le bord. */
const EDGE_MARGIN = 0.7;

const cache = new WeakMap<Track, RacingLine>();

export function getRacingLine(track: Track, p: MooseParams, surfaces: Record<SurfaceId, SurfaceParams>): RacingLine {
  let line = cache.get(track);
  if (!line) {
    line = computeRacingLine(track, p, surfaces);
    cache.set(track, line);
  }
  return line;
}

export function computeRacingLine(track: Track, p: MooseParams, surfaces: Record<SurfaceId, SurfaceParams>): RacingLine {
  const S = track.samples;
  const n = S.length;
  const off = new Float64Array(n);
  const lo = new Float64Array(n);
  const hi = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const m = Math.max(0, S[i].hw - EDGE_MARGIN);
    lo[i] = -m;
    hi[i] = m;
  }
  const px = (i: number) => {
    const s = S[(i + n) % n];
    return s.x + s.nx * off[(i + n) % n];
  };
  const py = (i: number) => {
    const s = S[(i + n) % n];
    return s.y + s.ny * off[(i + n) % n];
  };

  // Relaxation multi-échelle : chaque point est tiré vers le milieu de ses voisins à distance k,
  // ce qui redresse la trajectoire, dans les limites du sentier.
  const step = track.spacing;
  for (const scaleM of [40, 24, 14, 8, 4, 2]) {
    const k = Math.max(1, Math.round(scaleM / step));
    for (let iter = 0; iter < 60; iter++) {
      for (let i = 0; i < n; i++) {
        const mx = 0.5 * (px(i - k) + px(i + k));
        const my = 0.5 * (py(i - k) + py(i + k));
        const s = S[i];
        const target = (mx - s.x) * s.nx + (my - s.y) * s.ny;
        let o = off[i] + 0.7 * (target - off[i]);
        if (o < lo[i]) o = lo[i];
        else if (o > hi[i]) o = hi[i];
        off[i] = o;
      }
    }
  }

  const x = new Float64Array(n);
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = px(i);
    y[i] = py(i);
  }

  // Courbure de la ligne : variation de cap sur ±2 échantillons, lissée sur ±10 m. Un lissage court (±3)
  // gardait des pics là où la ligne s'enroule sur le bord intérieur : le profil freinait pour rien et la
  // ligne était battue de 3 % en moyenne par un pilote qui visait la courbure de l'axe.
  const heading = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i - 1 + n) % n;
    const b = (i + 1) % n;
    heading[i] = Math.atan2(y[b] - y[a], x[b] - x[a]);
  }
  const kRaw = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i - 2 + n) % n;
    const b = (i + 2) % n;
    let dh = heading[b] - heading[a];
    while (dh > Math.PI) dh -= 2 * Math.PI;
    while (dh < -Math.PI) dh += 2 * Math.PI;
    const ds = Math.hypot(x[b] - x[a], y[b] - y[a]) || 1;
    kRaw[i] = dh / ds;
  }
  const kLine = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let j = -10; j <= 10; j++) acc += kRaw[(i + j + n) % n];
    kLine[i] = acc / 21;
  }

  const speed = speedProfile(track, x, y, kLine, p, surfaces);

  // Points de corde : maxima locaux de courbure où la ligne touche l'intérieur du virage.
  const apexes: Apex[] = [];
  const win = Math.round(12 / step);
  for (let i = 0; i < n; i++) {
    const k = kLine[i];
    if (Math.abs(k) < 1 / 70) continue;
    let isMax = true;
    for (let j = -win; j <= win && isMax; j++) if (Math.abs(kLine[(i + j + n) % n]) > Math.abs(k)) isMax = false;
    if (!isMax) continue;
    const side = Math.sign(k);
    const inside = side > 0 ? hi[i] : -lo[i];
    if (off[i] * side < inside - 1.2) continue;
    const last = apexes[apexes.length - 1];
    if (last && (i - last.index) * step < 25) continue;
    apexes.push({ index: i, offset: off[i], side });
  }
  if (apexes.length > 1 && (apexes[0].index + n - apexes[apexes.length - 1].index) * step < 25) apexes.pop();

  return { offset: off, x, y, k: kLine, speed, apexes };
}

/** Vitesse maximale tenable en chaque point, puis passes de freinage et d'accélération. */
export function speedProfile(
  track: Track,
  x: Float64Array,
  y: Float64Array,
  k: Float64Array,
  p: MooseParams,
  surfaces: Record<SurfaceId, SurfaceParams>,
): Float64Array {
  const S = track.samples;
  const n = S.length;
  const v = new Float64Array(n);
  const ds = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const b = (i + 1) % n;
    ds[i] = Math.hypot(x[b] - x[i], y[b] - y[i]) || track.spacing;
    const surf = surfaces[S[i].surface];
    const vTop = p.topSpeed * surf.vmax;
    const kk = Math.abs(k[i]);
    v[i] = kk > 1e-5 ? Math.min(vTop, Math.sqrt((p.aLat * surf.grip) / kk)) : vTop;
  }
  // Deux tours de passes pour gérer la boucle fermée.
  for (let pass = 0; pass < 2; pass++) {
    for (let j = 2 * n - 1; j >= 0; j--) {
      const i = j % n;
      const b = (i + 1) % n;
      const decel = p.brakeDecel * 0.8 * surfaces[S[i].surface].grip;
      const lim = Math.sqrt(v[b] * v[b] + 2 * decel * ds[i]);
      if (v[i] > lim) v[i] = lim;
    }
    for (let j = 1; j <= 2 * n; j++) {
      const i = j % n;
      const a = (i - 1 + n) % n;
      const vTop = p.topSpeed * surfaces[S[a].surface].vmax;
      const acc = p.accel * Math.max(0.05, 1 - (v[a] / vTop) * (v[a] / vTop));
      const lim = Math.sqrt(v[a] * v[a] + 2 * acc * ds[a]);
      if (v[i] > lim) v[i] = lim;
    }
  }
  return v;
}

/** Vitesse limite de la ligne centrale (pour comparer, et pour le pilote « au centre »). */
export function centerSpeedProfile(track: Track, p: MooseParams, surfaces: Record<SurfaceId, SurfaceParams>): Float64Array {
  const S = track.samples;
  const n = S.length;
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const k = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = S[i].x;
    y[i] = S[i].y;
    k[i] = S[i].k;
  }
  return speedProfile(track, x, y, k, p, surfaces);
}
