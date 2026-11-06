/**
 * Météo : tirée de la graine de la course, selon le biome. La pluie rend le sentier glissant
 * (adhérence réduite), le brouillard réduit la visibilité (rendu seulement).
 */
import type { SurfaceParams } from './moose';
import type { Rng } from './rng';
import type { SurfaceId } from './track';

export type Weather = 'clair' | 'pluie' | 'brouillard';

/** Chances de pluie et de brouillard par biome. */
const CHANCES: Record<string, { pluie: number; brouillard: number }> = {
  foret: { pluie: 0.3, brouillard: 0.1 },
  plaine: { pluie: 0.2, brouillard: 0.05 },
  rocheuses: { pluie: 0.15, brouillard: 0.2 },
};

export function pickWeather(rng: Rng, biome: string | undefined, snowy: boolean): Weather {
  const c = biome ? CHANCES[biome] : undefined;
  if (!c) return 'clair';
  const r = rng.next();
  if (!snowy && r < c.pluie) return 'pluie';
  if (r > 1 - c.brouillard) return 'brouillard';
  return 'clair';
}

/** Surfaces sous la pluie : sentier, herbe et racines glissent ; la boue devient plus lourde. */
export function wetSurfaces(base: Record<SurfaceId, SurfaceParams>): Record<SurfaceId, SurfaceParams> {
  const out = { ...base };
  for (const k of ['sentier', 'herbe', 'racines'] as SurfaceId[]) out[k] = { grip: base[k].grip * 0.85, vmax: base[k].vmax * 0.97 };
  out.boue = { grip: base.boue.grip * 0.9, vmax: base.boue.vmax * 0.9 };
  return out;
}
