/**
 * Ours noir, castor, barrage et hutte, en formes simples générées par le code (remplaçables par des GLB).
 */
import * as THREE from 'three';

export function createBearView(): THREE.Group {
  const g = new THREE.Group();
  const fur = new THREE.MeshLambertMaterial({ color: 0x1d1b1a });
  const muzzle = new THREE.MeshLambertMaterial({ color: 0xc9a77c });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.85, 1.3, 4, 10), fur);
  body.rotation.z = Math.PI / 2;
  body.position.y = 1.15;
  g.add(body);
  const hump = new THREE.Mesh(new THREE.SphereGeometry(0.75, 10, 8), fur);
  hump.position.set(0.4, 1.5, 0);
  g.add(hump);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), fur);
  head.position.set(1.35, 1.45, 0);
  g.add(head);
  const snout = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.3, 4, 8), muzzle);
  snout.rotation.z = Math.PI / 2;
  snout.position.set(1.85, 1.35, 0);
  g.add(snout);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), fur);
    ear.position.set(1.2, 1.95, side * 0.32);
    g.add(ear);
    for (const fx of [-0.7, 0.7]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.2, 0.9, 8), fur);
      leg.position.set(fx, 0.45, side * 0.45);
      g.add(leg);
    }
  }
  return g;
}

export function createBeaverView(): THREE.Group {
  const g = new THREE.Group();
  const fur = new THREE.MeshLambertMaterial({ color: 0x7a4a26 });
  const tailMat = new THREE.MeshLambertMaterial({ color: 0x3b2a1e });
  const teeth = new THREE.MeshLambertMaterial({ color: 0xfff6dc });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), fur);
  body.scale.set(1.2, 0.95, 0.9);
  body.position.y = 0.55;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), fur);
  head.position.set(0.6, 0.85, 0);
  g.add(head);
  const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.14), teeth);
  tooth.position.set(0.92, 0.72, 0);
  g.add(tooth);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.08, 0.45), tailMat);
  tail.position.set(-0.85, 0.2, 0);
  tail.rotation.z = 0.25;
  g.add(tail);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    eye.position.set(0.85, 0.95, side * 0.15);
    g.add(eye);
  }
  // Halo doré : c'est une aide à ramasser.
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(0.9, 1.15, 24),
    new THREE.MeshBasicMaterial({ color: 0xf5b301, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }),
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.05;
  g.add(halo);
  return g;
}

export function createBarrageView(halfWidth: number): THREE.Group {
  const g = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ color: 0x8a5a36 });
  for (let i = 0; i < 3; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, halfWidth * 2, 8), wood);
    log.rotation.x = Math.PI / 2;
    log.position.set(0, 0.2 + i * 0.34, (i - 1) * 0.08);
    g.add(log);
  }
  return g;
}

export function createShieldView(): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(2.6, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x8fd1ff, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }),
  );
  return m;
}

/** Point d'exclamation rouge, toujours face à la caméra : signal 2 s avant le passage d'un ours. */
export function createWarningSprite(): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#D80621';
  g.beginPath();
  g.arc(32, 32, 30, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#fff';
  g.font = 'bold 46px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('!', 32, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  s.scale.set(2.2, 2.2, 1);
  return s;
}
