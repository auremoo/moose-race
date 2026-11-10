/**
 * Écrans hors course : Accueil, Carte du Canada, Préparation.
 * Les fonctions pas encore livrées sont grisées et affichent le jalon prévu quand on les touche.
 */
import {
  courses,
  featureMilestones,
  isAvailable,
  mooseCatalog,
  mooseRating,
  balance,
  type CourseDef,
  type DifficultyId,
  type FeatureId,
} from '../data';
import type { SaveData } from '../meta/settings';
import { formatTime } from './hud';
import { DAILY_BONUS, dailyChallenge } from '../meta/daily';
import { PODIUM_MIN_RACERS } from '../meta/economy';
import { isCourseUnlocked, unlockRequirement } from '../meta/progress';
import { CollectionScreens } from './collectionScreens';
import { ChestUI } from './chests';
import { getLang, t, type TextKey } from './i18n';

export type MenuScreen = 'home' | 'map' | 'prep' | 'enclos' | 'comptoir';

export interface RaceSetup {
  difficulty: DifficultyId;
  botCount: number;
  mode: 'classique' | 'special';
}

export interface MenuCallbacks {
  onStart(course: CourseDef, setup: RaceSetup): void;
  onScreen(screen: MenuScreen | null): void;
  /** La collection a changé (orignal actif, niveau…). */
  onCollectionChange(): void;
  onTutorial(): void;
  onDaily(): void;
  /** Cliché 3D d'un orignal avec un accessoire (aperçu), ou '' si indisponible. */
  snapshot(look: { coat: string; size: number; accessory: string }): string;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const tk = (k: string) => t(k as TextKey);

const BIOME_COLORS: Record<string, string> = {
  test: '#8E8A85',
  rocheuses: '#2C7BB6',
  plaine: '#E0A100',
  foret: '#2E8B57',
};

/** Jalon 9 = multijoueur (V2). */
function soonText(milestone: number, key: 'soonBadge' | 'soonToast'): string {
  if (milestone >= 9) return key === 'soonBadge' ? 'V2' : t('soonToastV2');
  return t(key).replace('{n}', String(milestone));
}

export class Menus {
  private current: MenuScreen | null = 'home';
  private selected: CourseDef = courses[0];
  private toastTimer = 0;
  readonly collection: CollectionScreens;
  readonly chests: ChestUI;

  constructor(
    private save: SaveData,
    private cb: MenuCallbacks,
  ) {
    // Clic sur un élément verrouillé : on l'intercepte avant tout autre gestionnaire.
    $('app').addEventListener(
      'click',
      (e) => {
        const locked = (e.target as HTMLElement).closest<HTMLElement>('.locked');
        if (!locked) return;
        e.preventDefault();
        e.stopPropagation();
        this.toast(soonText(Number(locked.dataset.milestone), 'soonToast'));
        locked.classList.remove('shake');
        void locked.offsetWidth;
        locked.classList.add('shake');
      },
      true,
    );

    this.collection = new CollectionScreens(
      save,
      () => {
        this.refreshCoins();
        this.renderHome();
        this.cb.onCollectionChange();
      },
      (m) => this.toast(m),
      (look) => this.cb.snapshot(look),
    );
    this.chests = new ChestUI(save, () => {
      this.refreshCoins();
      this.renderHome();
      this.cb.onCollectionChange();
    });
    $('btn-play').addEventListener('click', () => this.show('map'));
    // L'accueil se resserre quand il ne tient pas à l'écran (petit téléphone, texte agrandi, langue).
    const home = $('screen-home');
    const fit = new ResizeObserver(() => fitHome(home));
    for (const el of [home, home.querySelector('.home-title'), home.querySelector('.home-bottom')]) if (el) fit.observe(el);
    $('btn-daily').addEventListener('click', () => this.cb.onDaily());
    document.querySelector('.tile[data-feature="enclos"]')?.addEventListener('click', () => this.show('enclos'));
    document.querySelector('.tile[data-feature="comptoir"]')?.addEventListener('click', () => this.show('comptoir'));
    document.querySelector('.tile[data-feature="didacticiel"]')?.addEventListener('click', () => this.cb.onTutorial());
    document
      .querySelectorAll<HTMLElement>('[data-back]')
      .forEach((b) => b.addEventListener('click', () => this.show(b.dataset.back as MenuScreen)));
    $('btn-go').addEventListener('click', () =>
      this.cb.onStart(this.selected, { difficulty: this.save.difficulty, botCount: this.save.botCount, mode: this.save.mode }),
    );
    document.querySelectorAll<HTMLButtonElement>('[data-diff]').forEach((b) =>
      b.addEventListener('click', () => {
        this.save.difficulty = b.dataset.diff as DifficultyId;
        this.renderPrep();
      }),
    );
    document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) =>
      b.addEventListener('click', () => {
        this.save.mode = b.dataset.mode as 'classique' | 'special';
        this.renderPrep();
      }),
    );
    $('bots-minus').addEventListener('click', () => {
      this.save.botCount = Math.max(0, this.save.botCount - 1);
      this.renderPrep();
    });
    $('bots-plus').addEventListener('click', () => {
      this.save.botCount = Math.min(10, this.save.botCount + 1);
      this.renderPrep();
    });

