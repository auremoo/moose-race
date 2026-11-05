/**
 * Économie : pièces gagnées selon le classement (formule du cahier, section 7).
 *   pièces = (20 + 8(N − 1)) × ((N − r + 1) / N)^1,5 × M_difficulté × M_mode, arrondi, minimum 5.
 */
export function coinsFor(rank: number, participants: number, difficultyMul: number, modeMul: number): number {
  const N = Math.max(1, participants);
  const r = Math.min(Math.max(1, rank), N);
  const base = (20 + 8 * (N - 1)) * Math.pow((N - r + 1) / N, 1.5) * difficultyMul * modeMul;
  return Math.max(5, Math.round(base));
}

/** Bonification unique de la première victoire sur un couple parcours-difficulté. */
export const FIRST_WIN_BONUS = 50;

export function firstWinKey(trackId: string, difficulty: string): string {
  return `${trackId}|${difficulty}`;
}
