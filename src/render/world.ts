/**
 * Décor de la boîte grise : sol, bas-côté, sentier, bordures, vibreurs, ligne de départ,
 * clôture de barrière et arbres instanciés. Visuels provisoires, remplaçables.
 */
import * as THREE from 'three';
import { createRng } from '../sim/rng';
import type { RacingLine } from '../sim/racingLine';
import { terrainHeight, type SurfaceId, type Track } from '../sim/track';
import { decorate, paletteFor, skyDome, trackSigns, type Biome, type Decor } from './biomes';
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
  racines: 0x7a5034,
};

export interface IdealLine {
  mesh: THREE.Mesh;
  colors: THREE.BufferAttribute;
}

export interface World {
  group: THREE.Group;
  debugLine: THREE.Line;
  ideal: IdealLine;
  decor: Decor;
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
      pos[o + 1] = y + s.z;
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

export function buildWorld(scene: THREE.Scene, track: Track, line: RacingLine, biome: Biome = 'test', density = 1, weather = 'clair'): World {
  const snowy = track.def.surface === 'neige';
  const dusk = track.def.id === 'crepuscule-manitoba';
  const pal = paletteFor(biome, snowy, dusk);
  // Météo : ciel gris sous la pluie, brouillard rapproché.
  if (weather === 'pluie') {
    pal.skyTop = 0x6d7a86;
    pal.skyBottom = 0xaab4bd;
    pal.fog = 0xa3adb5;
    pal.sunIntensity *= 0.55;
  } else if (weather === 'brouillard') {
    pal.skyTop = pal.skyBottom = pal.fog = 0xd9dee2;
    pal.sunIntensity *= 0.7;
  }
  scene.background = new THREE.Color(pal.fog);
  scene.fog = new THREE.Fog(pal.fog, weather === 'brouillard' ? 25 : 110, weather === 'brouillard' ? 170 : weather === 'pluie' ? 420 : 620);
  const group = new THREE.Group();
  scene.add(group);
  group.add(skyDome(pal));

  const hemi = new THREE.HemisphereLight(pal.hemiSky, pal.hemiGround, 1.6);
  group.add(hemi);
  const sun = new THREE.DirectionalLight(pal.sun, pal.sunIntensity);
  sun.position.set(-120, 200, 80);
  group.add(sun);

  const vc = (hex: number) => new THREE.Color(hex);
  const flat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });

  // Sol.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(3000, 3000),
    new THREE.MeshLambertMaterial({ color: pal.ground }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  group.add(ground);

  // Relief : terrain qui épouse la hauteur du sentier et redescend au loin.
  if (track.samples.some((p) => p.z !== 0)) {
    const T = track.samples;
    const cx = T.reduce((a, p) => a + p.x, 0) / T.length;
    const cy = T.reduce((a, p) => a + p.y, 0) / T.length;
    const geo = new THREE.PlaneGeometry(1300, 1300, 96, 96);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + cx;
      const y = -(pos.getZ(i)) + cy;
      pos.setY(i, Math.max(0, terrainHeight(track, x, y) - 0.12));
    }
    geo.translate(simToWorldX(cx), 0, simToWorldZ(cy));
    geo.computeVertexNormals();
    group.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: pal.ground })));
  }

  const S = track.samples;
  const verge = track.def.verge;
  const hwAt = (i: number) => S[i].hw;
  const limitAt = (i: number) => S[i].hw + verge;
  const off = (f: (i: number) => number, k: number, c = 0) => (i: number) => k * f(i) + c;

  // Bas-côté (herbe), sentier, bordures blanches. La largeur varie le long de la piste.
  const vergeCol = vc(pal.verge);
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
  start.position.set(simToWorldX(s0.x), 0.05 + s0.z, simToWorldZ(s0.y));
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
    p.position.set(simToWorldX(s0.x + s0.nx * (hw + 1.5) * side), 5 + s0.z, simToWorldZ(s0.y + s0.ny * (hw + 1.5) * side));
    arch.add(p);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.9, hw * 2 + 4), archMat);
  beam.position.set(simToWorldX(s0.x), 10 + s0.z, simToWorldZ(s0.y));
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
      m4.makeTranslation(simToWorldX(s.x + s.nx * limit * side), 0.6 + s.z, simToWorldZ(s.y + s.ny * limit * side));
      posts.setMatrixAt(pi++, m4);
    }
  }
  posts.count = pi;
  group.add(posts);

  // Décor du biome et repères de pilotage, graine fixe par circuit.
  const rng = createRng(1234 + track.def.id.length * 97);
  const decor = decorate(group, track, biome, snowy, rng, density);
  trackSigns(group, track, line, rng);

  // Ligne centrale de débogage (masquée par défaut).
  const linePts = S.map((s) => new THREE.Vector3(simToWorldX(s.x), 0.12 + s.z, simToWorldZ(s.y)));
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
    m4.makeTranslation(simToWorldX(s.x + s.nx * ap.offset), 0.07 + s.z, simToWorldZ(s.y + s.ny * ap.offset));
    disc.setMatrixAt(i, m4);
    const edge = ap.side * (s.hw + 0.6);
    m4.makeTranslation(simToWorldX(s.x + s.nx * edge), s.z, simToWorldZ(s.y + s.ny * edge));
    flags.setMatrixAt(i, m4);
  });
  disc.count = line.apexes.length;
  flags.count = line.apexes.length;
  disc.renderOrder = 1;
  group.add(disc, flags);

  return { group, debugLine, decor, ideal: { mesh: idealMesh, colors: idealGeo.getAttribute('color') as THREE.BufferAttribute } };
}
