/**
 * Orignal provisoire « boîte grise » : capsule + pattes + panache, généré par le code.
 * Orienté vers +x. Sera remplacé par un GLB au jalon 4 sans toucher à la simulation.
 */
import * as THREE from 'three';
import type { MooseState } from '../sim/moose';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { accessoryById } from '../data';
import { legNodes, modelInstance } from './models';

/** Matériau d'accessoire : uni, rayé, à carreaux (bûcheron) ou fléché. */
function accessoryMaterial(pattern: string | undefined, colors: string[]): THREE.MeshLambertMaterial {
  const c0 = colors[0] ?? '#D80621';
  let mat: THREE.MeshLambertMaterial;
  if (!pattern || typeof document === 'undefined') mat = new THREE.MeshLambertMaterial({ color: c0 });
  else {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 32;
    const g = cv.getContext('2d')!;
    g.fillStyle = c0;
    g.fillRect(0, 0, 32, 32);
    g.fillStyle = colors[1] ?? '#FFFFFF';
    if (pattern === 'rayures') for (let y = 0; y < 32; y += 8) g.fillRect(0, y, 32, 4);
    else if (pattern === 'carreaux') {
      g.fillRect(0, 0, 16, 16);
      g.fillRect(16, 16, 16, 16);
      g.globalAlpha = 0.45;
      g.fillRect(16, 0, 16, 16);
      g.fillRect(0, 16, 16, 16);
      g.globalAlpha = 1;
    } else if (pattern === 'fleches') {
      // Chevrons de couleurs alternées, façon ceinture fléchée.
      colors.forEach((c, k) => {
        g.fillStyle = c;
        g.beginPath();
        g.moveTo(0, k * 10);
        g.lineTo(16, k * 10 + 8);
        g.lineTo(32, k * 10);
        g.lineTo(32, k * 10 + 5);
        g.lineTo(16, k * 10 + 13);
        g.lineTo(0, k * 10 + 5);
        g.fill();
      });
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 2);
    tex.magFilter = THREE.NearestFilter;
    mat = new THREE.MeshLambertMaterial({ map: tex });
  }
  return mat;
}

/**
 * Fusionne les maillages fixes d'un groupe en un maillage par matériau (moins d'appels de dessin).
 * Les objets de `keep` (parties animées) ne sont pas touchés.
 */
function mergeStatic(group: THREE.Object3D, keep: Set<THREE.Object3D>): void {
  group.updateMatrix();
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const remove: THREE.Object3D[] = [];
  for (const child of group.children) {
    const mesh = child as THREE.Mesh;
    if (keep.has(child) || !mesh.isMesh || Array.isArray(mesh.material)) continue;
    mesh.updateMatrix();
    const g = mesh.geometry.clone().applyMatrix4(mesh.matrix);
    const list = byMat.get(mesh.material) ?? [];
    list.push(g.index ? g : g);
    byMat.set(mesh.material, list);
    remove.push(child);
  }
  for (const [mat, geos] of byMat) {
    if (geos.length < 2) {
      geos.forEach((g) => g.dispose());
      remove.splice(0, remove.length, ...remove.filter((r) => (r as THREE.Mesh).material !== mat));
      continue;
    }
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) {
      remove.splice(0, remove.length, ...remove.filter((r) => (r as THREE.Mesh).material !== mat));
      continue;
    }
    group.add(new THREE.Mesh(merged, mat));
  }
  for (const r of remove) group.remove(r);
}

/** États animés du cahier : attente, départ, trot, galop, glissade, choc, étourdi, victoire, défaite. */
/** Distances (m) de passage à l'orignal simplifié puis à la silhouette. */
export const MOOSE_LOD = [40, 120] as const;

/** Pièce colorée pour un modèle simplifié (fusionné en un seul appel de dessin). */
function part(g: THREE.BufferGeometry, color: THREE.Color, x: number, y: number, z: number, rz = 0): THREE.BufferGeometry {
  const geo = (g.index ? g.toNonIndexed() : g).rotateZ(rz).translate(x, y, z);
  const n = geo.attributes.position.count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) color.toArray(c, i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  geo.deleteAttribute('uv');
  return geo;
}

/**
 * Orignal simplifié, sans animation des pattes : niveau 1 (formes à peu de faces) ou 2 (boîtes).
 * Une seule géométrie à couleurs par sommet : un appel de dessin au lieu d'une douzaine.
 */
