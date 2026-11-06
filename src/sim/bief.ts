import { projectOnTrack, type Track } from './track';

/**
 * Bief : raccourci d'eau du mode spécial. Détecté automatiquement sur les circuits où deux
 * portions de piste se rapprochent beaucoup (20 à 50 m à vol d'oiseau) alors qu'elles sont
 * éloignées d'au moins 120 m le long du tracé, sans que le canal croise une autre partie de la piste.
 * Le gain est plafonné (on nage lentement) pour que le bief aide sans décider la course.
 */

/** Gain de piste maximal retenu pour un bief (m). */
export const BIEF_MAX_GAIN = 130;
/** Vitesse de nage dans le canal (m/s). */
export const BIEF_SWIM_SPEED = 9;

export interface Bief {
  /** Indices d'échantillon de l'entrée et de la sortie du canal. */
  from: number;
  to: number;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  /** Longueur du canal (m) et distance de piste économisée (m). */
  length: number;
  gain: number;
}

const cache = new WeakMap<Track, Bief | null>();

export function findBief(track: Track): Bief | null {
  if (cache.has(track)) return cache.get(track)!;
  const S = track.samples;
  const n = S.length;
  const sp = track.spacing;
  let best: Bief | null = null;
  const step = Math.max(1, Math.round(4 / sp));
  for (let i = 0; i < n; i += step) {
    for (let k = Math.round(120 / sp); k < n * 0.45; k += step) {
      const j = (i + k) % n;
      const a = S[i];
      const b = S[j];
      const chord = Math.hypot(b.x - a.x, b.y - a.y);
      if (chord < 20 || chord > 50) continue;
      const gain = k * sp - chord;
      if (gain > BIEF_MAX_GAIN || gain < 60) continue;
      if (best && gain <= best.gain) continue;
      // Le canal ne doit croiser aucune autre partie de la piste.
      let clear = true;
      for (let t = 10; t < chord - 10 && clear; t += 3) {
        const x = a.x + ((b.x - a.x) * t) / chord;
        const y = a.y + ((b.y - a.y) * t) / chord;
        const p = projectOnTrack(track, x, y);
        if (Math.abs(p.d) < S[p.index].hw + 2) clear = false;
      }
      if (clear) best = { from: i, to: j, ax: a.x, ay: a.y, bx: b.x, by: b.y, length: chord, gain };
    }
  }
  cache.set(track, best);
  return best;
}