    this.applyLocks();
    this.applyTexts();
  }

  show(screen: MenuScreen | null): void {
    this.current = screen;
    for (const s of ['home', 'map', 'prep', 'enclos', 'comptoir'] as MenuScreen[]) $(`screen-${s}`).hidden = s !== screen;
    if (screen === 'enclos') this.collection.renderEnclos();
    if (screen === 'comptoir') this.collection.renderComptoir();
    this.refreshCoins();
    $('app').classList.toggle('on-menu', screen !== null);
    if (screen === 'map') this.renderCourses();
    if (screen === 'prep') this.renderPrep();
    if (screen === 'home') this.renderHome();
    this.cb.onScreen(screen);
  }

  get screen(): MenuScreen | null {
    return this.current;
  }

  /** Grise tout élément dont la fonctionnalité arrive à un jalon futur. */
  private applyLocks(): void {
    document.querySelectorAll<HTMLElement>('[data-feature]').forEach((el) => {
      const m = featureMilestones[el.dataset.feature as FeatureId];
      if (m === undefined || isAvailable(m)) return;
      el.classList.add('locked');
      el.dataset.milestone = String(m);
      el.setAttribute('aria-disabled', 'true');
      if (el.classList.contains('tile')) {
        const badge = document.createElement('small');
        badge.className = 'soon-badge';
        el.appendChild(badge);
      }
    });
  }

  applyTexts(): void {
    document.querySelectorAll<HTMLElement>('[data-t]').forEach((el) => (el.textContent = tk(el.dataset.t!)));
    document.querySelectorAll<HTMLElement>('[data-t-aria]').forEach((el) => el.setAttribute('aria-label', tk(el.dataset.tAria!)));
    document.querySelectorAll<HTMLElement>('.soon-badge').forEach((b) => {
      const m = Number(b.closest<HTMLElement>('.locked')?.dataset.milestone ?? 0);
      b.textContent = soonText(m, 'soonBadge');
    });
    document.querySelectorAll<HTMLElement>('.coins').forEach((c) => c.setAttribute('aria-label', t('coinsLabel')));
    if (this.current === 'map') this.renderCourses();
    if (this.current === 'prep') this.renderPrep();
    this.renderHome();
  }

  private activeMoose() {
    return mooseCatalog.moose.find((m) => m.id === this.save.activeMoose) ?? mooseCatalog.moose[0];
  }

  private rarityChip(el: HTMLElement, rarity: string): void {
    el.textContent = tk(`rarity_${rarity}`);
    el.style.background = mooseCatalog.rarities[rarity as keyof typeof mooseCatalog.rarities].color;
  }

  renderHome(): void {
    const daily = dailyChallenge();
    $('daily-name').textContent = daily.course.name;
    const done = this.save.dailyDone.includes(daily.key);
    $('daily-info').textContent =
      `${'★'.repeat(daily.course.stars)} · ${daily.mode === 'special' ? t('modeSpecial') : t('modeClassic')} · ${tk(daily.difficulty === 'difficile' ? 'hard' : daily.difficulty === 'facile' ? 'easy' : 'medium')} · ${done ? t('dailyDone') : `+${DAILY_BONUS}`}`;
    $('btn-daily').classList.toggle('done', done);
    // Première visite : le didacticiel est mis en avant.
    document.querySelector('.tile[data-feature="didacticiel"]')?.classList.toggle('highlight', !this.save.tutorialDone);
    const m = this.activeMoose();
    $('active-name').textContent = m.name;
    this.rarityChip($('active-rarity'), m.rarity);
    $('active-cote').textContent = `${t('rating')} ${mooseRating(m, this.save.levels[m.id] ?? 1)}`;
    document.querySelectorAll<HTMLElement>('.coin-balance').forEach((c) => (c.textContent = String(this.save.coins)));
    this.chests.render();
  }

  private renderCourses(): void {
    const list = $('course-list');
    list.replaceChildren();
    const nf = new Intl.NumberFormat(getLang() === 'fr' ? 'fr-CA' : 'en-CA', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    for (const c of courses) {
      const card = document.createElement('button');
      card.className = 'course-card';
      card.style.setProperty('--biome', BIOME_COLORS[c.biome] ?? '#8E8A85');
      const built = isAvailable(c.milestone) && !!c.trackId;
      // Déblocage progressif : podium sur le circuit précédent.
      const earned = built && isCourseUnlocked(this.save, c.id);
      const open = built && earned;
      if (!built) {
        card.classList.add('locked');
        card.dataset.milestone = String(c.milestone);
        card.setAttribute('aria-disabled', 'true');
      } else if (!earned) {
        card.classList.add('course-locked');
        card.setAttribute('aria-disabled', 'true');
      }
      const need = built && !earned ? unlockRequirement(c.id) : null;
      const best = this.save.bestTimes[c.trackId ?? c.id];
      const right = open
        ? `<span class="course-best"><small>${t('record2')}</small>${best !== undefined ? formatTime(best) : '—'}</span>`
        : `<span class="course-lock"><svg viewBox="0 0 24 24" width="20" height="20"><use href="#i-lock"/></svg>${need ? t('podiumNeeded') : soonText(c.milestone, 'soonBadge')}</span>`;
      const province = c.province ? `${tk(`prov_${c.province}`)} · ` : '';
      const laps = c.laps === 1 ? t('lap1') : t('lapsN').replace('{n}', String(c.laps));
      card.innerHTML = `
        <span class="course-info">
          <strong></strong>
          <span class="stars" aria-label="${c.stars}/5">${'★'.repeat(c.stars)}<span class="stars-off">${'★'.repeat(5 - c.stars)}</span></span>
          <small>${province}${tk(`biome_${c.biome}`)} · ${nf.format(c.lengthKm)} km · ${laps}</small>
        </span>${right}`;
      card.querySelector('strong')!.textContent = c.name;
      if (open)
        card.addEventListener('click', () => {
          this.selected = c;
          this.show('prep');
        });
      else if (need) card.addEventListener('click', () => this.toast(t('unlockHint').replace('{name}', need.name)));
      list.appendChild(card);
    }
  }

  private renderPrep(): void {
    $('prep-title').textContent = this.selected.name;
    const m = this.activeMoose();
    $('prep-moose-name').textContent = m.name;
    this.rarityChip($('prep-rarity'), m.rarity);
    const level = this.save.levels[m.id] ?? 1;
    $('prep-cote').textContent = String(mooseRating(m, level));
    $('bots-count').textContent = String(this.save.botCount);
    document.querySelectorAll<HTMLElement>('[data-diff]').forEach((b) => b.classList.toggle('on', b.dataset.diff === this.save.difficulty));
    document.querySelectorAll<HTMLElement>('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === this.save.mode));
    $('mode-desc').textContent = this.save.mode === 'special' ? t('modeSpecialDesc') : t('modeClassicDesc');
    const off = balance.difficulties[this.save.difficulty].ratingOffset;
    const rivals =
      this.save.botCount === 0 ? t('solo') : `${t('rivalsRating')} : ${mooseRating(m, level) + off} (${off >= 0 ? '+' : ''}${off})`;
    // Moins de 3 adversaires : ni podium, ni coffre, ni déblocage de circuit.
    $('prep-rivals').textContent = this.save.botCount + 1 < PODIUM_MIN_RACERS ? `${rivals} · ${t('podiumRule')}` : rivals;
  }

  refreshCoins(): void {
    document.querySelectorAll<HTMLElement>('.coin-balance').forEach((c) => (c.textContent = String(this.save.coins)));
  }

  toast(text: string): void {
    const el = $('toast');
    el.textContent = text;
    el.classList.add('on');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => el.classList.remove('on'), 1800);
  }
}

/** Niveaux de resserrement de l'accueil, du plus léger au plus fort (cumulatifs). */
const HOME_FIT = ['fit-1', 'fit-2', 'fit-3'];

/** Applique le plus léger resserrement qui fait tenir l'accueil sans défilement. */
export function fitHome(home: HTMLElement): void {
  if (home.hidden) return;
  home.classList.remove(...HOME_FIT);
  for (const c of HOME_FIT) {
    if (home.scrollHeight <= home.clientHeight + 1) return;
    home.classList.add(c);
  }
}
