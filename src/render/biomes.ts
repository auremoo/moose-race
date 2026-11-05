/**
 * Décors des trois biomes (Rocheuses, plaine, forêt) et repères de pilotage :
 * panneaux de virage, repères de freinage, panneaux « Attention orignaux », inukshuks.
 * Formes simples et instanciées pour tenir 60 FPS sur téléphone ; remplaçables par des GLB.
 */
import * as THREE from 'three';
import type { RacingLine } from '../sim/racingLine';
import type { Rng } from '../sim/rng';
import { projectOnTrack, type Track } from '../sim/track';
import { simToWorldX, simToWorldZ } from './coords';

export type Biome = 'plaine' | 'foret' | 'rocheuses' | 'test';

export interface Palette {
  skyTop: number;
  skyBottom: number;
  fog: number;
  ground: number;
  verge: number;
  hemiSky: number;
  hemiGround: number;
  sun: number;
  sunIntensity: number;
}

export function paletteFor(biome: Biome, snowy: boolean, dusk: boolean): Palette {
  if (dusk)
    return { skyTop: 0x3b4a8c, skyBottom: 0xf7a35c, fog: 0xf0b07a, ground: 0xb99a45, verge: 0xcfb35a, hemiSky: 0xffd2a8, hemiGround: 0x6b5a2a, sun: 0xffb36b, sunIntensity: 1.5 };
  if (snowy)
    return { skyTop: 0x6fa8dc, skyBottom: 0xdcefff, fog: 0xdcefff, ground: 0xf2f6fa, verge: 0xe6eef5, hemiSky: 0xeaf6ff, hemiGround: 0x9fb4c4, sun: 0xffffff, sunIntensity: 1.6 };
  switch (biome) {
    case 'plaine':
      return { skyTop: 0x5aa9e6, skyBottom: 0xcfeaff, fog: 0xd6ecff, ground: 0xc9a646, verge: 0xd9bf5a, hemiSky: 0xfff4d6, hemiGround: 0x8a7a3a, sun: 0xfff1d6, sunIntensity: 1.9 };
    case 'rocheuses':
      return { skyTop: 0x4f8fd6, skyBottom: 0xcde8fb, fog: 0xcfe4f2, ground: 0x7aa35a, verge: 0x93b96a, hemiSky: 0xe3f2ff, hemiGround: 0x4f6a3a, sun: 0xfff6e6, sunIntensity: 1.8 };
    case 'foret':
      return { skyTop: 0x5c9fd8, skyBottom: 0xd4ecf7, fog: 0xc8e2d0, ground: 0x4e8a3a, verge: 0x6fa84a, hemiSky: 0xe4f6e4, hemiGround: 0x35552a, sun: 0xffeccc, sunIntensity: 1.7 };
    default:
      return { skyTop: 0x7cc4ef, skyBottom: 0x9fd8f2, fog: 0x9fd8f2, ground: 0x6fa84a, verge: 0x8cc160, hemiSky: 0xdff3ff, hemiGround: 0x557a3a, sun: 0xfff1d6, sunIntensity: 1.8 };
  }
}

/** Ciel en dégradé : grande sphère dont les sommets sont colorés du haut vers l'horizon. */
export function skyDome(p: Palette): THREE.Mesh {
  const g = new THREE.SphereGeometry(1400, 24, 12);
  const top = new THREE.Color(p.skyTop);
  const bottom = new THREE.Color(p.skyBottom);
  const pos = g.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = Math.max(0, Math.min(1, pos.getY(i) / 700));
    const c = bottom.clone().lerp(top, Math.pow(t, 0.7));
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
}

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const signMats: Record<string, THREE.MeshBasicMaterial> = {};
function signMaterial(kind: 'chevronL' | 'chevronR' | 'moose' | 'b100' | 'b50'): THREE.MeshBasicMaterial {
  if (signMats[kind]) return signMats[kind];
  const tex = canvasTexture(128, 128, (g) => {
    if (kind === 'moose') {
      g.fillStyle = '#F5B301';
      g.translate(64, 64);
      g.rotate(Math.PI / 4);
      g.fillRect(-44, -44, 88, 88);
      g.strokeStyle = '#111';
      g.lineWidth = 6;
      g.strokeRect(-40, -40, 80, 80);
      g.rotate(-Math.PI / 4);
      g.fillStyle = '#111';
      // Silhouette d'orignal stylisée.
      g.beginPath();
      g.ellipse(-4, 8, 26, 13, 0, 0, Math.PI * 2);
      g.fill();
      g.fillRect(-24, 14, 6, 22);
      g.fillRect(12, 14, 6, 22);
      g.beginPath();
      g.ellipse(26, -6, 9, 7, -0.5, 0, Math.PI * 2);
      g.fill();
      g.fillRect(18, -24, 4, 14);
      g.fillRect(26, -26, 4, 14);
    } else if (kind === 'b100' || kind === 'b50') {
      g.fillStyle = '#fff';
      g.fillRect(0, 0, 128, 128);
      g.strokeStyle = '#D80621';
      g.lineWidth = 10;
      g.strokeRect(5, 5, 118, 118);
      g.fillStyle = '#111';
      g.font = 'bold 64px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(kind === 'b100' ? '100' : '50', 64, 68);
    } else {
      g.fillStyle = '#F5B301';
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = '#111';
      const dir = kind === 'chevronR' ? 1 : -1;
      for (const x of [34, 74]) {
        g.beginPath();
        g.moveTo(x - 18 * dir, 18);
        g.lineTo(x + 14 * dir, 64);
        g.lineTo(x - 18 * dir, 110);
        g.lineTo(x - 2 * dir, 110);
        g.lineTo(x + 30 * dir, 64);
        g.lineTo(x - 2 * dir, 18);
        g.fill();
      }
    }
  });
  signMats[kind] = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, transparent: kind === 'moose' });
  return signMats[kind];
}

