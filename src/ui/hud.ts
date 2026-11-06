/**
 * Affichage en course et menus. Lit la simulation (lecture seule) et les réglages (meta/).
 */
import type { SteerTouchVisual } from '../input/input';
import { countdownRemaining, rankOf, raceTime, windAt, type Race } from '../sim/race';
import { getLang, ordinal, t, type Lang, type TextKey } from './i18n';
import { chestCatalog, type ChestType } from '../data';
import { chestSvg } from './chests';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const tk = (k: string) => t(k as TextKey);

export function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

export interface ResultsInfo {
  rank: number;
  participants: number;
  coins: number;
  bonus: number;
  balance: number;
  standings: { name: string; rating: number; coat: string; time: number; isPlayer: boolean }[];
  /** Photo-finish si l'arrivée était serrée. */
  photo?: { url: string; gap: number; rival: string } | null;
  /** Coffre gagné à cette course. */
  rewards?: { chest: ChestType | null; chestStored: boolean; chestCoins: number };
}

export interface HudCallbacks {
  onPause(): void;
  onResume(): void;
  onRestart(): void;
  onQuit(): void;
  onSensitivity(v: number): void;
  onDebug(on: boolean): void;
  onLang(l: Lang): void;
  onIdealLine(on: boolean): void;
  onLefty(on: boolean): void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const GAUGE_CX = 70;
const GAUGE_CY = 72;
const GAUGE_R = 56;

function gaugePoint(frac: number, r: number): [number, number] {
  const a = Math.PI * (1 - frac);
  return [GAUGE_CX + r * Math.cos(a), GAUGE_CY - r * Math.sin(a)];
}

export class Hud {
  private lap = $('hud-lap');
  private time = $('hud-time');
  private best = $('hud-best');
  private speed = $('hud-speed');
  private flash = $('hud-flash');
  private countdown = $('countdown');
  private hint = $('steer-hint');
  private speedLines = $('speed-lines');
  private speedFx = 0;
  private knobBase = $('knob-base');
  private knob = $('knob');
  private debugEl = $<HTMLPreElement>('debug');
  private pauseMenu = $('pause-menu');
  private results = $('results');
  private sens = $<HTMLInputElement>('rng-sensitivity');
  private dbg = $<HTMLInputElement>('chk-debug');
  private lastCount = '';
  private hintShown = true;
  private zoneRect: DOMRect | null = null;
  private slideTimer = 0;
  private lastUpdate = performance.now();
  private gait = $('hud-gait');
  private needle = document.getElementById('gauge-needle') as unknown as SVGLineElement;
  private lastGait = '';
  private gallopBtn = $('btn-gallop');
  private rankEl = $('hud-rank');
  private progress = $('hud-progress-track');
  private dots: HTMLElement[] = [];
  private mapTrack: unknown = null;
  private mapDots: SVGCircleElement[] = [];
  private mapScale = { x0: 0, y0: 0, k: 1 };
  private lastCordeTick = -1;
  private lastBoost = 0;
  private eventMsg = '';
  private eventClass = '';
  private eventTimer = 0;
  private lastItemTick = -1;
  private biefShown = false;
  private weatherRace: Race | null = null;
  private needleKmh = 0;

