/**
 * Décor de la boîte grise : sol, bas-côté, sentier, bordures, vibreurs, ligne de départ,
 * clôture de barrière et arbres instanciés. Visuels provisoires, remplaçables.
 */
import * as THREE from 'three';
import { createRng } from '../sim/rng';
import type { RacingLine } from '../sim/racingLine';
import { projectOnTrack, type SurfaceId, type Track } from '../sim/track';
import { simToWorldX, simToWorldZ } from './coords';

const COLORS = {
  sky: 0x9fd8f2,
  ground: 0x6fa84a,
  verge: 0x8cc160,
  trail: 0xb08a5e,
  edge: 0xffffff,
  curbRed: 0xd80621,
  curbWhite: 0xffffff,
  trunk: 0x6b4426,
  pine: 0x2e8b57,
  pineDark: 0x1f6b40,
  post: 0x8a5a36,
  corde: 0x2e8b57,
};

/** Couleur du sentier selon la surface. */
const SURFACE_COLORS: Record<SurfaceId, number> = {
  sentier: 0xb08a5e,
  herbe: 0x8cc160,
  boue: 0x6b4a2f,
  neige: 0xeef3f7,
  glace: 0xbfe6f5,
};

export interface IdealLine {
  mesh: THREE.Mesh;
  colors: THREE.BufferAttribute;
}

export interface World {
  group: THREE.Group;
  debugLine: THREE.Line;
  ideal: IdealLine;
}

