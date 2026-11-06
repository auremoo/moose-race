/**
 * Fantôme : trajectoire du meilleur temps sur un circuit, rejouée en orignal translucide.
 * Enregistrée 10 fois par seconde, compressée en entiers, stockée à part de la sauvegarde
 * (clé panache.ghost.<circuit>) pour ne pas l'alourdir.
 */
const PREFIX = 'panache.ghost.';
export const GHOST_HZ = 10;

export interface GhostData {
  trackId: string;
  laps: number;
  time: number;
  coat: string;
  /** x, y en décimètres et cap en centièmes de radian, à la suite. */
  points: number[];
}

export class GhostRecorder {
  private points: number[] = [];
  private nextT = 0;

  reset(): void {
    this.points = [];
    this.nextT = 0;
  }

  /** À appeler à chaque pas de course avec le temps de course et la pose du joueur. */
  sample(t: number, x: number, y: number, heading: number): void {
    if (t < this.nextT) return;
    this.nextT += 1 / GHOST_HZ;
    this.points.push(Math.round(x * 10), Math.round(y * 10), Math.round(heading * 100));
  }

  result(trackId: string, laps: number, time: number, coat: string): GhostData {
    return { trackId, laps, time, coat, points: this.points.slice() };
  }
}

export function loadGhost(trackId: string, laps: number): GhostData | null {
  try {
    const raw = localStorage.getItem(PREFIX + trackId);
    if (!raw) return null;
    const g = JSON.parse(raw) as GhostData;
    return g.laps === laps && Array.isArray(g.points) ? g : null;
  } catch {
    return null;
  }
}

export function saveGhost(g: GhostData): void {
  try {
    localStorage.setItem(PREFIX + g.trackId, JSON.stringify(g));
  } catch {
    /* stockage plein ou indisponible : pas de fantôme */
  }
}

/** Pose du fantôme au temps t (interpolée), ou null après son arrivée. */
export function ghostPose(g: GhostData, t: number): { x: number; y: number; heading: number } | null {
  const n = g.points.length / 3;
  if (n < 2) return null;
  const f = t * GHOST_HZ;
  if (f >= n - 1) return null;
  const i = Math.max(0, Math.floor(f));
  const a = f - i;
  const p = g.points;
  const x = (p[i * 3] + (p[i * 3 + 3] - p[i * 3]) * a) / 10;
  const y = (p[i * 3 + 1] + (p[i * 3 + 4] - p[i * 3 + 1]) * a) / 10;
  let dh = (p[i * 3 + 5] - p[i * 3 + 2]) / 100;
  if (dh > Math.PI) dh -= 2 * Math.PI;
  else if (dh < -Math.PI) dh += 2 * Math.PI;
  return { x, y, heading: p[i * 3 + 2] / 100 + dh * a };
}
