import { test, expect } from '@playwright/test';
import { attachIntegrityGates } from './e2e-gates.js';

test.describe('Phase 5 — Intelligent Parts Search E2E Journeys', () => {

  test('1. Central Parts Discovery hub (/onderdelen/) loads cleanly with curated categories', async ({ page }) => {
    const gates = attachIntegrityGates(page);
    const response = await page.goto('/onderdelen/');
    expect(response?.status()).toBe(200);

    const heading = page.locator('h1');
    await expect(heading).toContainText('STIHL Onderdelen Zoeken');

    const catHeading = page.locator('text=Populaire Onderdelengroepen');
    await expect(catHeading).toBeVisible();

    const searchInput = page.locator('#parts-query-input');
    await expect(searchInput).toBeVisible();

    await page.waitForTimeout(200);
    gates.assertClean('Central Parts Discovery Hub');
  });

  test('2. Exact Part Number Search displays exact match card with Bevestigde compatibiliteit', async ({ page }) => {
    const gates = attachIntegrityGates(page);
    const response = await page.goto('/onderdelen/?q=1123+160+2050');
    expect(response?.status()).toBe(200);

    const banner = page.locator('text=Exacte Onderdeelnummer Match');
    await expect(banner).toBeVisible();

    const partNo = page.locator('text=STIHL 1123 160 2050');
    await expect(partNo).toBeVisible();

    const badge = page.locator('text=Bevestigde compatibiliteit');
    await expect(badge.first()).toBeVisible();

    const detailLink = page.locator('a[href="/onderdeelnummer/11231602050/"]');
    await expect(detailLink.first()).toBeVisible();

    await page.waitForTimeout(200);
    gates.assertClean('Exact Part Number Search');
  });

  test('3. Superseded Part Number displays replacement alert banner', async ({ page }) => {
    const gates = attachIntegrityGates(page);
    const response = await page.goto('/onderdelen/?q=4203+400+1301');
    expect(response?.status()).toBe(200);

    const alertBanner = page.locator('text=Onderdeelvervanging Geverifieerd');
    await expect(alertBanner).toBeVisible();

    const replacementNotice = page.locator('text=4203 400 1302');
    await expect(replacementNotice.first()).toBeVisible();

    await page.waitForTimeout(200);
    gates.assertClean('Superseded Part Alert Banner');
  });

  test('4. Text component search with machine type filter displays filtered table', async ({ page }) => {
    const gates = attachIntegrityGates(page);
    const response = await page.goto('/onderdelen/?q=luchtfilter&machine_type=kettingzagen');
    expect(response?.status()).toBe(200);

    const filterBar = page.locator('text=⚡ Filters');
    await expect(filterBar).toBeVisible();

    const resultsCount = page.locator('text=Tekstzoekresultaten');
    await expect(resultsCount).toBeVisible();

    // Verify clear filters link is present
    const clearFilters = page.locator('text=Wis filters');
    await expect(clearFilters).toBeVisible();

    await page.waitForTimeout(200);
    gates.assertClean('Filtered Text Search');
  });

  test('5. REST API /api/parts-search endpoint returns structured JSON with facets', async ({ page, request }) => {
    const res = await request.get('/api/parts-search?q=carburateur&machine_type=kettingzagen');
    expect(res.status()).toBe(200);

    const data = await res.json();
    expect(data.query).toBe('carburateur');
    expect(data.total_matches).toBeGreaterThan(0);
    expect(Array.isArray(data.results)).toBe(true);
    expect(data.results.length).toBeGreaterThan(0);

    // Verify result card structure
    const first = data.results[0];
    expect(first.part_number).toBeDefined();
    expect(first.compatibility_badge).toBe('✓ Bevestigde compatibiliteit');
    expect(first.origin_type).toBe('OEM-referentie');
    expect(first.purchase_offer).toBeDefined();

    // Verify available filters facets
    expect(data.available_filters).toBeDefined();
    expect(Array.isArray(data.available_filters.categories)).toBe(true);
  });

});