interface Spot {
  x: number;
  y: number;
}

/** Points libres autour du circuit (hors piste et hors bas-côté). */
function freeSpots(track: Track, rng: Rng, count: number, margin: number, reach: number): Spot[] {
  const S = track.samples;
  const xs = S.map((s) => s.x);
  const ys = S.map((s) => s.y);
  const minX = Math.min(...xs) - reach;
  const maxX = Math.max(...xs) + reach;
  const minY = Math.min(...ys) - reach;
  const maxY = Math.max(...ys) + reach;
  const out: Spot[] = [];
  for (let tries = 0; tries < count * 8 && out.length < count; tries++) {
    const x = rng.range(minX, maxX);
    const y = rng.range(minY, maxY);
    const pr = projectOnTrack(track, x, y);
    if (Math.abs(pr.d) < S[pr.index].hw + track.def.verge + margin) continue;
    out.push({ x, y });
  }
  return out;
}

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, spots: { x: number; y: number; s: number; r: number; h?: number; c?: THREE.Color }[]): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, spots.length));
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  spots.forEach((p, i) => {
    q.setFromAxisAngle(up, p.r);
    m4.compose(new THREE.Vector3(simToWorldX(p.x), p.h ?? 0, simToWorldZ(p.y)), q, new THREE.Vector3(p.s, p.s, p.s));
    mesh.setMatrixAt(i, m4);
    if (p.c) mesh.setColorAt(i, p.c);
  });
  mesh.count = spots.length;
  return mesh;
}

