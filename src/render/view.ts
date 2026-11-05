/**
 * Rendu : lit l'état de la simulation (lecture seule) et l'interpole entre deux pas.
 */
import * as THREE from 'three';
import type { Balance } from '../data';
import type { Race } from '../sim/race';
import { ChaseCamera } from './camera';
import { simToWorldX, simToWorldZ } from './coords';
import { createMooseView, type MooseView } from './moose';
import { Particles } from './particles';
import { buildWorld, type IdealLine } from './world';

export interface Pose {
  x: number;
  y: number;
  heading: number;
}

const C = {
  dust: new THREE.Color(0xd9c19a),
  snow: new THREE.Color(0xffffff),
  mud: new THREE.Color(0x5a3d26),
  blue: new THREE.Color(0x4fb3ff),
  gold: new THREE.Color(0xffc21a),
  breath: new THREE.Color(0xf4f8ff),
  lineOk: new THREE.Color(0x2ee37a),
  lineHot: new THREE.Color(0xff2a3d),
  lineFar: new THREE.Color(0xffffff),
};

export class GameView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly chase: ChaseCamera;
  private moose: MooseView[] = [];
  private debugLine!: THREE.Line;
  private world!: THREE.Group;
  private ideal!: IdealLine;
  private idealOn = true;
  private dust = new Particles(120, 0.7, false, -0.5);
  private sparks = new Particles(160, 0.4, true, 6);
  private breath = new Particles(40, 0.9, false, -0.3);
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
    this.buildTrackWorld(race);
    this.addMoose(race);
    this.scene.add(this.dust.points, this.sparks.points, this.breath.points);
    this.resize();
    // La taille réelle du canvas peut changer sans événement « resize » (barre d'adresse iOS,
    // navigateur intégré d'une app) : on observe le canvas et on vérifie aussi à chaque image.
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => this.resize()).observe(canvas);
  }

  private buildTrackWorld(race: Race): void {
    const w = buildWorld(this.scene, race.track, race.line);
    this.world = w.group;
    this.debugLine = w.debugLine;
    this.ideal = w.ideal;
    this.ideal.mesh.visible = this.idealOn;
  }

  private addMoose(race: Race): void {
    for (const r of race.racers) {
      const mv = createMooseView({ coat: r.coat, size: r.size, accessory: r.accessory });
      this.moose.push(mv);
      this.scene.add(mv.root);
    }
  }

  private disposeObject(o: THREE.Object3D): void {
    o.traverse((x) => {
      const mesh = x as THREE.Mesh;
      mesh.geometry?.dispose();
      const mats = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
      for (const m of mats) {
        (m as THREE.MeshBasicMaterial).map?.dispose();
        m.dispose();
      }
    });
  }

  /** Nouvelle course : participants recréés ; décor reconstruit seulement si le circuit change. */
  setRace(race: Race, trackChanged = true): void {
    if (trackChanged) {
      const debugOn = this.debugLine.visible;
      this.scene.remove(this.world);
      this.disposeObject(this.world);
      this.buildTrackWorld(race);
      this.debugLine.visible = debugOn;
    }
    for (const mv of this.moose) {
      this.scene.remove(mv.root);
      this.disposeObject(mv.root);
    }
    this.moose = [];
    this.addMoose(race);
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

  setIdealLine(on: boolean): void {
    this.idealOn = on;
    this.ideal.mesh.visible = on;
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
        const shake = race.tick - race.racers[0].lastContactTick < 12 || m.stunTime > 0 ? 0.25 : 0;
        this.chase.update(x, y, heading, m.speed / race.balance.moose.topSpeed, dt, m.galloping || m.boostTime > 0, shake);
        this.effects(race, x, y, heading, dt);
      }
    }
    if (this.idealOn && !this.showcaseOn) this.colorIdealLine(race);
    this.dust.update(dt);
    this.sparks.update(dt);
    this.breath.update(dt);
    this.renderer.render(this.scene, this.chase.camera);
  }

  /**
   * Ligne idéale : verte si la vitesse actuelle permet encore de passer le point en freinant,
   * rouge s'il faut freiner maintenant ; blanche et discrète au-delà de 160 m.
   */
  private colorIdealLine(race: Race): void {
    const r = race.racers[0];
    const n = race.track.samples.length;
    const v = r.moose.speed;
    const decel = race.balance.moose.brakeDecel * 0.75;
    const arr = this.ideal.colors.array as Float32Array;
    const ahead = Math.round(160 / race.track.spacing);
    for (let j = 0; j <= n; j++) {
      const i = j % n;
      let di = i - r.proj.index;
      if (di < 0) di += n;
      let c = C.lineFar;
      let fade = 0.25;
      if (di <= ahead) {
        const dist = di * race.track.spacing;
        const vLine = race.line.speed[i];
        const reachable = Math.sqrt(vLine * vLine + 2 * decel * Math.max(0, dist - 2));
        c = v > reachable + 0.4 ? C.lineHot : C.lineOk;
        fade = 1 - (di / ahead) * 0.6;
      }
      for (let side = 0; side < 2; side++) {
        const o = (j * 2 + side) * 3;
        arr[o] = c.r * fade;
        arr[o + 1] = c.g * fade;
        arr[o + 2] = c.b * fade;
      }
    }
    this.ideal.colors.needsUpdate = true;
  }

  private effects(race: Race, x: number, y: number, heading: number, dt: number): void {
    const r = race.racers[0];
    const m = r.moose;
    const ch = Math.cos(heading);
    const sh = Math.sin(heading);
    const at = (back: number, side: number, h: number): [number, number, number] => [
      simToWorldX(x + ch * back - sh * side),
      h,
      simToWorldZ(y + sh * back + ch * side),
    ];
    const rnd = (a: number) => (Math.random() - 0.5) * a;

    // Poussière (ou neige, ou boue) : dérapage, glissade, bas-côté.
    const surface = r.onVerge ? race.track.def.vergeSurface : race.track.samples[r.proj.index].surface;
    const dustColor = surface === 'neige' || surface === 'glace' ? C.snow : surface === 'boue' ? C.mud : C.dust;
    const dustRate = m.drifting ? 50 : m.sliding ? 60 * Math.max(0.3, m.slip) : r.onVerge && m.speed > 5 ? 25 : 0;
    for (let k = this.dust.due(dustRate, dt); k > 0; k--) {
      const [px, py, pz] = at(-1.5 + rnd(0.6), rnd(1.6), 0.3);
      this.dust.emit(px, py, pz, rnd(2), 1 + Math.random() * 1.5, rnd(2), 0.7, dustColor);
    }

    // Gerbes de glissade : bleues pendant la charge, or quand l'élan est plein.
    if (m.drifting) {
      const col = m.boostCharge >= 1 ? C.gold : m.boostCharge > 0 ? C.blue : C.dust;
      for (let k = this.sparks.due(m.boostCharge > 0 ? 90 : 20, dt); k > 0; k--) {
        const side = (Math.random() < 0.5 ? -1 : 1) * 0.5;
        const [px, py, pz] = at(-1.6, side, 0.15);
        this.sparks.emit(px, py, pz, rnd(3) - ch * 2, 2 + Math.random() * 2, rnd(3) + sh * 2, 0.45, col);
      }
    }
    // Élan libéré : traînée dorée.
    if (m.boostTime > 0) {
      for (let k = this.sparks.due(70, dt); k > 0; k--) {
        const [px, py, pz] = at(-2, rnd(1), 1 + Math.random());
        this.sparks.emit(px, py, pz, rnd(1), 0.5, rnd(1), 0.35, C.gold);
      }
    }
    // Souffle visible au galop.
    if (m.galloping) {
      for (let k = this.breath.due(14, dt); k > 0; k--) {
        const [px, py, pz] = at(2.4, rnd(0.3), 2.7);
        this.breath.emit(px, py, pz, ch * m.speed * 0.6 + rnd(1), 0.4, -sh * m.speed * 0.6 + rnd(1), 0.6, C.breath);
      }
    }
  }
}
