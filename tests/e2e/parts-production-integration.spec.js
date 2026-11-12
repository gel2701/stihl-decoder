import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { attachIntegrityGates } from './e2e-gates.js';

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), '..', '..');
const registryDoc = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'data', 'affiliate', 'verified_amazon_registry.json'), 'utf8')
);

const activeOffer = (partNumber, marketplace) => registryDoc.offers.find(
  offer => offer.status === 'ACTIVE' &&
    String(offer.part_number) === partNumber &&
    String(offer.marketplace || 'amazon.nl').toLowerCase() === marketplace
);

test.describe('Phase 52C — Parts Production Integration Journeys', () => {

  test('1. Homepage Part Number Search shows enriched part warning card and compatible models', async ({ page }) => {
    const gates = await attachIntegrityGates(page);
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
    const gates = await attachIntegrityGates(page);
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
    const gates = await attachIntegrityGates(page);
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
    const gates = await attachIntegrityGates(page);
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
    const gates = await attachIntegrityGates(page);
    const response = await page.goto('/onderdeelnummer/99999999999/');
    expect(response?.status()).toBe(200);

    const msg = page.locator('text=niet opgenomen in de canonieke onderdelendatabase');
    await expect(msg).toBeVisible();

    await page.waitForTimeout(300);
    gates.assertClean('Unknown Part Fail-Closed');
  });

  test('6. Zero External Scraping Requests during parts browsing', async ({ page }) => {
    await attachIntegrityGates(page);
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

  test('7. Phase 79B — direct Amazon buy button sits above the full model list', async ({ page }) => {
    const gates = await attachIntegrityGates(page);
    const offer = activeOffer('11104007005', 'amazon.nl');
    expect(offer).toBeTruthy();

    const response = await page.goto('/onderdeelnummer/11104007005/');
    expect(response?.status()).toBe(200);

    const buyButton = page.locator(
      'a[data-part-number="11104007005"][data-offer-type="MANUAL_ASIN"][data-marketplace="amazon.nl"]'
    ).first();
    await expect(buyButton).toBeVisible();
    const href = await buyButton.getAttribute('href');
    expect(href).toContain(offer.asin);
    expect(href).toContain(`tag=${offer.affiliate_tag}`);
    await expect(buyButton).toHaveAttribute('rel', /sponsored/);

    await expect(page.locator('text=Controleer compatibiliteit vóór aankoop').first()).toBeVisible();
    await expect(page.locator('#geschikte-modellen')).toBeAttached();

    const buyBox = await buyButton.boundingBox();
    const modelsBox = await page.locator('#geschikte-modellen').boundingBox();
    expect(buyBox.y).toBeLessThan(modelsBox.y);

    await page.waitForTimeout(300);
    gates.assertClean('Phase 79B Buy Button Order');
  });

  test('8. Phase 79B — buy button is visible without scrolling on a mobile viewport', async ({ page }) => {
    const gates = await attachIntegrityGates(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/onderdeelnummer/11104007005/');

    const buyButton = page.locator('a[data-part-number="11104007005"][data-offer-type="MANUAL_ASIN"]').first();
    await expect(buyButton).toBeVisible();

    const buyBox = await buyButton.boundingBox();
    expect(buyBox.y).toBeLessThan(844);
    expect(buyBox.width).toBeGreaterThan(280);

    await page.waitForTimeout(300);
    gates.assertClean('Phase 79B Mobile Buy Button');
  });

  test('9. Phase 79B — Amazon.de only part links to the German marketplace with the DE tag', async ({ page }) => {
    const gates = await attachIntegrityGates(page);
    const offer = activeOffer('30050003905', 'amazon.de');
    expect(offer).toBeTruthy();

    await page.goto('/onderdeelnummer/30050003905/');

    const deButton = page.locator(
      'a[data-part-number="30050003905"][data-offer-type="MANUAL_ASIN"][data-marketplace="amazon.de"]'
    ).first();
    await expect(deButton).toBeVisible();
    const href = await deButton.getAttribute('href');
    expect(href).toContain(offer.asin);
    expect(href).toContain(`tag=${offer.affiliate_tag}`);

    await page.waitForTimeout(300);
    gates.assertClean('Phase 79B Amazon.de Buy Button');
  });

  test('10. Phase 79B — both marketplaces are offered when both are verified', async ({ page }) => {
    const gates = await attachIntegrityGates(page);
    const nlOffer = activeOffer('11301240800', 'amazon.nl');
    const deOffer = activeOffer('11301240800', 'amazon.de');
    expect(nlOffer && deOffer).toBeTruthy();

    await page.goto('/onderdeelnummer/11301240800/');

    const nlButton = page.locator('a[data-marketplace="amazon.nl"][data-offer-type="MANUAL_ASIN"]').first();
    const deButton = page.locator('a[data-marketplace="amazon.de"][data-offer-type="MANUAL_ASIN"]').first();
    await expect(nlButton).toBeVisible();
    await expect(deButton).toBeVisible();

    const nlHref = await nlButton.getAttribute('href');
    const deHref = await deButton.getAttribute('href');
    expect(nlHref).toContain(`tag=${nlOffer.affiliate_tag}`);
    expect(deHref).toContain(`tag=${deOffer.affiliate_tag}`);

    await page.waitForTimeout(300);
    gates.assertClean('Phase 79B Both Marketplaces');
  });

});
