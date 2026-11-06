/**
 * Générateur de circuits : chaque circuit est décrit par une suite de segments.
 *   S200        ligne droite de 200 m
 *   R90@40      virage à droite de 90° et 40 m de rayon (L pour la gauche)
 *   W16         largeur de base du sentier à partir d'ici (m)
 * La somme des virages doit faire ±360°. Le petit écart de position restant est réparti
 * le long du tracé pour fermer la boucle. Les lignes droites longues sont élargies
 * (zones de dépassement), les virages très serrés légèrement rétrécis.
 *
 * Usage : npm run tracks:gen   (écrit src/data/tracks/*.json, courses.json, une planche SVG)
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import balanceJson from '../src/data/balance.json';
import type { Balance } from '../src/data';
import { autopilot } from '../src/sim/autopilot';
import { createRace, raceTime, stepRace } from '../src/sim/race';
import { buildTrack, type SurfaceId, type TrackDef } from '../src/sim/track';

const balance = balanceJson as unknown as Balance;

interface Spec {
  id: string;
  name: string;
  biome: 'plaine' | 'foret' | 'rocheuses' | 'test';
  province: string;
  stars: 1 | 2 | 3 | 4 | 5;
  verge: number;
  route: string;
  /** Surface de base du sentier (sentier par défaut). */
  surface?: SurfaceId;
  zones?: { from: number; to: number; surface: SurfaceId }[];
  wind?: { strength: number; period: number; direction: number };
  elevation?: [number, number][];
}