/** Arbres, montagnes, champs, lacs, bâtiments selon le biome. */
export function decorate(group: THREE.Group, track: Track, biome: Biome, snowy: boolean, rng: Rng, density: number): void {
  const pine = new THREE.ConeGeometry(2.6, 7, 7);
  pine.translate(0, 5.5, 0);
  const trunk = new THREE.CylinderGeometry(0.35, 0.45, 2, 6);
  trunk.translate(0, 1, 0);
  const round = new THREE.IcosahedronGeometry(2.6, 0);
  round.translate(0, 5, 0);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4426 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  const greens = [0x2e8b57, 0x1f6b40, 0x2b7a4b];
  const snowGreens = [0x3c6e57, 0x557f6c];
  const maples = [0xd8461b, 0xe8742a, 0xc22f1f, 0xf0a030];
  const n = Math.round((biome === 'plaine' ? 160 : biome === 'rocheuses' ? 520 : 760) * density);
  const spots = freeSpots(track, rng, n, 3, 140);
  const trees = spots.map((p) => {
    const isMaple = biome === 'foret' && rng.next() < 0.35;
    const isPoplar = biome === 'plaine';
    const palette = isMaple ? maples : snowy ? snowGreens : greens;
    return { ...p, s: rng.range(0.7, 1.4) * (biome === 'rocheuses' ? 1.15 : 1), r: rng.range(0, 6.28), c: new THREE.Color(palette[Math.floor(rng.next() * palette.length)]), kind: isMaple || isPoplar ? 'round' : 'pine' };
  });
  group.add(instanced(trunk, trunkMat, trees.map(({ x, y, s: sc, r }) => ({ x, y, s: sc, r }))));
  group.add(instanced(pine, leafMat, trees.filter((t) => t.kind === 'pine')));
  group.add(instanced(round, leafMat, trees.filter((t) => t.kind === 'round')));
  if (snowy) {
    // Neige sur la pointe des sapins.
    const cap = new THREE.ConeGeometry(1.1, 2.2, 7);
    cap.translate(0, 8.0, 0);
    group.add(instanced(cap, new THREE.MeshLambertMaterial({ color: 0xffffff }), trees.filter((t) => t.kind === 'pine')));
  }

  const S = track.samples;
  const cx = S.reduce((a, s) => a + s.x, 0) / S.length;
  const cy = S.reduce((a, s) => a + s.y, 0) / S.length;

  if (biome === 'rocheuses' || snowy) {
    // Couronne de sommets enneigés à l'horizon.
    const mount = new THREE.ConeGeometry(1, 1, 6);
    mount.translate(0, 0.5, 0);
    const capG = new THREE.ConeGeometry(1, 1, 6);
    capG.translate(0, 0.5, 0);
    const peaks: { x: number; y: number; s: number; r: number }[] = [];
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + rng.range(-0.1, 0.1);
      const dist = rng.range(650, 950);
      peaks.push({ x: cx + Math.cos(a) * dist, y: cy + Math.sin(a) * dist, s: rng.range(160, 320), r: rng.range(0, 6.28) });
    }
    const rock = instanced(mount, new THREE.MeshLambertMaterial({ color: 0x7d8794, flatShading: true }), peaks);
    rock.geometry = mount.clone().scale(1.3, 1, 1.3);
    group.add(rock);
    const caps = peaks.map((p) => ({ ...p, h: p.s * 0.58, s: p.s * 0.45 }));
    group.add(instanced(capG, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), caps));
    // Lac turquoise et inukshuks.
    const lakes = freeSpots(track, rng, 2, 30, 90);
    for (const l of lakes) {
      const lake = new THREE.Mesh(new THREE.CircleGeometry(rng.range(25, 45), 24), new THREE.MeshLambertMaterial({ color: 0x3fc1c9 }));
      lake.rotation.x = -Math.PI / 2;
      lake.position.set(simToWorldX(l.x), 0.03, simToWorldZ(l.y));
      group.add(lake);
    }
    const stone = new THREE.MeshLambertMaterial({ color: 0x8e8a85, flatShading: true });
    for (const p of freeSpots(track, rng, 5, 4, 30)) group.add(inukshuk(stone, p.x, p.y, rng.range(0, 6.28)));
  }

  if (biome === 'plaine') {
    // Champs de blé : rangées dorées, silos et élévateurs à grain.
    const rows = canvasTexture(64, 64, (g) => {
      g.fillStyle = '#d9b24a';
      g.fillRect(0, 0, 64, 64);
      g.fillStyle = '#c49a35';
      for (let y = 0; y < 64; y += 8) g.fillRect(0, y, 64, 3);
    });
    rows.wrapS = rows.wrapT = THREE.RepeatWrapping;
    rows.repeat.set(60, 60);
    const field = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.MeshLambertMaterial({ map: rows }));
    field.rotation.x = -Math.PI / 2;
    field.position.set(simToWorldX(cx), -0.04, simToWorldZ(cy));
    group.add(field);
    const silo = new THREE.MeshLambertMaterial({ color: 0xc0c6cc });
    const red = new THREE.MeshLambertMaterial({ color: 0xa8322b });
    for (const p of freeSpots(track, rng, 7, 20, 120)) {
      const g = new THREE.Group();
      for (let k = 0; k < 3; k++) {
        const c = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 14, 12), silo);
        c.position.set(k * 6.5, 7, 0);
        const dome = new THREE.Mesh(new THREE.SphereGeometry(3, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), silo);
        dome.position.set(k * 6.5, 14, 0);
        g.add(c, dome);
      }
      const elev = new THREE.Mesh(new THREE.BoxGeometry(6, 24, 6), red);
      elev.position.set(-8, 12, 0);
      g.add(elev);
      g.position.set(simToWorldX(p.x), 0, simToWorldZ(p.y));
      g.rotation.y = rng.range(0, 6.28);
      group.add(g);
    }
  }

  if (biome === 'foret') {
    // Lacs, canots, cabane à sucre.
    for (const l of freeSpots(track, rng, 3, 30, 100)) {
      const r = rng.range(22, 40);
      const lake = new THREE.Mesh(new THREE.CircleGeometry(r, 24), new THREE.MeshLambertMaterial({ color: 0x3c7fb0 }));
      lake.rotation.x = -Math.PI / 2;
      lake.position.set(simToWorldX(l.x), 0.03, simToWorldZ(l.y));
      group.add(lake);
      const canoe = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 3.6, 4, 8), new THREE.MeshLambertMaterial({ color: 0xc8361f }));
      canoe.rotation.z = Math.PI / 2;
      canoe.scale.set(1, 1, 0.45);
      canoe.position.set(simToWorldX(l.x + r * 0.3), 0.2, simToWorldZ(l.y));
      group.add(canoe);
    }
    const wood = new THREE.MeshLambertMaterial({ color: 0x8a5a36 });
    const roof = new THREE.MeshLambertMaterial({ color: 0x5b3a29 });
    for (const p of freeSpots(track, rng, 2, 15, 60)) {
      const g = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 6), wood);
      box.position.y = 2;
      const top = new THREE.Mesh(new THREE.ConeGeometry(6, 3, 4), roof);
      top.rotation.y = Math.PI / 4;
      top.position.y = 5.5;
      const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.8, 3, 0.8), new THREE.MeshLambertMaterial({ color: 0x8e8a85 }));
      chimney.position.set(2, 6, 0);
      g.add(box, top, chimney);
      g.position.set(simToWorldX(p.x), 0, simToWorldZ(p.y));
      g.rotation.y = rng.range(0, 6.28);
      group.add(g);
    }
  }
}

