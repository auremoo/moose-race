import { expect, test, type Page } from '@playwright/test';

/**
 * Chaque réglage a un effet réel (issue #9) : il survit au rechargement et change ce qu'il doit
 * changer en jeu. Les champs privés de la vue sont lus directement (TypeScript ne les cache qu'à la
 * compilation).
 */
interface ViewProbe {
  ghostView: { root: { visible: boolean } } | null;
  ideal: { mesh: { visible: boolean } };
  home: { camera: { position: { x: number; z: number } } } | null;
}
interface PanacheWindow {
  panache: {
    race: { laps: number; phase: string; track: { length: number }; racers: { distance: number; moose: { speed: number } }[] };
    view: ViewProbe;
  };
}
type Save = Record<string, unknown>;

async function start(page: Page, extra: Save = {}) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.evaluate((e) => localStorage.setItem('panache.v1', JSON.stringify({ schema: 6, tutorialDone: true, ...e })), extra);
  await page.reload();
  return errors;
}

const readSave = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('panache.v1')!) as Save);

/** Lance la première course de la carte, accélère jusqu'à prendre de la vitesse. */
async function race(page: Page) {
  await page.click('#btn-play');
  await page.locator('.course-card').first().click();
  await page.click('#btn-go');
  await page.keyboard.down('ArrowUp');
  await page.waitForFunction(() => (window as unknown as PanacheWindow).panache.race.racers[0].moose.speed > 5, undefined, {
    timeout: 60_000,
  });
}

/** Amène le joueur juste avant la ligne d'arrivée du dernier tour. */
async function finish(page: Page) {
  await page.evaluate(() => {
    const r = (window as unknown as PanacheWindow).panache.race;
    r.racers[0].distance = r.laps * r.track.length - 2;
  });
}

const CHECKS = ['chk-debug', 'chk-sound', 'chk-music', 'chk-haptics', 'chk-contrast', 'chk-motion', 'chk-ghost', 'chk-ideal', 'chk-lefty'];
const FIELDS: Record<string, string> = {
  'chk-debug': 'debug',
  'chk-sound': 'soundOn',
  'chk-music': 'musicOn',
  'chk-haptics': 'hapticsOn',
  'chk-contrast': 'highContrast',
  'chk-motion': 'reduceMotion',
  'chk-ghost': 'ghostOn',
  'chk-ideal': 'idealLine',
  'chk-lefty': 'lefty',
};

test('chaque réglage survit au rechargement de la page', async ({ page }) => {
  const errors = await start(page);
  await page.click('#btn-settings');
  await expect(page.locator('#settings')).toBeVisible();
  const before: Record<string, boolean> = {};
  for (const id of CHECKS) {
    const box = page.locator(`#${id}`);
    before[id] = await box.isChecked();
    // Inversion par un vrai clic (le libellé reçoit le toucher).
    await box.evaluate((el) => (el as HTMLInputElement).click());
  }
  await page.locator('#rng-sensitivity').fill('1.5');
  await page.click('[data-scale="1.15"]');
  const saved = await readSave(page);
  for (const id of CHECKS) expect(saved[FIELDS[id]], id).toBe(!before[id]);
  expect(saved.sensitivity).toBe(1.5);
  expect(saved.uiScale).toBe(1.15);

  await page.reload();
  for (const id of CHECKS) expect(await page.locator(`#${id}`).isChecked(), id).toBe(!before[id]);
  expect(await page.locator('#rng-sensitivity').inputValue()).toBe('1.5');
  const root = await page.evaluate(() => ({
    contrast: document.documentElement.classList.contains('high-contrast'),
    motion: document.documentElement.classList.contains('reduce-motion'),
    lefty: document.getElementById('app')!.classList.contains('lefty'),
    scale: document.documentElement.style.getPropertyValue('--ui-scale'),
  }));
  expect(root).toEqual({ contrast: !before['chk-contrast'], motion: !before['chk-motion'], lefty: !before['chk-lefty'], scale: '1.15' });
  expect(errors).toEqual([]);
});

test('gaucher : accélérateur à gauche, direction à droite', async ({ page }) => {
  const errors = await start(page, { lefty: true, botCount: 0 });
  await race(page);
  const w = page.viewportSize()!.width;
  const gas = (await page.locator('.pedal-gas').boundingBox())!;
  const zone = (await page.locator('#steer-zone').boundingBox())!;
  expect(gas.x + gas.width / 2).toBeLessThan(w / 2);
  expect(zone.x + zone.width / 2).toBeGreaterThan(w / 2);
  // Et l'inverse sans le réglage.
  await page.evaluate(() => document.getElementById('chk-lefty')!.click());
  const gas2 = (await page.locator('.pedal-gas').boundingBox())!;
  expect(gas2.x + gas2.width / 2).toBeGreaterThan(w / 2);
  expect(errors).toEqual([]);
});

test('fantôme et ligne idéale : présents, puis retirés quand on décoche', async ({ page }) => {
  const errors = await start(page, { botCount: 0 });
  await race(page);
  const view = () =>
    page.evaluate(() => {
      const v = (window as unknown as PanacheWindow).panache.view;
      return { ghost: v.ghostView !== null, ideal: v.ideal.mesh.visible };
    });
  expect((await view()).ideal).toBe(true);
  // Premier temps sur le circuit : il devient le record et le fantôme.
  await page.waitForTimeout(1500);
  await finish(page);
  await expect(page.locator('#results')).toBeVisible({ timeout: 10_000 });
  expect(await page.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('panache.ghost.')))).toBe(true);

  // Course suivante : le fantôme est là.
  await page.click('#btn-replay');
  await page.waitForFunction(() => (window as unknown as PanacheWindow).panache.view.ghostView !== null, undefined, { timeout: 10_000 });
  await page.evaluate(() => {
    document.getElementById('chk-ghost')!.click();
    document.getElementById('chk-ideal')!.click();
  });
  expect(await view()).toEqual({ ghost: false, ideal: false });
  expect(errors).toEqual([]);
});

test('animations réduites : ni ralenti, ni podium, ni lignes de vitesse, caméra fixe à l’accueil', async ({ page }) => {
  const errors = await start(page, { reduceMotion: true, botCount: 3 });
  const cam = () =>
    page.evaluate(() => {
      const p = (window as unknown as PanacheWindow).panache.view.home!.camera.position;
      return { x: p.x, z: p.z };
    });
  await page.waitForFunction(() => !!(window as unknown as PanacheWindow).panache.view.home);
  const a = await cam();
  await page.waitForTimeout(1200);
  const b = await cam();
  expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(1e-6);

  await race(page);
  await expect(page.locator('#speed-lines')).toBeHidden();
  await finish(page);
  // Sans animations, les résultats arrivent tout de suite, sans ralenti ni podium.
  await expect(page.locator('#results')).toBeVisible({ timeout: 3_000 });
  await expect(page.locator('#replay-banner')).toBeHidden();
  expect(errors).toEqual([]);
});

test('contraste renforcé : contours marqués et textes plus sombres', async ({ page }) => {
  const errors = await start(page, { highContrast: true });
  const style = await page.evaluate(() => {
    const tile = getComputedStyle(document.querySelector('.tile')!);
    return { outline: tile.outlineWidth, brun: getComputedStyle(document.documentElement).getPropertyValue('--brun').trim() };
  });
  expect(style).toEqual({ outline: '2px', brun: '#1e120b' });
  expect(errors).toEqual([]);
});
