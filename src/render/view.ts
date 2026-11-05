/**
 * Rendu : lit l'état de la simulation (lecture seule) et l'interpole entre deux pas.
 */
import * as THREE from 'three';
import type { Balance } from '../data';
import type { Race } from '../sim/race';
import { ChaseCamera } from './camera';
import { simToWorldX, simToWorldZ } from './coords';
import { createBarrageView, createBearView, createBeaverView, createShieldView, createWarningSprite } from './creatures';
import { createMooseView, type MooseView } from './moose';
import { Particles } from './particles';
import type { Biome } from './biomes';
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
  private hazardGroup = new THREE.Group();
  private bearViews: { root: THREE.Group; warn: THREE.Sprite; lastD: number }[] = [];
  private beaverViews: THREE.Group[] = [];
  private barragePool: THREE.Group[] = [];
  private shields: THREE.Mesh[] = [];
  private clock = 0;
  /** Densité du décor (qualité) : réduite sur les appareils modestes. */
  private density = 1;
  /** Qualité auto-adaptative : moyenne glissante des FPS. */
  private fpsAvg = 60;
  private qualityTimer = 0;
  private pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
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
    this.scene.add(this.dust.points, this.sparks.points, this.breath.points, this.hazardGroup);
    this.buildHazards(race);
    this.resize();
    // La taille réelle du canvas peut changer sans événement « resize » (barre d'adresse iOS,
    // navigateur intégré d'une app) : on observe le canvas et on vérifie aussi à chaque image.
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => this.resize()).observe(canvas);
  }

  private buildTrackWorld(race: Race): void {
    const w = buildWorld(this.scene, race.track, race.line, (race.biome ?? 'test') as Biome, this.density);
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
    this.buildHazards(race);
    this.chase.reset();
  }

  /** Ours, castors, barrages et boucliers du mode spécial. */
  private buildHazards(race: Race): void {
    this.scene.remove(this.hazardGroup);
    this.disposeObject(this.hazardGroup);
    this.hazardGroup = new THREE.Group();
    this.scene.add(this.hazardGroup);
    this.bearViews = [];
    this.beaverViews = [];
    this.barragePool = [];
    this.shields = [];
    const h = race.hazards;
    if (!h) return;
    for (let i = 0; i < h.bears.length; i++) {
      const root = createBearView();
      const warn = createWarningSprite();
      warn.visible = false;
      this.hazardGroup.add(root, warn);
      this.bearViews.push({ root, warn, lastD: 0 });
    }
    for (let i = 0; i < h.beavers.length; i++) {
      const bv = createBeaverView();
      this.hazardGroup.add(bv);
      this.beaverViews.push(bv);
    }
    for (let i = 0; i < 12; i++) {
      const b = createBarrageView(race.balance.special.items.barrageHalfWidth);
      b.visible = false;
      this.hazardGroup.add(b);
      this.barragePool.push(b);
    }
    for (let i = 0; i < race.racers.length; i++) {
      const sh = createShieldView();
      sh.visible = false;
      this.hazardGroup.add(sh);
      this.shields.push(sh);
    }
  }

  private renderHazards(race: Race, dt: number): void {
    const h = race.hazards;
    if (!h) return;
    this.clock += dt;
    h.bears.forEach((b, i) => {
      const v = this.bearViews[i];
      const s = race.track.samples[b.index];
      v.root.position.set(simToWorldX(b.x), 0, simToWorldZ(b.y));
      // L'ours regarde dans le sens de sa marche (à travers la piste).
      const dir = b.d - v.lastD;
      v.lastD = b.d;
      const ang = Math.atan2(s.ny * Math.sign(dir || b.side * -1), s.nx * Math.sign(dir || b.side * -1));
      v.root.rotation.y = ang;
      v.root.position.y = b.active ? Math.abs(Math.sin(this.clock * 9)) * 0.15 : 0;
      v.warn.visible = b.warning;
      const ws = race.track.samples[b.index];
      const lo = b.lineOffset;
      v.warn.position.set(simToWorldX(ws.x + ws.nx * lo), 4.5 + Math.sin(this.clock * 8) * 0.3, simToWorldZ(ws.y + ws.ny * lo));
    });
    h.beavers.forEach((bv, i) => {
      const v = this.beaverViews[i];
      v.visible = bv.respawn <= 0;
      v.position.set(simToWorldX(bv.x), Math.abs(Math.sin(this.clock * 3 + i)) * 0.25, simToWorldZ(bv.y));
      v.rotation.y = this.clock * 1.5 + i;
    });
    this.barragePool.forEach((b, i) => {
      const br = h.barrages[i];
      b.visible = !!br;
      if (br) {
        b.position.set(simToWorldX(br.x), 0, simToWorldZ(br.y));
        b.rotation.y = br.heading;
      }
    });
    race.racers.forEach((r, i) => {
      const sh = this.shields[i];
      sh.visible = r.moose.shieldTime > 0;
      if (sh.visible) sh.position.copy(this.moose[i].root.position);
    });
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
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h, false);
    this.chase.setAspect(w / h);
  }

  /**
   * Qualité auto-adaptative : sous 45 FPS pendant 2 s, on baisse la résolution de rendu ;
   * au-dessus de 58 FPS pendant 6 s, on la remonte (jusqu'à la densité de l'écran, 2 au plus).
   */
  private adaptQuality(dt: number): void {
    if (dt <= 0) return;
    this.fpsAvg += (1 / dt - this.fpsAvg) * Math.min(1, dt * 2);
    this.qualityTimer += dt;
    const max = Math.min(window.devicePixelRatio || 1, 2);
    if (this.fpsAvg < 45 && this.qualityTimer > 2 && this.pixelRatio > 0.75) {
      this.pixelRatio = Math.max(0.75, this.pixelRatio - 0.25);
      this.qualityTimer = 0;
      this.resize();
    } else if (this.fpsAvg > 58 && this.qualityTimer > 6 && this.pixelRatio < max) {
      this.pixelRatio = Math.min(max, this.pixelRatio + 0.25);
      this.qualityTimer = 0;
      this.resize();
    }
    if (this.fpsAvg < 30 && this.density > 0.5) this.density = 0.5;
  }

  get qualityInfo(): string {
    return `${this.pixelRatio.toFixed(2)}x · décor ${this.density}`;
  }

  render(race: Race, prev: Pose[], alpha: number, dt: number): void {
    if (this.canvas.clientWidth !== this.lastW || this.canvas.clientHeight !== this.lastH) this.resize();
    this.adaptQuality(dt);
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
    this.renderHazards(race, dt);
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
    // Élan libéré ou coup de queue : traînée dorée.
    if (m.boostTime > 0 || m.tailTime > 0) {
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
