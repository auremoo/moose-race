/**
 * Orignal provisoire « boîte grise » : capsule + pattes + panache, généré par le code.
 * Orienté vers +x. Sera remplacé par un GLB au jalon 4 sans toucher à la simulation.
 */
import * as THREE from 'three';
import type { MooseState } from '../sim/moose';
import { legNodes, modelInstance } from './models';

/** États animés du cahier : attente, départ, trot, galop, glissade, choc, étourdi, victoire, défaite. */
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

  // Accessoire : tuque, foulard ou clochette (visibles de dos).
  const red = new THREE.MeshLambertMaterial({ color: 0xd80621 });
  const white = new THREE.MeshLambertMaterial({ color: 0xffffff });
  if (look.accessory === 'tuque') {
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.55, 10), red);
    hat.position.set(1.95, 3.35, 0);
    const brim = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.08, 6, 12), white);
    brim.rotation.x = Math.PI / 2;
    brim.position.set(1.95, 3.1, 0);
    const pom = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), white);
    pom.position.set(1.95, 3.65, 0);
    lean.add(hat, brim, pom);
  } else if (look.accessory === 'foulard') {
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.13, 6, 14), red);
    scarf.rotation.y = Math.PI / 2;
    scarf.rotation.x = 0.5;
    scarf.position.set(1.25, 2.45, 0);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.25), red);
    tail.position.set(0.85, 2.55, 0.3);
    tail.rotation.z = 0.4;
    lean.add(scarf, tail);
  } else if (look.accessory === 'clochette') {
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshLambertMaterial({ color: 0xf5b301 }));
    bell.position.set(1.45, 2.0, 0);
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 6, 14), dark);
    strap.rotation.y = Math.PI / 2;
    strap.position.set(1.35, 2.35, 0);
    lean.add(bell, strap);
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

      // En survitesse, l'arrière chasse légèrement vers l'extérieur.
      const slipYaw = Math.sign(s.curvature) * s.slip * (s.drifting ? 0.85 : 0.35);
      yawSlip.rotation.y += (slipYaw - yawSlip.rotation.y) * Math.min(1, 8 * dt);
    },
  };
}