/** Ruban entre deux décalages latéraux d1 < d2 le long de la piste, couleur par échantillon. */
function ribbon(
  track: Track,
  d1: (i: number) => number,
  d2: (i: number) => number,
  y: number,
  color: (i: number) => THREE.Color,
): THREE.BufferGeometry {
  const S = track.samples;
  const n = S.length;
  const pos = new Float32Array((n + 1) * 2 * 3);
  const col = new Float32Array((n + 1) * 2 * 3);
  for (let j = 0; j <= n; j++) {
    const i = j % n;
    const s = S[i];
    const c = color(i);
    for (let side = 0; side < 2; side++) {
      const d = side === 0 ? d1(i) : d2(i);
      const o = (j * 2 + side) * 3;
      pos[o] = simToWorldX(s.x + s.nx * d);
      pos[o + 1] = y;
      pos[o + 2] = simToWorldZ(s.y + s.ny * d);
      col[o] = c.r;
      col[o + 1] = c.g;
      col[o + 2] = c.b;
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < n; j++) {
    const a = j * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    // Ordre choisi pour des faces orientées vers le haut (voir conversion y → -z).
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildWorld(scene: THREE.Scene, track: Track, line: RacingLine): World {
  scene.background = new THREE.Color(COLORS.sky);
  scene.fog = new THREE.Fog(COLORS.sky, 90, 420);
  const group = new THREE.Group();
  scene.add(group);

  const hemi = new THREE.HemisphereLight(0xdff3ff, 0x557a3a, 1.6);
  group.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 1.8);
  sun.position.set(-120, 200, 80);
  group.add(sun);

  const vc = (hex: number) => new THREE.Color(hex);
  const flat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });

  // Sol.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(3000, 3000),
    new THREE.MeshLambertMaterial({ color: COLORS.ground }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  group.add(ground);

  const S = track.samples;
  const verge = track.def.verge;
  const hwAt = (i: number) => S[i].hw;
  const limitAt = (i: number) => S[i].hw + verge;
  const off = (f: (i: number) => number, k: number, c = 0) => (i: number) => k * f(i) + c;

  // Bas-côté (herbe), sentier, bordures blanches. La largeur varie le long de la piste.
  const vergeCol = vc(COLORS.verge);
  group.add(new THREE.Mesh(ribbon(track, off(limitAt, -1), limitAt, 0.0, () => vergeCol), flat));
  const surfA = {} as Record<SurfaceId, THREE.Color>;
  const surfB = {} as Record<SurfaceId, THREE.Color>;
  for (const k of Object.keys(SURFACE_COLORS) as SurfaceId[]) {
    surfA[k] = vc(SURFACE_COLORS[k]);
    surfB[k] = vc(SURFACE_COLORS[k]).offsetHSL(0, 0, -0.03);
  }
  group.add(
    new THREE.Mesh(
      ribbon(track, off(hwAt, -1), hwAt, 0.02, (i) => (Math.floor(i / 6) % 2 ? surfA : surfB)[S[i].surface]),
      flat,
    ),
  );
  const white = vc(COLORS.edge);
  group.add(new THREE.Mesh(ribbon(track, off(hwAt, 1, -0.5), off(hwAt, 1, -0.2), 0.04, () => white), flat));
  group.add(new THREE.Mesh(ribbon(track, off(hwAt, -1, 0.2), off(hwAt, -1, 0.5), 0.04, () => white), flat));

  // Vibreurs rouge et blanc sur les virages marqués, côté intérieur et extérieur.
  const red = vc(COLORS.curbRed);
  const curbMask = S.map((s) => Math.abs(s.k) > 1 / 70);
  const curbColor = (i: number) => (curbMask[i] ? (Math.floor(i / 3) % 2 ? red : white) : vergeCol);
  group.add(new THREE.Mesh(ribbon(track, hwAt, off(hwAt, 1, 1.4), 0.03, curbColor), flat));
  group.add(new THREE.Mesh(ribbon(track, off(hwAt, -1, -1.4), off(hwAt, -1), 0.03, curbColor), flat));

  // Ligne de départ en damier.
  const startCanvas = document.createElement('canvas');
  startCanvas.width = 64;
  startCanvas.height = 8;
  const ctx = startCanvas.getContext('2d')!;
  for (let x = 0; x < 16; x++)
    for (let y = 0; y < 2; y++) {
      ctx.fillStyle = (x + y) % 2 ? '#222' : '#fff';
      ctx.fillRect(x * 4, y * 4, 4, 4);
    }
  const tex = new THREE.CanvasTexture(startCanvas);
  tex.magFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  const s0 = S[0];
  const hw = s0.hw;
  const start = new THREE.Mesh(new THREE.PlaneGeometry(2, hw * 2), new THREE.MeshBasicMaterial({ map: tex }));
  start.rotation.x = -Math.PI / 2;
  start.rotation.z = Math.atan2(s0.ty, s0.tx);
  start.position.set(simToWorldX(s0.x), 0.05, simToWorldZ(s0.y));
  // La texture est allongée dans le sens de la largeur de piste.
  tex.rotation = Math.PI / 2;
  tex.center.set(0.5, 0.5);
  group.add(start);

  // Arche de départ simple.
  const archMat = new THREE.MeshLambertMaterial({ color: COLORS.curbRed });
  const arch = new THREE.Group();
  const pillarGeo = new THREE.BoxGeometry(0.8, 10, 0.8);
  for (const side of [-1, 1]) {
    const p = new THREE.Mesh(pillarGeo, archMat);
    p.position.set(simToWorldX(s0.x + s0.nx * (hw + 1.5) * side), 5, simToWorldZ(s0.y + s0.ny * (hw + 1.5) * side));
    arch.add(p);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.9, hw * 2 + 4), archMat);
  beam.position.set(simToWorldX(s0.x), 10, simToWorldZ(s0.y));
  beam.rotation.y = Math.atan2(s0.ty, s0.tx);
  arch.add(beam);
  group.add(arch);

  // Poteaux de clôture le long de la barrière.
  const postGeo = new THREE.CylinderGeometry(0.15, 0.18, 1.2, 6);
  const postMat = new THREE.MeshLambertMaterial({ color: COLORS.post });
  const postStep = 6;
  const postCount = Math.floor(S.length / postStep) * 2;
  const posts = new THREE.InstancedMesh(postGeo, postMat, postCount);
  const m4 = new THREE.Matrix4();
  let pi = 0;
  for (let i = 0; i < S.length - postStep + 1 && pi < postCount; i += postStep) {
    for (const side of [-1, 1]) {
      const s = S[i];
      const limit = limitAt(i);
      m4.makeTranslation(simToWorldX(s.x + s.nx * limit * side), 0.6, simToWorldZ(s.y + s.ny * limit * side));
      posts.setMatrixAt(pi++, m4);
    }
  }
  posts.count = pi;
  group.add(posts);

  // Arbres : cônes instanciés hors de la piste, graine fixe.
  const rng = createRng(1234);
  const xs = S.map((s) => s.x);
  const ys = S.map((s) => s.y);
  const minX = Math.min(...xs) - 120;
  const maxX = Math.max(...xs) + 120;
  const minY = Math.min(...ys) - 120;
  const maxY = Math.max(...ys) + 120;
  const treeTarget = 700;
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.45, 2, 6);
  const crownGeo = new THREE.ConeGeometry(2.6, 7, 7);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: COLORS.trunk }), treeTarget);
  const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), treeTarget);
  const q = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  const p = new THREE.Vector3();
  const cA = vc(COLORS.pine);
  const cB = vc(COLORS.pineDark);
  let placed = 0;
  for (let tries = 0; tries < treeTarget * 8 && placed < treeTarget; tries++) {
    const x = rng.range(minX, maxX);
    const y = rng.range(minY, maxY);
    const pr = projectOnTrack(track, x, y);
    if (Math.abs(pr.d) < limitAt(pr.index) + 3) continue;
    const sc = rng.range(0.7, 1.4);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.range(0, Math.PI * 2));
    scl.set(sc, sc, sc);
    p.set(simToWorldX(x), 1 * sc, simToWorldZ(y));
    m4.compose(p, q, scl);
    trunks.setMatrixAt(placed, m4);
    p.y = (2 + 3.5) * sc;
    m4.compose(p, q, scl);
    crowns.setMatrixAt(placed, m4);
    crowns.setColorAt(placed, cA.clone().lerp(cB, rng.next()));
    placed++;
  }
  trunks.count = placed;
  crowns.count = placed;
  group.add(trunks, crowns);

  // Ligne centrale de débogage (masquée par défaut).
  const linePts = S.map((s) => new THREE.Vector3(simToWorldX(s.x), 0.12, simToWorldZ(s.y)));
  linePts.push(linePts[0].clone());
  const debugLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(linePts),
    new THREE.LineBasicMaterial({ color: 0x00e5ff }),
  );
  debugLine.visible = false;
  group.add(debugLine);

  // Ligne idéale : ruban étroit au sol, couleurs mises à jour à chaque image.
  const lineOff = (i: number) => line.offset[i];
  const idealGeo = ribbon(track, off(lineOff, 1, -0.35), off(lineOff, 1, 0.35), 0.06, () => white);
  const idealMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false });
  const idealMesh = new THREE.Mesh(idealGeo, idealMat);
  idealMesh.renderOrder = 1;
  group.add(idealMesh);

  // Points de corde : disque vert au sol et petit fanion côté intérieur.
  const discGeo = new THREE.CircleGeometry(1.6, 18);
  discGeo.rotateX(-Math.PI / 2);
  const disc = new THREE.InstancedMesh(
    discGeo,
    new THREE.MeshBasicMaterial({ color: COLORS.corde, transparent: true, opacity: 0.75, depthWrite: false }),
    Math.max(1, line.apexes.length),
  );
  const flagGeo = new THREE.ConeGeometry(0.35, 1.6, 6);
  flagGeo.translate(0, 0.8, 0);
  const flags = new THREE.InstancedMesh(flagGeo, new THREE.MeshLambertMaterial({ color: COLORS.corde }), Math.max(1, line.apexes.length));
  line.apexes.forEach((ap, i) => {
    const s = S[ap.index];
    m4.makeTranslation(simToWorldX(s.x + s.nx * ap.offset), 0.07, simToWorldZ(s.y + s.ny * ap.offset));
    disc.setMatrixAt(i, m4);
    const edge = ap.side * (s.hw + 0.6);
    m4.makeTranslation(simToWorldX(s.x + s.nx * edge), 0, simToWorldZ(s.y + s.ny * edge));
    flags.setMatrixAt(i, m4);
  });
  disc.count = line.apexes.length;
  flags.count = line.apexes.length;
  disc.renderOrder = 1;
  group.add(disc, flags);

  return { group, debugLine, ideal: { mesh: idealMesh, colors: idealGeo.getAttribute('color') as THREE.BufferAttribute } };
}
