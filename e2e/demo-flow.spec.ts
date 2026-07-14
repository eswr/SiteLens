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

  test('Cancel watching stops client polling without cancelling the backend job', async ({
    page,
  }) => {
    page.setDefaultTimeout(45_000);

    // Isolate this run so reused contexts / shared Dubai place ids cannot
    // skip the watch UI across parallel or repeated e2e runs.
    const uniquePlaceId = `e2e-cancel-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    await page.route('**/api/planning-contexts/build', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      const payload = route.request().postDataJSON() as {
        place?: { id?: string };
      };
      if (payload?.place) {
        payload.place.id = uniquePlaceId;
      }
      await route.continue({
        postData: JSON.stringify(payload),
      });
    });

    // Synthetic fallback can finish before the Cancel click lands; keep job
    // polls non-terminal until cancel succeeds so the button stays mounted.
    let holdJobAsRunning = true;
    await page.route('**/api/planning-contexts/jobs/**', async (route) => {
      const url = route.request().url();
      if (
        route.request().method() !== 'GET' ||
        url.includes('/jobs/health')
      ) {
        await route.continue();
        return;
      }
      const response = await route.fetch();
      const body = (await response.json()) as {
        data?: { job?: { status?: string; finishedAt?: string | null } };
      };
      if (holdJobAsRunning && body.data?.job) {
        body.data.job = {
          ...body.data.job,
          status: 'running',
          finishedAt: null,
        };
      }
      await route.fulfill({
        status: response.status(),
        headers: {
          ...response.headers(),
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Planning Context Health')).toBeVisible({
      timeout: 60_000,
    });
    await ensurePlanner(page);
    await ensureProPlan(page);

    // Distinct from the happy-path city; e2e API uses
    // EXTERNAL_CONTEXT_REBUILD_AFTER_DAYS=0 so reuse cannot skip the watch UI.
    await page.getByRole('tab', { name: 'Places' }).click();
    const placeInput = page.getByRole('combobox', {
      name: 'Search worldwide places',
    });
    await placeInput.fill('Dubai');
    await page.waitForTimeout(600);

    const suggestion = page
      .getByRole('option')
      .filter({ hasText: 'Dubai' })
      .first();
    if (await suggestion.isVisible().catch(() => false)) {
      await suggestion.click();
    } else {
      await page
        .getByRole('button', { name: /Search live geocoder for/i })
        .click();
      await page
        .locator('.MuiListItemButton-root')
        .filter({ hasText: 'Dubai' })
        .first()
        .click();
    }

    const buildBtn = page.getByRole('button', {
      name: /Build planning context for this place/i,
    });
    await expect(buildBtn).toBeEnabled({ timeout: 20_000 });
    await buildBtn.click();

    const cancelBtn = page.getByRole('button', { name: /Cancel watching/i });
    await expect(cancelBtn).toBeVisible({ timeout: 20_000 });
    await cancelBtn.click();
    holdJobAsRunning = false;
    await expect(
      page.getByText(
        /Stopped watching this build\. The backend job will continue/i,
      ),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole('button', { name: /Resume watching/i }),
    ).toBeVisible();
  });
});
