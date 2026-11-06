/**
 * Coffres sur l'accueil : quatre emplacements, minuterie de déverrouillage, ouverture avec révélation.
 */
import { accessoryById, chestCatalog, type ChestType } from '../data';
import { chestState, openChest, remainingMs, skipCost, startUnlock, type ChestReward, type SavedChest } from '../meta/chests';
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

/** Durée lisible : « 15 min », « 2 h 05 », « 0:42 ». */
export function formatDuration(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')}`;
  if (m >= 1) return `${m} min`;
  return `0:${String(s % 60).padStart(2, '0')}`;
}

export class ChestUI {
  private sheetId = -1;

  constructor(
    private save: SaveData,
    private onChange: () => void,
    private now: () => number = () => Date.now(),
  ) {
    $('chest-close').addEventListener('click', () => this.closeSheet());
    $('chest-main').addEventListener('click', () => this.sheetAction('main'));
    $('chest-second').addEventListener('click', () => this.sheetAction('second'));
    $('chest-ok').addEventListener('click', () => ($('chest-reveal').hidden = true));
    // Minuteries : une mise à jour par seconde suffit.
    setInterval(() => {
      if (!$('screen-home').hidden) this.render();
      if (!$('chest-sheet').hidden) this.renderSheet();
    }, 1000);
  }

  /** Emplacements créés une fois ; chaque seconde, on ne change que ce qui a bougé (un appui n'est jamais perdu). */
  private slots: { el: HTMLButtonElement; key: string }[] = [];

  render(): void {
    const row = $('chest-row');
    if (this.slots.length !== chestCatalog.slots) {
      row.replaceChildren();
      this.slots = [];
      for (let i = 0; i < chestCatalog.slots; i++) {
        const el = document.createElement('button');
        el.className = 'chest-slot';
        el.innerHTML = `<span class="ic"></span><small></small>`;
        el.addEventListener('click', () => this.tap(i));
        row.appendChild(el);
        this.slots.push({ el, key: '' });
      }
    }
    const now = this.now();
    this.slots.forEach((slot, i) => {
      const c = this.save.chests[i];
      const st = c ? chestState(c, now) : null;
      const key = c ? `${c.id}|${st}` : 'empty';
      const el = slot.el;
      if (key !== slot.key) {
        slot.key = key;
        el.className = `chest-slot ${c ? `is-${st}` : 'empty'}`;
        el.disabled = !c;
        (el.querySelector('.ic') as HTMLElement).innerHTML = c ? chestSvg(c.type, st === 'ready') : '';
        if (c) el.setAttribute('aria-label', chestCatalog.types[c.type].name[getLang()]);
        else el.removeAttribute('aria-label');
      }
      (el.querySelector('small') as HTMLElement).textContent = !c
        ? t('chestEmpty')
        : st === 'ready'
          ? t('chestOpen')
          : formatDuration(remainingMs(c, now));
    });
  }

  private tap(i: number): void {
    const c = this.save.chests[i];
    if (!c) return;
    if (chestState(c, this.now()) === 'ready') this.open(c.id, false);
    else this.openSheet(c.id);
  }

  private chest(): SavedChest | undefined {
    return this.save.chests.find((x) => x.id === this.sheetId);
  }

  private openSheet(id: number): void {
    this.sheetId = id;
    this.renderSheet();
    $('chest-sheet').hidden = false;
  }

  private closeSheet(): void {
    $('chest-sheet').hidden = true;
    this.sheetId = -1;
  }

  private renderSheet(): void {
    const c = this.chest();
    if (!c) return this.closeSheet();
    const now = this.now();
    const def = chestCatalog.types[c.type];
    const st = chestState(c, now);
    $('chest-icon').innerHTML = chestSvg(c.type, st === 'ready');
    $('chest-title').textContent = def.name[getLang()];
    const busy = st === 'locked' && this.save.chests.some((x) => chestState(x, now) === 'unlocking');
    const info = fmt('chestContains', {
      c1: def.coins[0],
      c2: def.coins[1],
      f1: def.fragments[0],
      f2: def.fragments[1],
      p: Math.round(def.accessoryChance * 100),
    });
    $('chest-desc').textContent = busy ? `${info}. ${t('chestBusy')}` : info;
    const main = $<HTMLButtonElement>('chest-main');
    const second = $<HTMLButtonElement>('chest-second');
    const cost = skipCost(c, now);
    if (st === 'locked' && !busy) {
      main.textContent = fmt('chestUnlock', { t: formatDuration(remainingMs(c, now)) });
      second.hidden = false;
      second.textContent = fmt('chestOpenNow', { n: cost });
      second.classList.toggle('poor', this.save.coins < cost);
    } else {
      main.textContent = st === 'ready' ? t('chestOpen') : fmt('chestOpenNow', { n: cost });
      main.classList.toggle('poor', st !== 'ready' && this.save.coins < cost);
      second.hidden = true;
    }
    $('chest-close').textContent = t('close');
  }

  private sheetAction(which: 'main' | 'second'): void {
    const c = this.chest();
    if (!c) return;
    const now = this.now();
    const st = chestState(c, now);
    const busy = st === 'locked' && this.save.chests.some((x) => chestState(x, now) === 'unlocking');
    if (which === 'main' && st === 'locked' && !busy) {
      startUnlock(this.save, c.id, now);
      writeSave(this.save);
      this.closeSheet();
      this.render();
      return;
    }
    this.open(c.id, st !== 'ready');
  }

  private open(id: number, pay: boolean): void {
    const res = openChest(this.save, id, this.now(), pay);
    if (!res) {
      $('chest-main').classList.remove('shake');
      void $('chest-main').offsetWidth;
      $('chest-main').classList.add('shake');
      return;
    }
    writeSave(this.save);
    this.closeSheet();
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