  constructor(
    private zone: HTMLElement,
    race: Race,
    cb: HudCallbacks,
    sensitivity: number,
    debug: boolean,
    idealLine: boolean,
    lefty: boolean,
  ) {
    this.applyTexts();
    this.buildGauge(race.balance.hud);
    document.querySelectorAll<HTMLButtonElement>('.seg[data-lang]').forEach((b) =>
      b.addEventListener('click', () => {
        cb.onLang(b.dataset.lang as Lang);
        this.applyTexts();
      }),
    );

    const ideal = $<HTMLInputElement>('chk-ideal');
    const left = $<HTMLInputElement>('chk-lefty');
    ideal.checked = idealLine;
    left.checked = lefty;
    $('app').classList.toggle('lefty', lefty);
    ideal.addEventListener('change', () => cb.onIdealLine(ideal.checked));
    left.addEventListener('change', () => {
      $('app').classList.toggle('lefty', left.checked);
      this.zoneRect = null;
      cb.onLefty(left.checked);
    });
    this.sens.value = String(sensitivity);
    this.dbg.checked = debug;
    this.debugEl.style.display = debug ? 'block' : 'none';

    $('btn-pause').addEventListener('click', () => cb.onPause());
    $('btn-resume').addEventListener('click', () => cb.onResume());
    $('btn-restart').addEventListener('click', () => cb.onRestart());
    $('btn-replay').addEventListener('click', () => cb.onRestart());
    $('btn-quit').addEventListener('click', () => cb.onQuit());
    $('btn-home').addEventListener('click', () => cb.onQuit());
    $('btn-settings').addEventListener('click', () => this.showSettings(true));
    $('btn-settings-back').addEventListener('click', () => this.showSettings(false));
    this.sens.addEventListener('input', () => cb.onSensitivity(Number(this.sens.value)));
    this.dbg.addEventListener('change', () => {
      this.debugEl.style.display = this.dbg.checked ? 'block' : 'none';
      cb.onDebug(this.dbg.checked);
    });
    window.addEventListener('resize', () => (this.zoneRect = null));
  }

  /** (Ré)applique tous les textes fixes dans la langue courante. */
  applyTexts(): void {
    const set = (id: string, key: TextKey) => ($(id).textContent = t(key));
    set('hud-kmh', 'kmh');
    set('steer-hint', 'steerHint');
    set('pause-title', 'pause');
    set('btn-resume', 'resume');
    set('btn-restart', 'restart');
    set('lbl-sensitivity', 'sensitivity');
    set('lbl-debug', 'debug');
    set('lbl-language', 'language');
    set('btn-quit', 'quit');
    set('btn-home', 'home');
    set('settings-title', 'settings');
    set('btn-settings-back', 'back');
    set('res-title', 'finish');
    set('res-total-lbl', 'total');
    set('res-best-lbl', 'bestLap');
    set('btn-replay', 'replay');
    $('gauge').title = t('speedNote');
    document.querySelectorAll<HTMLButtonElement>('.seg[data-lang]').forEach((b) => b.classList.toggle('on', b.dataset.lang === getLang()));
    this.lastGait = '';
  }

  private buildGauge(cfg: Race['balance']['hud']): void {
    const arcs = document.getElementById('gauge-arcs')!;
    const ticks = document.getElementById('gauge-ticks')!;
    const max = cfg.gaugeMaxKmh;
    const zones: [number, number, string][] = [
      [0, 8, '#cfc7bf'],
      [8, 25, '#8fd1a8'],
      [25, 40, '#2E8B57'],
      [40, cfg.realTopKmh, '#F5B301'],
      [cfg.realTopKmh, max, '#D80621'],
    ];
    for (const [a, b, color] of zones) {
      const [x1, y1] = gaugePoint(a / max, GAUGE_R);
      const [x2, y2] = gaugePoint(b / max, GAUGE_R);
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', `M${x1.toFixed(2)},${y1.toFixed(2)} A${GAUGE_R},${GAUGE_R} 0 0 1 ${x2.toFixed(2)},${y2.toFixed(2)}`);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', color);
      path.setAttribute('stroke-width', '11');
      arcs.appendChild(path);
    }
    for (let k = 0; k <= max; k += 10) {
      const [x1, y1] = gaugePoint(k / max, GAUGE_R - 9);
      const [x2, y2] = gaugePoint(k / max, GAUGE_R - 15);
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', x1.toFixed(2));
      line.setAttribute('y1', y1.toFixed(2));
      line.setAttribute('x2', x2.toFixed(2));
      line.setAttribute('y2', y2.toFixed(2));
      line.setAttribute('stroke', '#5B3A29');
      line.setAttribute('stroke-width', k % 20 === 0 ? '2.5' : '1.5');
      ticks.appendChild(line);
      if (k % 20 === 0) {
        const [tx, ty] = gaugePoint(k / max, GAUGE_R - 24);
        const label = document.createElementNS(SVG_NS, 'text');
        label.setAttribute('x', tx.toFixed(2));
        label.setAttribute('y', (ty + 3.5).toFixed(2));
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('font-size', '10');
        label.setAttribute('font-weight', '800');
        label.setAttribute('fill', '#5B3A29');
        label.textContent = String(k);
        ticks.appendChild(label);
      }
    }
  }

