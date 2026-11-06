/**
 * Point d'entrée : relie entrées → simulation (pas fixe 60 Hz) → rendu interpolé → interface.
 */
// Polices hébergées avec le jeu (licence OFL) : pas d'appel à Google, jeu complet hors ligne.
import '@fontsource/lilita-one/latin-400.css';
import '@fontsource/nunito/latin-600.css';
import '@fontsource/nunito/latin-800.css';
import '@fontsource/nunito/latin-900.css';
import './ui/styles.css';
import { balance, courses, trackById, tracks, type CourseDef, type DifficultyId } from './data';
import { InputManager } from './input/input';
import { coinsFor, FIRST_WIN_BONUS, firstWinKey } from './meta/economy';
import { exportSave, importSave, loadSave, writeSave } from './meta/settings';
import { assistCommand } from './sim/assist';
import { NO_COMMANDS } from './sim/moose';
import { createRace, estimatedFinishTime, standings, stepRace, type Race } from './sim/race';
import { buildEntrants } from './sim/roster';
import { GameView, type Pose } from './render/view';
import { Hud } from './ui/hud';
import { detectLang, setLang, t } from './ui/i18n';
import { Menus } from './ui/menus';
import { Tutorial } from './ui/tutorial';
import { SoundEngine } from './audio/sound';
import { preloadModels } from './render/models';

const save = loadSave();
const sound = new SoundEngine();
sound.sfxOn = save.soundOn;
sound.musicOn = save.musicOn;
sound.hapticsOn = save.hapticsOn;
document.documentElement.classList.toggle('reduce-motion', save.reduceMotion);
// iOS n'autorise le son qu'après un geste de l'utilisateur.
const unlockAudio = () => sound.unlock();
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);
setLang(save.lang ?? detectLang());
let course: CourseDef = courses[0];
let trackDef = trackById(course.trackId ?? '') ?? tracks[0];
const canvas = document.getElementById('scene') as HTMLCanvasElement;
const zone = document.getElementById('steer-zone') as HTMLElement;

