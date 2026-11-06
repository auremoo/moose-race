/**
 * Écrans de collection : Enclos (orignaux, niveaux, améliorations) et Comptoir
 * (ravitaillement, fragments, achat direct).
 */
import { mooseCatalog, mooseRating, mooseStats, type MooseDef } from '../data';
import {
  buyDirect,
  directPrice,
  exchangeFragments,
  fragmentCost,
  levelOf,
  openLoot,
  owns,
  pityRemaining,
  RARITY_ORDER,
  upgrade,
  upgradeCost,
} from '../meta/collection';
import { accessoryOf, buyAccessory, equipAccessory, ownedAccessories, ownsAccessory } from '../meta/accessories';
import { writeSave, type SaveData } from '../meta/settings';
import { accessoryCatalog, type AccessoryDef } from '../data';
import { getLang, t, type TextKey } from './i18n';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const tk = (k: string) => t(k as TextKey);
const fmt = (k: TextKey, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((s, [a, b]) => s.replace(`{${a}}`, String(b)), t(k));

/** Petit portrait : rond à la couleur de la robe, avec un panache stylisé. */
export function portrait(el: HTMLElement, def: MooseDef, owned: boolean): void {
  el.style.setProperty('--coat', def.coat);
  el.style.setProperty('--frame', mooseCatalog.rarities[def.rarity].color);
  el.classList.toggle('silhouette', !owned);
  el.innerHTML = `<svg viewBox="0 0 48 48" aria-hidden="true">
    <path d="M10 14c-3-6 1-9 3-5 1-4 5-3 4 1 2-3 6-1 3 3l-2 4c3 1 5 1 6 0 1 1 3 1 6 0l-2-4c-3-4 1-6 3-3-1-4 3-5 4-1 2-4 6-1 3 5-1 3-4 5-8 5l-1 1H19l-1-1c-4 0-7-2-8-5z" fill="#E8D3A8"/>
    <ellipse cx="24" cy="30" rx="9" ry="11" fill="var(--coat)"/>
    <ellipse cx="24" cy="38" rx="6" ry="5" fill="rgba(0,0,0,.25)"/>
    <circle cx="20" cy="27" r="1.8" fill="#fff"/><circle cx="28" cy="27" r="1.8" fill="#fff"/>
    <circle cx="20.4" cy="27.3" r="1" fill="#2a1a12"/><circle cx="28.4" cy="27.3" r="1" fill="#2a1a12"/>
  </svg>`;
}

/** Pastille d'accessoire : couleurs et motif en variables CSS. */
export function accessorySwatch(el: HTMLElement, a: AccessoryDef): void {
  el.className = `acc-swatch ${a.pattern ?? (a.kind === 'aucun' ? 'aucun' : '')}`;
  a.colors.forEach((c, i) => el.style.setProperty(`--c${i}`, c));
  el.title = a.name[getLang()];
}

function rarityChip(el: HTMLElement, def: MooseDef): void {
  el.textContent = tk(`rarity_${def.rarity}`);
  el.style.background = mooseCatalog.rarities[def.rarity].color;
}

export class CollectionScreens {
  private detailId = '';
  private detailFrom: 'enclos' | 'comptoir' = 'enclos';

  constructor(
    private save: SaveData,
    private onChange: () => void,
    private toast: (msg: string) => void,
  ) {
    $('detail-close').addEventListener('click', () => ($('moose-detail').hidden = true));
    $('detail-main').addEventListener('click', () => this.detailAction('main'));
    $('detail-second').addEventListener('click', () => this.detailAction('second'));
    $('btn-loot').addEventListener('click', () => this.loot());
    $('reveal-ok').addEventListener('click', () => ($('loot-reveal').hidden = true));
    $('acc-prev').addEventListener('click', () => this.cycleAccessory(-1));
    $('acc-next').addEventListener('click', () => this.cycleAccessory(1));
  }

  /** Accessoire suivant ou précédent parmi ceux possédés, porté tout de suite. */
  private cycleAccessory(dir: number): void {
    const list = ownedAccessories(this.save);
    const cur = list.findIndex((a) => a.id === accessoryOf(this.save, this.detailId).id);
    const next = list[(cur + dir + list.length) % list.length];
    equipAccessory(this.save, this.detailId, next.id);
    this.commit();
    this.renderDetail();
  }

  private renderAccessoryShop(): void {
    const grid = $('acc-grid');
    grid.replaceChildren();
    for (const a of accessoryCatalog.accessories.filter((x) => x.price > 0)) {
      const owned = ownsAccessory(this.save, a.id);
      const b = document.createElement('button');
      b.className = 'moose-card';
      b.style.setProperty('--frame', a.colors[0] ?? '#ccc');
      if (owned) b.classList.add('owned-acc');
      b.innerHTML = `<span class="acc-swatch"></span><strong></strong><small></small>`;
      accessorySwatch(b.querySelector('.acc-swatch') as HTMLElement, a);
      (b.querySelector('strong') as HTMLElement).textContent = a.name[getLang()];
      (b.querySelector('small') as HTMLElement).textContent = owned ? t('ownedLbl') : String(a.price);
      b.disabled = owned;
      b.addEventListener('click', () => {
        if (!buyAccessory(this.save, a.id)) {
          this.toast(t('notEnough'));
          return;
        }
        this.commit();
        this.toast(fmt('boughtAcc', { name: a.name[getLang()] }));
        this.renderComptoir();
      });
      grid.appendChild(b);
    }
  }

  private commit(): void {
    writeSave(this.save);
    this.onChange();
  }

  private sorted(): MooseDef[] {
    return [...mooseCatalog.moose].sort(
      (a, b) =>
        Number(owns(this.save, b.id)) - Number(owns(this.save, a.id)) || RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity),
    );
  }

  private card(def: MooseDef, info: string): HTMLButtonElement {
    const owned = owns(this.save, def.id);
    const b = document.createElement('button');
    b.className = 'moose-card';
    b.style.setProperty('--frame', mooseCatalog.rarities[def.rarity].color);
    if (def.id === this.save.activeMoose) b.classList.add('active');
    b.innerHTML = `<span class="portrait"></span><strong></strong><small></small>`;
    portrait(b.querySelector('.portrait') as HTMLElement, def, owned);
    (b.querySelector('strong') as HTMLElement).textContent = def.name;
    (b.querySelector('small') as HTMLElement).textContent = info;
    return b;
  }

  renderEnclos(): void {
    const grid = $('enclos-grid');
    grid.replaceChildren();
    $('enclos-sub').textContent = fmt('owned', { n: this.save.owned.length, m: mooseCatalog.moose.length });
    for (const def of this.sorted()) {
      const owned = owns(this.save, def.id);
      const info = owned
        ? `${fmt('level', { n: levelOf(this.save, def.id) })} · ${t('rating')} ${mooseRating(def, levelOf(this.save, def.id))}`
        : tk(`rarity_${def.rarity}`);
      const b = this.card(def, info);
      b.addEventListener('click', () => this.openDetail(def.id, 'enclos'));
      grid.appendChild(b);
    }
  }

  renderComptoir(): void {
    const cfg = mooseCatalog.loot;
    const odds = $('loot-odds');
    odds.replaceChildren();
    for (const r of RARITY_ORDER) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="rarity-chip"></span><b></b>`;
      const chip = li.querySelector('.rarity-chip') as HTMLElement;
      chip.textContent = tk(`rarity_${r}`);
      chip.style.background = mooseCatalog.rarities[r].color;
      (li.querySelector('b') as HTMLElement).textContent =
        `${(cfg.odds[r] * 100).toLocaleString(undefined, { maximumFractionDigits: 1 })} %`;
      odds.appendChild(li);
    }
    $('loot-pity').textContent = fmt('lootPity', { n: pityRemaining(this.save) });
    $('btn-loot').textContent = fmt('openLoot', { n: cfg.cost });
    $('btn-loot').classList.toggle('poor', this.save.coins < cfg.cost);
    $('frag-count').textContent = String(this.save.fragments);
    const grid = $('shop-grid');
    grid.replaceChildren();
    for (const def of this.sorted().filter((d) => !owns(this.save, d.id))) {
      const price = directPrice(def);
      const b = this.card(def, price !== null ? `${price}` : t('starterOnly'));
      b.addEventListener('click', () => this.openDetail(def.id, 'comptoir'));
      grid.appendChild(b);
    }
    this.renderAccessoryShop();
  }

  openDetail(id: string, from: 'enclos' | 'comptoir'): void {
    this.detailId = id;
    this.detailFrom = from;
    this.renderDetail();
    $('moose-detail').hidden = false;
  }

  private renderDetail(): void {
    const def = mooseCatalog.moose.find((m) => m.id === this.detailId)!;
    const owned = owns(this.save, def.id);
    const level = levelOf(this.save, def.id);
    portrait($('detail-portrait'), def, true);
    rarityChip($('detail-rarity'), def);
    $('detail-name').textContent = def.name;
    $('detail-style').textContent = def.style ?? '';
    $('detail-level').textContent = owned ? fmt('level', { n: level }) : t('notOwned');
    $('detail-cote').textContent = `${t('rating')} ${mooseRating(def, owned ? level : 1)}`;
    const stats = mooseStats(def, owned ? level : 1);
    const next = owned && level < mooseCatalog.maxLevel ? mooseStats(def, level + 1) : stats;
    const box = $('detail-stats');
    box.replaceChildren();
    stats.forEach((v, i) => {
      const row = document.createElement('div');
      row.className = 'stat';
      row.innerHTML = `<span></span><div class="bar"><i class="next"></i><i class="now"></i></div><b></b>`;
      (row.querySelector('span') as HTMLElement).textContent = tk(`stat${i}`);
      (row.querySelector('.now') as HTMLElement).style.width = `${v}%`;
      (row.querySelector('.next') as HTMLElement).style.width = `${next[i]}%`;
      (row.querySelector('b') as HTMLElement).textContent = String(v);
      box.appendChild(row);
    });
    const main = $<HTMLButtonElement>('detail-main');
    const second = $<HTMLButtonElement>('detail-second');
    second.hidden = true;
    if (owned) {
      const cost = upgradeCost(def, level);
      main.textContent = cost === null ? t('maxLevel') : fmt('upgradeFor', { n: cost });
      main.disabled = cost === null;
      main.classList.toggle('poor', cost !== null && this.save.coins < cost);
      second.hidden = false;
      second.textContent = def.id === this.save.activeMoose ? t('chosen') : t('choose');
      second.disabled = def.id === this.save.activeMoose;
    } else {
      const price = directPrice(def);
      main.disabled = price === null;
      main.textContent = price === null ? t('starterOnly') : fmt('buyFor', { n: price });
      main.classList.toggle('poor', price !== null && this.save.coins < price);
      second.hidden = false;
      second.textContent = fmt('fragFor', { n: fragmentCost(def) });
      second.disabled = this.save.fragments < fragmentCost(def);
    }
    // Accessoire porté (orignaux possédés seulement).
    $('detail-acc').hidden = !owned;
    if (owned) {
      const acc = accessoryOf(this.save, def.id);
      accessorySwatch($('acc-swatch'), acc);
      $('acc-name').textContent = `${t('accessoryLbl')} : ${acc.name[getLang()]}`;
    }
    $('detail-close').textContent = t('close');
  }

  private detailAction(which: 'main' | 'second'): void {
    const def = mooseCatalog.moose.find((m) => m.id === this.detailId)!;
    const owned = owns(this.save, def.id);
    let ok: boolean;
    if (owned && which === 'main') ok = upgrade(this.save, def.id);
    else if (owned && which === 'second') {
      this.save.activeMoose = def.id;
      ok = true;
    } else if (!owned && which === 'main') ok = buyDirect(this.save, def.id);
    else ok = exchangeFragments(this.save, def.id);
    if (!ok) {
      this.toast(t('notEnough'));
      return;
    }
    this.commit();
    this.renderDetail();
    if (this.detailFrom === 'enclos') this.renderEnclos();
    else this.renderComptoir();
  }

  private loot(): void {
    const res = openLoot(this.save);
    if (!res) {
      this.toast(t('notEnough'));
      return;
    }
    this.commit();
    portrait($('reveal-portrait'), res.moose, true);
    rarityChip($('reveal-rarity'), res.moose);
    $('reveal-name').textContent = res.moose.name;
    $('reveal-msg').textContent = res.duplicate ? fmt('duplicate', { n: res.fragments }) : t('newMoose');
    $('reveal-ok').textContent = t('great');
    $('loot-reveal').hidden = false;
    this.renderComptoir();
  }
}
