/**
 * Records liés au tracé : un record (et son fantôme) enregistré sur un ancien tracé est écarté.
 */
import type { SaveData } from './settings';

/**
 * Supprime les records dont l'empreinte de tracé ne correspond plus ; renvoie les circuits concernés.
 * Écarte aussi un record impossible : un temps total plus court que (tours × meilleur tour). C'est la
 * trace d'un record pris sur moins de tours que le circuit (ancien défaut du didacticiel, en 1 tour).
 */
export function pruneStaleRecords(
  save: SaveData,
  signatureOf: (trackId: string) => string | undefined,
  lapsOf: (trackId: string) => number | undefined = () => undefined,
): string[] {
  const stale: string[] = [];
  for (const id of new Set([...Object.keys(save.bestTimes), ...Object.keys(save.bestLaps)])) {
    const sig = signatureOf(id);
    if (sig !== undefined && save.trackSigs[id] === sig) {
      const laps = lapsOf(id);
      const total = save.bestTimes[id];
      const lap = save.bestLaps[id];
      if (laps === undefined || total === undefined || lap === undefined || total >= laps * lap - 0.05) continue;
      // Temps total impossible : on l'écarte, le meilleur tour reste valable.
      stale.push(id);
      delete save.bestTimes[id];
      continue;
    }
    stale.push(id);
    delete save.bestTimes[id];
    delete save.bestLaps[id];
    delete save.trackSigs[id];
  }
  return stale;
}
