/** Générateur pseudo-aléatoire à graine (mulberry32). Seule source d'aléa autorisée dans sim/. */
export interface Rng {
  next(): number;
  range(lo: number, hi: number): number;
  state(): number;
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, range: (lo, hi) => lo + (hi - lo) * next(), state: () => a };
}