const SPECS: Spec[] = [
  { id: 'prairie-tranquille', name: 'Prairie tranquille', biome: 'plaine', province: 'SK', stars: 1, verge: 12,
    route: 'W22 S220 R90@45 S80 ESL40@60 S60 R90@40 S120 CHL25@50 S100 R60@45 S60 R30@50 S150 R90@40 S60 ESR30@60 S80' },
  { id: 'champs-canola', name: 'Champs de canola', biome: 'plaine', province: 'MB', stars: 1, verge: 12,
    route: 'W22 S250 R45@50 S60 R45@50 S100 L60@45 R60@45 S80 R90@40 S200 R120@45 S60 L30@50 S80 R90@40' },
  { id: 'riviere-rouge', name: 'Rivière Rouge', biome: 'plaine', province: 'MB', stars: 1, verge: 12,
    route: 'W21 S180 R90@40 S100 L90@40 S80 R90@40 S240 CHR30@45 S120 R90@40 S90 L45@45 R45@45 S60 R90@40 S80 R90@40' },
  { id: 'sentier-bleuets', name: 'Sentier des bleuets', biome: 'foret', province: 'QC', stars: 2, verge: 11,
    route: 'W19 S160 R70@35 S60 ESL45@30 S80 R110@30 S120 CHL35@28 S100 R90@30 S60 L60@35 R60@35 S100 R90@32' },
  { id: 'ble-saskatchewan', name: 'Blé de Saskatchewan', biome: 'plaine', province: 'SK', stars: 2, verge: 11,
    wind: { strength: 1.2, period: 12, direction: 1.2 },
    route: 'W19 S400 CHL30@35 S200 R90@35 S120 R90@35 S150 L90@30 R90@30 S200 R90@35 S60 ESR40@35 S100 R90@35 S80' },
  { id: 'lacs-banff', name: 'Lacs de Banff', biome: 'rocheuses', province: 'AB', stars: 2, verge: 10,
    elevation: [[0, 0], [0.22, 14], [0.45, 30], [0.62, 26], [0.8, 8]],
    zones: [{ from: 0.62, to: 0.68, surface: 'boue' }],
    route: 'W18 S200 R120@40 S100 L60@45 R90@35 S150 R150@40 S80 L60@40 R60@40 S120 R60@35 S60 CHR30@30 S80' },
  { id: 'crepuscule-manitoba', name: 'Crépuscule du Manitoba', biome: 'plaine', province: 'MB', stars: 3, verge: 10,
    wind: { strength: 2.6, period: 9, direction: 0.4 },
    route: 'W17 S150 CHL30@35 S150 R90@30 S80 CHR35@28 S60 R90@30 S100 L90@25 S40 R180@20 S40 L90@25 S150 R90@30 S100 ESL40@35 S60 R90@30' },
  { id: 'sentiers-algonquin', name: "Sentiers d'Algonquin", biome: 'foret', province: 'ON', stars: 3, verge: 9,
    zones: [
      { from: 0.08, to: 0.13, surface: 'racines' },
      { from: 0.2, to: 0.26, surface: 'boue' },
      { from: 0.42, to: 0.47, surface: 'racines' },
      { from: 0.6, to: 0.65, surface: 'boue' },
      { from: 0.82, to: 0.86, surface: 'racines' },
    ],
    route: 'W15 S150 R90@24 S80 L90@24 S100 R90@24 S120 R60@22 S100 R30@30 S80 R180@20 S100 L90@25 S150 R90@26' },
  { id: 'automne-mauricie', name: 'Automne en Mauricie', biome: 'foret', province: 'QC', stars: 3, verge: 9,
    zones: [{ from: 0.45, to: 0.51, surface: 'boue' }],
    route: 'W15 S200 ESR60@30 R60@30 S120 R120@26 S100 L90@25 R90@25 S150 CHL35@24 S100 R90@26 S180 R90@28' },
  { id: 'promenade-glaciers', name: 'Promenade des Glaciers', biome: 'rocheuses', province: 'AB', stars: 4, verge: 8,
    elevation: [[0, 0], [0.3, 12], [0.55, 22], [0.8, 6]],
    surface: 'neige', zones: [{ from: 0.17, to: 0.23, surface: 'glace' }, { from: 0.56, to: 0.61, surface: 'glace' }],
    route: 'W15 S250 R90@30 S120 R180@17 S120 L180@18 S120 R90@28 S150 CHL35@22 S150 R90@30 S100 ESR45@25 S120 R90@30' },
  { id: 'route-baleines', name: 'Route des baleines', biome: 'foret', province: 'QC', stars: 4, verge: 8,
    zones: [{ from: 0.7, to: 0.75, surface: 'boue' }],
    route: 'W14 S200 R180@19 S140 L90@22 S60 R90@22 S100 CHR40@20 S80 R60@26 L60@26 S160 R90@20 S120 R90@22 S80' },
  { id: 'badlands-drumheller', name: 'Badlands de Drumheller', biome: 'plaine', province: 'AB', stars: 4, verge: 8,
    route: 'W14 S220 R135@19 S100 L90@22 S80 R135@18 S160 CHL40@20 S100 R90@20 S200 R90@24 S60 ESL45@25' },
  { id: 'chicanes-lac-saint-jean', name: 'Chicanes du Lac-Saint-Jean', biome: 'foret', province: 'QC', stars: 4, verge: 8,
    route: 'W14 S150 CHL40@18 S120 R90@20 S100 CHR40@18 S100 R90@20 S150 CHL40@18 S100 R90@20 S60 L90@18 S40 R180@16 S40 L90@18 S120 R90@20' },
  { id: 'vallee-okanagan', name: "Vallée de l'Okanagan", biome: 'rocheuses', province: 'BC', stars: 4, verge: 8,
    route: 'W14 S180 R90@18 S60 L90@18 R90@18 S60 L90@18 S150 R180@16 S180 R90@22 S60 CHL40@20 S60 R90@22' },
  { id: 'col-kicking-horse', name: 'Col du Kicking Horse', biome: 'rocheuses', province: 'BC', stars: 5, verge: 7,
    elevation: [[0, 0], [0.25, 6], [0.5, 20], [0.75, 14]],
    zones: [{ from: 0.3, to: 0.52, surface: 'neige' }],
    route: 'W13 S160 R180@17 S80 L180@17 S80 R180@17 S120 CHL40@18 S80 R90@20 S240 R90@24' },
  { id: 'serpent-temiscamingue', name: 'Serpent du Témiscamingue', biome: 'foret', province: 'QC', stars: 5, verge: 7,
    route: 'W13 S100 L30@25 R60@25 L30@25 S100 R180@17 S100 L180@17 S100 R180@17 S100 L180@17 S100 R180@17 S180 R90@20 S150 R90@20' },
  { id: 'cap-diamant', name: 'Cap Diamant', biome: 'foret', province: 'QC', stars: 5, verge: 7,
    route: 'W12 S120 CHL45@16 S120 R90@17 S120 R90@17 S60 L90@15 S50 R180@14 S50 L90@15 S60 L90@15 S50 R180@14 S50 L90@15 S60 R90@17 S60 CHR40@16 S60 R90@17' },
  { id: 'tempete-yukon', name: 'Tempête du Yukon', biome: 'rocheuses', province: 'YT', stars: 5, verge: 7,
    surface: 'neige', zones: [{ from: 0.4, to: 0.46, surface: 'glace' }],
    route: 'W12 S260 R90@18 S100 L90@16 S50 R180@15 S50 L90@16 S100 R90@18 S120 CHR35@18 S120 R90@18 S80 L45@20 R90@20 L45@20 S80 R90@18' },
  { id: 'grand-nord', name: 'Grand Nord', biome: 'rocheuses', province: 'NU', stars: 5, verge: 7,
    surface: 'neige', zones: [{ from: 0.24, to: 0.29, surface: 'glace' }, { from: 0.7, to: 0.75, surface: 'glace' }],
    route: 'W11 S150 R180@14 L90@15 R90@15 L180@14 R90@15 S100 CHL40@16 S100 R180@14 S80 L90@15 S120 R90@18 S200 R90@20' },
];

