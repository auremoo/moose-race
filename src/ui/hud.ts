/**
 * Affichage en course et menus. Lit la simulation (lecture seule) et les réglages (meta/).
 */
import type { SteerTouchVisual } from '../input/input';
import { countdownRemaining, raceTime, type Race } from '../sim/race';
import { t } from './i18n';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

export interface HudCallbacks {
  onPause(): void;
  onResume(): void;
  onRestart(): void;
  onSensitivity(v: number): void;
  onDebug(on: boolean): void;
}

export class Hud {
  private lap = $('hud-lap');
  private time = $('hud-time');
  private best = $('hud-best');
  private speed = $('hud-speed');
  private flash = $('hud-flash');
  private countdown = $('countdown');
  private hint = $('steer-hint');
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

  constructor(
    private zone: HTMLElement,
    cb: HudCallbacks,
    sensitivity: number,
    debug: boolean,
  ) {
    $('hud-kmh').textContent = t('kmh');
    this.hint.textContent = t('steerHint');
    $('pause-title').textContent = t('pause');
    $('btn-resume').textContent = t('resume');
    $('btn-restart').textContent = t('restart');
    $('lbl-sensitivity').textContent = t('sensitivity');
    $('lbl-debug').textContent = t('debug');
    $('lbl-sound').textContent = t('sound');
    $('res-title').textContent = t('finish');
    $('res-total-lbl').textContent = t('total');
    $('res-best-lbl').textContent = t('bestLap');
    $('btn-replay').textContent = t('replay');

    this.sens.value = String(sensitivity);
    this.dbg.checked = debug;
    this.debugEl.style.display = debug ? 'block' : 'none';

    $('btn-pause').addEventListener('click', () => cb.onPause());
    $('btn-resume').addEventListener('click', () => cb.onResume());
    $('btn-restart').addEventListener('click', () => cb.onRestart());
    $('btn-replay').addEventListener('click', () => cb.onRestart());
    this.sens.addEventListener('input', () => cb.onSensitivity(Number(this.sens.value)));
    this.dbg.addEventListener('change', () => {
      this.debugEl.style.display = this.dbg.checked ? 'block' : 'none';
      cb.onDebug(this.dbg.checked);
    });
    window.addEventListener('resize', () => (this.zoneRect = null));
  }

  showPause(on: boolean): void {
    this.pauseMenu.hidden = !on;
  }

  showResults(race: Race, record: boolean): void {
    const r = race.racers[0];
    $('res-total').textContent = formatTime(r.finishTime);
    $('res-best').textContent = formatTime(Math.min(...r.lapTimes));
    $('res-laps').textContent = r.lapTimes.map((x, i) => `${t('lap')} ${i + 1} : ${formatTime(x)}`).join('  ·  ');
    $('res-record').textContent = record ? t('record') : '';
    this.results.hidden = false;
  }

  hideResults(): void {
    this.results.hidden = true;
  }

  resetHint(): void {
    this.hintShown = true;
    this.hint.classList.remove('hide');
  }

  update(race: Race, steer: SteerTouchVisual, bestLap: number | undefined, debugText: string | null): void {
    const r = race.racers[0];
    const lapNow = Math.min(race.laps, r.lapsDone + 1);
    this.lap.textContent = `${t('lap')} ${lapNow}/${race.laps}`;
    this.time.textContent = formatTime(r.finished ? r.finishTime : raceTime(race));
    this.best.textContent = bestLap ? `${t('best')} ${formatTime(bestLap)}` : '';
    this.speed.textContent = String(Math.round(r.moose.speed * 3.6));

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

    // Message bref en cas de survitesse ou de bas-côté.
    const msg = r.moose.sliding && r.moose.slip > 0.35 ? t('sliding') : r.onVerge ? t('offTrack') : '';
    if (msg) this.flash.textContent = msg;
    this.flash.classList.toggle('on', !!msg && race.phase === 'running');

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
