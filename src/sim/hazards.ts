/**
 * Mode spécial : ours noirs (pièges) et castors (aides). Absent du mode classique.
 * Tout est tiré avec la graine de la course : même comportement pour tous les joueurs (multijoueur).
 */
import { BIEF_SWIM_SPEED, findBief, type Bief } from './bief';
import type { Race, Racer } from './race';
import type { Rng } from './rng';

export type BearKind = 'traverse' | 'garde' | 'charge';
export type ItemId = 'coup' | 'barrage' | 'hutte' | 'bief';

export interface Bear {
  kind: BearKind;
  /** Indice d'échantillon de la piste où l'ours agit. */
  index: number;
  /** Écart latéral menacé (sur la ligne idéale). */
  lineOffset: number;
  period: number;
  phase: number;
  /** Côté de départ (+1 gauche, −1 droite). */
  side: number;
  speed: number;
  /** Position et état calculés à chaque pas. */
  x: number;
  y: number;
  d: number;
  active: boolean;
  warning: boolean;
  /** Pas du dernier contact par participant (évite les coups répétés). */
  lastHit: Map<number, number>;
}

export interface Beaver {
  index: number;
  offset: number;
  x: number;
  y: number;
  /** Temps avant réapparition (0 = présent). */
  respawn: number;
}

export interface Barrage {
  x: number;
  y: number;
  heading: number;
  owner: number;
  time: number;
}

export interface Hazards {
  bears: Bear[];
  beavers: Beaver[];
  barrages: Barrage[];
  /** Raccourci d'eau du circuit, s'il en a un. */
  bief: Bief | null;
}

function place(r: Race, index: number, d: number): { x: number; y: number } {
  const s = r.track.samples[index];
  return { x: s.x + s.nx * d, y: s.y + s.ny * d };
}

export function createHazards(r: Race, rng: Rng): Hazards {
  const cfg = r.balance.special;
  const n = r.track.samples.length;
  const spacing = r.track.spacing;
  const count = Math.round(rng.range(cfg.bears[r.difficulty].count[0], cfg.bears[r.difficulty].count[1] + 0.999) - 0.5);
  const speedMul = cfg.bears[r.difficulty].speedMul;
  // Les ours menacent la ligne idéale juste après les points de corde (là où on accélère).
  const candidates = r.line.apexes.map((a) => (a.index + Math.round(25 / spacing)) % n);
  const startClear = Math.round(150 / spacing);
  const chosen: number[] = [];
  const pool = candidates.filter((i) => i > startClear && i < n - Math.round(30 / spacing));
  while (chosen.length < count && pool.length) {
    const i = pool.splice(Math.floor(rng.next() * pool.length), 1)[0];
    if (chosen.every((c) => Math.abs(c - i) * spacing >= cfg.bear.minSpacing)) chosen.push(i);
  }
  const kinds: BearKind[] = ['traverse', 'garde', 'charge'];
  const bears: Bear[] = chosen.map((index, k) => {
    const kind = kinds[k % 3];
    const p = place(r, index, r.line.offset[index]);
    return {
      kind,
      index,
      lineOffset: r.line.offset[index],
      period: rng.range(cfg.bear.periodMin, cfg.bear.periodMax),
      phase: rng.range(0, cfg.bear.periodMax),
      side: rng.next() < 0.5 ? -1 : 1,
      speed: (kind === 'charge' ? cfg.bear.chargeSpeed : cfg.bear.crossSpeed) * speedMul,
      x: p.x,
      y: p.y,
      d: 0,
      active: false,
      warning: false,
      lastHit: new Map(),
    };
  });
  // Castors : souvent hors de la ligne idéale, à mi-chemin entre deux virages.
  const beavers: Beaver[] = [];
  for (let k = 0; k < cfg.beaver.perTrack; k++) {
    const index = (Math.round(((k + 0.5) / cfg.beaver.perTrack) * n) + Math.round(rng.range(-20, 20))) % n;
    const s = r.track.samples[index];
    const lo = r.line.offset[index];
    let offset = lo + (lo > 0 ? -1 : 1) * cfg.beaver.lineOffset;
    offset = Math.max(-s.hw + 1.5, Math.min(s.hw - 1.5, offset));
    const p = place(r, index, offset);
    beavers.push({ index, offset, x: p.x, y: p.y, respawn: 0 });
  }
  return { bears, beavers, barrages: [], bief: findBief(r.track) };
}

