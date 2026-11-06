/**
 * Équilibrage sans rendu (critères du cahier, section 10) :
 *   npm run balance -- [nombre de duels par critère, défaut 1000]
 * 1. À cote égale, un pilote expert bat un pilote moyen dans ≥ 85 % des duels.
 * 2. À pilotage identique, 10 points de cote d'avance ne donnent pas plus de 80 % de victoires.
 * 3. Aucun orignal à cote égale ne gagne plus de 60 % de ses duels sur l'ensemble des parcours.
 */
import balanceJson from '../src/data/balance.json';
import { courses, mooseCatalog, mooseParamsFor, mooseRating, trackById, type Balance, type MooseDef } from '../src/data';
import { createRace, stepRace, type Entrant } from '../src/sim/race';

const balance = balanceJson as unknown as Balance;
const N = Number(process.argv[2] ?? 1000);

function duel(trackIdx: number, a: Entrant, b: Entrant, seed: number): number {
  const c = courses[trackIdx % courses.length];
  const race = createRace(trackById(c.trackId!)!, balance, {
    seed,
    laps: c.laps,
    entrants: [a, b],
    playerGridSlot: seed % 2,
    difficulty: 'difficile',
  });
  for (let i = 0; i < 60 * 400; i++) {
    stepRace(race, []);
    if (race.racers.every((r) => r.finished)) break;
  }
  const [A, B] = race.racers;
  const ta = A.finished ? A.finishTime : Infinity;
  const tb = B.finished ? B.finishTime : Infinity;
  return ta < tb ? 0 : 1;
}

const ent = (def: MooseDef, level: number, talent: number, name: string): Entrant => ({
  name,
  mooseId: def.id,
  rating: mooseRating(def, level),
  params: mooseParamsFor(def, level, balance),
  botTalent: talent,
});

const buch = mooseCatalog.moose.find((m) => m.id === 'bucheron')!;
let wins = 0;
for (let i = 0; i < N; i++) wins += duel(i, ent(buch, 1, 0.95, 'expert'), ent(buch, 1, 0.65, 'moyen'), i + 1) === 0 ? 1 : 0;
const c1 = wins / N;
console.log(`1. Expert contre moyen, cote égale : ${(c1 * 100).toFixed(1)} % (≥ 85 %) ${c1 >= 0.85 ? '✓' : '✗'}`);
if (c1 < 0.85) process.exitCode = 1;

wins = 0;
for (let i = 0; i < N; i++) wins += duel(i, ent(buch, 6, 0.8, 'fort'), ent(buch, 1, 0.8, 'faible'), i + 7) === 0 ? 1 : 0;
const c2 = wins / N;
console.log(`2. +10 de cote, même pilotage : ${(c2 * 100).toFixed(1)} % (≤ 80 %) ${c2 <= 0.8 ? '✓' : '✗'}`);
if (c2 > 0.8) process.exitCode = 1;

// 3. Chaque orignal, ramené à la cote 58 (cote des communs au niveau 10), contre des adversaires variés.
const targetRating = 58;
const levelFor = (m: MooseDef) => Math.max(1, Math.min(10, Math.round((targetRating - mooseRating(m, 1)) / 2) + 1));
const pool = mooseCatalog.moose.filter((m) => Math.abs(mooseRating(m, levelFor(m)) - targetRating) <= 1);
// On garde le maximum de 20 taux : avec 50 duels par orignal, le bruit (± 7 points) suffit à frôler
// les 60 % sans déséquilibre réel. Trois fois plus de duels pour ce critère.
const per = Math.max(30, Math.round((3 * N) / pool.length));
let worst = 0;
let worstName = '';
for (const m of pool) {
  let w = 0;
  for (let i = 0; i < per; i++) {
    const opp = pool[(i * 7 + 3) % pool.length];
    w += duel(i, ent(m, levelFor(m), 0.8, m.name), ent(opp, levelFor(opp), 0.8, opp.name), i * 13 + 5) === 0 ? 1 : 0;
  }
  const rate = w / per;
  if (rate > worst) {
    worst = rate;
    worstName = m.name;
  }
}
console.log(
  `3. Meilleur orignal à cote égale (${pool.length} orignaux) : ${worstName} ${(worst * 100).toFixed(1)} % (≤ 60 %) ${worst <= 0.6 ? '✓' : '✗'}`,
);
if (worst > 0.6) process.exitCode = 1;

// 4. Un joueur simulé (pilote correct) améliore complètement un Commun en 25 à 40 courses.
import { coinsFor, FIRST_WIN_BONUS, firstWinKey } from '../src/meta/economy';
import { buildEntrants } from '../src/sim/roster';
import { upgradeCost } from '../src/meta/collection';
import { openChest } from '../src/meta/chests';
import { recordRace } from '../src/meta/rewards';
import { defaultSave } from '../src/meta/settings';
// Coffres : le joueur les ouvre tous (ils s'ouvrent sans attente).
let chestCoins = 0;
let raceCoins = 0;
const careers: number[] = [];
const players = Math.max(3, Math.round(N / 100));
for (let p = 0; p < players; p++) {
  let coins = 0;
  let level = 1;
  let races = 0;
  const wins = new Set<string>();
  const meta = defaultSave();
  while (level < 10 && races < 120) {
    const c = courses[(races * 3 + p) % courses.length];
    const entrants = buildEntrants({
      playerName: 'J',
      playerMooseId: 'bucheron',
      playerLevel: level,
      difficulty: 'moyen',
      botCount: 10,
      seed: 100 + p * 1000 + races,
      balance,
    });
    entrants[0].botTalent = 0.8;
    const race = createRace(trackById(c.trackId!)!, balance, { seed: 100 + p * 1000 + races, laps: c.laps, entrants, difficulty: 'moyen' });
    for (let i = 0; i < 60 * 400 && !race.racers[0].finished; i++) stepRace(race, []);
    const order = race.racers
      .map((_, i) => i)
      .sort(
        (a, b) =>
          (race.racers[a].finished ? race.racers[a].finishTime : 1e9) - (race.racers[b].finished ? race.racers[b].finishTime : 1e9) ||
          race.racers[b].distance - race.racers[a].distance,
      );
    const rank = order.indexOf(0) + 1;
    const earned = coinsFor(rank, 11, balance.difficulties.moyen.coinMul, 1);
    coins += earned;
    raceCoins += earned;
    recordRace(meta, rank, 11, false);
    for (const ch of [...meta.chests]) {
      const got = openChest(meta, ch.id);
      if (got) {
        coins += got.coins;
        chestCoins += got.coins;
      }
    }
    const key = firstWinKey(c.id, 'moyen');
    if (rank === 1 && !wins.has(key)) {
      wins.add(key);
      coins += FIRST_WIN_BONUS;
    }
    races++;
    let cost = upgradeCost(buch, level);
    while (cost !== null && coins >= cost) {
      coins -= cost;
      level++;
      cost = upgradeCost(buch, level);
    }
  }
  careers.push(races);
}
const avg = careers.reduce((a, b) => a + b, 0) / careers.length;
console.log(`   (pièces des coffres : ${((100 * chestCoins) / Math.max(1, raceCoins + chestCoins)).toFixed(1)} % du total)`);
console.log(
  `4. Courses pour améliorer un Commun au niveau 10 : ${careers.join(', ')} (moyenne ${avg.toFixed(1)}, attendu 25 à 40) ${avg >= 25 && avg <= 40 ? '✓' : '✗'}`,
);
if (avg < 25 || avg > 40) process.exitCode = 1;
