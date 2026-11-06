/**
 * Coffres sur l'accueil : quatre emplacements ; un toucher ouvre le coffre, tout de suite, avec la
 * révélation de son contenu.
 */
import { accessoryById, chestCatalog, type ChestType } from '../data';
import { openChest, type ChestReward } from '../meta/chests';
import { writeSave, type SaveData } from '../meta/settings';
import { accessorySwatch } from './collectionScreens';
import { getLang, t, type TextKey } from './i18n';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const fmt = (k: TextKey, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((s, [a, b]) => s.replace(`{${a}}`, String(b)), t(k));

/** Coffre dessiné en SVG, à la couleur de son type. */
export function chestSvg(type: ChestType, open = false): string {
  const c = chestCatalog.types[type].color;
  const lid = open ? 'translate(0 -7) rotate(-14 8 18)' : '';
  return `<svg viewBox="0 0 48 48" aria-hidden="true">
    <rect x="7" y="22" width="34" height="18" rx="3" fill="${c}" stroke="#3b2a1e" stroke-width="2.5"/>
    <g transform="${lid}"><path d="M7 22v-4a9 9 0 0 1 9-9h16a9 9 0 0 1 9 9v4z" fill="${c}" stroke="#3b2a1e" stroke-width="2.5"/>
    <rect x="21" y="9" width="6" height="13" fill="#3b2a1e" opacity=".35"/></g>
    <rect x="21" y="22" width="6" height="18" fill="#3b2a1e" opacity=".35"/>
    <rect x="20" y="24" width="8" height="7" rx="1.5" fill="#F5B301" stroke="#3b2a1e" stroke-width="2"/>
  </svg>`;
}

export class ChestUI {
  /** Emplacements créés une fois et mis à jour sur place (un appui n'est jamais perdu). */
  private slots: { el: HTMLButtonElement; key: string }[] = [];

  constructor(
    private save: SaveData,
    private onChange: () => void,
  ) {
    $('chest-ok').addEventListener('click', () => ($('chest-reveal').hidden = true));
  }

  render(): void {
    const row = $('chest-row');
    if (this.slots.length !== chestCatalog.slots) {
      row.replaceChildren();
      this.slots = [];
      for (let i = 0; i < chestCatalog.slots; i++) {
        const el = document.createElement('button');
        el.className = 'chest-slot';
        el.innerHTML = `<span class="ic"></span><small></small>`;
        el.addEventListener('click', () => this.open(i));
        row.appendChild(el);
        this.slots.push({ el, key: '' });
      }
    }
    this.slots.forEach((slot, i) => {
      const c = this.save.chests[i];
      const key = c ? String(c.id) : 'empty';
      if (key === slot.key) return;
      slot.key = key;
      const el = slot.el;
      el.className = `chest-slot ${c ? 'is-ready' : 'empty'}`;
      el.disabled = !c;
      (el.querySelector('.ic') as HTMLElement).innerHTML = c ? chestSvg(c.type) : '';
      (el.querySelector('small') as HTMLElement).textContent = c ? t('chestOpen') : t('chestEmpty');
      if (c) el.setAttribute('aria-label', `${t('chestOpen')} ${chestCatalog.types[c.type].name[getLang()]}`);
      else el.removeAttribute('aria-label');
    });
  }

  private open(i: number): void {
    const c = this.save.chests[i];
    if (!c) return;
    const res = openChest(this.save, c.id);
    if (!res) return;
    writeSave(this.save);
    this.reveal(res);
    this.render();
    this.onChange();
  }

  private reveal(res: ChestReward): void {
    $('chest-reveal-icon').innerHTML = chestSvg(res.type, true);
    $('chest-reveal-title').textContent = chestCatalog.types[res.type].name[getLang()];
    const list = $('chest-loot');
    list.replaceChildren();
    const line = (text: string, swatchOf?: string) => {
      const li = document.createElement('li');
      if (swatchOf) {
        const sw = document.createElement('span');
        accessorySwatch(sw, accessoryById(swatchOf));
        li.appendChild(sw);
      }
      li.appendChild(document.createTextNode(text));
      list.appendChild(li);
    };
    line(fmt('chestCoins', { n: res.coins }));
    line(fmt('chestFrags', { n: res.fragments }));
    if (res.accessory) line(fmt('chestAcc', { name: accessoryById(res.accessory).name[getLang()] }), res.accessory);
    for (const id of res.unlocked) line(fmt('newAcc', { name: accessoryById(id).name[getLang()] }), id);
    $('chest-ok').textContent = t('great');
    $('chest-reveal').hidden = false;
  }
}
