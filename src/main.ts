/**
 * Point d'entrée : relie entrées → simulation (pas fixe 60 Hz) → rendu interpolé → interface.
 */
import './ui/styles.css';
import { balance, courses, trackById, tracks, type CourseDef, type DifficultyId } from './data';
import { InputManager } from './input/input';
import { coinsFor, FIRST_WIN_BONUS, firstWinKey } from './meta/economy';
import { loadSave, writeSave } from './meta/settings';
import { assistCommand } from './sim/assist';
import { NO_COMMANDS } from './sim/moose';
import { createRace, estimatedFinishTime, standings, stepRace, type Race } from './sim/race';
import { buildEntrants } from './sim/roster';
import { GameView, type Pose } from './render/view';
import { Hud } from './ui/hud';
import { detectLang, setLang, t } from './ui/i18n';
import { Menus } from './ui/menus';

const save = loadSave();
setLang(save.lang ?? detectLang());
let course: CourseDef = courses[0];
let trackDef = trackById(course.trackId ?? '') ?? tracks[0];
const canvas = document.getElementById('scene') as HTMLCanvasElement;
const zone = document.getElementById('steer-zone') as HTMLElement;

let difficulty: DifficultyId = save.difficulty;
let botCount = save.botCount;

function newRace(): Race {
  const seed = 1 + save.raceCount * 7919;
  const entrants = buildEntrants({
    playerName: t('you'),
    playerMooseId: save.activeMoose,
    playerLevel: save.levels[save.activeMoose] ?? 1,
    difficulty,
    botCount,
    seed,
    balance,
  });
  return createRace(trackDef, balance, { seed, laps: course.laps, entrants, difficulty });
}

let race: Race = newRace();
const view = new GameView(canvas, race, balance);
const input = new InputManager(
  zone,
  { ...balance.input, sensitivity: save.sensitivity, driftSteerMin: balance.moose.driftSteerMin },
  document.getElementById('pedals'),
);
let debug = save.debug || new URLSearchParams(location.search).has('debug');
view.setDebug(debug);

let paused = true;
let onHome = true;
let resultsShown = false;
const prev: Pose[] = race.racers.map((r) => ({ x: r.moose.x, y: r.moose.y, heading: r.moose.heading }));

const hud = new Hud(
  zone,
  race,
  {
    onPause: () => setPaused(true),
    onResume: () => setPaused(false),
    onRestart: () => restart(),
    onQuit: () => {
      restart();
      paused = true;
      menus.show('home');
    },
    onSensitivity: (v) => {
      save.sensitivity = v;
      input.setSensitivity(v);
      writeSave(save);
    },
    onDebug: (on) => {
      debug = on;
      save.debug = on;
      view.setDebug(on);
      writeSave(save);
    },
    onIdealLine: (on) => {
      save.idealLine = on;
      view.setIdealLine(lineVisible());
      writeSave(save);
    },
    onLefty: (on) => {
      save.lefty = on;
      input.reset();
      writeSave(save);
    },
    onLang: (l) => {
      setLang(l);
      save.lang = l;
      writeSave(save);
      menus.applyTexts();
    },
  },
  save.sensitivity,
  debug,
  save.idealLine,
  save.lefty,
);
/** Ligne idéale : selon le réglage, et masquée par défaut en Difficile. */
function lineVisible(): boolean {
  return save.idealLine && balance.difficulties[difficulty].idealLine;
}
view.setIdealLine(lineVisible());
const menus = new Menus(save, {
  onStart: (c, setup) => {
    const def = trackById(c.trackId ?? '');
    if (!def) return;
    const changed = def.id !== trackDef.id;
    course = c;
    trackDef = def;
    difficulty = setup.difficulty;
    botCount = setup.botCount;
    save.difficulty = difficulty;
    save.botCount = botCount;
    menus.show(null);
    restart(changed);
  },
  onScreen: (screen) => {
    onHome = screen !== null;
    view.setShowcase(onHome);
    if (onHome) {
      paused = true;
      hud.showPause(false);
      hud.hideResults();
    }
  },
});
menus.show('home');

function setPaused(p: boolean): void {
  if (resultsShown || onHome) return;
  paused = p;
  input.reset();
  hud.showPause(p);
  last = performance.now();
}

function restart(trackChanged = false): void {
  save.raceCount++;
  writeSave(save);
  race = newRace();
  prev.length = 0;
  race.racers.forEach((r) => prev.push({ x: r.moose.x, y: r.moose.y, heading: r.moose.heading }));
  view.setRace(race, trackChanged);
  view.setIdealLine(lineVisible());
  resultsShown = false;
  hud.hideResults();
  hud.resetHint();
  paused = false;
  hud.showPause(false);
  input.reset();
  acc = 0;
  last = performance.now();
}