function mooseProxy(color: THREE.Color, level: 1 | 2, accessory?: string): THREE.Mesh {
  const dark = color.clone().multiplyScalar(0.6);
  const antler = new THREE.Color(0xe8d3a8);
  const parts: THREE.BufferGeometry[] = [];
  if (level === 1) {
    parts.push(part(new THREE.CapsuleGeometry(0.75, 1.7, 2, 6), color, 0, 1.9, 0, Math.PI / 2));
    parts.push(part(new THREE.SphereGeometry(0.7, 6, 4), color, 0.6, 2.35, 0));
    parts.push(part(new THREE.CylinderGeometry(0.32, 0.45, 1.1, 5), color, 1.35, 2.55, 0, -0.9));
    parts.push(part(new THREE.CapsuleGeometry(0.32, 0.7, 2, 5), dark, 1.95, 2.85, 0, Math.PI / 2 - 0.35));
    for (const side of [-1, 1]) parts.push(part(new THREE.SphereGeometry(1, 6, 3).scale(0.32, 0.12, 0.75), antler, 1.85, 3.3, side * 0.72));
    for (const [x, z] of [
      [0.85, 0.4],
      [0.85, -0.4],
      [-0.85, 0.4],
      [-0.85, -0.4],
    ])
      parts.push(part(new THREE.CylinderGeometry(0.13, 0.1, 1.45, 4), dark, x, 0.78, z));
    const acc = accessoryById(accessory);
    const ac = new THREE.Color(acc.colors[0] ?? '#D80621');
    if (acc.kind === 'tuque') parts.push(part(new THREE.ConeGeometry(0.32, 0.55, 6), ac, 1.95, 3.35, 0));
    if (acc.kind === 'foulard') parts.push(part(new THREE.TorusGeometry(0.46, 0.13, 4, 8).rotateY(Math.PI / 2), ac, 1.25, 2.45, 0));
    if (acc.kind === 'ceinture') parts.push(part(new THREE.TorusGeometry(0.8, 0.13, 4, 10).rotateY(Math.PI / 2), ac, 0.15, 1.9, 0));
  } else {
    parts.push(part(new THREE.BoxGeometry(3.0, 1.4, 1.3), color, 0, 2.0, 0));
    parts.push(part(new THREE.BoxGeometry(1.0, 0.55, 0.55), dark, 1.9, 2.8, 0, -0.35));
    parts.push(part(new THREE.BoxGeometry(0.4, 0.12, 2.6), antler, 1.85, 3.3, 0));
    for (const x of [0.85, -0.85]) parts.push(part(new THREE.BoxGeometry(0.22, 1.5, 1.0), dark, x, 0.75, 0));
  }
  const merged = mergeGeometries(parts, false)!;
  merged.computeVertexNormals();
  return new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
}

export type MoosePose = 'race' | 'idle' | 'victory' | 'defeat';

export interface MooseView {
  root: THREE.Group;
  /** Phase de la foulée (pour caler le bruit des sabots). */
  readonly stridePhase: number;
  update(state: MooseState, dt: number, pose?: MoosePose): void;
}

export interface MooseLook {
  coat?: string;
  size?: number;
  accessory?: string;
}