/** Choix de l'aide selon le rang : les dernières places reçoivent plus d'aides offensives. */
export function pickItem(rank: number, participants: number, r01: number, hasBief = false): ItemId {
  const f = participants > 1 ? (rank - 1) / (participants - 1) : 0.5;
  // Poids : les dernières places reçoivent plus de coups de queue et de biefs, les premières plus de barrages.
  const w = { coup: 0.25 + 0.35 * f, barrage: 0.45 - 0.35 * f, hutte: 0.3, bief: hasBief ? 0.08 + 0.2 * f : 0 };
  const total = w.coup + w.barrage + w.hutte + w.bief;
  let acc = 0;
  for (const k of ['coup', 'barrage', 'hutte', 'bief'] as ItemId[]) {
    acc += w[k] / total;
    if (r01 < acc) return k;
  }
  return 'hutte';
}

/** Écart (en échantillons) entre l'indice du participant et un indice de piste, vers l'avant. */
function ahead(r: Race, from: number, to: number): number {
  const n = r.track.samples.length;
  let d = to - from;
  if (d < 0) d += n;
  return d;
}

/** Bief : entrée dans le canal si l'aide est active et qu'on passe à son embouchure. */
function updateBief(r: Race, h: Hazards, racer: Racer): void {
  const b = h.bief;
  if (!b) return;
  if (racer.biefOpen > 0) racer.biefOpen = Math.max(0, racer.biefOpen - r.dt);
  if (racer.swim >= 0 || racer.biefOpen <= 0) return;
  const d = ahead(r, racer.proj.index, b.from);
  if (d <= Math.round(4 / r.track.spacing) || d >= r.track.samples.length - Math.round(3 / r.track.spacing)) {
    racer.swim = 0;
    racer.biefOpen = 0;
    racer.moose.x = b.ax;
    racer.moose.y = b.ay;
    racer.moose.heading = Math.atan2(b.by - b.ay, b.bx - b.ax);
    racer.moose.speed = BIEF_SWIM_SPEED;
  }
}

/** Met à jour les ours (positions, signal, activité) au temps t de la course. */
function updateBears(r: Race, h: Hazards, t: number): void {
  const cfg = r.balance.special.bear;
  for (const b of h.bears) {
    const s = r.track.samples[b.index];
    const width = s.hw + 3;
    if (b.kind === 'garde') {
      // L'ours garde sa zone : il patrouille en permanence autour de la ligne idéale.
      b.d = b.lineOffset + Math.sin((t + b.phase) * (b.speed / cfg.guardSway)) * cfg.guardSway;
      b.active = t > 0;
      b.warning = false;
    } else {
      // Traversée ou charge : cycle (signal, passage, repos).
      const cross = (2 * width) / b.speed;
      const local = (t + b.phase) % b.period;
      const startAt = b.period - cross;
      b.warning = local >= startAt - cfg.warnSeconds && local < startAt;
      b.active = local >= startAt;
      const u = b.active ? (local - startAt) / cross : 0;
      b.d = b.side * (width - 2 * width * u);
      if (!b.active) b.d = b.side * width;
    }
    const p = place(r, b.index, b.d);
    b.x = p.x;
    b.y = p.y;
  }
}

function hitRacer(r: Race, racer: Racer, keep: number, stunScale: number): void {
  const m = racer.moose;
  if (m.shieldTime > 0) {
    m.shieldTime = 0;
    return;
  }
  m.speed *= keep;
  m.stunTime = Math.max(m.stunTime, racer.params.stunSeconds * stunScale);
  racer.lastContactTick = r.tick;
}

