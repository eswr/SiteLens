import { expect, test, type Page } from '@playwright/test';

async function ensurePlanner(page: Page): Promise<void> {
  const plannerChip = page.getByText('Demo Planner').first();
  if (await plannerChip.isVisible().catch(() => false)) {
    return;
  }
  const identity = page.getByLabel('Identity');
  await identity.scrollIntoViewIfNeeded();
  await identity.click();
  await page.getByRole('option', { name: 'Planner' }).click();
  await expect(page.getByText('Demo Planner').first()).toBeVisible({
    timeout: 20_000,
  });
}

/** Build requires Pro/Enterprise; demo-plan persists, so prior Free runs leave Build disabled. */
async function ensureProPlan(page: Page): Promise<void> {
  const proChip = page.getByText(/Demo Planner · Pro/i).first();
  if (await proChip.isVisible().catch(() => false)) {
    return;
  }
  const plan = page.getByRole('combobox', { name: 'Plan' });
  await plan.scrollIntoViewIfNeeded();
  await plan.click();
  await page.getByRole('option', { name: 'Pro' }).click();
  await expect(proChip).toBeVisible({ timeout: 20_000 });
}

async function drawSquareAoi(page: Page): Promise<void> {
  const drawBtn = page.getByRole('button', { name: /^Draw area$/i });
  await expect(drawBtn).toBeVisible();
  await drawBtn.scrollIntoViewIfNeeded();
  await drawBtn.click();

  const map = page.locator('canvas.maplibregl-canvas').first();
  await expect(map).toBeVisible();
  const box = await map.boundingBox();
  if (!box) {
    throw new Error('Map canvas has no bounding box');
  }

  const pts: [number, number][] = [
    [box.x + box.width * 0.42, box.y + box.height * 0.42],
    [box.x + box.width * 0.58, box.y + box.height * 0.42],
    [box.x + box.width * 0.58, box.y + box.height * 0.58],
    [box.x + box.width * 0.42, box.y + box.height * 0.58],
  ];
  for (const [x, y] of pts) {
    await page.mouse.click(x, y);
    await page.waitForTimeout(250);
  }

  await page.getByRole('button', { name: /^Complete area$/i }).click();
}

test.describe('SiteLens demo flow smoke', () => {
  test('Planner → Places → Bengaluru → Build → Ready → AOI → Summary → Free gate', async ({
    page,
  }) => {
    page.setDefaultTimeout(45_000);

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Planning Context Health')).toBeVisible({
      timeout: 60_000,
    });
    await ensurePlanner(page);
    await ensureProPlan(page);

    await page.getByRole('tab', { name: 'Places' }).click();
    const placeInput = page.getByRole('combobox', {
      name: 'Search worldwide places',
    });
    await expect(placeInput).toBeVisible();
    await placeInput.fill('Bengaluru');
    await page.waitForTimeout(600);

    // Prefer static-demo suggestion when Nominatim is unavailable in CI.
    const suggestion = page
      .getByRole('option')
      .filter({ hasText: 'Bengaluru' })
      .first();
    if (await suggestion.isVisible().catch(() => false)) {
      await suggestion.click();
    } else {
      const liveSearch = page.getByRole('button', {
        name: /Search live geocoder for/i,
      });
      await liveSearch.click();
      const resultRow = page
        .locator('.MuiListItemButton-root')
        .filter({ hasText: 'Bengaluru' })
        .first();
      await expect(resultRow).toBeVisible({ timeout: 30_000 });
      await resultRow.click();
    }

    const buildBtn = page.getByRole('button', {
      name: /Build planning context for this place/i,
    });
    await expect(buildBtn).toBeVisible({ timeout: 20_000 });
    await expect(buildBtn).toBeEnabled({ timeout: 20_000 });
    await expect(page.getByText(/Demo Planner · Pro/i).first()).toBeVisible();
    await buildBtn.click();

    // Building chip may be skipped on reuse; Status: ready is the gate.
    const building = page.getByText('Status: building', { exact: false });
    await building.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {
      /* reuse path */
    });

    await expect(page.getByText('Status: ready', { exact: false })).toBeVisible(
      { timeout: 180_000 },
    );

    const clearPlace = page.getByRole('button', { name: /Clear place/i });
    if (await clearPlace.isVisible().catch(() => false)) {
      await clearPlace.click();
    }
    await page.getByRole('tab', { name: 'Planning features' }).click();

    await drawSquareAoi(page);
    await expect(
      page.getByRole('button', {
        name: /Generate (backend|AI|local demo) summary/i,
      }),
    ).toBeVisible({ timeout: 60_000 });

    await page
      .getByRole('button', {
        name: /Generate (backend|AI|local demo) summary/i,
      })
      .first()
      .click();

    // Switch to Free to assert the entitlement gate copy.
    const plan = page.getByRole('combobox', { name: 'Plan' });
    await plan.scrollIntoViewIfNeeded();
    await plan.click();
    await page.getByRole('option', { name: 'Free' }).click();
    await expect(
      page.getByText(
        /Backend summary requires Pro or Enterprise; Free mode uses a local/i,
      ),
    ).toBeVisible({ timeout: 20_000 });
  });
});
