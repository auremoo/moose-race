/**
 * Physique arcade d'un orignal, en 2D sur le plan de piste.
 *
 * Principe : le joueur commande une courbure (direction analogique). La force latérale
 * disponible est plafonnée (a_lat × adhérence). Si la courbure demandée l'exige plus,
 * l'orignal élargit (courbure plafonnée) et frotte (perte de vitesse). L'accélération
 * longitudinale partage le même budget d'adhérence (cercle de friction).
 * Conséquence émergente : en virage stabilisé, v → sqrt(a_lat × R), donc un rayon plus
 * large (bonne trajectoire) passe plus vite, sans bonus scripté.
 *
 * Le joueur accélère et freine lui-même. Le freinage partage aussi le cercle de friction :
 * on freine fort en ligne droite, moins fort en plein virage.
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
  /** Adhérence restante une fois en dérapage (fraction, < 1 : glisser fait perdre le contrôle). */
  slideGrip: number;
  scrubMaxExcess: number;
  slideFlatDecel: number;
  overTopDecelRate: number;
  /** Décélération en roue libre, ni accélérateur ni frein (m/s²). */
  coastDecel: number;
  /** Décélération maximale au frein en ligne droite (m/s²). */
  brakeDecel: number;
  startSpeed: number;
  /** Galop : multiplicateurs de vitesse de pointe et d'accélération. */
  gallopSpeedMul: number;
  gallopAccelMul: number;
  /** Durée du galop endurance pleine (s), et temps pour la recharger hors galop (s). */
  enduranceSeconds: number;
  enduranceRecoverSeconds: number;
  /** Une fois l'endurance vidée, part minimale à recharger avant de pouvoir regaloper. */
  gallopRestartMin: number;
  /** Élan (départ parfait, aides) : gain de vitesse et d'accélération. */
  boostSpeedMul: number;
  boostAccel: number;
  /** Corde parfaite : gain de vitesse et durée. */
  cordeSpeedMul: number;
  cordeSeconds: number;
  /** Aspiration : gain de vitesse dans le sillage d'un orignal à moins de draftDistance m. */
  draftSpeedMul: number;
  draftDistance: number;
  /** Durée d'étourdissement après un gros choc (s), selon la Robustesse. */
  stunSeconds: number;
  /** Masse relative pour les contacts (Robustesse). */
  mass: number;
}

export interface SurfaceParams {
  grip: number;
  vmax: number;
  /** Sol glissant (pluie) : part de l'adhérence gardée en survitesse, à la place de slideGrip de l'orignal. */
  slideGrip?: number;
}

/** Commandes abstraites, produites par input/ (joueur) ou par un pilote automatique. */
export interface Commands {
  /** Direction, -1 (droite) à +1 (gauche). */
  steer: number;
  /** Accélérateur 0..1. */
  throttle: number;
  /** Frein 0..1. */
  brake: number;
  gallop: boolean;
  castor: boolean;
}

