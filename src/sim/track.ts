/**
 * Piste : spline centrale fermée (Catmull-Rom centripète), échantillonnée tous les `spacing` mètres.
 * Le plan de piste est (x, y) ; le rendu le pose sur (x, z) en 3D.
 * Aucune dépendance au DOM ni à Three.js.
 */

export type SurfaceId = 'sentier' | 'herbe' | 'boue' | 'neige' | 'glace';

export interface TrackDef {
  id: string;
  name: string;
  /** Points de contrôle de la ligne centrale, boucle fermée, en mètres. */
  points: [number, number][];
  /** Largeur du sentier (m). */
  width: number;
  /** Largeur de la bande d'herbe de chaque côté avant la barrière (m). */
  verge: number;
  /** Surface du sentier. */
  surface: SurfaceId;
  /** Surface du bas-côté. */
  vergeSurface: SurfaceId;
  /** Distance le long de la ligne centrale où se trouve la ligne de départ (m). */
  startOffset: number;
}

export interface TrackSample {
  x: number;
  y: number;
  /** Tangente unitaire. */
  tx: number;
  ty: number;
  /** Normale gauche unitaire. */
  nx: number;
  ny: number;
  /** Courbure signée (1/m), positive vers la gauche. */
  k: number;
  /** Abscisse curviligne (m). */
  s: number;
}

export interface Track {
  def: TrackDef;
  samples: TrackSample[];
  length: number;
  spacing: number;
  halfWidth: number;
}

export interface TrackProjection {
  index: number;
  /** Abscisse curviligne projetée (m), dans [0, length). */
  s: number;
  /** Écart latéral signé (m), positif à gauche. */
  d: number;
}

function catmullRomCentripetal(
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  t: number,
): [number, number] {
  const alpha = 0.5;
  const tj = (ti: number, a: [number, number], b: [number, number]) =>
    ti + Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]), alpha);
  const t0 = 0;
  const t1 = tj(t0, p0, p1);
  const t2 = tj(t1, p1, p2);
  const t3 = tj(t2, p2, p3);
  const u = t1 + (t2 - t1) * t;
  const lerp = (a: [number, number], b: [number, number], ta: number, tb: number): [number, number] => {
    const w = tb - ta === 0 ? 0 : (u - ta) / (tb - ta);
    return [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w];
  };
  const a1 = lerp(p0, p1, t0, t1);
  const a2 = lerp(p1, p2, t1, t2);
  const a3 = lerp(p2, p3, t2, t3);
  const b1 = lerp(a1, a2, t0, t2);
  const b2 = lerp(a2, a3, t1, t3);
  return lerp(b1, b2, t1, t2);
}

export function buildTrack(def: TrackDef, spacing = 1): Track {
  const pts = def.points;
  const n = pts.length;
  if (n < 4) throw new Error(`Piste ${def.id} : il faut au moins 4 points de contrôle`);

  // 1. Échantillonnage dense de la spline.
  const dense: [number, number][] = [];
  const perSeg = 40;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    for (let j = 0; j < perSeg; j++) dense.push(catmullRomCentripetal(p0, p1, p2, p3, j / perSeg));
  }

  // 2. Longueur cumulée.
  const cum: number[] = [0];
  for (let i = 1; i <= dense.length; i++) {
    const a = dense[i - 1];
    const b = dense[i % dense.length];
    cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = cum[dense.length];

  // 3. Rééchantillonnage uniforme.
  const count = Math.max(8, Math.round(total / spacing));
  const step = total / count;
  const raw: [number, number][] = [];
  let seg = 0;
  for (let i = 0; i < count; i++) {
    const target = i * step;
    while (cum[seg + 1] < target) seg++;
    const a = dense[seg];
    const b = dense[(seg + 1) % dense.length];
    const segLen = cum[seg + 1] - cum[seg];
    const w = segLen === 0 ? 0 : (target - cum[seg]) / segLen;
    raw.push([a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w]);
  }

  // 4. Décalage pour placer la ligne de départ à l'indice 0.
  const shift = Math.round(((def.startOffset % total) + total) % total / step) % count;
  const pos = raw.slice(shift).concat(raw.slice(0, shift));

  // 5. Tangentes, normales, courbure (différences centrées, courbure lissée).
  const samples: TrackSample[] = [];
  const heading: number[] = [];
  for (let i = 0; i < count; i++) {
    const a = pos[(i - 1 + count) % count];
    const b = pos[(i + 1) % count];
    heading.push(Math.atan2(b[1] - a[1], b[0] - a[0]));
  }
  const kRaw: number[] = [];
  for (let i = 0; i < count; i++) {
    let dh = heading[(i + 1) % count] - heading[(i - 1 + count) % count];
    while (dh > Math.PI) dh -= 2 * Math.PI;
    while (dh < -Math.PI) dh += 2 * Math.PI;
    kRaw.push(dh / (2 * step));
  }
  const smoothR = Math.max(1, Math.round(3 / step));
  for (let i = 0; i < count; i++) {
    let k = 0;
    for (let j = -smoothR; j <= smoothR; j++) k += kRaw[(i + j + count) % count];
    k /= 2 * smoothR + 1;
    const h = heading[i];
    const tx = Math.cos(h);
    const ty = Math.sin(h);
    samples.push({ x: pos[i][0], y: pos[i][1], tx, ty, nx: -ty, ny: tx, k, s: i * step });
  }

  return { def, samples, length: total, spacing: step, halfWidth: def.width / 2 };
}

/**
 * Projette un point sur la ligne centrale. Recherche locale autour de `hint`
 * (indice précédent) pour rester en O(1) ; `window` en nombre d'échantillons.
 */
export function projectOnTrack(track: Track, x: number, y: number, hint = -1, window = 40): TrackProjection {
  const { samples } = track;
  const n = samples.length;
  let best = 0;
  let bestD2 = Infinity;
  const scan = (from: number, to: number) => {
    for (let j = from; j <= to; j++) {
      const i = ((j % n) + n) % n;
      const p = samples[i];
      const dx = x - p.x;
      const dy = y - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = i;
      }
    }
  };
  if (hint < 0) scan(0, n - 1);
  else scan(hint - window, hint + window);

  // Affinage sur le segment le plus proche (précédent ou suivant).
  const p = samples[best];
  const dx = x - p.x;
  const dy = y - p.y;
  const along = dx * p.tx + dy * p.ty;
  const d = dx * p.nx + dy * p.ny;
  let s = p.s + along;
  s = ((s % track.length) + track.length) % track.length;
  return { index: best, s, d };
}