/** Place de la boucle grise (circuit dessiné à la main) dans la progression. */
const HANDMADE = { id: 'boucle-grise', name: 'Boucle grise', biome: 'test' as const, province: '', stars: 3 as const, insertAt: 7 };

interface Pt {
  x: number;
  y: number;
  w: number;
}

interface Traced {
  pts: Pt[];
  turn: number;
  end: [number, number];
  straights: { tokIndex: number; dir: [number, number]; len: number }[];
}

/**
 * Raccourcis : CHL40@25 = chicane gauche-droite-gauche (L40 R80 L40), CHR = l'inverse ;
 * ESL60@30 = S gauche puis droite (L60 R60), ESR = l'inverse.
 */
function expand(route: string): string[] {
  const out: string[] = [];
  for (const tok of route.trim().split(/\s+/)) {
    const m = /^(CH|ES)([LR])(\d+)@(\d+)$/.exec(tok);
    if (!m) {
      out.push(tok);
      continue;
    }
    const [, kind, side, a, r] = m;
    const other = side === 'L' ? 'R' : 'L';
    if (kind === 'CH') out.push(`${side}${a}@${r}`, `${other}${Number(a) * 2}@${r}`, `${side}${a}@${r}`);
    else out.push(`${side}${a}@${r}`, `${other}${a}@${r}`);
  }
  return out;
}

function traceRaw(tokens: string[]): Traced {
  const pts: Pt[] = [];
  const straights: Traced['straights'] = [];
  let x = 0;
  let y = 0;
  let h = 0;
  let base = 16;
  let turn = 0;
  const push = (w: number) => pts.push({ x, y, w });
  tokens.forEach((tok, ti) => {
    const kind = tok[0];
    if (kind === 'W') {
      base = Number(tok.slice(1));
    } else if (kind === 'S') {
      const len = Number(tok.slice(1));
      straights.push({ tokIndex: ti, dir: [Math.cos(h), Math.sin(h)], len });
      const n = Math.max(1, Math.round(len / 30));
      // Ligne droite longue : zone de dépassement plus large.
      const w = len >= 150 ? base + 4 : base;
      for (let i = 0; i < n; i++) {
        x += Math.cos(h) * (len / n);
        y += Math.sin(h) * (len / n);
        push(w);
      }
    } else if (kind === 'R' || kind === 'L') {
      const [a, r] = tok.slice(1).split('@').map(Number);
      const sign = kind === 'L' ? 1 : -1;
      const ang = (a * Math.PI) / 180;
      const n = Math.max(3, Math.round((ang * r) / 5));
      const w = r < 20 ? base - 1 : base;
      for (let i = 0; i < n; i++) {
        const dh = (sign * ang) / n;
        const chord = 2 * r * Math.sin(Math.abs(dh) / 2);
        x += Math.cos(h + dh / 2) * chord;
        y += Math.sin(h + dh / 2) * chord;
        h += dh;
        push(w);
      }
      turn += sign * a;
    } else {
      throw new Error(`segment inconnu ${tok}`);
    }
  });
  return { pts, turn, end: [x, y], straights };
}

/**
 * Ferme la boucle exactement en allongeant ou raccourcissant deux lignes droites
 * de directions différentes (la paire qui demande la plus petite retouche).
 */