  showSettings(on: boolean): void {
    $('settings').hidden = !on;
  }

  /** Mini-carte : tracé du circuit et un point par orignal (le joueur en rouge, au-dessus). */
  private updateMinimap(race: Race): void {
    const S = race.track.samples;
    if (this.mapTrack !== race.track || this.mapDots.length !== race.racers.length) {
      this.mapTrack = race.track;
      const xs = S.map((p) => p.x);
      const ys = S.map((p) => p.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const k = 88 / Math.max(maxX - minX, maxY - minY);
      this.mapScale = { x0: 50 - ((minX + maxX) / 2) * k, y0: 50 + ((minY + maxY) / 2) * k, k };
      const d = S.filter((_, i) => i % 4 === 0)
        .map((p, i) => `${i ? 'L' : 'M'}${(this.mapScale.x0 + p.x * k).toFixed(1)},${(this.mapScale.y0 - p.y * k).toFixed(1)}`)
        .join(' ');
      document.getElementById('minimap-path')!.setAttribute('d', `${d}Z`);
      // Bifurcation : la branche en pointillés.
      const fp = race.fork
        ? race.fork.samples
            .filter((_, i) => i % 4 === 0)
            .map((p, i) => `${i ? 'L' : 'M'}${(this.mapScale.x0 + p.x * k).toFixed(1)},${(this.mapScale.y0 - p.y * k).toFixed(1)}`)
            .join(' ')
        : '';
      document.getElementById('minimap-fork')!.setAttribute('d', fp);
      const g = document.getElementById('minimap-dots')!;
      g.replaceChildren();
      this.mapDots = race.racers
        .map((x, i) => {
          const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          c.setAttribute('r', i === 0 ? '4.5' : '3');
          c.setAttribute('fill', i === 0 ? '#D80621' : x.coat);
          c.setAttribute('stroke', '#fff');
          c.setAttribute('stroke-width', '1.2');
          return c;
        })
        .reverse();
      this.mapDots.forEach((c) => g.appendChild(c));
      this.mapDots.reverse();
    }
    const { x0, y0, k } = this.mapScale;
    race.racers.forEach((x, i) => {
      this.mapDots[i].setAttribute('cx', (x0 + x.moose.x * k).toFixed(1));
      this.mapDots[i].setAttribute('cy', (y0 - x.moose.y * k).toFixed(1));
    });
  }

  private showEvent(text: string, cls: string): void {
    this.eventMsg = text;
    this.eventClass = cls;
    this.eventTimer = 1;
  }

  showPodiumTitle(on: boolean): void {
    const el = $('podium-title');
    el.textContent = t('podium');
    el.hidden = !on;
    $('app').classList.toggle('on-podium', on);
  }

  showPause(on: boolean): void {
    this.pauseMenu.hidden = !on;
  }

  showResults(race: Race, record: boolean, info?: ResultsInfo): void {
    const r = race.racers[0];
    if (info) {
      $('res-title').textContent = info.participants > 1 ? t('finish') : t('finish');
      $('res-rank').textContent = info.participants > 1 ? `${ordinal(info.rank)} / ${info.participants}` : t('solo');
      const list = $('res-standings');
      list.replaceChildren();
      if (info.participants > 1) {
        info.standings.forEach((st, i) => {
          const li = document.createElement('li');
          li.className = st.isPlayer ? 'me' : '';
          if (i < 3) li.classList.add(`podium-${i + 1}`);
          li.innerHTML = `<span class="pos"></span><span class="dot"></span><span class="nm"></span><span class="rt"></span><span class="tm"></span>`;
          (li.querySelector('.pos') as HTMLElement).textContent = ordinal(i + 1);
          (li.querySelector('.dot') as HTMLElement).style.background = st.coat;
          (li.querySelector('.nm') as HTMLElement).textContent = st.name;
          (li.querySelector('.rt') as HTMLElement).textContent = String(st.rating);
          (li.querySelector('.tm') as HTMLElement).textContent = formatTime(st.time);
          list.appendChild(li);
        });
      }
      const fig = $('res-photo');
      fig.hidden = !info.photo;
      if (info.photo) {
        (fig.querySelector('img') as HTMLImageElement).src = info.photo.url;
        (fig.querySelector('img') as HTMLImageElement).alt = t('photoFinish');
        const n = Math.abs(info.photo.gap)
          .toFixed(2)
          .replace('.', getLang() === 'fr' ? ',' : '.');
        (fig.querySelector('figcaption') as HTMLElement).textContent = `${t('photoFinish')} · ${t(
          info.photo.gap >= 0 ? 'photoAhead' : 'photoBehind',
        )
          .replace('{name}', info.photo.rival)
          .replace('{n}', n)}`;
      }
      const chestEl = $('res-chest');
      const rw = info.rewards;
      chestEl.hidden = !rw?.chest;
      if (rw?.chest) {
        chestEl.innerHTML = chestSvg(rw.chest);
        const span = document.createElement('span');
        const chestName = chestCatalog.types[rw.chest].name[getLang()];
        span.textContent = rw.chestStored
          ? t('chestWon').replace('{name}', chestName)
          : t('chestFull').replace('{name}', chestName).replace('{n}', String(rw.chestCoins));
        chestEl.appendChild(span);
        chestEl.classList.toggle('converted', !rw.chestStored);
      }
      const coinsEl = $('res-coins');
      coinsEl.innerHTML = `<span class="coin"><svg viewBox="0 0 24 24"><use href="#i-leaf"/></svg></span><b>+0</b><small></small>`;
      (coinsEl.querySelector('small') as HTMLElement).textContent = info.bonus
        ? `${t('firstWin')} +${info.bonus}`
        : `${t('balanceLbl')} ${info.balance}`;
      // Pièces qui défilent jusqu'au gain.
      const b = coinsEl.querySelector('b') as HTMLElement;
      const start = performance.now();
      const anim = (now: number) => {
        const k = Math.min(1, (now - start) / 900);
        b.textContent = `+${Math.round(info.coins * (1 - Math.pow(1 - k, 3)))}`;
        if (k < 1) requestAnimationFrame(anim);
      };
      requestAnimationFrame(anim);
    }
    $('res-total').textContent = formatTime(r.finishTime);
    $('res-best').textContent = formatTime(Math.min(...r.lapTimes));
    const colon = getLang() === 'fr' ? ' : ' : ': ';
    $('res-laps').textContent = r.lapTimes.map((x, i) => `${t('lap')} ${i + 1}${colon}${formatTime(x)}`).join('  ·  ');
    $('res-record').textContent = record ? t('record') : '';
    this.results.hidden = false;
  }

  hideResults(): void {
    this.results.hidden = true;
  }

  /** Aide des commandes : seulement pour les premières courses, et elle s'efface d'elle-même. */
  resetHint(show = true): void {
    this.hintShown = show;
    this.hint.classList.toggle('hide', !show);
  }

  update(race: Race, steer: SteerTouchVisual, bestLap: number | undefined, debugText: string | null): void {
    const r = race.racers[0];
    const N = race.racers.length;
    this.rankEl.style.display = N > 1 ? '' : 'none';
    if (N > 1) this.rankEl.textContent = `${ordinal(rankOf(race, 0))}/${N}`;
    // Barre de progression : un point par orignal, le joueur en rouge.
    if (this.dots.length !== N) {
      this.progress.replaceChildren();
      this.dots = race.racers.map((x, i) => {
        const d = document.createElement('span');
        d.className = i === 0 ? 'pdot me' : 'pdot';
        d.style.background = i === 0 ? '' : x.coat;
        this.progress.appendChild(d);
        return d;
      });
    }
    const total = race.laps * race.track.length;
    race.racers.forEach((x, i) => {
      const f = Math.max(0, Math.min(1, x.distance / total));
      this.dots[i].style.left = `${(f * 100).toFixed(2)}%`;
    });
    this.updateMinimap(race);
    // Vent de travers : flèche orientée par rapport à l'orignal (haut = devant), taille selon la rafale.
    const windEl = $('hud-wind');
    windEl.hidden = !race.track.def.wind;
    if (race.track.def.wind) {
      const w = windAt(race);
      const ang = Math.atan2(w.y, w.x) - r.moose.heading;
      const deg = (-ang * 180) / Math.PI + 90;
      const arrow = document.getElementById('wind-arrow')!;
      arrow.setAttribute('transform', `rotate(${deg.toFixed(0)} 12 12) scale(${(0.6 + 0.5 * w.gust).toFixed(2)})`);
      arrow.style.transformOrigin = '12px 12px';
      windEl.classList.toggle('gust', w.gust > 0.7);
    }
    const lapNow = Math.min(race.laps, r.lapsDone + 1);
    this.lap.textContent = `${t('lap')} ${lapNow}/${race.laps}`;
    this.time.textContent = formatTime(r.finished ? r.finishTime : raceTime(race));
    this.best.textContent = bestLap ? `${t('best')} ${formatTime(bestLap)}` : '';

    // Compteur : vitesse ramenée à celle d'un vrai orignal (pointe en course = realTopKmh).
    const hudCfg = race.balance.hud;
    const kmh = (r.moose.speed * hudCfg.realTopKmh) / race.balance.moose.topSpeed;
    this.needleKmh += (kmh - this.needleKmh) * 0.35;
    this.speed.textContent = String(Math.round(kmh));
    const frac = Math.max(0, Math.min(1, this.needleKmh / hudCfg.gaugeMaxKmh));
    this.needle.style.transform = `rotate(${(frac * 180 - 90).toFixed(1)}deg)`;
    const gaitKey = (hudCfg.gaits.find((g) => kmh < g[0]) ?? hudCfg.gaits[hudCfg.gaits.length - 1])[1];
    if (gaitKey !== this.lastGait) {
      this.lastGait = gaitKey;
      this.gait.textContent = t(gaitKey as TextKey);
      this.gait.classList.toggle('super', gaitKey === 'gaitSuper');
    }

    // Annonce de la météo au début du compte à rebours.
    if (race !== this.weatherRace) {
      this.weatherRace = race;
      if (race.weather !== 'clair') this.showEvent(t(race.weather === 'pluie' ? 'weatherRain' : 'weatherFog'), '');
    }

    // Compte à rebours 3, 2, 1, Partez !
    let c = '';
    if (race.phase === 'countdown') c = String(Math.ceil(countdownRemaining(race)));
    else if (raceTime(race) < 0.8) c = t('go');
    if (c !== this.lastCount) {
      this.lastCount = c;
      this.countdown.textContent = c;
      this.countdown.classList.remove('pop');
      void this.countdown.offsetWidth;
      if (c) this.countdown.classList.add('pop');
    }

    // Message bref en cas de vraie survitesse (dérapage fort et prolongé) ou de bas-côté.
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastUpdate) / 1000);
    this.lastUpdate = now;
    const cfg = race.balance.hud;
    this.slideTimer = r.moose.sliding && r.moose.slip > cfg.slideMessageSlip ? this.slideTimer + dt : 0;
    // Événements brefs : corde parfaite, élan libéré.
    if (r.lastCordeTick !== this.lastCordeTick) {
      if (r.lastCordeTick >= 0) this.showEvent(t('corde'), 'good');
      this.lastCordeTick = r.lastCordeTick;
    }
    if (r.moose.boostTime > this.lastBoost + 0.2) this.showEvent(t('boost'), 'gold');
    this.lastBoost = r.moose.boostTime;
    this.eventTimer = Math.max(0, this.eventTimer - dt);