function inukshuk(mat: THREE.Material, x: number, y: number, rot: number): THREE.Group {
  const g = new THREE.Group();
  const block = (w: number, h: number, d: number, px: number, py: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(px, py, 0);
    g.add(m);
  };
  block(0.5, 1.2, 0.5, -0.5, 0.6);
  block(0.5, 1.2, 0.5, 0.5, 0.6);
  block(1.8, 0.4, 0.6, 0, 1.4);
  block(0.7, 0.8, 0.5, 0, 2);
  block(2.6, 0.35, 0.5, 0, 2.55);
  block(0.55, 0.55, 0.5, 0, 3);
  g.position.set(simToWorldX(x), 0, simToWorldZ(y));
  g.rotation.y = rot;
  return g;
}

/** Panneaux de virage (chevrons côté extérieur), repères de freinage, panneaux « Attention orignaux ». */
export function trackSigns(group: THREE.Group, track: Track, line: RacingLine, rng: Rng): void {
  const S = track.samples;
  const n = S.length;
  const board = new THREE.PlaneGeometry(1.6, 1.6);
  const post = new THREE.CylinderGeometry(0.08, 0.08, 1.6, 6);
  const postMat = new THREE.MeshLambertMaterial({ color: 0x8a8a8a });
  const addSign = (kind: Parameters<typeof signMaterial>[0], i: number, side: number, height = 2.1) => {
    const s = S[(i + n) % n];
    const d = side * (s.hw + 2);
    const x = s.x + s.nx * d;
    const y = s.y + s.ny * d;
    const g = new THREE.Group();
    const b = new THREE.Mesh(board, signMaterial(kind));
    b.position.y = height;
    const p = new THREE.Mesh(post, postMat);
    p.position.y = 0.8;
    g.add(b, p);
    g.position.set(simToWorldX(x), 0, simToWorldZ(y));
    // Face aux orignaux qui arrivent : le panneau regarde vers l'arrière de la piste.
    g.rotation.y = Math.atan2(s.ty, s.tx) + Math.PI / 2;
    group.add(g);
  };
  for (const ap of line.apexes) {
    if (Math.abs(line.k[ap.index]) < 1 / 45) continue;
    // Chevrons sur l'extérieur, en entrée de virage.
    const outside = -ap.side;
    for (const back of [18, 8]) addSign(ap.side > 0 ? 'chevronL' : 'chevronR', ap.index - Math.round(back / track.spacing), outside);
    // Repères de freinage avant les virages serrés.
    if (Math.abs(line.k[ap.index]) > 1 / 28) {
      addSign('b100', ap.index - Math.round(100 / track.spacing), outside, 1.2);
      addSign('b50', ap.index - Math.round(50 / track.spacing), outside, 1.2);
    }
  }
  // Quelques panneaux « Attention orignaux » le long des lignes droites.
  for (let k = 0; k < 3; k++) {
    const i = Math.floor(rng.next() * n);
    if (Math.abs(S[i].k) > 1 / 120) continue;
    addSign('moose', i, rng.next() < 0.5 ? 1 : -1, 2.3);
  }
}