function trace(spec: Spec): { pts: Pt[]; turn: number; gap: number; raw: [number, number] } {
  const tokens = expand(spec.route);
  const first = traceRaw(tokens);
  const gx = -first.end[0];
  const gy = -first.end[1];
  const S = first.straights;
  if (Math.hypot(gx, gy) < 0.5) {
    const pts = first.pts;
    const last = pts.pop()!;
    pts.unshift({ x: 0, y: 0, w: last.w });
    return { pts, turn: first.turn, gap: 0, raw: [0, 0] };
  }
  // Retouche de norme minimale répartie sur toutes les lignes droites (moindres carrés),
  // en gardant chaque ligne droite d'au moins 30 m.
  const delta = new Array(S.length).fill(0);
  const free = new Set(S.map((_, i) => i));
  let rx = gx;
  let ry = gy;
  for (let iter = 0; iter < 10 && free.size >= 2; iter++) {
    let a11 = 0, a12 = 0, a22 = 0;
    for (const i of free) {
      const [dx, dy] = S[i].dir;
      a11 += dx * dx; a12 += dx * dy; a22 += dy * dy;
    }
    const det = a11 * a22 - a12 * a12;
    if (Math.abs(det) < 1e-6) break;
    const lx = (a22 * rx - a12 * ry) / det;
    const ly = (-a12 * rx + a11 * ry) / det;
    let clipped = false;
    for (const i of [...free]) {
      const d = S[i].dir[0] * lx + S[i].dir[1] * ly;
      if (S[i].len + delta[i] + d < 30) {
        const allowed = 30 - S[i].len - delta[i];
        delta[i] += allowed;
        rx -= S[i].dir[0] * allowed;
        ry -= S[i].dir[1] * allowed;
        free.delete(i);
        clipped = true;
      }
    }
    if (clipped) continue;
    for (const i of free) {
      const d = S[i].dir[0] * lx + S[i].dir[1] * ly;
      delta[i] += d;
    }
    rx = 0;
    ry = 0;
    break;
  }
  if (Math.hypot(rx, ry) > 0.5) throw new Error(`impossible de fermer la boucle : écart brut (${Math.round(-gx)}, ${Math.round(-gy)}), reste ${Math.hypot(rx, ry).toFixed(0)} m`);
  const fixed = [...tokens];
  S.forEach((st, i) => (fixed[st.tokIndex] = `S${st.len + delta[i]}`));
  const cost = delta.reduce((acc, d) => acc + Math.abs(d), 0);
  const res = traceRaw(fixed);
  const pts = res.pts;
  // Le dernier point coïncide avec le départ : on le remplace par le départ.
  const last = pts.pop()!;
  pts.unshift({ x: 0, y: 0, w: last.w });
  return { pts, turn: res.turn, gap: cost, raw: [Math.round(-gx), Math.round(-gy)] };
}

function selfClearance(def: TrackDef): { min: number; need: number } {
  const t = buildTrack(def, 1);
  const S = t.samples;
  const n = S.length;
  let min = Infinity;
  for (let a = 0; a < n; a += 2) {
    for (let b = a + 2; b < n; b += 2) {
      const ds = Math.min(b - a, n - (b - a)) * t.spacing;
      const need = S[a].hw + S[b].hw + 2 * def.verge;
      if (ds < need * 3) continue;
      const d = Math.hypot(S[a].x - S[b].x, S[a].y - S[b].y) - need;
      if (d < min) min = d;
    }
  }
  return { min, need: 0 };
}

function lapTime(def: TrackDef): number {
  const race = createRace(def, balance, { laps: 1 });
  while (race.phase !== 'finished' && race.tick < 60 * 600) {
    stepRace(race, [autopilot(race.track, race.racers[0], balance.moose, balance.surfaces.sentier, { line: race.line })]);
  }
  return race.phase === 'finished' ? raceTime(race) : Infinity;
}

const outDir = 'src/data/tracks';
mkdirSync(outDir, { recursive: true });
const courses: object[] = [];
const svgs: string[] = [];
let failed = false;

const handmade = JSON.parse(readFileSync(`${outDir}/boucle-grise.json`, 'utf8')) as TrackDef;
const all: (Spec | typeof HANDMADE)[] = [...SPECS];
all.splice(HANDMADE.insertAt, 0, HANDMADE);

