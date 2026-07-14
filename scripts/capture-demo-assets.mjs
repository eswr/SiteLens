/**
 * Capture SiteLens portfolio screenshots + a short demo video.
 * Requires: local web on :5173 (VITE → local API), API on :4000 with worker.
 *
 *   CAPTURE_BASE_URL=http://localhost:5173 npm run capture:demo
 */
import { chromium } from 'playwright';
import { mkdir, copyFile, readdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'docs', 'screenshots');
const baseURL = process.env.CAPTURE_BASE_URL ?? 'http://localhost:5173';

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function shot(page, name) {
  const file = path.join(outDir, name);
  await page.screenshot({ path: file, fullPage: false });
  console.log('wrote', file);
}

async function waitForVisible(locator, timeout = 30_000) {
  await locator.waitFor({ state: 'visible', timeout });
  return locator;
}

async function ensurePlanner(page) {
  // Header chip: "Demo Planner · Pro" once /api/me succeeds with planner key.
  const plannerChip = page.getByText('Demo Planner').first();
  if (await plannerChip.isVisible().catch(() => false)) {
    return;
  }

  // Sidebar footer Demo access → Identity select
  const identity = page.getByLabel('Identity');
  await identity.scrollIntoViewIfNeeded();
  await identity.click();
  await page.getByRole('option', { name: 'Planner' }).click();
  await waitForVisible(page.getByText('Demo Planner').first(), 20_000);
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const videoDir = path.join(outDir, '_video-tmp');
  await rm(videoDir, { recursive: true, force: true });
  await mkdir(videoDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: videoDir, size: { width: 1440, height: 900 } },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(45_000);

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.log('console.error:', msg.text());
    }
  });

  console.log('opening', baseURL);
  await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await waitForVisible(page.getByText('Planning Context Health'));
  await ensurePlanner(page);
  await sleep(2500);
  await shot(page, 'planning-context-health.png');

  // Places mode (MUI Tabs)
  await page.getByRole('tab', { name: 'Places' }).click();
  await sleep(400);

  const placeInput = page.getByRole('combobox', {
    name: 'Search worldwide places',
  });
  await waitForVisible(placeInput);
  await placeInput.click();
  await placeInput.fill('Bengaluru');
  await sleep(800);

  // Prefer live geocoder so screenshots show API-mode place search.
  const liveSearch = page.getByRole('button', {
    name: /Search live geocoder for/i,
  });
  await waitForVisible(liveSearch);
  await liveSearch.click();
  await sleep(1500);

  // Prefer the results list row (not the "Search live geocoder…" button).
  const resultRow = page
    .locator('.MuiListItemButton-root')
    .filter({ hasText: 'Bengaluru' })
    .first();
  await waitForVisible(resultRow);
  await resultRow.click();

  await waitForVisible(
    page.getByRole('button', {
      name: /Build planning context for this place/i,
    }),
  );
  // Confirm we are not on Free anonymous mode after API connectivity.
  await waitForVisible(
    page.getByText('Demo Planner').first(),
  );
  await sleep(1000);
  await shot(page, 'place-search-build-context.png');

  await page
    .getByRole('button', { name: /Build planning context for this place/i })
    .click();

  // Mid-build: Status chip must flip to building (reuse would skip this).
  const buildingChip = page.getByText('Status: building', { exact: false });
  await buildingChip.waitFor({ state: 'visible', timeout: 30_000 });
  // Bring health card into frame for the running shot.
  await page.getByText('Planning Context Health').scrollIntoViewIfNeeded();
  await sleep(400);
  await shot(page, 'async-build-running.png');

  const apiFail = page.getByText(/Failed to reach the API/i);
  if (await apiFail.isVisible().catch(() => false)) {
    throw new Error('Build failed: frontend cannot reach local API (CORS/network)');
  }

  await page.getByText('Provider: Overpass').waitFor({ state: 'visible', timeout: 120_000 });
  await page.getByText('Status: ready').waitFor({ state: 'visible', timeout: 60_000 });
  await page
    .getByRole('button', { name: /Refresh if stale/i })
    .waitFor({ state: 'visible', timeout: 15_000 })
    .catch(() => {});
  await page.getByText('Planning Context Health').scrollIntoViewIfNeeded();
  await sleep(1200);
  await shot(page, 'planning-context-health.png');

  // Clear place-search chrome so AOI/summary shots focus on analysis.
  const clearPlace = page.getByRole('button', { name: /Clear place/i });
  if (await clearPlace.isVisible().catch(() => false)) {
    await clearPlace.click();
    await sleep(400);
  }
  await page.getByRole('tab', { name: 'Planning features' }).click();
  await sleep(400);

  const drawBtn = page.getByRole('button', { name: /^Draw area$/i });
  await waitForVisible(drawBtn);
  await drawBtn.scrollIntoViewIfNeeded();
  await drawBtn.click();
  await sleep(400);

  const map = page.locator('canvas.maplibregl-canvas').first();
  await waitForVisible(map);
  const box = await map.boundingBox();
  if (!box) throw new Error('Map canvas has no bounding box');

  const pts = [
    [box.x + box.width * 0.42, box.y + box.height * 0.42],
    [box.x + box.width * 0.58, box.y + box.height * 0.42],
    [box.x + box.width * 0.58, box.y + box.height * 0.58],
    [box.x + box.width * 0.42, box.y + box.height * 0.58],
  ];
  for (const [x, y] of pts) {
    await page.mouse.click(x, y);
    await sleep(250);
  }

  await page.getByRole('button', { name: /^Complete area$/i }).click();
  await sleep(3500);
  await shot(page, 'generated-context-aoi-analysis.png');

  const summaryBtn = page
    .getByRole('button', {
      name: /Generate (backend|AI|local demo) summary/i,
    })
    .first();
  await waitForVisible(summaryBtn);
  await summaryBtn.click();
  await sleep(3000);
  await shot(page, 'planning-summary-generated-context.png');

  await context.close();
  await browser.close();

  const videos = (await readdir(videoDir)).filter((f) => f.endsWith('.webm'));
  if (videos[0]) {
    const src = path.join(videoDir, videos[0]);
    const webm = path.join(outDir, 'async-build-demo.webm');
    const mp4 = path.join(outDir, 'async-build-demo.mp4');
    await copyFile(src, webm);
    const ff = spawnSync(
      'ffmpeg',
      [
        '-y',
        '-i',
        webm,
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        mp4,
      ],
      { encoding: 'utf8' },
    );
    if (ff.status === 0) {
      console.log('wrote', mp4);
    } else {
      console.warn('ffmpeg failed; kept webm', ff.stderr?.slice(-500));
    }
  } else {
    console.warn('No playwright video found in', videoDir);
  }

  console.log('done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
