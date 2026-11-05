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
