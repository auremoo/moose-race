import fr from '../data/i18n/fr.json';

type Key = keyof typeof fr;
const dict: Record<string, string> = fr;

/** Textes externalisés : français d'abord, l'anglais s'ajoutera dans data/i18n/. */
export function t(key: Key): string {
  return dict[key] ?? key;
}