    let msg = '';
    let cls = '';
    if (this.eventTimer > 0) {
      msg = this.eventMsg;
      cls = this.eventClass;
    } else if (this.slideTimer > cfg.slideMessageDelay) msg = t('sliding');
    else if (r.onVerge) msg = t('offTrack');
    if (msg) {
      this.flash.textContent = msg;
      this.flash.classList.toggle('good', cls === 'good');
      this.flash.classList.toggle('gold', cls === 'gold');
    }
    this.flash.classList.toggle('on', !!msg && (race.phase === 'running' || this.eventTimer > 0));

    // Mode spécial : bouton Castor, aide détenue, alerte ours.
    const castorBtn = $('btn-castor');
    castorBtn.hidden = !race.hazards;
    if (race.hazards) {
      const item = r.item;
      castorBtn.classList.toggle('empty', !item);
      $('castor-label').textContent = item ? tk(`item_${item}`) : t('castorBtn');
      $('castor-icon').className = `castor-icon ${item ?? ''}`;
      if (r.biefOpen > 0 && !this.biefShown) {
        this.showEvent(t('biefOpen'), 'gold');
        this.biefShown = true;
      } else if (r.biefOpen <= 0) this.biefShown = false;
      if (r.lastItemTick !== this.lastItemTick) {
        if (item) this.showEvent(t('gotItem').replace('{n}', tk(`item_${item}`)), 'gold');
        this.lastItemTick = r.lastItemTick;
      }
      const n = race.track.samples.length;
      const near = race.hazards.bears.some((b) => {
        let di = b.index - r.proj.index;
        if (di < 0) di += n;
        return (b.warning || (b.active && b.kind !== 'garde')) && di * race.track.spacing < 120;
      });
      if (near && this.eventTimer <= 0 && race.phase === 'running') {
        this.flash.textContent = t('bearAlert');
        this.flash.classList.add('on');
        this.flash.classList.remove('good', 'gold');
      }
    }

