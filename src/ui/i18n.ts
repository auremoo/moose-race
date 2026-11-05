import en from '../data/i18n/en.json';
import fr from '../data/i18n/fr.json';

export type Lang = 'fr' | 'en';
export type TextKey = keyof typeof fr;

const DICTS: Record<Lang, Record<string, string>> = { fr, en };
let current: Lang = 'fr';

/** Langue par défaut : celle du téléphone si c'est le français, sinon l'anglais. */
export function detectLang(): Lang {
  const langs = typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : [];
  return langs.some((l) => l?.toLowerCase().startsWith('fr')) ? 'fr' : 'en';
}

export function setLang(l: Lang): void {
  current = l;
  document.documentElement.lang = l;
}

export function getLang(): Lang {
  return current;
}

/** Textes externalisés dans data/i18n/. */
export function t(key: TextKey): string {
  return DICTS[current][key] ?? DICTS.fr[key] ?? key;
}

/** Rang ordinal : 1er, 2e… / 1st, 2nd, 3rd, 4th… */
export function ordinal(n: number): string {
  if (current === 'fr') return n === 1 ? '1er' : `${n}e`;
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${s}`;
}