let difficulty: DifficultyId = save.difficulty;
let botCount = save.botCount;
let mode: 'classique' | 'special' = save.mode;

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
  return createRace(trackDef, balance, { seed, laps: course.laps, entrants, difficulty, mode, biome: course.biome });
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
      stopTutorial();
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
    mode = setup.mode;
    save.mode = mode;
    save.difficulty = difficulty;
    save.botCount = botCount;
    menus.show(null);
    restart(changed);
  },
  onTutorial: () => startTutorial(),
  onCollectionChange: () => {
    // Nouvel orignal actif ou nouveau niveau : la vitrine et la prochaine course en tiennent compte.
    race = newRace();
    prev.length = 0;
    race.racers.forEach((r) => prev.push({ x: r.moose.x, y: r.moose.y, heading: r.moose.heading }));
    view.setRace(race, false);
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

// Didacticiel : course guidée en solo, sur la Prairie tranquille, en Facile.
const tutorial = new Tutorial(() => {
  save.tutorialDone = true;
  writeSave(save);
});
function stopTutorial(): void {
  tutorial.stop();
}
function startTutorial(): void {
  const c = courses.find((x) => x.id === 'prairie-tranquille') ?? courses[0];
  const def = trackById(c.trackId ?? '')!;
  const changed = def.id !== trackDef.id;
  course = { ...c, laps: 1 };
  trackDef = def;
  difficulty = 'facile';
  botCount = 0;
  mode = 'classique';
  menus.show(null);
  restart(changed);
  tutorial.start();
}

document.getElementById('btn-improve')?.addEventListener('click', () => {
  menus.show('enclos');
  menus.collection.openDetail(save.activeMoose, 'enclos');
});

// Réglages du son, des vibrations et des animations.
const bindCheck = (id: string, get: () => boolean, set: (v: boolean) => void) => {
  const el = document.getElementById(id) as HTMLInputElement;
  el.checked = get();
  el.addEventListener('change', () => {
    set(el.checked);
    writeSave(save);
    refreshSoundButton();
  });
};
bindCheck('chk-sound', () => save.soundOn, (v) => { save.soundOn = sound.sfxOn = v; sound.applyToggles(); });
bindCheck('chk-music', () => save.musicOn, (v) => { save.musicOn = sound.musicOn = v; sound.applyToggles(); });
bindCheck('chk-haptics', () => save.hapticsOn, (v) => { save.hapticsOn = sound.hapticsOn = v; });
bindCheck('chk-motion', () => save.reduceMotion, (v) => {
  save.reduceMotion = v;
  document.documentElement.classList.toggle('reduce-motion', v);
});
const soundBtn = document.getElementById('btn-sound-toggle') as HTMLButtonElement;
function refreshSoundButton(): void {
  soundBtn.textContent = save.soundOn || save.musicOn ? t('soundOn') : t('soundOff');
}
refreshSoundButton();
soundBtn.addEventListener('click', () => {
  const on = !(save.soundOn || save.musicOn);
  save.soundOn = save.musicOn = sound.sfxOn = sound.musicOn = on;
  sound.applyToggles();
  (document.getElementById('chk-sound') as HTMLInputElement).checked = on;
  (document.getElementById('chk-music') as HTMLInputElement).checked = on;
  writeSave(save);
  refreshSoundButton();
});

// Export et import de la sauvegarde (le navigateur peut effacer le stockage local).
document.getElementById('btn-export')?.addEventListener('click', () => {
  const blob = new Blob([exportSave(save)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `panache-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
const fileInput = document.getElementById('file-import') as HTMLInputElement;
document.getElementById('btn-import')?.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  const f = fileInput.files?.[0];
  if (!f) return;
  const loaded = importSave(await f.text());
  if (!loaded) {
    menus.toast(t('importFailed'));
    return;
  }
  Object.assign(save, loaded);
  writeSave(save);
  menus.toast(t('imported'));
  setTimeout(() => location.reload(), 600);
});

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
  let coins = coinsFor(rank, N, balance.difficulties[difficulty].coinMul, mode === 'special' ? balance.special.coinMul : 1);
  const key = firstWinKey(trackDef.id, difficulty);
  let bonus = 0;
  if (rank === 1) sound.brame();
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
  sound.suspend(document.hidden);
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
      if (tutorial.active && tutorial.update(race, cmd, dt)) {
        save.tutorialDone = true;
        writeSave(save);
        menus.toast(t('tutoDone'));
      }
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
      `FPS      ${fps.toFixed(0)} (${view.qualityInfo})`,
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
  soundEvents();
}

// ---------- Événements sonores, déduits de l'état de la course ----------
let lastStride = 0;
let lastCount = -1;
let lastCorde = -1;
let lastContact = -1;
let lastItem = -1;
let lastBoosting = false;
let lastStun = 0;
function soundEvents(): void {
  sound.setMusic(onHome ? 'menu' : (race.biome ?? 'test'));
  const me = race.racers[0];
  const m = me.moose;
  if (onHome || paused) {
    sound.drift(false, 0);
    return;
  }
  // Compte à rebours : un bip par seconde, un bip aigu au départ.
  const remain = Math.ceil(Math.max(0, race.countdownTicks - race.tick) * race.dt);
  if (remain !== lastCount) {
    if (remain > 0) sound.beep(false);
    else if (lastCount > 0) sound.beep(true);
    lastCount = remain;
  }
  // Sabots : deux appuis par foulée, calés sur l'animation.
  const stride = view.playerStride();
  if (m.speed > 1 && Math.floor(stride / Math.PI) !== Math.floor(lastStride / Math.PI)) {
    const surface = me.onVerge ? race.track.def.vergeSurface : race.track.samples[me.proj.index].surface;
    sound.hoof(surface, m.speed / 30);
  }
  lastStride = stride;
  sound.drift(m.drifting, m.boostCharge);
  if (me.lastCordeTick !== lastCorde) {
    if (me.lastCordeTick >= 0) sound.corde();
    lastCorde = me.lastCordeTick;
  }
  const boosting = m.boostTime > 0 || m.tailTime > 0;
  if (boosting && !lastBoosting) sound.boost();
  lastBoosting = boosting;
  if (me.lastItemTick !== lastItem) {
    if (me.item) sound.pickup();
    lastItem = me.lastItemTick;
  }
  if (m.stunTime > lastStun + 0.5 && race.hazards) sound.growl();
  else if (me.lastContactTick !== lastContact && me.lastContactTick === race.tick) sound.thud();
  lastContact = me.lastContactTick;
  lastStun = m.stunTime;
}

// Application installable (PWA) : service worker en production seulement.
// Le cache est lié au build : une nouvelle version publiée remplace l'ancienne.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    // Première visite : pas de bandeau, il n'y a pas d'ancienne version à remplacer.
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker
      .register(`./sw.js?v=${__BUILD_ID__}`)
      .then((reg) => {
        reg.addEventListener('updatefound', () => {
          const w = reg.installing;
          w?.addEventListener('statechange', () => {
            if (w.state === 'activated' && hadController) showUpdateBanner();
          });
        });
      })
      .catch(() => undefined);
  });
}
function showUpdateBanner(): void {
  const b = document.getElementById('update-banner');
  if (!b) return;
  b.textContent = t('updateReady');
  b.hidden = false;
  b.addEventListener('click', () => location.reload(), { once: true });
}

// Modèles GLB éventuels : chargés une fois, puis appliqués dès la course suivante.
void preloadModels().then(() => view.setRace(race, false));

requestAnimationFrame(frame);

// Point d'accès pour le débogage depuis la console.
(window as unknown as { panache: unknown }).panache = { get race() { return race; }, balance };