    // Bouton Galop : anneau d'endurance.
    this.gallopBtn.style.setProperty('--endurance', r.moose.endurance.toFixed(3));
    this.gallopBtn.classList.toggle('on', r.moose.galloping);
    // Lignes de vitesse sur les bords : au-delà de 85 % de la vitesse de pointe, plus fortes au galop et
    // pendant l'élan. Lissées pour ne pas clignoter.
    const ratio = r.moose.speed / r.params.topSpeed;
    const fxTarget = Math.max(0, Math.min(1, (ratio - 0.85) / 0.3)) * (r.moose.galloping || r.moose.boostTime > 0 ? 1 : 0.45);
    this.speedFx += (fxTarget - this.speedFx) * 0.12;
    this.speedLines.style.opacity = this.speedFx.toFixed(3);
    this.gallopBtn.classList.toggle('tired', r.moose.exhausted);

    // L'aide s'efface 5 s après le départ, ou dès le premier coup de pouce.
    if (this.hintShown && race.phase === 'running' && raceTime(race) > 5) {
      this.hintShown = false;
      this.hint.classList.add('hide');
    }
    // Repère du pouce.
    if (steer.active) {
      if (this.hintShown) {
        this.hintShown = false;
        this.hint.classList.add('hide');
      }
      if (!this.zoneRect) this.zoneRect = this.zone.getBoundingClientRect();
      const zr = this.zoneRect;
      this.knobBase.style.display = 'block';
      this.knobBase.style.left = `${steer.originX - zr.left}px`;
      this.knobBase.style.top = `${steer.originY - zr.top}px`;
      this.knob.style.transform = `translateX(${-steer.steer * 50}px)`;
    } else {
      this.knobBase.style.display = 'none';
    }

    if (debugText !== null) this.debugEl.textContent = debugText;
  }
}
