/**
 * Didacticiel : première course guidée (ignorable). Chaque étape attend que le joueur ait fait
 * le geste demandé, ou passe d'elle-même après un délai.
 */
import type { Commands } from '../sim/moose';
import type { Race } from '../sim/race';
import { t, type TextKey } from './i18n';

interface Step {
  text: TextKey;
  done: (r: Race, c: Commands, since: number) => boolean;
}

const STEPS: Step[] = [
  { text: 'tuto1', done: (r) => r.racers[0].moose.speed > 8 },
  { text: 'tuto2', done: (_r, c, s) => Math.abs(c.steer) > 0.4 || s > 10 },
  { text: 'tuto3', done: (r, _c, s) => r.racers[0].moose.braking || s > 9 },
  { text: 'tuto4', done: (r, _c, s) => r.racers[0].cordeCount > 0 || s > 25 },
  { text: 'tuto5', done: (r, _c, s) => r.racers[0].moose.galloping || s > 12 },
  // Conseil sans geste à réussir : il s'affiche 7 s (la glissade volontaire n'existe plus).
  { text: 'tuto6', done: (_r, _c, s) => s > 7 },
  { text: 'tuto7', done: (_r, _c, s) => s > 6 },
];

export class Tutorial {
  private step = 0;
  private since = 0;
  active = false;
  private box = document.getElementById('tutorial')!;
  private text = document.getElementById('tutorial-text')!;

  constructor(onSkip: () => void) {
    document.getElementById('tutorial-skip')!.addEventListener('click', () => {
      this.stop();
      onSkip();
    });
  }

  start(): void {
    this.active = true;
    this.step = 0;
    this.since = 0;
    this.box.hidden = false;
    (document.getElementById('tutorial-skip') as HTMLElement).textContent = t('tutoSkip');
    this.render();
  }

  stop(): void {
    this.active = false;
    this.box.hidden = true;
  }

  private render(): void {
    this.text.textContent = t(STEPS[this.step].text);
    this.box.classList.remove('pop');
    void this.box.offsetWidth;
    this.box.classList.add('pop');
  }

  /** Appelé à chaque image pendant la course ; renvoie vrai quand le didacticiel est terminé. */
  update(r: Race, cmd: Commands, dt: number): boolean {
    if (!this.active || r.phase === 'countdown') return false;
    this.since += dt;
    if (STEPS[this.step].done(r, cmd, this.since)) {
      this.step++;
      this.since = 0;
      if (this.step >= STEPS.length) {
        this.stop();
        return true;
      }
      this.render();
    }
    return false;
  }
}
