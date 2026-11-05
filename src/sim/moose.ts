/**
 * Physique arcade d'un orignal, en 2D sur le plan de piste.
 *
 * Principe : le joueur commande une courbure (direction analogique). La force latérale
 * disponible est plafonnée (a_lat × adhérence). Si la courbure demandée l'exige plus,
 * l'orignal élargit (courbure plafonnée) et frotte (perte de vitesse). L'accélération
 * longitudinale partage le même budget d'adhérence (cercle de friction).
 * Conséquence émergente : en virage stabilisé, v → sqrt(a_lat × R), donc un rayon plus
 * large (bonne trajectoire) passe plus vite, sans bonus scripté.
 */

export interface MooseParams {
  topSpeed: number;
  accel: number;
  aLat: number;
  maxSteerCurvature: number;
  /** Braquage maximal exprimé en multiple de l'adhérence disponible à la vitesse courante. */
  steerGripMargin: number;
  steerRate: number;
  scrubFactor: number;
  scrubMaxExcess: number;
  slideFlatDecel: number;
  overTopDecelRate: number;
  startSpeed: number;
}

export interface SurfaceParams {
  grip: number;
  vmax: number;
}

/** Commandes abstraites, produites par input/ (joueur) ou par un pilote automatique. */
export interface Commands {
  /** Direction, -1 (droite) à +1 (gauche). */
  steer: number;
  gallop: boolean;
  slide: boolean;
  castor: boolean;
}

export const NO_COMMANDS: Commands = { steer: 0, gallop: false, slide: false, castor: false };

export interface MooseState {
  x: number;
  y: number;
  /** Cap (rad), 0 = +x. */
  heading: number;
  /** Vitesse le long du cap (m/s). */
  speed: number;
  /** Direction effective après lissage, -1..1. */
  steer: number;
  /** Courbure réellement suivie (1/m). */
  curvature: number;
  /** Courbure demandée par la direction (1/m). */
  commandedCurvature: number;
  /** Accélération latérale réelle (m/s²). */
  lateralAccel: number;
  /** Vrai si l'adhérence est dépassée (survitesse en virage). */
  sliding: boolean;
  /** Intensité de glissement 0..1, pour le rendu (poussière, dérapage). */
  slip: number;
}

export function createMooseState(x: number, y: number, heading: number, speed = 0): MooseState {
  return {
    x,
    y,
    heading,
    speed,
    steer: 0,
    curvature: 0,
    commandedCurvature: 0,
    lateralAccel: 0,
    sliding: false,
    slip: 0,
  };
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/**
 * Courbure obtenue direction à fond, selon la vitesse (direction « sensible à la vitesse »,
 * comme dans les jeux de course arcade). À fond, on demande `steerGripMargin` fois l'adhérence :
 * un petit geste reste précis à haute vitesse, et braquer à fond fait encore déraper.
 */
export function steerCurvatureRange(speed: number, surface: SurfaceParams, p: MooseParams): number {
  const v2 = Math.max(speed * speed, 1);
  return Math.min(p.maxSteerCurvature, (p.steerGripMargin * p.aLat * surface.grip) / v2);
}

/** Avance l'état d'un pas `dt`. Mutation en place pour éviter les allocations à 60 Hz. */
export function stepMoose(
  s: MooseState,
  cmd: Commands,
  surface: SurfaceParams,
  p: MooseParams,
  dt: number,
): void {
  // Direction lissée : pas de changement instantané de braquage.
  const target = clamp(cmd.steer, -1, 1);
  const maxDelta = p.steerRate * dt;
  s.steer += clamp(target - s.steer, -maxDelta, maxDelta);

  const aMax = p.aLat * surface.grip;
  const vTop = p.topSpeed * surface.vmax;
  const v = s.speed;

  const kCmd = s.steer * steerCurvatureRange(v, surface, p);
  s.commandedCurvature = kCmd;
  const aDemand = v * v * Math.abs(kCmd);

  let k = kCmd;
  let aUsed = aDemand;
  let excess = 0;
  if (aDemand > aMax && v > 0.1) {
    // Survitesse : la courbure suivie est plafonnée, l'orignal élargit.
    k = Math.sign(kCmd) * (aMax / (v * v));
    aUsed = aMax;
    excess = aDemand - aMax;
    s.sliding = true;
  } else {
    s.sliding = false;
  }
  s.curvature = k;
  s.lateralAccel = v * v * k;
  const slipTarget = s.sliding ? clamp(excess / aMax, 0, 1) : 0;
  s.slip += (slipTarget - s.slip) * clamp(8 * dt, 0, 1);

  // Longitudinal : course automatique vers la vitesse de pointe, dans la limite du cercle de friction.
  let a: number;
  if (v <= vTop) {
    const drive = p.accel * (1 - (v / vTop) * (v / vTop));
    const budget = Math.sqrt(Math.max(0, aMax * aMax - aUsed * aUsed));
    a = Math.min(drive, budget);
  } else {
    // Au-dessus de la vitesse permise par la surface : ralentissement progressif, jamais net.
    a = -p.overTopDecelRate * (v - vTop);
  }
  if (s.sliding) {
    a -= p.scrubFactor * Math.min(excess, p.scrubMaxExcess) + p.slideFlatDecel;
  }

  let nv = v + a * dt;
  if (nv < 0) nv = 0;

  // Intégration (vitesse moyenne du pas pour plus de précision).
  const vm = 0.5 * (v + nv);
  s.heading += vm * k * dt;
  if (s.heading > Math.PI) s.heading -= 2 * Math.PI;
  else if (s.heading < -Math.PI) s.heading += 2 * Math.PI;
  s.x += vm * Math.cos(s.heading) * dt;
  s.y += vm * Math.sin(s.heading) * dt;
  s.speed = nv;
}