function onFinish(): void {
  const r = race.racers[0];
  // Classement à l'arrivée du joueur, pièces selon la formule du cahier.
  const order = standings(race);
  const rank = order.indexOf(0) + 1;
  const N = race.racers.length;
  let coins = coinsFor(rank, N, balance.difficulties[difficulty].coinMul, 1);
  const key = firstWinKey(trackDef.id, difficulty);
  let bonus = 0;
  if (rank === 1 && N > 1 && !save.firstWins.includes(key)) {
    bonus = FIRST_WIN_BONUS;
    save.firstWins.push(key);
  }
  coins += bonus;
  save.coins += coins;
  const results = order.map((i) => ({
    name: race.racers[i].name,
    rating: race.racers[i].rating,
    coat: race.racers[i].coat,
    time: estimatedFinishTime(race, race.racers[i]),
    isPlayer: i === 0,
  }));
  const bestLap = Math.min(...r.lapTimes);
  const prevBest = save.bestTimes[trackDef.id];
  const record = prevBest === undefined || r.finishTime < prevBest;
  if (record) save.bestTimes[trackDef.id] = r.finishTime;
  if (save.bestLaps[trackDef.id] === undefined || bestLap < save.bestLaps[trackDef.id]) save.bestLaps[trackDef.id] = bestLap;
  writeSave(save);
  resultsShown = true;
  setTimeout(() => {
    hud.showResults(race, record, { rank, participants: N, coins, bonus, standings: results, balance: save.coins });
    menus.refreshCoins();
  }, 900);
}

// Pause automatique si la page passe en arrière-plan.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && race.phase !== 'finished') setPaused(true);
});
window.addEventListener('resize', () => view.resize());
// Bloque le zoom par pincement et le menu contextuel sur iOS/Android.
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' || e.code === 'KeyP') setPaused(!paused);
  if (e.code === 'KeyR' && !onHome && (paused || resultsShown)) restart();
});

const dt = race.dt;
let acc = 0;
let last = performance.now();
let fpsFrames = 0;
let fpsTime = 0;
let fps = 0;

function frame(now: number): void {
  requestAnimationFrame(frame);
  let real = (now - last) / 1000;
  last = now;
  if (real > 0.25) real = 0.25;

  fpsFrames++;
  fpsTime += real;
  if (fpsTime >= 0.5) {
    fps = fpsFrames / fpsTime;
    fpsFrames = 0;
    fpsTime = 0;
  }

  if (!paused) {
    acc += real;
    let steps = 0;
    while (acc >= dt && steps < 8) {
      let cmd = race.phase === 'countdown' ? NO_COMMANDS : input.read(dt);
      const assist = balance.difficulties[difficulty].assist;
      if (assist > 0 && race.phase === 'running') cmd = assistCommand(race, cmd, assist);
      race.racers.forEach((r, i) => {
        prev[i] ??= { x: 0, y: 0, heading: 0 };
        prev[i].x = r.moose.x;
        prev[i].y = r.moose.y;
        prev[i].heading = r.moose.heading;
      });
      const wasFinished = race.phase === 'finished';
      stepRace(race, [cmd]);
      if (!wasFinished && race.phase === 'finished') onFinish();
      acc -= dt;
      steps++;
    }
    if (steps === 8) acc = 0;
  }

  const alpha = paused ? 1 : acc / dt;
  view.render(race, prev, alpha, paused && !onHome ? 0 : real);

  let dbg: string | null = null;
  if (debug) {
    const m = race.racers[0].moose;
    const R = Math.abs(m.curvature) > 1e-4 ? 1 / Math.abs(m.curvature) : Infinity;
    const Rcmd = Math.abs(m.commandedCurvature) > 1e-4 ? 1 / Math.abs(m.commandedCurvature) : Infinity;
    const vLim = Number.isFinite(Rcmd) ? Math.sqrt(balance.moose.aLat * Rcmd) : Infinity;
    const p = race.racers[0].proj;
    const k = race.track.samples[p.index].k;
    dbg = [
      `FPS      ${fps.toFixed(0)}`,
      `vitesse  ${m.speed.toFixed(1)} m/s (jeu)`,
      `rayon    ${Number.isFinite(R) ? R.toFixed(0) + ' m' : '∞'}`,
      `v limite ${Number.isFinite(vLim) ? vLim.toFixed(1) + ' m/s' : '—'}`,
      `a_lat    ${m.lateralAccel.toFixed(1)} m/s²`,
      `dérapage ${m.sliding ? 'OUI' : 'non'} ${m.slip.toFixed(2)}`,
      `direct.  ${m.steer.toFixed(2)}`,
      `écart    ${p.d.toFixed(1)} m`,
      `R piste  ${Math.abs(k) > 1e-4 ? (1 / Math.abs(k)).toFixed(0) + ' m' : '∞'}`,
      `ligne    ${race.line.speed[p.index].toFixed(1)} m/s`,
      `endur.   ${(m.endurance * 100).toFixed(0)} %${m.galloping ? ' GALOP' : ''}`,
      `glisse   ${m.drifting ? `OUI ${m.driftTime.toFixed(1)} s` : 'non'}  élan ${m.boostTime.toFixed(1)} s`,
      `cordes   ${race.racers[0].cordeCount}/${race.line.apexes.length}`,
    ].join('\n');
  }
  hud.update(race, input.visual, save.bestLaps[trackDef.id], dbg);
}

requestAnimationFrame(frame);

// Point d'accès pour le débogage depuis la console.
(window as unknown as { panache: unknown }).panache = { get race() { return race; }, balance };
