import { test, expect } from '@playwright/test';
import { attachIntegrityGates } from './e2e-gates.js';

test.describe('Phase 52C — Parts Production Integration Journeys', () => {

  test('1. Homepage Part Number Search shows enriched part warning card and compatible models', async ({ page }) => {
    const gates = attachIntegrityGates(page);
    await page.goto('/');

    const input = page.locator('#code-input');
    const btn = page.locator('#search-btn');
    const warningCard = page.locator('#warning-card');
    const partNoDisplay = page.locator('#warn-part-no');
    const partNameDisplay = page.locator('#warn-part-name');
    const modelGroupDisplay = page.locator('#warn-model-group');

    await input.fill('1121 007 1001');
    await btn.click();

    await expect(warningCard).toBeVisible({ timeout: 5000 });
    await expect(partNoDisplay).toContainText('1121 007 1001');
    await expect(modelGroupDisplay).toContainText('MS 260 / 026 familie');

    await page.waitForTimeout(300);
    gates.assertClean('Homepage Part Search');
  });

  test('2. Model Parts Page (/kettingzagen/ms-261/onderdelen/) loads with canonical catalog table', async ({ page }) => {
    const gates = attachIntegrityGates(page);
    const response = await page.goto('/kettingzagen/ms-261/onderdelen/');
    expect(response?.status()).toBe(200);

    const heading = page.locator('h1');
    await expect(heading).toContainText('STIHL MS 261 Onderdelen');

    const canonicalSection = page.locator('text=Canonieke Onderdelencatalogus');
    await expect(canonicalSection).toBeVisible();

    const partsTable = page.locator('table');
    await expect(partsTable.first()).toBeVisible();

    await page.waitForTimeout(300);
    gates.assertClean('Model Parts Page MS 261');
  });

  test('3. Model with multiple configurations allows filtering without error', async ({ page }) => {
    const gates = attachIntegrityGates(page);
    const response = await page.goto('/kettingzagen/ms-261/onderdelen/?config=vw');
    expect(response?.status()).toBe(200);

    const heading = page.locator('h1');
    await expect(heading).toContainText('MS 261');

    const configSection = page.locator('text=Beschikbare Uitvoeringen');
    await expect(configSection).toBeVisible();

    await page.waitForTimeout(300);
    gates.assertClean('Model Parts Config MS 261');
  });

  test('4. Dedicated Part Detail Page (/onderdeelnummer/11210071001/) loads with noindex and compatible models', async ({ page }) => {
    const gates = attachIntegrityGates(page);
    const response = await page.goto('/onderdeelnummer/11210071001/');
    expect(response?.status()).toBe(200);

    const metaRobots = page.locator('meta[name="robots"]');
    await expect(metaRobots).toHaveAttribute('content', /noindex/);

    const title = page.locator('h1');
    await expect(title).toContainText('1121 007 1001');

    const modelsSection = page.locator('text=Geschikte STIHL Modellen');
    await expect(modelsSection).toBeVisible();

    await page.waitForTimeout(300);
    gates.assertClean('Part Detail Page 11210071001');
  });

  test('5. Unknown Part Number (/onderdeelnummer/99999999999/) returns clean fail-closed view', async ({ page }) => {
    const gates = attachIntegrityGates(page);
    const response = await page.goto('/onderdeelnummer/99999999999/');
    expect(response?.status()).toBe(200);

    const msg = page.locator('text=niet opgenomen in de canonieke onderdelendatabase');
    await expect(msg).toBeVisible();

    await page.waitForTimeout(300);
    gates.assertClean('Unknown Part Fail-Closed');
  });

  test('6. Zero External Scraping Requests during parts browsing', async ({ page }) => {
    const externalRequests = [];
    page.on('request', req => {
      const u = req.url();
      if (u.includes('sparepartsworld') || u.includes('diyspareparts') || u.includes('partstree') || u.includes('lsengineers')) {
        externalRequests.push(u);
      }
    });

    await page.goto('/');
    await page.goto('/kettingzagen/ms-261/onderdelen/');
    await page.goto('/onderdeelnummer/11210071001/');

    expect(externalRequests.length).toBe(0);
  });

});
