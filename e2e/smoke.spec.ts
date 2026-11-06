import { expect, test, type Page } from '@playwright/test';

/** Ce que le jeu expose sur window pour les tests (sous-ensemble utilisé ici). */
interface PanacheWindow {
  panache: {
    race: {
      laps: number;
      track: { length: number };
      racers: { distance: number; moose: { speed: number } }[];
      hazards: { bears: unknown[] } | null;
    };
  };
}

/** Sauvegarde de départ : didacticiel déjà vu, pour aller droit au but. */
async function freshStart(page: Page, extra: Record<string, unknown> = {}) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.evaluate((e) => localStorage.setItem('panache.v1', JSON.stringify({ schema: 2, tutorialDone: true, ...e })), extra);
  await page.reload();
  return errors;
}

test("l'accueil s'affiche sans erreur", async ({ page }) => {
  const errors = await freshStart(page);
  await expect(page.locator('.logo')).toHaveText('Panache');
  await expect(page.locator('#btn-play')).toBeVisible();
  await expect(page.locator('#btn-daily')).toBeVisible();
  expect(errors).toEqual([]);
});

test('une course se lance, se met en pause et se termine avec des pièces', async ({ page }) => {
  const errors = await freshStart(page, { botCount: 3 });
  await page.click('#btn-play');
  await page.locator('.course-card').first().click();
  await page.click('#btn-go');
  await page.keyboard.down('ArrowUp');
  // Le rendu logiciel de la CI est lent : on attend que l'orignal ait pris de la vitesse.
  await page.waitForFunction(() => (window as unknown as PanacheWindow).panache.race.racers[0].moose.speed > 5, undefined, {
    timeout: 60_000,
  });
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause-menu')).toBeVisible();
  await page.click('#btn-resume');
  await page.evaluate(() => {
    const r = (window as unknown as PanacheWindow).panache.race;
    r.racers[0].distance = r.laps * r.track.length - 2;
  });
  await expect(page.locator('#results')).toBeVisible({ timeout: 10_000 });
  const coins = await page.evaluate(() => JSON.parse(localStorage.getItem('panache.v1')!).coins);
  expect(coins).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('Enclos et Comptoir fonctionnent', async ({ page }) => {
  const errors = await freshStart(page, { coins: 5000 });
  await page.click('.tile[data-feature="enclos"]');
  await expect(page.locator('#enclos-grid .moose-card')).toHaveCount(20);
  await page.locator('#enclos-grid .moose-card').first().click();
  await page.click('#detail-main');
  const lvl = await page.evaluate(() => JSON.parse(localStorage.getItem('panache.v1')!).levels.bucheron);
  expect(lvl).toBe(2);
  await page.click('#detail-close');
  await page.click('#screen-enclos [data-back]');
  await page.click('.tile[data-feature="comptoir"]');
  await page.click('#btn-loot');
  await expect(page.locator('#loot-reveal')).toBeVisible();
  expect(errors).toEqual([]);
});

test('la langue passe en anglais', async ({ page }) => {
  await freshStart(page);
  await page.click('#btn-settings');
  await page.click('.seg[data-lang="en"]');
  await page.click('#btn-settings-back');
  await expect(page.locator('#btn-play')).toHaveText('Play');
});

test('le mode Ours et castors démarre avec des ours', async ({ page }) => {
  const errors = await freshStart(page, { mode: 'special', difficulty: 'difficile', botCount: 5 });
  await page.click('#btn-play');
  await page.locator('.course-card').nth(7).click();
  await page.click('#btn-go');
  await page.waitForTimeout(1000);
  const bears = await page.evaluate(() => (window as unknown as PanacheWindow).panache.race.hazards?.bears.length ?? 0);
  expect(bears).toBeGreaterThan(0);
  await expect(page.locator('#btn-castor')).toBeVisible();
  expect(errors).toEqual([]);
});
