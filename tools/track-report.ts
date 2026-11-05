/**
 * Outil de développement : rapport de piste (longueur, virages, rayons, auto-intersection)
 * et rendu SVG. Usage : npm run track:report -- src/data/tracks/boucle-grise.json [sortie.svg]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { buildTrack, type TrackDef } from '../src/sim/track';

const file = process.argv[2] ?? 'src/data/tracks/boucle-grise.json';
const out = process.argv[3];
const def = JSON.parse(readFileSync(file, 'utf8')) as TrackDef;
const track = buildTrack(def, 1);
const S = track.samples;
console.log(`${def.name} : ${track.length.toFixed(0)} m, ${S.length} échantillons`);

// Virages : zones où |k| > 1/150, avec rayon minimal.
const thr = 1 / 150;
let inCorner = false;
let start = 0;
let minR = Infinity;
let sign = 0;
const corners: string[] = [];
const n = S.length;
let i0 = 0;
while (i0 < n && Math.abs(S[i0].k) > thr) i0++;
for (let j = 0; j <= n; j++) {
  const s = S[(i0 + j) % n];
  const c = Math.abs(s.k) > thr;
  if (c && !inCorner) { inCorner = true; start = s.s; minR = Infinity; sign = Math.sign(s.k); }
  if (c) minR = Math.min(minR, 1 / Math.abs(s.k));
  if (!c && inCorner) {
    inCorner = false;
    const vmax = Math.sqrt(18 * minR);
    corners.push(`  ${sign > 0 ? 'gauche' : 'droite'} à ${start.toFixed(0)} m, R min ${minR.toFixed(1)} m (v_max centre ${vmax.toFixed(1)} m/s)`);
  }
}
console.log(`${corners.length} virages :`);
corners.forEach((c) => console.log(c));

// Auto-intersection : deux points éloignés le long de la piste trop proches dans le plan.
const clear = 2 * track.maxHalfWidth + 2 * def.verge;
const ws = S.map((x) => x.hw * 2);
console.log(`Largeur du sentier : ${Math.min(...ws).toFixed(1)} à ${Math.max(...ws).toFixed(1)} m`);
let worst = Infinity;
for (let a = 0; a < n; a += 2) {
  for (let b = a + 2; b < n; b += 2) {
    const ds = Math.min(b - a, n - (b - a)) * track.spacing;
    if (ds < clear * 3) continue;
    const d = Math.hypot(S[a].x - S[b].x, S[a].y - S[b].y);
    if (d < worst) worst = d;
  }
}
console.log(`Distance minimale entre portions non voisines : ${worst.toFixed(1)} m (besoin > ${clear} m) ${worst > clear ? 'OK' : 'TROP PROCHE'}`);

if (out) {
  const xs = S.map((s) => s.x);
  const ys = S.map((s) => -s.y);
  const pad = 40;
  const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad;
  const minY = Math.min(...ys) - pad, maxY = Math.max(...ys) + pad;
  const path = S.map((s, i) => `${i ? 'L' : 'M'}${s.x.toFixed(1)},${(-s.y).toFixed(1)}`).join(' ') + 'Z';
  const edge = (sg: number) => S.map((s, i) => `${i ? 'L' : 'M'}${(s.x + s.nx * s.hw * sg).toFixed(1)},${(-(s.y + s.ny * s.hw * sg)).toFixed(1)}`).join(' ') + 'Z';
  const trail = edge(1) + ' ' + edge(-1);
  const pts = def.points.map((p) => `<circle cx="${p[0]}" cy="${-p[1]}" r="3" fill="red"/>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${maxX - minX} ${maxY - minY}" width="900">
<rect x="${minX}" y="${minY}" width="${maxX - minX}" height="${maxY - minY}" fill="#7cb342"/>
<path d="${path}" fill="none" stroke="#a5d6a7" stroke-width="${2 * track.maxHalfWidth + 2 * def.verge}" stroke-linejoin="round"/>
<path d="${trail}" fill="#8d6e63" fill-rule="evenodd"/>
<path d="${path}" fill="none" stroke="#fff" stroke-width="0.6"/>
${pts}<circle cx="${S[0].x}" cy="${-S[0].y}" r="5" fill="#000"/></svg>`;
  writeFileSync(out, svg);
  console.log(`SVG : ${out}`);
}
