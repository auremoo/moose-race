/**
 * Rendu : lit l'état de la simulation (lecture seule) et l'interpole entre deux pas.
 */
import * as THREE from 'three';
import type { Balance } from '../data';
import { raceTime, rankOf, type Race } from '../sim/race';
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
  water: new THREE.Color(0x9fd3ff),
  lineOk: new THREE.Color(0x2ee37a),
  lineHot: new THREE.Color(0xff2a3d),
  lineFar: new THREE.Color(0xffffff),
};

/** Étiquette « nom · cote » toujours face à la caméra. */
function nameTag(name: string, rating: number, coat: string): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(255,255,255,0.92)';
  g.beginPath();
  if (g.roundRect) g.roundRect(4, 8, 248, 48, 20);
  else g.rect(4, 8, 248, 48);
  g.fill();
  g.fillStyle = coat;
  g.beginPath();
  g.arc(32, 32, 12, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#5B3A29';
  g.font = 'bold 26px Nunito, system-ui, sans-serif';
  g.textBaseline = 'middle';
  g.fillText(`${name} · ${rating}`, 52, 33);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  // Taille constante à l'écran, quelle que soit la distance.
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, sizeAttenuation: false }));
  s.scale.set(0.13, 0.0325, 1);
  return s;
}

export class GameView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly chase: ChaseCamera;
  private moose: MooseView[] = [];
  private tags: (THREE.Sprite | null)[] = [];
  /** Pose du fantôme au temps de course t, ou null (fournie par l'appelant). */
  private ghost: ((t: number) => Pose | null) | null = null;
  private ghostView: MooseView | null = null;
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
  private podium: { scene: THREE.Scene; camera: THREE.PerspectiveCamera; views: MooseView[]; t: number } | null = null;
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
    this.tags = [];
    for (const r of race.racers) {
      const mv = createMooseView({ coat: r.coat, size: r.size, accessory: r.accessory });
      this.moose.push(mv);
      this.scene.add(mv.root);
      // Étiquette de nom et de cote au-dessus des bots.
      const tag = r.id === 0 ? null : nameTag(r.name, r.rating, r.coat);
      if (tag) this.scene.add(tag);
      this.tags.push(tag);
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
    this.hidePodium();
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
    for (const tg of this.tags) {
      if (!tg) continue;
      this.scene.remove(tg);
      tg.material.map?.dispose();
      tg.material.dispose();
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
    // Bief : canal d'eau signalé entre l'embouchure et la sortie.
    if (h.bief) {
      const b = h.bief;
      const g = new THREE.Group();
      const water = new THREE.Mesh(
        new THREE.PlaneGeometry(b.length + 6, 7),
        new THREE.MeshLambertMaterial({ color: 0x3c8fd0, transparent: true, opacity: 0.85 }),
      );
      water.rotation.x = -Math.PI / 2;
      water.position.y = 0.05;
      g.add(water);
      for (const side of [-1, 1]) {
        const bank = new THREE.Mesh(new THREE.BoxGeometry(b.length + 6, 0.4, 0.6), new THREE.MeshLambertMaterial({ color: 0x8a5a36 }));
        bank.position.set(0, 0.2, side * 3.8);
        g.add(bank);
      }
      g.position.set(simToWorldX((b.ax + b.bx) / 2), 0, simToWorldZ((b.ay + b.by) / 2));
      g.rotation.y = Math.atan2(b.by - b.ay, b.bx - b.ax);
      this.hazardGroup.add(g);
      for (const [x, y] of [[b.ax, b.ay], [b.bx, b.by]]) {
        const sign = createWarningSprite('~', '#2C7BB6');
        sign.position.set(simToWorldX(x), 4, simToWorldZ(y));
        this.hazardGroup.add(sign);
      }
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

  /**
   * Podium d'arrivée : les trois premiers sur des marches (1er au centre, qui se cabre).
   * Scène à part, rendue à la place de la course jusqu'à hidePodium().
   */
  showPodium(top: { coat: string; size: number; accessory: string }[]): void {
    this.hidePodium();
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffe9c7);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xc8a070, 1.8));
    const sun = new THREE.DirectionalLight(0xfff3dd, 1.6);
    sun.position.set(6, 12, 10);
    scene.add(sun);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(30, 32), new THREE.MeshLambertMaterial({ color: 0x8cc160 }));
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    const colors = [0xf5b301, 0xc0c6cc, 0xc8814a];
    const heights = [2.4, 1.6, 1.0];
    const xs = [0, -3.7, 3.7];
    const views: MooseView[] = [];
    top.slice(0, 3).forEach((look, i) => {
      const block = new THREE.Mesh(new THREE.BoxGeometry(3.4, heights[i], 3.4), new THREE.MeshLambertMaterial({ color: colors[i] }));
      block.position.set(xs[i], heights[i] / 2, 0);
      scene.add(block);
      const mv = createMooseView(look);
      mv.root.position.set(xs[i], heights[i], 0);
      // Face à la caméra (qui regarde vers -z).
      mv.root.rotation.y = -Math.PI / 2;
      mv.root.scale.setScalar(0.85);
      scene.add(mv.root);
      views.push(mv);
    });
    const camera = new THREE.PerspectiveCamera(50, this.chase.camera.aspect, 0.1, 200);
    camera.position.set(0, 6.5, 27);
    camera.lookAt(0, 2.8, 0);
    this.podium = { scene, camera, views, t: 0 };
  }

  hidePodium(): void {
    if (!this.podium) return;
    this.disposeObject(this.podium.scene);
    this.podium = null;
  }

  /** Fantôme du meilleur temps : fonction qui donne sa pose à l'instant t (null pour l'enlever). */
  setGhost(g: ((t: number) => Pose | null) | null): void {
    if (this.ghostView) {
      this.scene.remove(this.ghostView.root);
      this.disposeObject(this.ghostView.root);
      this.ghostView = null;
    }
    this.ghost = g;
    if (!g) return;
    const v = createMooseView({ coat: '#ffffff' });
    v.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.material) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mesh.material = mats.map((m) => {
        const c = m.clone() as THREE.MeshLambertMaterial;
        c.transparent = true;
        c.opacity = 0.32;
        c.depthWrite = false;
        if ('color' in c) c.color.lerp(new THREE.Color(0x9fd3ff), 0.6);
        return c;
      });
      if (mats.length === 1) mesh.material = (mesh.material as THREE.Material[])[0];
    });
    this.ghostView = v;
    this.scene.add(v.root);
  }

  /** Menus : caméra vitrine devant l'orignal au lieu de la vue poursuite. */
  setShowcase(on: boolean): void {
    if (on) this.hidePodium();
    this.showcaseOn = on;
    this.chase.reset();
  }

  setDebug(on: boolean): void {
    this.debugLine.visible = on;
  }

  /** Phase de foulée et vitesse de l'orignal du joueur (pour le son des sabots). */
  playerStride(): number {
    return this.moose[0]?.stridePhase ?? 0;
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
    if (this.podium) {
      const pd = this.podium;
      pd.t += dt;
      pd.camera.aspect = this.chase.camera.aspect;
      pd.camera.updateProjectionMatrix();
      pd.camera.position.x = Math.sin(pd.t * 0.4) * 2;
      pd.camera.lookAt(0, 2.8, 0);
      const still = { ...race.racers[0].moose, speed: 0, lateralAccel: 0, slip: 0, stunTime: 0, drifting: false, galloping: false };
      pd.views.forEach((v, i) => v.update(still, dt, i === 0 ? 'victory' : 'idle'));
      this.renderer.render(pd.scene, pd.camera);
      return;
    }
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
      // Vitrine de l'accueil : seul l'orignal du joueur est montré.
      view.root.visible = i === 0 || !this.showcaseOn;
      const tag = this.tags[i];
      if (tag) {
        const cam = this.chase.camera.position;
        const dist = Math.hypot(cam.x - simToWorldX(x), cam.z - simToWorldZ(y));
        tag.visible = !this.showcaseOn && race.phase !== 'countdown' && dist > 12 && dist < 70;
        tag.position.set(simToWorldX(x), 4.6 * race.racers[i].size, simToWorldZ(y));
        tag.material.opacity = Math.max(0, Math.min(1, (70 - dist) / 20));
      }
      // À la nage dans le bief : l'orignal est à moitié immergé.
      const swimming = race.racers[i].swim >= 0;
      view.root.position.set(simToWorldX(x), swimming ? -1.3 : 0, simToWorldZ(y));
      view.root.rotation.y = heading;
      let pose: 'race' | 'idle' | 'victory' | 'defeat' = 'race';
      if (this.showcaseOn) pose = 'idle';
      else if (race.racers[i].finished && race.racers.length > 1) {
        const rk = rankOf(race, i);
        pose = rk === 1 ? 'victory' : rk > race.racers.length / 2 ? 'defeat' : 'race';
      }
      view.update(m, dt, pose);
      if (i === 0 && this.showcaseOn) {
        this.showcaseTime += dt;
        this.chase.showcase(x, y, heading, this.showcaseTime);
      } else if (i === 0) {
        const reduce = document.documentElement.classList.contains('reduce-motion');
        const shake = !reduce && (race.tick - race.racers[0].lastContactTick < 12 || m.stunTime > 0) ? 0.25 : 0;
        this.chase.update(x, y, heading, m.speed / race.balance.moose.topSpeed, dt, m.galloping || m.boostTime > 0, shake);
        this.effects(race, x, y, heading, dt);
      }
    }
    if (this.ghostView && this.ghost) {
      const pose = race.phase === 'countdown' || this.showcaseOn ? null : this.ghost(raceTime(race));
      this.ghostView.root.visible = !!pose;
      if (pose) {
        this.ghostView.root.position.set(simToWorldX(pose.x), 0, simToWorldZ(pose.y));
        this.ghostView.root.rotation.y = pose.heading;
        this.ghostView.update({ ...race.racers[0].moose, speed: 22, lateralAccel: 0, slip: 0, stunTime: 0, drifting: false } as never, dt);
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
        const hot = v > reachable + 0.4;
        c = hot ? C.lineHot : C.lineOk;
        fade = 1 - (di / ahead) * 0.6;
        // Tirets quand il faut freiner : lisible aussi sans distinguer le rouge du vert.
        if (hot && Math.floor(i / 3) % 2 === 1) fade *= 0.15;
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
    const swimming = r.swim >= 0;
    const dustColor = swimming ? C.water : surface === 'neige' || surface === 'glace' ? C.snow : surface === 'boue' ? C.mud : C.dust;
    const dustRate = swimming ? 45 : m.drifting ? 50 : m.sliding ? 60 * Math.max(0.3, m.slip) : r.onVerge && m.speed > 5 ? 25 : 0;
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