/** Pas du mode spécial : ours, castors, barrages et effets des aides. */
export function stepHazards(r: Race, h: Hazards): void {
  const cfg = r.balance.special;
  const t = Math.max(0, r.tick - r.countdownTicks) * r.dt;
  updateBears(r, h, t);
  for (const racer of r.racers) {
    const m = racer.moose;
    if (m.shieldTime > 0) m.shieldTime = Math.max(0, m.shieldTime - r.dt);
    if (m.tailTime > 0) m.tailTime = Math.max(0, m.tailTime - r.dt);
    updateBief(r, h, racer);
    if (racer.swim >= 0) continue;
    // Ours : contact = étourdissement selon la Robustesse, aucune élimination.
    for (const b of h.bears) {
      if (!b.active) continue;
      const dist = Math.hypot(m.x - b.x, m.y - b.y);
      if (dist > cfg.bear.radius + 0.9) continue;
      const last = b.lastHit.get(racer.id) ?? -1e9;
      if (r.tick - last < Math.round(3 / r.dt)) continue;
      b.lastHit.set(racer.id, r.tick);
      hitRacer(r, racer, cfg.bear.hitSpeedKeep, 1);
    }
    // Castors : en toucher un donne une aide si l'emplacement est libre.
    for (const bv of h.beavers) {
      if (bv.respawn > 0 || racer.item) continue;
      if (Math.hypot(m.x - bv.x, m.y - bv.y) > cfg.beaver.radius + 0.9) continue;
      bv.respawn = cfg.beaver.respawnSeconds;
      const rank = r.racers.filter((o) => o.distance > racer.distance).length + 1;
      racer.item = pickItem(rank, r.racers.length, r.rng.next(), !!h.bief);
      racer.lastItemTick = r.tick;
    }
    // Barrages posés par les autres : ralentissent, puis disparaissent.
    for (let i = h.barrages.length - 1; i >= 0; i--) {
      const br = h.barrages[i];
      if (br.owner === racer.id && br.time < 1.5) continue;
      const dx = m.x - br.x;
      const dy = m.y - br.y;
      const lon = dx * Math.cos(br.heading) + dy * Math.sin(br.heading);
      const lat = -dx * Math.sin(br.heading) + dy * Math.cos(br.heading);
      if (Math.abs(lon) < 1.2 && Math.abs(lat) < cfg.items.barrageHalfWidth + 0.7) {
        hitRacer(r, racer, cfg.items.barrageSpeedKeep, 0.25);
        h.barrages.splice(i, 1);
      }
    }
  }
  for (const bv of h.beavers) if (bv.respawn > 0) bv.respawn = Math.max(0, bv.respawn - r.dt);
  for (let i = h.barrages.length - 1; i >= 0; i--) {
    h.barrages[i].time += r.dt;
    if (h.barrages[i].time > cfg.items.barrageSeconds) h.barrages.splice(i, 1);
  }
}

/** Déclenche l'aide détenue par un participant. */
export function useItem(r: Race, h: Hazards, racer: Racer): void {
  const item = racer.item;
  if (!item) return;
  const cfg = r.balance.special.items;
  const m = racer.moose;
  racer.item = null;
  racer.lastItemUseTick = r.tick;
  if (item === 'coup') m.tailTime = cfg.coupSeconds;
  else if (item === 'hutte') m.shieldTime = cfg.hutteSeconds;
  else if (item === 'bief') racer.biefOpen = cfg.biefOpenSeconds;
  else {
    h.barrages.push({
      x: m.x - Math.cos(m.heading) * 3,
      y: m.y - Math.sin(m.heading) * 3,
      heading: m.heading,
      owner: racer.id,
      time: 0,
    });
  }
}

/** Les bots décident d'utiliser leur aide. */
export function botWantsItem(r: Race, h: Hazards, racer: Racer): boolean {
  const item = racer.item;
  if (!item) return false;
  const n = r.track.samples.length;
  if (item === 'coup') {
    // En sortie de virage : profil qui remonte devant.
    const ahead = racer.profile[(racer.proj.index + Math.round(40 / r.track.spacing)) % n];
    return racer.moose.speed < ahead - 2;
  }
  if (item === 'bief') {
    // Bief : on l'ouvre quand l'embouchure approche (moins de 150 m devant).
    if (!h.bief) return true;
    return ahead(r, racer.proj.index, h.bief.from) * r.track.spacing < 150;
  }
  if (item === 'barrage') return r.racers.some((o) => o !== racer && racer.distance - o.distance > 3 && racer.distance - o.distance < 18);
  // Hutte : un ours actif ou annoncé droit devant.
  return h.bears.some((b) => {
    let di = b.index - racer.proj.index;
    if (di < 0) di += n;
    return (b.active || b.warning) && di * r.track.spacing < 60;
  });
}

/** Décalage latéral qu'un bot prend pour éviter un ours devant lui (0 si rien). */
export function bearAvoidance(r: Race, h: Hazards, racer: Racer): number {
  const n = r.track.samples.length;
  let shift = 0;
  for (const b of h.bears) {
    if (!b.active && !b.warning) continue;
    let di = b.index - racer.proj.index;
    if (di < 0) di += n;
    const dist = di * r.track.spacing;
    if (dist > 70 || dist < -5) continue;
    const lat = racer.proj.d - b.d;
    if (Math.abs(lat) > 4) continue;
    shift += (lat >= 0 ? 1 : -1) * (4 - Math.abs(lat));
  }
  return shift;
}
