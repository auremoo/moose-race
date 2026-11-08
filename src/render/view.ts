/**
 * Rendu : lit l'état de la simulation (lecture seule) et l'interpole entre deux pas.
 */
import * as THREE from 'three';
import type { Balance } from '../data';
import { raceTime, rankOf, surfaceUnder, windAt, type Race } from '../sim/race';
import { terrainHeight } from '../sim/track';
import { biefWaterSpan } from '../sim/bief';
import { ChaseCamera } from './camera';
import { simToWorldX, simToWorldZ } from './coords';
import { createBarrageView, createBearView, createBeaverView, createShieldView, createWarningSprite } from './creatures';
import { createMooseView, type MooseView } from './moose';
import { Particles, RainStreaks } from './particles';
import type { Biome, Decor } from './biomes';
import { createHomeScene, type HomeScene } from './home';
import { buildWorld, type IdealLine } from './world';

/** Vitesse du ralenti de l'arrivée. */
export const REPLAY_SPEED = 0.4;

/** Écart maximal (s) avec un rival pour déclencher le photo-finish. */
export const PHOTO_GAP = 0.3;

export interface PhotoFinish {
  /** Image JPEG (data URL) de la ligne vue de côté. */
  url: string;
  /** Écart en secondes, positif si le joueur devance le rival. */
  gap: number;
  rival: string;
}

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
  rain: new THREE.Color(0xcfe6ff),
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
  private decor: Decor | null = null;
  private ideal!: IdealLine;
  private idealOn = true;
  private dust = new Particles(120, 0.7, false, -0.5);
  private sparks = new Particles(160, 0.4, true, 6);
  private breath = new Particles(40, 0.9, false, -0.3);
  private rain = new RainStreaks();
  private raining = false;
  private hazardGroup = new THREE.Group();
  private bearViews: { root: THREE.Group; warn: THREE.Sprite; lastD: number }[] = [];
  private beaverViews: THREE.Group[] = [];
  private barragePool: THREE.Group[] = [];
  private shields: THREE.Mesh[] = [];
  private clock = 0;
  /** Hauteur du sol sous l'orignal du joueur (pour les particules). */
  private groundZ = 0;
  /** Densité du décor (qualité) : réduite sur les appareils modestes. */
  private density = 1;
  /** Qualité auto-adaptative : moyenne glissante des FPS. */
  private fpsAvg = 60;
  private qualityTimer = 0;
  private pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  private podium: { scene: THREE.Scene; camera: THREE.PerspectiveCamera; views: MooseView[]; t: number } | null = null;
  private showcaseOn = false;
  private photo: PhotoFinish | null = null;
  /** Portion en eau du bief (m depuis l'embouchure), null sans bief. */
  private biefSpan: [number, number] | null = null;
  private photoChecked = false;
  /** Enclos de l'accueil, créé à la première ouverture d'un menu. */
  private home: HomeScene | null = null;
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
    this.scene.add(this.dust.points, this.sparks.points, this.breath.points, this.rain.lines, this.hazardGroup);
    this.buildHazards(race);
    this.resize();
    // La taille réelle du canvas peut changer sans événement « resize » (barre d'adresse iOS,
    // navigateur intégré d'une app) : on observe le canvas et on vérifie aussi à chaque image.
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => this.resize()).observe(canvas);
  }

  private buildTrackWorld(race: Race): void {
    const w = buildWorld(this.scene, race.track, race.line, (race.biome ?? 'test') as Biome, this.density, race.weather);
    this.raining = race.weather === 'pluie';
    this.world = w.group;
    this.debugLine = w.debugLine;
    this.ideal = w.ideal;
    this.decor = w.decor;
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
    this.replay = null;
    this.photo = null;
    this.photoChecked = false;
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
    // Bief : canal d'eau signalé entre l'embouchure et la sortie, du bord de la piste au bord de la piste,
    // posé sur le terrain (il suit le relief au lieu d'être un plan tendu entre les deux bouts).
    this.biefSpan = null;
    if (h.bief) {
      const b = h.bief;
      const [t0, t1] = biefWaterSpan(race.track, b);
      this.biefSpan = [t0, t1];
      const ux = (b.bx - b.ax) / b.length;
      const uy = (b.by - b.ay) / b.length;
      const strip = (d1: number, d2: number, lift: number, color: number) => {
        const n = Math.max(2, Math.ceil((t1 - t0) / 2) + 1);
        const pos: number[] = [];
        const idx: number[] = [];
        for (let k = 0; k < n; k++) {
          const t = t0 + ((t1 - t0) * k) / (n - 1);
          for (const d of [d1, d2]) {
            const x = b.ax + ux * t - uy * d;
            const y = b.ay + uy * t + ux * d;
            pos.push(simToWorldX(x), terrainHeight(race.track, x, y) + lift, simToWorldZ(y));
          }
          if (k > 0) {
            const a = (k - 1) * 2;
            idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
          }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setIndex(idx);
        geo.computeVertexNormals();
        return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
      };
      this.hazardGroup.add(strip(-3.5, 3.5, 0.06, 0x3c8fd0));
      this.hazardGroup.add(strip(-4.2, -3.5, 0.3, 0x8a5a36));
      this.hazardGroup.add(strip(3.5, 4.2, 0.3, 0x8a5a36));
      const za = race.track.samples[b.from].z;
      const zb = race.track.samples[b.to].z;
      for (const [x, y, z] of [
        [b.ax, b.ay, za],
        [b.bx, b.by, zb],
      ]) {
        const sign = createWarningSprite('~', '#2C7BB6');
        sign.position.set(simToWorldX(x), z + 4, simToWorldZ(y));
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
      const bz = race.track.samples[b.index].z;
      v.root.position.set(simToWorldX(b.x), bz, simToWorldZ(b.y));
      // L'ours regarde dans le sens de sa marche (à travers la piste).
      const dir = b.d - v.lastD;
      v.lastD = b.d;
      const ang = Math.atan2(s.ny * Math.sign(dir || b.side * -1), s.nx * Math.sign(dir || b.side * -1));
      v.root.rotation.y = ang;
      v.root.position.y = bz + (b.active ? Math.abs(Math.sin(this.clock * 9)) * 0.15 : 0);
      v.warn.visible = b.warning;
      const ws = race.track.samples[b.index];
      const lo = b.lineOffset;
      v.warn.position.set(simToWorldX(ws.x + ws.nx * lo), ws.z + 4.5 + Math.sin(this.clock * 8) * 0.3, simToWorldZ(ws.y + ws.ny * lo));
    });
    h.beavers.forEach((bv, i) => {
      const v = this.beaverViews[i];
      v.visible = bv.respawn <= 0;
      v.position.set(simToWorldX(bv.x), race.track.samples[bv.index].z + Math.abs(Math.sin(this.clock * 3 + i)) * 0.25, simToWorldZ(bv.y));
      v.rotation.y = this.clock * 1.5 + i;
    });
    this.barragePool.forEach((b, i) => {
      const br = h.barrages[i];
      b.visible = !!br;
      if (br) {
        b.position.set(simToWorldX(br.x), terrainHeight(race.track, br.x, br.y), simToWorldZ(br.y));
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
    if (this.replay) {
      this.renderReplay(race, dt);
      return;
    }
    if (this.podium) {
      const pd = this.podium;
      pd.t += dt;
      pd.camera.aspect = this.chase.camera.aspect;
      pd.camera.updateProjectionMatrix();
      pd.camera.position.x = Math.sin(pd.t * 0.4) * 2;
      pd.camera.lookAt(0, 2.8, 0);
      const still = { ...race.racers[0].moose, speed: 0, lateralAccel: 0, slip: 0, stunTime: 0, drifting: false, galloping: false };
      pd.views.forEach((v, i) => v.update(still, dt, i === 0 ? 'victory' : 'idle'));
      this.draw(pd.scene, pd.camera);
      return;
    }
    if (this.showcaseOn) {
      this.home ??= createHomeScene();
      const r0 = race.racers[0];
      this.home.setMoose({ coat: r0.coat, size: r0.size, accessory: r0.accessory ?? '' });
      this.home.update(dt, this.chase.camera.aspect);
      this.draw(this.home.scene, this.home.camera);
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
      // Un orignal collé à la caméra (grille de départ, peloton) bouchait la vue : on le masque.
      if (i > 0 && view.root.visible) {
        const cp = this.chase.camera.position;
        view.root.visible = Math.hypot(cp.x - simToWorldX(x), cp.z - simToWorldZ(y)) > 4.5;
      }
      const tag = this.tags[i];
      if (tag) {
        const cam = this.chase.camera.position;
        const dist = Math.hypot(cam.x - simToWorldX(x), cam.z - simToWorldZ(y));
        tag.visible = !this.showcaseOn && race.phase !== 'countdown' && dist > 12 && dist < 70;
        tag.position.set(simToWorldX(x), race.track.samples[race.racers[i].proj.index].z + 4.6 * race.racers[i].size, simToWorldZ(y));
        tag.material.opacity = Math.max(0, Math.min(1, (70 - dist) / 20));
      }
      // À la nage dans le bief : l'orignal est à moitié immergé.
      const swimming = race.racers[i].swim >= 0;
      let groundZ = race.track.samples[race.racers[i].proj.index].z;
      const bief = race.hazards?.bief;
      // Dans l'eau seulement entre les deux bords de piste : avant et après, il marche sur la chaussée.
      const inWater =
        swimming && !!bief && !!this.biefSpan && race.racers[i].swim >= this.biefSpan[0] && race.racers[i].swim <= this.biefSpan[1];
      if (swimming && bief) groundZ = terrainHeight(race.track, x, y);
      view.root.position.set(simToWorldX(x), groundZ + (inWater ? -1.3 : 0), simToWorldZ(y));
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
        this.chase.showcase(x, y, heading, this.showcaseTime, groundZ);
      } else if (i === 0) {
        const reduce = document.documentElement.classList.contains('reduce-motion');
        this.chase.calm = reduce;
        const shake = !reduce && (race.tick - race.racers[0].lastContactTick < 12 || m.stunTime > 0) ? 0.25 : 0;
        this.chase.update(x, y, heading, m.speed / race.balance.moose.topSpeed, dt, m.galloping || m.boostTime > 0, shake, groundZ);
        this.groundZ = groundZ;
        this.effects(race, x, y, heading, dt);
      }
    }
    if (this.ghostView && this.ghost) {
      const pose = race.phase === 'countdown' || this.showcaseOn ? null : this.ghost(raceTime(race));
      this.ghostView.root.visible = !!pose;
      if (pose) {
        this.ghostView.root.position.set(simToWorldX(pose.x), terrainHeight(race.track, pose.x, pose.y), simToWorldZ(pose.y));
        this.ghostView.root.rotation.y = pose.heading;
        this.ghostView.update({ ...race.racers[0].moose, speed: 22, lateralAccel: 0, slip: 0, stunTime: 0, drifting: false } as never, dt);
      }
    }
    if (this.idealOn && !this.showcaseOn) this.colorIdealLine(race);
    this.renderHazards(race, dt);
    this.rain.lines.visible = this.raining && !this.showcaseOn;
    if (this.rain.lines.visible) {
      // Pluie : traînées autour de la caméra, penchées par le vent du circuit (exagéré pour se voir).
      const cam = this.chase.camera.position;
      const w = windAt(race);
      this.rain.update(dt, cam.x, cam.y, cam.z, 2 + w.x * 3, -w.y * 3);
    }
    this.dust.update(dt);
    this.sparks.update(dt);
    this.breath.update(dt);
    const camPos = this.chase.camera.position;
    this.decor?.update(camPos.x, camPos.z);
    if (!this.photoChecked && race.racers[0].finished) {
      this.photoChecked = true;
      this.photo = this.photoFinish(race);
    }
    this.draw(this.scene, this.chase.camera);
  }

  private lastFrame: { scene: THREE.Scene; camera: THREE.Camera } | null = null;
  private snapScene: THREE.Scene | null = null;

  private draw(scene: THREE.Scene, camera: THREE.Camera): void {
    this.lastFrame = { scene, camera };
    this.renderer.render(scene, camera);
  }

  /**
   * Cliché d'un orignal (robe, taille, accessoire), de trois quarts, en image PNG carrée.
   * Rendu avec le moteur de la partie puis l'image courante est redessinée dans la même tâche :
   * le navigateur n'affiche que cette dernière, donc rien ne clignote.
   */
  snapshotMoose(look: { coat: string; size: number; accessory: string }, px = 256): string {
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (!w || !h) return '';
    if (!this.snapScene) {
      const sc = new THREE.Scene();
      sc.add(new THREE.HemisphereLight(0xffffff, 0xc8a070, 1.9));
      const sun = new THREE.DirectionalLight(0xfff3dd, 1.5);
      sun.position.set(6, 10, 8);
      sc.add(sun);
      this.snapScene = sc;
    }
    const scene = this.snapScene;
    scene.background = new THREE.Color(0xf6efe4);
    const mv = createMooseView(look);
    mv.root.rotation.y = -0.6;
    mv.update({ speed: 0, lateralAccel: 0, slip: 0, stunTime: 0, drifting: false, galloping: false, curvature: 0 } as never, 0.016, 'idle');
    scene.add(mv.root);
    const cam = new THREE.PerspectiveCamera(30, w / h, 0.1, 100);
    // Cadre carré au centre : on recule selon l'étroitesse de l'écran.
    const side = Math.min(w, h);
    const dist = 8.5 * (h / side);
    cam.position.set(Math.sin(0.2) * dist, 2.6 + 0.6, Math.cos(0.2) * dist);
    cam.lookAt(0.4, 2.2, 0);
    this.renderer.render(scene, cam);
    const out = document.createElement('canvas');
    out.width = out.height = px;
    const g = out.getContext('2d');
    if (g) g.drawImage(this.canvas, (w - side) / 2, (h - side) / 2, side, side, 0, 0, px, px);
    scene.remove(mv.root);
    this.disposeObject(mv.root);
    if (this.lastFrame) this.renderer.render(this.lastFrame.scene, this.lastFrame.camera);
    try {
      return out.toDataURL('image/png');
    } catch {
      return '';
    }
  }

  private replay: {
    frames: Float32Array[];
    t: number;
    cam: THREE.PerspectiveCamera;
    look: THREE.Vector3;
    done: () => void;
  } | null = null;

  /**
   * Ralenti de l'arrivée : rejoue les dernières images enregistrées (x, y, cap, vitesse, galop par
   * orignal) à REPLAY_SPEED, filmées par une caméra posée au bord de la ligne. Se termine seul ou par skipReplay().
   */
  startReplay(race: Race, frames: Float32Array[], done: () => void): void {
    if (frames.length < 10) {
      done();
      return;
    }
    const s0 = race.track.samples[0];
    const cam = new THREE.PerspectiveCamera(38, this.chase.camera.aspect, 0.1, 900);
    // Bord de la ligne, côté gauche, un peu en retrait vers l'arrivée des orignaux.
    const d = s0.hw + 7;
    cam.position.set(simToWorldX(s0.x + s0.nx * d + s0.tx * 4), s0.z + 2.2, simToWorldZ(s0.y + s0.ny * d + s0.ty * 4));
    const f0 = frames[0];
    const look = new THREE.Vector3(simToWorldX(f0[0]), s0.z + 1.8, simToWorldZ(f0[1]));
    this.tags.forEach((t) => t && (t.visible = false));
    // L'arche de départ masquerait l'image depuis le bord de la ligne.
    const arch = this.world.getObjectByName('finish-arch');
    if (arch) arch.visible = false;
    this.replay = { frames, t: 0, cam, look, done };
  }

  skipReplay(): void {
    if (!this.replay) return;
    const done = this.replay.done;
    this.replay = null;
    const arch = this.world.getObjectByName('finish-arch');
    if (arch) arch.visible = true;
    done();
  }

  get replaying(): boolean {
    return this.replay !== null;
  }

  private renderReplay(race: Race, dt: number): void {
    const rp = this.replay!;
    rp.t += dt * REPLAY_SPEED;
    const f = rp.t * race.balance.sim.hz;
    const last = rp.frames.length - 1;
    if (f >= last) {
      this.skipReplay();
      return;
    }
    const i0 = Math.floor(f);
    const a = f - i0;
    const A = rp.frames[i0];
    const B = rp.frames[i0 + 1];
    for (let k = 0; k < this.moose.length; k++) {
      const o = k * 5;
      const x = A[o] + (B[o] - A[o]) * a;
      const y = A[o + 1] + (B[o + 1] - A[o + 1]) * a;
      let dh = B[o + 2] - A[o + 2];
      if (dh > Math.PI) dh -= 2 * Math.PI;
      else if (dh < -Math.PI) dh += 2 * Math.PI;
      const v = this.moose[k];
      v.root.visible = true;
      v.root.position.set(simToWorldX(x), terrainHeight(race.track, x, y), simToWorldZ(y));
      v.root.rotation.y = A[o + 2] + dh * a;
      v.update(
        { speed: A[o + 3], lateralAccel: 0, slip: 0, stunTime: 0, drifting: false, galloping: A[o + 4] > 0, curvature: 0 } as never,
        dt * REPLAY_SPEED,
      );
    }
    // La caméra reste au bord de la ligne et suit le joueur.
    const me = this.moose[0].root.position;
    rp.look.lerp(new THREE.Vector3(me.x, me.y + 1.8, me.z), Math.min(1, dt * 6));
    rp.cam.aspect = this.chase.camera.aspect;
    rp.cam.updateProjectionMatrix();
    rp.cam.lookAt(rp.look);
    this.draw(this.scene, rp.cam);
  }

  /** Photo-finish de la dernière course (null si l'arrivée n'était pas serrée). */
  takePhoto(): PhotoFinish | null {
    return this.photo;
  }

  /**
   * À l'image où le joueur franchit la ligne : si un rival est à moins de PHOTO_GAP secondes,
   * on rend la ligne vue de côté, on la recadre en 16:9 et on la vire au sépia, avec le fil rouge.
   */
  private photoFinish(race: Race): PhotoFinish | null {
    const me = race.racers[0];
    let best: { gap: number; name: string } | null = null;
    const total = race.laps * race.track.length;
    for (const o of race.racers.slice(1)) {
      // Écart en secondes : positif si le joueur devance ce rival.
      const gap = o.finished ? o.finishTime - me.finishTime : (total - o.distance) / Math.max(1, o.moose.speed);
      if (Math.abs(gap) < PHOTO_GAP && (!best || Math.abs(gap) < Math.abs(best.gap))) best = { gap, name: o.name };
    }
    if (!best) return null;
    const s0 = race.track.samples[0];
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (!w || !h) return null;
    const aspect = w / h;
    const D = s0.hw + 7;
    // Bande de 16:9 prise au centre de l'image ; on veut ~5,5 m de haut dans cette bande.
    const bandFrac = Math.min(1, (aspect * 9) / 16);
    const fov = (2 * Math.atan(5.5 / bandFrac / 2 / D) * 180) / Math.PI;
    const cam = new THREE.PerspectiveCamera(fov, aspect, 0.1, 400);
    const z = s0.z;
    cam.position.set(simToWorldX(s0.x + s0.nx * D), z + 1.7, simToWorldZ(s0.y + s0.ny * D));
    cam.lookAt(simToWorldX(s0.x), z + 1.7, simToWorldZ(s0.y));
    const tagsShown = this.tags.map((t) => t?.visible ?? false);
    this.tags.forEach((t) => t && (t.visible = false));
    // L'arche cacherait la ligne : la caméra de photo-finish est censée être posée dessus.
    const arch = this.world.getObjectByName('finish-arch');
    if (arch) arch.visible = false;
    // Instant du cliché : quand le museau du joueur touche la ligne (la course compte le centre de
    // l'orignal). On recule chaque orignal de sa vitesse × Δt le long de son cap.
    const nose = 2.2 * me.size;
    const dt = (Math.max(0, me.distance - total) + nose) / Math.max(1, me.moose.speed);
    const saved = this.moose.map((v) => v.root.position.clone());
    race.racers.forEach((r, i) => {
      const v = this.moose[i];
      if (!v) return;
      const back = r.finished && r !== me && r.finishTime < me.finishTime - 1 ? 0 : r.moose.speed * dt;
      const x = r.moose.x - Math.cos(r.moose.heading) * back;
      const y = r.moose.y - Math.sin(r.moose.heading) * back;
      v.root.position.set(simToWorldX(x), v.root.position.y, simToWorldZ(y));
    });
    this.renderer.render(this.scene, cam);
    this.moose.forEach((v, i) => v.root.position.copy(saved[i]));
    if (arch) arch.visible = true;
    const out = document.createElement('canvas');
    out.width = 640;
    out.height = 360;
    const g = out.getContext('2d');
    if (!g) return null;
    const bh = w * (9 / 16);
    g.filter = 'sepia(0.7) contrast(1.15) saturate(0.8)';
    g.drawImage(this.canvas, 0, Math.max(0, (h - bh) / 2), w, Math.min(h, bh), 0, 0, 640, 360);
    g.filter = 'none';
    g.fillStyle = '#D80621';
    g.fillRect(319, 0, 3, 360);
    this.tags.forEach((t, i) => t && (t.visible = tagsShown[i]));
    try {
      return { url: out.toDataURL('image/jpeg', 0.82), gap: best.gap, rival: best.name };
    } catch {
      return null;
    }
  }

  /**
   * Ligne idéale : verte si la vitesse actuelle permet encore de passer le point en freinant,
   * rouge s'il faut freiner maintenant ; blanche et discrète au-delà de 160 m.
   */
  private capCache = new WeakMap<Float64Array, number>();
  /** Vitesse du profil en ligne droite (sa valeur maximale). */
  private profileCap(p: Float64Array): number {
    let c = this.capCache.get(p);
    if (c === undefined) {
      c = 0;
      for (const v of p) c = Math.max(c, v);
      this.capCache.set(p, c);
    }
    return c;
  }

  private colorIdealLine(race: Race): void {
    const r = race.racers[0];
    const n = race.track.samples.length;
    const v = r.moose.speed;
    const decel = race.balance.moose.brakeDecel * 0.75;
    const arr = this.ideal.colors.array as Float32Array;
    const ahead = Math.round(160 / race.track.spacing);
    // Profil de vitesse de l'orignal du joueur. Un point dont la vitesse limite est celle de la ligne
    // droite n'impose rien : sans ça, la ligne rougissait au galop en pleine ligne droite (le galop
    // dépasse la vitesse de pointe de la ligne droite, sans aucun virage à négocier).
    const profile = r.profile;
    const straightCap = this.profileCap(profile);
    for (let j = 0; j <= n; j++) {
      const i = j % n;
      let di = i - r.proj.index;
      if (di < 0) di += n;
      let c = C.lineFar;
      let fade = 0.25;
      if (di <= ahead) {
        const dist = di * race.track.spacing;
        const vLine = profile[i];
        const limiting = vLine < straightCap - 0.5;
        const reachable = Math.sqrt(vLine * vLine + 2 * decel * Math.max(0, dist - 2));
        const hot = limiting && v > reachable + 0.4;
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
    const gz = this.groundZ;
    const at = (back: number, side: number, h: number): [number, number, number] => [
      simToWorldX(x + ch * back - sh * side),
      h + gz,
      simToWorldZ(y + sh * back + ch * side),
    ];
    const rnd = (a: number) => (Math.random() - 0.5) * a;

    // Poussière (ou neige, ou boue) : dérapage, glissade, bas-côté.
    const surface = surfaceUnder(race, r);
    const swimming = r.swim >= 0;
    // Sous la pluie, on soulève des éclaboussures plutôt que de la poussière.
    if (race.weather === 'pluie' && m.speed > 6 && !swimming) {
      for (let k = this.dust.due(14, dt); k > 0; k--) {
        const [px, py, pz] = at(-1.2 + rnd(0.6), rnd(1.4), 0.2);
        this.dust.emit(px, py, pz, rnd(1.5), 1.2, rnd(1.5), 0.4, C.water);
      }
    }
    const dustColor = swimming ? C.water : surface === 'neige' || surface === 'glace' ? C.snow : surface === 'boue' ? C.mud : C.dust;
    const dustRate = swimming ? 45 : m.skidding ? 60 * Math.max(0.3, m.slip) : r.onVerge && m.speed > 5 ? 25 : 0;
    for (let k = this.dust.due(dustRate, dt); k > 0; k--) {
      const [px, py, pz] = at(-1.5 + rnd(0.6), rnd(1.6), 0.3);
      this.dust.emit(px, py, pz, rnd(2), 1 + Math.random() * 1.5, rnd(2), 0.7, dustColor);
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