export const NO_COMMANDS: Commands = { steer: 0, throttle: 0, brake: 0, gallop: false, castor: false };

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
  /** Vrai si l'orignal dérape vraiment (survitesse sur sol glissant, sous la pluie). */
  skidding: boolean;
  /** Intensité de glissement 0..1, pour le rendu (poussière, dérapage). */
  slip: number;
  /** Vrai pendant un freinage. */
  braking: boolean;
  /** Endurance 0..1. */
  endurance: number;
  galloping: boolean;
  /** Vrai après avoir vidé l'endurance, jusqu'à recharge minimale. */
  exhausted: boolean;
  /** Temps d'élan restant (s). */
  boostTime: number;
  /** Temps de bonus de corde restant (s). */
  cordeTime: number;
  /** Vrai dans le sillage d'un autre orignal (renseigné par la course). */
  drafting: boolean;
  /** Temps d'étourdissement restant (s) après un choc. */
  stunTime: number;
  /** Multiplicateur de vitesse de pointe externe (rattrapage léger des bots), 1 par défaut. */
  extraSpeedMul: number;
  /** Hutte de castor : bouclier restant (s). */
  shieldTime: number;
  /** Coup de queue de castor : poussée restante (s), sans consommer d'endurance. */
  tailTime: number;
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
    skidding: false,
    slip: 0,
    braking: false,
    endurance: 1,
    galloping: false,
    exhausted: false,
    boostTime: 0,
    cordeTime: 0,
    drafting: false,
    stunTime: 0,
    extraSpeedMul: 1,
    shieldTime: 0,
    tailTime: 0,
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
  /** Pente le long du cap (dz/ds) : en montée l'orignal ralentit, en descente il prend de l'élan. */
  slope = 0,
): void {
  // Étourdi : l'orignal ne pousse plus et se dirige mal, le temps de reprendre ses esprits.
  if (s.stunTime > 0) {
    s.stunTime = Math.max(0, s.stunTime - dt);
    cmd = { ...cmd, steer: cmd.steer * 0.3, throttle: 0, brake: 0, gallop: false };
  }
  // Direction lissée : pas de changement instantané de braquage.
  const target = clamp(cmd.steer, -1, 1);
  const maxDelta = p.steerRate * dt;
  s.steer += clamp(target - s.steer, -maxDelta, maxDelta);

  const v = s.speed;
  const throttleIn = clamp(cmd.throttle, 0, 1);
  const brakeIn = clamp(cmd.brake, 0, 1);

  // ---- Galop : vide l'endurance, qui se recharge hors galop. ----
  if (s.exhausted && s.endurance >= p.gallopRestartMin) s.exhausted = false;
  s.galloping = cmd.gallop && !s.exhausted && s.endurance > 0;
  if (s.galloping) {
    s.endurance -= dt / p.enduranceSeconds;
    if (s.endurance <= 0) {
      s.endurance = 0;
      s.exhausted = true;
      s.galloping = false;
    }
  } else {
    s.endurance = Math.min(1, s.endurance + dt / p.enduranceRecoverSeconds);
  }
  // Galoper, c'est aussi accélérer.
  const throttle = s.galloping ? 1 : throttleIn;
  const brake = s.galloping ? 0 : brakeIn;

  // ---- Effets temporaires ----
  if (s.boostTime > 0) s.boostTime = Math.max(0, s.boostTime - dt);
  if (s.cordeTime > 0) s.cordeTime = Math.max(0, s.cordeTime - dt);

  let speedMul = 1;
  let accelMul = 1;
  let accelAdd = 0;
  if (s.galloping) {
    speedMul *= p.gallopSpeedMul;
    accelMul *= p.gallopAccelMul;
  }
  if (s.boostTime > 0) {
    speedMul *= p.boostSpeedMul;
    accelAdd += p.boostAccel;
  }
  if (s.cordeTime > 0) speedMul *= p.cordeSpeedMul;
  if (s.tailTime > 0) {
    speedMul *= p.boostSpeedMul;
    accelAdd += p.boostAccel;
  }
  if (s.drafting) speedMul *= p.draftSpeedMul;
  speedMul *= s.extraSpeedMul;

  const aMax = p.aLat * surface.grip;
  const vTop = p.topSpeed * surface.vmax * speedMul;

  const range = steerCurvatureRange(v, surface, p);
  const kCmd = s.steer * range;
  s.commandedCurvature = kCmd;
  const aDemand = v * v * Math.abs(kCmd);

  let k = kCmd;
  let aUsed = aDemand;
  let excess = 0;
  if (aDemand > aMax && v > 0.1) {
    // Survitesse : l'adhérence chute, la courbure suivie est plafonnée, l'orignal élargit. Sur sol
    // mouillé (surface avec son propre slideGrip), elle chute davantage et l'orignal glisse vraiment.
    const aSlide = aMax * (surface.slideGrip ?? p.slideGrip);
    k = Math.sign(kCmd) * (aSlide / (v * v));
    aUsed = aMax;
    excess = aDemand - aSlide;
    s.sliding = true;
  } else {
    s.sliding = false;
  }
  s.curvature = k;
  s.lateralAccel = v * v * k;
  // Dérapage visible (arrière qui chasse, poussière, message) seulement sur sol glissant : par temps
  // sec, la survitesse fait élargir et ralentir, sans glissade.
  s.skidding = s.sliding && surface.slideGrip !== undefined;
  const slipTarget = s.skidding ? clamp(excess / aMax, 0, 1) : 0;
  s.slip += (slipTarget - s.slip) * clamp(8 * dt, 0, 1);

  // ---- Longitudinal : accélérateur, roue libre et frein, dans la limite du cercle de friction. ----
  const budget = Math.sqrt(Math.max(0, aMax * aMax - aUsed * aUsed));
  let a: number;
  if (v > vTop) {
    // Au-dessus de la vitesse permise : ralentissement progressif, jamais net.
    a = -p.overTopDecelRate * (v - vTop) - p.coastDecel;
  } else if (throttle > 0 && brake === 0) {
    const drive = throttle * p.accel * accelMul * (1 - (v / vTop) * (v / vTop)) + accelAdd;
    a = Math.min(drive, budget + accelAdd) - p.coastDecel * (1 - throttle);
  } else {
    a = -p.coastDecel * (1 - throttle) + accelAdd;
  }
  if (brake > 0 && v > 0) a -= Math.min(brake * p.brakeDecel, Math.max(budget, 0.25 * p.brakeDecel));
  s.braking = brake > 0 && v > 0.5;
  // Gravité le long de la pente (atténuée : jeu d'arcade).
  a -= 9.81 * 0.6 * slope;
  if (s.sliding) a -= p.scrubFactor * Math.min(excess, p.scrubMaxExcess) + p.slideFlatDecel;

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
