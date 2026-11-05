/**
 * Orignal provisoire « boîte grise » : capsule + pattes + panache, généré par le code.
 * Orienté vers +x. Sera remplacé par un GLB au jalon 4 sans toucher à la simulation.
 */
import * as THREE from 'three';
import type { MooseState } from '../sim/moose';

export interface MooseView {
  root: THREE.Group;
  update(state: MooseState, dt: number): void;
}

export function createMooseView(color = 0x5b3a29): MooseView {
  const root = new THREE.Group();
  const lean = new THREE.Group();
  const yawSlip = new THREE.Group();
  root.add(yawSlip);
  yawSlip.add(lean);

  const fur = new THREE.MeshLambertMaterial({ color });
  const dark = new THREE.MeshLambertMaterial({ color: 0x3a2418 });
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
  head.rotation.z = Math.PI / 2 - 0.35;
  head.position.set(1.95, 2.85, 0);
  lean.add(head);

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

  // Ombre portée simple.
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1.4, 16),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(1.6, 1, 1);
  shadow.position.y = 0.06;
  root.add(shadow);

  let phase = 0;
  let leanAngle = 0;
  let antlerLag = 0;

  return {
    root,
    update(s: MooseState, dt: number) {
      // Cadence liée à la vitesse : pas de sabots qui patinent (foulée ~4,5 m au galop).
      const stride = 4.5;
      phase += (s.speed / stride) * Math.PI * 2 * dt;
      const amp = Math.min(0.75, 0.15 + s.speed / 40);
      // Allure en galop rotatif simplifiée : antérieurs et postérieurs décalés.
      const offsets = [0, 0.25, 0.55, 0.8];
      legs.forEach((l, i) => {
        l.rotation.z = Math.sin(phase + offsets[i] * Math.PI * 2) * amp;
      });
      const bob = Math.abs(Math.sin(phase)) * Math.min(0.18, s.speed / 160);
      lean.position.y = bob;
      body.rotation.x = 0;

      // Inclinaison dans le virage (vers l'intérieur), proportionnelle à l'accélération latérale.
      const targetLean = -Math.max(-0.35, Math.min(0.35, s.lateralAccel * 0.016));
      leanAngle += (targetLean - leanAngle) * Math.min(1, 10 * dt);
      lean.rotation.x = leanAngle;

      // Bois qui oscillent avec un léger retard.
      antlerLag += (leanAngle - antlerLag) * Math.min(1, 5 * dt);
      panache.rotation.x = (antlerLag - leanAngle) * 1.5;

      // En survitesse, l'arrière chasse légèrement vers l'extérieur.
      const slipYaw = Math.sign(s.curvature) * s.slip * 0.35;
      yawSlip.rotation.y += (slipYaw - yawSlip.rotation.y) * Math.min(1, 8 * dt);
    },
  };
}