export function createMooseView(look: MooseLook = {}): MooseView {
  const color = new THREE.Color(look.coat ?? '#5B3A29');
  const root = new THREE.Group();
  const lean = new THREE.Group();
  const yawSlip = new THREE.Group();
  root.add(yawSlip);
  yawSlip.add(lean);

  const fur = new THREE.MeshLambertMaterial({ color });
  const dark = new THREE.MeshLambertMaterial({ color: color.clone().multiplyScalar(0.6) });
  const antler = new THREE.MeshLambertMaterial({ color: 0xe8d3a8 });

  // Corps : capsule horizontale, garrot haut.
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.75, 1.7, 4, 10), fur);
  body.rotation.z = Math.PI / 2;
  body.position.y = 1.9;
  lean.add(body);
  const hump = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8), fur);
  hump.position.set(0.6, 2.35, 0);
  lean.add(hump);

  // Cou et tête.
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.45, 1.1, 8), fur);
  neck.position.set(1.35, 2.55, 0);
  neck.rotation.z = -0.9;
  lean.add(neck);
  const head = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.7, 4, 8), dark);
  head.geometry.rotateZ(Math.PI / 2 - 0.35);
  head.position.set(1.95, 2.85, 0);
  lean.add(head);

  // Gros yeux expressifs (visibles à l'accueil et aux résultats).
  const eyeWhite = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const pupil = new THREE.MeshBasicMaterial({ color: 0x1a1210 });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), eyeWhite);
    eye.position.set(2.05, 3.0, side * 0.24);
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), pupil);
    p.position.set(2.15, 3.0, side * 0.27);
    lean.add(eye, p);
  }

  // Panache : deux palettes larges, bien lisibles de dos.
  const panache = new THREE.Group();
  panache.position.set(1.85, 3.05, 0);
  for (const side of [-1, 1]) {
    const palm = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), antler);
    palm.scale.set(0.32, 0.1, 0.7);
    palm.position.set(0, 0.2, side * 0.72);
    palm.rotation.x = side * 0.55;
    panache.add(palm);
    for (let t = 0; t < 4; t++) {
      const tine = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.38, 5), antler);
      tine.position.set(-0.12 + t * 0.08, 0.42 + t * 0.06, side * (0.45 + t * 0.24));
      tine.rotation.x = side * 0.25;
      panache.add(tine);
    }
  }
  lean.add(panache);

  // Pattes : pivots à la hanche et à l'épaule.
  const legs: THREE.Group[] = [];
  const legGeo = new THREE.CylinderGeometry(0.13, 0.1, 1.45, 6);
  legGeo.translate(0, -0.72, 0);
  const legPos: [number, number][] = [
    [0.85, 0.4],
    [0.85, -0.4],
    [-0.85, 0.4],
    [-0.85, -0.4],
  ];
  for (const [x, z] of legPos) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 1.5, z);
    pivot.add(new THREE.Mesh(legGeo, dark));
    lean.add(pivot);
    legs.push(pivot);
  }

  // Petite queue.
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 5), dark);
  tail.position.set(-1.6, 2.1, 0);
  tail.rotation.z = Math.PI / 2 + 0.6;
  lean.add(tail);

  // Accessoire : tuque, foulard, clochette ou ceinture fléchée, aux couleurs du catalogue.
  const acc = accessoryById(look.accessory);
  const c0 = acc.colors[0] ?? '#D80621';
  const c1 = acc.colors[1] ?? '#FFFFFF';
  const main = accessoryMaterial(acc.pattern, acc.colors);
  const second = new THREE.MeshLambertMaterial({ color: c1 });
  if (acc.kind === 'tuque') {
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.55, 10), main);
    hat.position.set(1.95, 3.35, 0);
    const brim = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.08, 6, 12), second);
    brim.rotation.x = Math.PI / 2;
    brim.position.set(1.95, 3.1, 0);
    const pom = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), second);
    pom.position.set(1.95, 3.65, 0);
    lean.add(hat, brim, pom);
  } else if (acc.kind === 'foulard') {
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.13, 6, 14), main);
    scarf.rotation.y = Math.PI / 2;
    scarf.rotation.x = 0.5;
    scarf.position.set(1.25, 2.45, 0);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.25), main);
    tail.position.set(0.85, 2.55, 0.3);
    tail.rotation.z = 0.4;
    lean.add(scarf, tail);
  } else if (acc.kind === 'clochette') {
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshLambertMaterial({ color: c0 }));
    bell.position.set(1.45, 2.0, 0);
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 6, 14), dark);
    strap.rotation.y = Math.PI / 2;
    strap.position.set(1.35, 2.35, 0);
    lean.add(bell, strap);
  } else if (acc.kind === 'ceinture') {
    // Ceinture fléchée nouée sur le flanc, deux pans qui pendent.
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.13, 6, 20), main);
    belt.rotation.y = Math.PI / 2;
    belt.position.set(0.15, 1.9, 0);
    lean.add(belt);
    for (const dz of [-0.12, 0.12]) {
      const end = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.05), main);
      end.position.set(0.15 + dz, 1.45, 0.82);
      end.rotation.z = dz * 1.5;
      lean.add(end);
    }
  }

  // Ombre portée simple.
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1.4, 16),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(1.6, 1, 1);
  shadow.position.y = 0.06;
  root.add(shadow);

  const size = look.size ?? 1;
  yawSlip.scale.setScalar(size);

  // Étoiles d'étourdissement autour de la tête.
  const stars = new THREE.Group();
  const starMat = new THREE.MeshBasicMaterial({ color: 0xffd34d });
  for (let i = 0; i < 3; i++) {
    const st = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), starMat);
    st.position.set(Math.cos((i / 3) * Math.PI * 2) * 0.6, 0, Math.sin((i / 3) * Math.PI * 2) * 0.6);
    stars.add(st);
  }
  stars.position.set(1.9, 3.9, 0);
  stars.visible = false;
  lean.add(stars);

  // Parties fixes fusionnées par matériau ; tête, queue, pattes, panache et étoiles restent animés.
  mergeStatic(panache, new Set());
  mergeStatic(lean, new Set<THREE.Object3D>([head, tail, panache, stars, ...legs]));

  // Modèle GLB fourni : il remplace les formes du code (les pattes sont animées si elles sont nommées).
  const glb = modelInstance('moose', look.coat);
  if (glb) {
    const glbLegs = legNodes(glb);
    lean.clear();
    lean.add(glb, stars);
    if (glbLegs) {
      legs.length = 0;
      for (const l of glbLegs) legs.push(l as THREE.Group);
    }
  }

  // Niveaux de détail (formes du code seulement) : complet, simplifié, silhouette.
  if (!glb) {
    const lod = new THREE.LOD();
    root.remove(yawSlip);
    lod.addLevel(yawSlip, 0, 0.1);
    for (const [i, level] of [1, 2].entries()) {
      const proxy = mooseProxy(color, level as 1 | 2, look.accessory);
      proxy.scale.setScalar(size);
      lod.addLevel(proxy, MOOSE_LOD[i], 0.1);
    }
    root.add(lod);
  }

  let phase = 0;
  let leanAngle = 0;
  let antlerLag = 0;
  let time = 0;
  let gallopBlend = 0;
  // Décalages de phase par patte (avant gauche, avant droite, arrière gauche, arrière droite).
  const TROT = [0, 0.5, 0.5, 0];
  const GALLOP = [0, 0.12, 0.55, 0.67];

  return {
    root,
    get stridePhase() {
      return phase;
    },
    update(s: MooseState, dt: number, pose: MoosePose = 'race') {
      time += dt;
      // Cadence liée à la vitesse : pas de sabots qui patinent.
      // Foulée plus longue au galop (≈ 5 m) qu'au trot (≈ 3 m).
      const galloping = s.speed > 17 || s.galloping;
      gallopBlend += ((galloping ? 1 : 0) - gallopBlend) * Math.min(1, 4 * dt);
      const stride = 3 + 2 * gallopBlend;
      phase += (s.speed / stride) * Math.PI * 2 * dt;
      const amp = s.speed < 0.3 ? 0 : Math.min(0.8, 0.22 + s.speed / 38);
      legs.forEach((l, i) => {
        const off = TROT[i] * (1 - gallopBlend) + GALLOP[i] * gallopBlend;
        l.rotation.z = Math.sin(phase + off * Math.PI * 2) * amp;
      });
      // Galop : le corps tangue ; trot : petit rebond.
      const bob = Math.abs(Math.sin(phase)) * Math.min(0.18, s.speed / 160);
      lean.position.y = bob;
      body.rotation.x = 0;
      let pitch = Math.sin(phase) * 0.06 * gallopBlend * Math.min(1, s.speed / 20);

      // Attente : respiration, tête qui dodeline, queue qui bat.
      if (s.speed < 0.3) {
        lean.position.y = Math.sin(time * 2.2) * 0.03;
        head.rotation.y = Math.sin(time * 0.7) * 0.15;
        tail.rotation.y = Math.sin(time * 5) * 0.4;
      } else {
        head.rotation.y *= 0.9;
        tail.rotation.y = Math.sin(phase * 2) * 0.2;
      }
      if (pose === 'victory') {
        // Victoire : il se cabre à intervalles réguliers.
        pitch = Math.max(0, Math.sin(time * 3)) * 0.45;
        legs[0].rotation.z = legs[1].rotation.z = -0.8 * Math.max(0, Math.sin(time * 3));
      } else if (pose === 'defeat') {
        head.rotation.z = -0.35;
      } else head.rotation.z = 0;
      lean.rotation.z = pitch;

      stars.visible = s.stunTime > 0;
      if (stars.visible) stars.rotation.y = time * 6;

      // Inclinaison dans le virage (vers l'intérieur), proportionnelle à l'accélération latérale.
      const targetLean = -Math.max(-0.35, Math.min(0.35, s.lateralAccel * 0.016));
      leanAngle += (targetLean - leanAngle) * Math.min(1, 10 * dt);
      lean.rotation.x = leanAngle;

      // Bois qui oscillent avec un léger retard.
      antlerLag += (leanAngle - antlerLag) * Math.min(1, 5 * dt);
      panache.rotation.x = (antlerLag - leanAngle) * 1.5;

      // Dérapage sous la pluie : l'arrière chasse vers l'extérieur (slip reste nul par temps sec).
      const slipYaw = Math.sign(s.curvature) * s.slip * 0.6;
      yawSlip.rotation.y += (slipYaw - yawSlip.rotation.y) * Math.min(1, 8 * dt);
    },
  };
}
