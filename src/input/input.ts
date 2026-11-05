/**
 * Entrées : convertit tactile et clavier en commandes abstraites.
 * Ne dépend de rien d'autre que du DOM ; la simulation ne voit que `Commands`.
 */

export interface Commands {
  steer: number;
  gallop: boolean;
  slide: boolean;
  castor: boolean;
}

export interface InputConfig {
  touchRangePx: number;
  touchCurve: number;
  keyboardRampPerSecond: number;
  sensitivity: number;
}

export interface SteerTouchVisual {
  active: boolean;
  originX: number;
  originY: number;
  x: number;
  y: number;
  /** Direction -1..1 après courbe de réponse. */
  steer: number;
}

export class InputManager {
  private keys = new Set<string>();
  private keySteer = 0;
  private touchId: number | null = null;
  private touchOriginX = 0;
  private touchOriginY = 0;
  private touchX = 0;
  private touchY = 0;
  private touchSteer = 0;
  readonly visual: SteerTouchVisual = { active: false, originX: 0, originY: 0, x: 0, y: 0, steer: 0 };

  constructor(
    private zone: HTMLElement,
    private cfg: InputConfig,
  ) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.reset);
    zone.addEventListener('pointerdown', this.onPointerDown);
    zone.addEventListener('pointermove', this.onPointerMove);
    zone.addEventListener('pointerup', this.onPointerUp);
    zone.addEventListener('pointercancel', this.onPointerUp);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.reset);
    this.zone.removeEventListener('pointerdown', this.onPointerDown);
    this.zone.removeEventListener('pointermove', this.onPointerMove);
    this.zone.removeEventListener('pointerup', this.onPointerUp);
    this.zone.removeEventListener('pointercancel', this.onPointerUp);
  }

  setSensitivity(v: number): void {
    this.cfg = { ...this.cfg, sensitivity: v };
  }

  reset = (): void => {
    this.keys.clear();
    this.keySteer = 0;
    this.touchId = null;
    this.touchSteer = 0;
    this.visual.active = false;
  };

  /** Lit les commandes du pas courant. `dt` sert à la rampe du clavier. */
  read(dt: number): Commands {
    // Clavier : rampe progressive vers ±1, retour rapide au centre.
    const left = this.keys.has('ArrowLeft') || this.keys.has('KeyA');
    const right = this.keys.has('ArrowRight') || this.keys.has('KeyD');
    const target = (left ? 1 : 0) - (right ? 1 : 0);
    const rate = this.cfg.keyboardRampPerSecond * (target === 0 || Math.sign(target) !== Math.sign(this.keySteer) ? 2 : 1);
    const delta = target - this.keySteer;
    this.keySteer += Math.max(-rate * dt, Math.min(rate * dt, delta));

    const steer = this.touchId !== null ? this.touchSteer : this.keySteer;
    return {
      steer,
      gallop: this.keys.has('Space'),
      slide: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'),
      castor: this.keys.has('KeyE'),
    };
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
    this.keys.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private onPointerDown = (e: PointerEvent): void => {
    if (this.touchId !== null) return;
    e.preventDefault();
    this.touchId = e.pointerId;
    this.zone.setPointerCapture?.(e.pointerId);
    this.touchOriginX = this.touchX = e.clientX;
    this.touchOriginY = this.touchY = e.clientY;
    this.updateTouch();
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.touchId) return;
    e.preventDefault();
    this.touchX = e.clientX;
    this.touchY = e.clientY;
    // Ancre flottante : si le pouce dépasse la plage, l'origine le suit (pas de butée frustrante).
    const range = this.cfg.touchRangePx / this.cfg.sensitivity;
    const dx = this.touchX - this.touchOriginX;
    if (dx > range) this.touchOriginX = this.touchX - range;
    else if (dx < -range) this.touchOriginX = this.touchX + range;
    this.updateTouch();
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.touchId) return;
    this.touchId = null;
    this.touchSteer = 0;
    this.visual.active = false;
  };

  private updateTouch(): void {
    const range = this.cfg.touchRangePx / this.cfg.sensitivity;
    const nx = Math.max(-1, Math.min(1, (this.touchX - this.touchOriginX) / range));
    // Glisser à droite = tourner à droite = steer négatif (convention sim : +1 à gauche).
    const curved = Math.sign(nx) * Math.pow(Math.abs(nx), this.cfg.touchCurve);
    this.touchSteer = -curved;
    const v = this.visual;
    v.active = true;
    v.originX = this.touchOriginX;
    v.originY = this.touchOriginY;
    v.x = this.touchX;
    v.y = this.touchY;
    v.steer = this.touchSteer;
  }
}
