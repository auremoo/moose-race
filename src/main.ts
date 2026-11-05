/**
 * Point d'entrée : relie entrées → simulation (pas fixe 60 Hz) → rendu interpolé → interface.
 */
import './ui/styles.css';
import { balance, tracks } from './data';
import { InputManager } from './input/input';
import { loadSave, writeSave } from './meta/settings';
import { NO_COMMANDS } from './sim/moose';
import { createRace, stepRace, type Race } from './sim/race';
import { GameView, type Pose } from './render/view';
import { Hud } from './ui/hud';
import { detectLang, setLang } from './ui/i18n';

const save = loadSave();
setLang(save.lang ?? detectLang());
const trackDef = tracks[0];
const canvas = document.getElementById('scene') as HTMLCanvasElement;
const zone = document.getElementById('steer-zone') as HTMLElement;

let race: Race = createRace(trackDef, balance, { seed: 1 });
const view = new GameView(canvas, race, balance);
const input = new InputManager(zone, { ...balance.input, sensitivity: save.sensitivity });
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
    onPlay: () => {
      onHome = false;
      hud.showHome(false);
      restart();
    },
    onQuit: () => {
      onHome = true;
      restart();
      paused = true;
      hud.showHome(true);
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
    onLang: (l) => {
      setLang(l);
      save.lang = l;
      writeSave(save);
    },
  },
  save.sensitivity,
  debug,
);
hud.showHome(true);

function setPaused(p: boolean): void {
  if (resultsShown || onHome) return;
  paused = p;
  input.reset();
  hud.showPause(p);
  last = performance.now();
}

function restart(): void {
  race = createRace(trackDef, balance, { seed: 1 });
  race.racers.forEach((r, i) => {
    prev[i] = { x: r.moose.x, y: r.moose.y, heading: r.moose.heading };
  });
  view.chase.reset();
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
  const bestLap = Math.min(...r.lapTimes);
  const prevBest = save.bestTimes[trackDef.id];
  const record = prevBest === undefined || r.finishTime < prevBest;
  if (record) save.bestTimes[trackDef.id] = r.finishTime;
  if (save.bestLaps[trackDef.id] === undefined || bestLap < save.bestLaps[trackDef.id]) save.bestLaps[trackDef.id] = bestLap;
  writeSave(save);
  resultsShown = true;
  setTimeout(() => hud.showResults(race, record), 900);
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
      const cmd = race.phase === 'countdown' ? NO_COMMANDS : input.read(dt);
      race.racers.forEach((r, i) => {
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
  view.render(race, prev, alpha, paused ? 0 : real);

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
      `glisse   ${m.sliding ? 'OUI' : 'non'} ${m.slip.toFixed(2)}`,
      `direct.  ${m.steer.toFixed(2)}`,
      `écart    ${p.d.toFixed(1)} m`,
      `R piste  ${Math.abs(k) > 1e-4 ? (1 / Math.abs(k)).toFixed(0) + ' m' : '∞'}`,
    ].join('\n');
  }
  hud.update(race, input.visual, save.bestLaps[trackDef.id], dbg);
}

requestAnimationFrame(frame);

// Point d'accès pour le débogage depuis la console.
(window as unknown as { panache: unknown }).panache = { get race() { return race; }, balance };