for (const spec of all) {
  let def: TrackDef;
  let info = '';
  if ('route' in spec) {
    let traced: ReturnType<typeof trace>;
    try {
      traced = trace(spec);
    } catch (e) {
      console.error(`✗ ${spec.id} : ${(e as Error).message}`);
      failed = true;
      continue;
    }
    const { pts, turn, gap, raw } = traced;
    if (Math.abs(Math.abs(turn) - 360) > 0.5) {
      console.error(`✗ ${spec.id} : somme des virages ${turn}° (attendu ±360°)`);
      failed = true;
    }
    def = {
      id: spec.id,
      name: spec.name,
      width: 16,
      verge: spec.verge,
      surface: spec.surface ?? 'sentier',
      vergeSurface: 'herbe',
      startOffset: 20,
      ...(spec.zones ? { zones: spec.zones } : {}),
      ...(spec.wind ? { wind: spec.wind } : {}),
      ...(spec.elevation ? { elevation: spec.elevation } : {}),
      points: pts.map((p) => [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10, p.w] as [number, number, number]),
    };
    info = `retouche ${gap.toFixed(0)} m, écart brut (${raw[0]}, ${raw[1]})`;
    writeFileSync(`${outDir}/${spec.id}.json`, JSON.stringify(def, null, 1).replace(/\[\n\s+(-?[\d.]+),\n\s+(-?[\d.]+),\n\s+(-?[\d.]+)\n\s+\]/g, '[$1, $2, $3]') + '\n');
  } else {
    def = handmade;
  }
  const track = buildTrack(def, 1);
  const clear = selfClearance(def);
  const lap = lapTime(def);
  // Course visée : environ 90 s.
  const laps = Math.max(1, Math.min(4, Math.round(90 / lap)));
  const minR = Math.min(...track.samples.map((s) => (Math.abs(s.k) > 1e-4 ? 1 / Math.abs(s.k) : Infinity)));
  const widths = track.samples.map((s) => s.hw * 2);
  const ok = clear.min > 0 && Number.isFinite(lap);
  if (!ok) failed = true;
  console.log(
    `${ok ? '✓' : '✗'} ${spec.id.padEnd(26)} ${'★'.repeat(spec.stars).padEnd(5)} ${(track.length / 1000).toFixed(2)} km` +
      `  tour ${lap.toFixed(1)} s × ${laps}  R min ${minR.toFixed(0)} m  largeur ${Math.min(...widths).toFixed(0)}–${Math.max(...widths).toFixed(0)} m` +
      `  marge ${clear.min.toFixed(1)} m  ${info}`,
  );
  courses.push({
    id: spec.id,
    trackId: spec.id,
    name: spec.name,
    biome: spec.biome,
    province: spec.province,
    lengthKm: Math.round(track.length / 100) / 10,
    stars: spec.stars,
    laps,
    milestone: 1,
  });

  // Vignette SVG pour la planche de contrôle.
  const S = track.samples;
  const xs = S.map((s) => s.x);
  const ys = S.map((s) => -s.y);
  const pad = 30;
  const vb = [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) - Math.min(...xs) + 2 * pad, Math.max(...ys) - Math.min(...ys) + 2 * pad];
  const edge = (sg: number) => S.map((s, i) => `${i ? 'L' : 'M'}${(s.x + s.nx * s.hw * sg).toFixed(1)},${(-(s.y + s.ny * s.hw * sg)).toFixed(1)}`).join(' ') + 'Z';
  svgs.push(`<div class="c"><svg viewBox="${vb.join(' ')}"><path d="${edge(1)} ${edge(-1)}" fill="#8d6e63" fill-rule="evenodd"/><circle cx="${S[0].x}" cy="${-S[0].y}" r="${Math.max(vb[2], vb[3]) / 50}" fill="#d80621"/></svg><b>${spec.name}</b> ${'★'.repeat(spec.stars)}<br>${(track.length / 1000).toFixed(2)} km · ${laps} tour(s) · ${lap.toFixed(0)} s</div>`);
}

// Index des pistes pour l'application (import statique, compatible Vite et Node).
const ids = all.map((s) => s.id);
const ident = (id: string) => id.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
writeFileSync(
  `${outDir}/index.ts`,
  `// Fichier généré par tools/track-gen.ts : ne pas modifier à la main.\n` +
    ids.map((id) => `import ${ident(id)} from './${id}.json';`).join('\n') +
    `\n\nexport const trackJsons: unknown[] = [${ids.map(ident).join(', ')}];\n`,
);

const coursesPath = 'src/data/courses.json';
const existing = JSON.parse(readFileSync(coursesPath, 'utf8')) as { features: object };
writeFileSync(coursesPath, JSON.stringify({ courses, features: existing.features }, null, 2) + '\n');

const sheet = process.argv[2];
if (sheet) {
  writeFileSync(
    sheet,
    `<!doctype html><meta charset="utf-8"><style>body{font:13px sans-serif;display:grid;grid-template-columns:repeat(5,1fr);gap:10px;background:#7cb342;margin:10px}.c{background:#a5d6a7;padding:6px;border-radius:8px}svg{width:100%;height:150px}</style>${svgs.join('')}`,
  );
  console.log(`Planche : ${sheet}`);
}
if (failed) {
  console.error('Au moins un circuit est invalide.');
  process.exit(1);
}
