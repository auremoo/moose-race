/**
 * Rendu : lit l'état de la simulation (lecture seule) et l'interpole entre deux pas.
 */
import * as THREE from 'three';
import type { Balance } from '../data';
import type { Race } from '../sim/race';
import { ChaseCamera } from './camera';
import { simToWorldX, simToWorldZ } from './coords';
import { createMooseView, type MooseView } from './moose';
import { buildWorld } from './world';

export interface Pose {
  x: number;
  y: number;
  heading: number;
}

const DUST_COUNT = 80;

/** Petite tache ronde et floue pour les particules de poussière. */
function dotTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class GameView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly chase: ChaseCamera;
  private moose: MooseView[] = [];
  private debugLine: THREE.Line;
  private world: THREE.Group;
  private dust: THREE.Points;
  private dustLife = new Float32Array(DUST_COUNT);
  private dustVel = new Float32Array(DUST_COUNT * 3);
  private dustNext = 0;
  private dustAcc = 0;
  private showcaseOn = false;
  private showcaseTime = 0;
  private lastW = 0;
  private lastH = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    race: Race,
    balance: Balance,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.chase = new ChaseCamera(balance.camera);
    const { group, debugLine } = buildWorld(this.scene, race.track);
    this.world = group;
    this.debugLine = debugLine;
    this.addMoose(race.racers.length);

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(DUST_COUNT * 3), 3));
    this.dust = new THREE.Points(
      g,
      new THREE.PointsMaterial({
        color: 0xd9c19a,
        size: 0.7,
        map: dotTexture(),
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
        alphaTest: 0.05,
      }),
    );
    this.dust.frustumCulled = false;
    this.scene.add(this.dust);
    this.resize();
    // La taille réelle du canvas peut changer sans événement « resize » (barre d'adresse iOS,
    // navigateur intégré d'une app) : on observe le canvas et on vérifie aussi à chaque image.
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => this.resize()).observe(canvas);
  }

  private addMoose(count: number): void {
    for (let i = 0; i < count; i++) {
      const mv = createMooseView();
      this.moose.push(mv);
      this.scene.add(mv.root);
    }
  }

  /** Change de circuit : le décor est reconstruit, l'ancien libéré de la mémoire graphique. */
  setRace(race: Race): void {
    const debugOn = this.debugLine.visible;
    this.scene.remove(this.world);
    this.world.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
      const mats = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
      for (const m of mats) {
        (m as THREE.MeshBasicMaterial).map?.dispose();
        m.dispose();
      }
    });
    const { group, debugLine } = buildWorld(this.scene, race.track);
    this.world = group;
    this.debugLine = debugLine;
    this.debugLine.visible = debugOn;
    for (const mv of this.moose) this.scene.remove(mv.root);
    this.moose = [];
    this.addMoose(race.racers.length);
    this.chase.reset();
  }

  /** Menus : caméra vitrine devant l'orignal au lieu de la vue poursuite. */
  setShowcase(on: boolean): void {
    this.showcaseOn = on;
    this.chase.reset();
  }

  setDebug(on: boolean): void {
    this.debugLine.visible = on;
  }

  resize(): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w === 0 || h === 0) return;
    this.lastW = w;
    this.lastH = h;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    this.chase.setAspect(w / h);
  }

  render(race: Race, prev: Pose[], alpha: number, dt: number): void {
    if (this.canvas.clientWidth !== this.lastW || this.canvas.clientHeight !== this.lastH) this.resize();
    for (let i = 0; i < race.racers.length; i++) {
      const m = race.racers[i].moose;
      const p = prev[i];
      const x = p.x + (m.x - p.x) * alpha;
      const y = p.y + (m.y - p.y) * alpha;
      let dh = m.heading - p.heading;
      if (dh > Math.PI) dh -= 2 * Math.PI;
      else if (dh < -Math.PI) dh += 2 * Math.PI;
      const heading = p.heading + dh * alpha;
      const view = this.moose[i];
      view.root.position.set(simToWorldX(x), 0, simToWorldZ(y));
      view.root.rotation.y = heading;
      view.update(m, dt);
      if (i === 0 && this.showcaseOn) {
        this.showcaseTime += dt;
        this.chase.showcase(x, y, heading, this.showcaseTime);
      } else if (i === 0) {
        this.chase.update(x, y, heading, m.speed / race.balance.moose.topSpeed, dt);
        const r = race.racers[0];
        const emit = m.sliding ? 60 * Math.max(0.3, m.slip) : r.onVerge && m.speed > 5 ? 25 : 0;
        this.updateDust(x, y, heading, emit, dt);
      }
    }
    this.renderer.render(this.scene, this.chase.camera);
  }

  private updateDust(x: number, y: number, heading: number, rate: number, dt: number): void {
    const pos = this.dust.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    this.dustAcc += rate * dt;
    while (this.dustAcc >= 1) {
      this.dustAcc -= 1;
      const i = this.dustNext;
      this.dustNext = (this.dustNext + 1) % DUST_COUNT;
      const back = -1.5 + Math.random() * 0.6;
      const side = (Math.random() - 0.5) * 1.6;
      const cx = x + Math.cos(heading) * back - Math.sin(heading) * side;
      const cy = y + Math.sin(heading) * back + Math.cos(heading) * side;
      arr[i * 3] = simToWorldX(cx);
      arr[i * 3 + 1] = 0.3;
      arr[i * 3 + 2] = simToWorldZ(cy);
      this.dustVel[i * 3] = (Math.random() - 0.5) * 2;
      this.dustVel[i * 3 + 1] = 1 + Math.random() * 1.5;
      this.dustVel[i * 3 + 2] = (Math.random() - 0.5) * 2;
      this.dustLife[i] = 0.7;
    }
    for (let i = 0; i < DUST_COUNT; i++) {
      if (this.dustLife[i] <= 0) {
        arr[i * 3 + 1] = -10;
        continue;
      }
      this.dustLife[i] -= dt;
      arr[i * 3] += this.dustVel[i * 3] * dt;
      arr[i * 3 + 1] += this.dustVel[i * 3 + 1] * dt;
      arr[i * 3 + 2] += this.dustVel[i * 3 + 2] * dt;
    }
    pos.needsUpdate = true;
  }
}
