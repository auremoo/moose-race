/**
 * Enclos de l'accueil : prairie, clôture de perches, balles de foin, abreuvoir, cabane et forêt.
 * Scène à part, rendue à la place de la course tant qu'un menu est ouvert. L'orignal actif y broute
 * et la caméra tourne lentement autour de lui.
 */
import * as THREE from 'three';
import { createRng } from '../sim/rng';
import { paletteFor, skyDome } from './biomes';
import { createMooseView, STILL_MOOSE, type MooseLook, type MooseView } from './moose';

export interface HomeScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Remplace l'orignal si son apparence a changé. */
  setMoose(look: Required<MooseLook>): void;
  update(dt: number, aspect: number): void;
  dispose(): void;
}

const FENCE_R = 9;

export function createHomeScene(): HomeScene {
  const scene = new THREE.Scene();
  const pal = paletteFor('foret', false, false);
  scene.background = new THREE.Color(pal.fog);
  scene.fog = new THREE.Fog(pal.fog, 60, 260);
  scene.add(skyDome(pal));
  scene.add(new THREE.HemisphereLight(pal.hemiSky, pal.hemiGround, 1.7));
  const sun = new THREE.DirectionalLight(pal.sun, pal.sunIntensity);
  sun.position.set(-30, 50, 20);
  scene.add(sun);
  const rng = createRng(2024);

  const lambert = (color: number, flat = false) => new THREE.MeshLambertMaterial({ color, flatShading: flat });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, ry = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    scene.add(m);
    return m;
  };

  // Prairie et terre battue de l'enclos.
  const meadow = add(new THREE.CircleGeometry(400, 48), lambert(pal.ground), 0, 0, 0);
  meadow.rotation.x = -Math.PI / 2;
  const dirt = add(new THREE.CircleGeometry(FENCE_R - 0.6, 40), lambert(0x9c7a4c), 0, 0.02, 0);
  dirt.rotation.x = -Math.PI / 2;

  // Clôture de perches : poteaux et deux lisses, ouverte vers la caméra (côté +z).
  const wood = lambert(0x8a5a36);
  const posts = 28;
  const gap = 4;
  for (let i = 0; i < posts; i++) {
    if (i < gap || i >= posts - gap) continue;
    const a = Math.PI / 2 + (i / posts) * Math.PI * 2;
    const x = Math.cos(a) * FENCE_R;
    const z = Math.sin(a) * FENCE_R;
    add(new THREE.CylinderGeometry(0.12, 0.14, 1.6, 6), wood, x, 0.8, z);
    if (i + 1 < posts - gap) {
      const a2 = Math.PI / 2 + ((i + 1) / posts) * Math.PI * 2;
      const x2 = Math.cos(a2) * FENCE_R;
      const z2 = Math.sin(a2) * FENCE_R;
      const len = Math.hypot(x2 - x, z2 - z);
      for (const h of [0.75, 1.35]) {
        const rail = add(new THREE.CylinderGeometry(0.07, 0.07, len, 5), wood, (x + x2) / 2, h, (z + z2) / 2);
        rail.rotation.z = Math.PI / 2;
        rail.rotation.y = -Math.atan2(z2 - z, x2 - x);
      }
    }
  }

  // Balles de foin, abreuvoir et seau.
  const hay = lambert(0xe2c05a, true);
  for (const [x, z, ry] of [
    [-5.5, -4.5, 0.4],
    [-6.6, -2.6, 1.1],
    [-6.1, -3.6, 0.7],
  ]) {
    const bale = add(new THREE.CylinderGeometry(0.75, 0.75, 1.2, 12), hay, x, 0.75, z, ry);
    bale.rotation.x = Math.PI / 2;
  }
  add(new THREE.BoxGeometry(2.4, 0.7, 0.9), wood, 5.2, 0.35, -4.2, -0.6);
  const water = add(new THREE.BoxGeometry(2.1, 0.05, 0.65), new THREE.MeshLambertMaterial({ color: 0x4f9ad1 }), 5.2, 0.68, -4.2, -0.6);
  water.renderOrder = 1;

  // Cabane en rondins derrière l'enclos.
  const cabin = new THREE.Group();
  const logs = lambert(0x7a4a26);
  const roofMat = lambert(0x5b3a29, true);
  const box = new THREE.Mesh(new THREE.BoxGeometry(7, 3.6, 5), logs);
  box.position.y = 1.8;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(5.6, 2.6, 4), roofMat);
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1.15, 1, 0.85);
  roof.position.y = 4.9;
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 0.1), lambert(0x3b2a1e));
  door.position.set(0, 1.1, 2.52);
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2.6, 0.8), lambert(0x8e8a85));
  chimney.position.set(2.2, 5.4, 0);
  cabin.add(box, roof, door, chimney);
  cabin.position.set(-4, 0, -17);
  cabin.rotation.y = 0.35;
  scene.add(cabin);

  // Forêt autour : sapins et érables, plus serrés vers l'arrière.
  const pine = new THREE.ConeGeometry(2.4, 6.5, 7).translate(0, 5, 0);
  const round = new THREE.IcosahedronGeometry(2.4, 0).translate(0, 4.6, 0);
  const trunk = new THREE.CylinderGeometry(0.3, 0.4, 2, 6).translate(0, 1, 0);
  const trunkMat = lambert(0x6b4426);
  const greens = [0x2e8b57, 0x1f6b40, 0x2b7a4b];
  const maples = [0xd8461b, 0xe8742a, 0xc22f1f, 0xf0a030];
  for (let i = 0; i < 90; i++) {
    const a = rng.range(0, Math.PI * 2);
    // Moins d'arbres devant la caméra pour garder l'orignal dégagé.
    const front = Math.sin(a) > 0.5;
    const d = rng.range(front ? 40 : 16, front ? 120 : 90);
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    if (Math.hypot(x + 4, z + 17) < 7) continue;
    const s = rng.range(0.8, 1.4);
    const maple = rng.next() < 0.35;
    const t = add(trunk, trunkMat, x, 0, z);
    t.scale.setScalar(s);
    const palette = maple ? maples : greens;
    const leaves = add(maple ? round : pine, lambert(palette[Math.floor(rng.next() * palette.length)], true), x, 0, z, rng.range(0, 6.28));
    leaves.scale.setScalar(s);
  }
  // Sommets bleutés à l'horizon.
  const peak = new THREE.ConeGeometry(1, 1, 6).translate(0, 0.5, 0);
  const rock = lambert(0x8aa0b4, true);
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI / 2 + (i - 4) * 0.28 + rng.range(-0.08, 0.08);
    const m = add(peak, rock, Math.cos(a) * 230, 0, Math.sin(a) * 230);
    m.scale.set(rng.range(60, 90), rng.range(45, 80), rng.range(60, 90));
  }

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1500);
  let moose: MooseView | null = null;
  let key = '';
  let time = 0;

  return {
    scene,
    camera,
    setMoose(look) {
      const k = `${look.coat}|${look.size}|${look.accessory}`;
      if (k === key) return;
      key = k;
      if (moose) scene.remove(moose.root);
      moose = createMooseView(look);
      // Profil trois quarts, tête vers la droite de l'écran.
      moose.root.rotation.y = -0.6;
      scene.add(moose.root);
    },
    update(dt, aspect) {
      time += dt;
      if (camera.aspect !== aspect) {
        camera.aspect = aspect;
        camera.updateProjectionMatrix();
      }
      // Portrait : on recule pour que l'orignal tienne en largeur.
      // On vise sous l'orignal : il apparaît dans le tiers haut, entre le titre et les boutons.
      const dist = aspect < 0.7 ? 16 : 11;
      const a = Math.PI / 2 + Math.sin(time * 0.2) * 0.5;
      camera.position.set(Math.cos(a) * dist, 2.8, Math.sin(a) * dist);
      camera.lookAt(0.3, aspect < 0.7 ? 0 : 1.2, 0);
      moose?.update(STILL_MOOSE, dt, 'idle');
    },
    dispose() {
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
        for (const mat of mats) mat.dispose();
      });
    },
  };
}
