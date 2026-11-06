/**
 * Records liés au tracé : un record (et son fantôme) enregistré sur un ancien tracé est écarté.
 */
import type { SaveData } from './settings';

/** Supprime les records dont l'empreinte de tracé ne correspond plus ; renvoie les circuits concernés. */
export function pruneStaleRecords(save: SaveData, signatureOf: (trackId: string) => string | undefined): string[] {
  const stale: string[] = [];
  for (const id of new Set([...Object.keys(save.bestTimes), ...Object.keys(save.bestLaps)])) {
    const sig = signatureOf(id);
    if (sig !== undefined && save.trackSigs[id] === sig) continue;
    stale.push(id);
    delete save.bestTimes[id];
    delete save.bestLaps[id];
    delete save.trackSigs[id];
  }
  return stale;
}
