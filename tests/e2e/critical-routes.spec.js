import { test, expect } from '@playwright/test';
import { attachIntegrityGates } from './e2e-gates.js';

test.describe('Critical Route User Journeys', () => {

  test('1. Paspoortpagina (/stihl-paspoort/) laadt met HTTP 200 en zero JS errors', async ({ page }) => {
    const gates = attachIntegrityGates(page);
    const response = await page.goto('/stihl-paspoort/');
    expect(response?.status()).toBe(200);

    const h1 = page.locator('h1');
    await expect(h1).toBeVisible();
    await expect(h1).toContainText(/Paspoort/i);

    // Verify passport interactive elements exist
    const createBtn = page.locator('#btn-open-create-modal, #input-serial');
    await expect(createBtn.first()).toBeAttached();

    await page.waitForTimeout(500);
    gates.assertClean('Passport Page');
  });

  test('2. Modelpagina (/kettingzagen/ms-261/) laadt met HTTP 200 en toont modeltitel', async ({ page }) => {
    const gates = attachIntegrityGates(page);
    const response = await page.goto('/kettingzagen/ms-261/');
    expect(response?.status()).toBe(200);

    const h1 = page.locator('h1');
    await expect(h1).toBeVisible();
    await expect(h1).toContainText('MS 261');

    await page.waitForTimeout(500);
    gates.assertClean('Model MS 261 Page');
  });

  test('3. Onderdelenpagina (/kettingzagen/ms-261/onderdelen/) laadt met HTTP 200', async ({ page }) => {
    const gates = attachIntegrityGates(page);
    const response = await page.goto('/kettingzagen/ms-261/onderdelen/');
    expect(response?.status()).toBe(200);

    const h1 = page.locator('h1');
    await expect(h1).toBeVisible();
    await expect(h1).toContainText(/onderdelen/i);

    await page.waitForTimeout(500);
    gates.assertClean('Model Parts MS 261 Page');
  });

  test('4. Gidspagina (/gidsen/serienummer-locaties/) laadt met inhoud', async ({ page }) => {
    const gates = attachIntegrityGates(page);
    const response = await page.goto('/gidsen/serienummer-locaties/');
    expect(response?.status()).toBe(200);

    const h1 = page.locator('h1');
    await expect(h1).toBeVisible();
    await expect(h1).toContainText(/serienummer/i);

    // Verify substantive content is visible
    const article = page.locator('article, main, .prose');
    await expect(article.first()).toBeVisible();

    await page.waitForTimeout(500);
    gates.assertClean('Serial Location Guide');
  });

  test('5. Accumachine (/bosmaaiers/fsa-45/) bevat zero benzine- of M-Tronic content', async ({ page }) => {
    const gates = attachIntegrityGates(page);
    const response = await page.goto('/bosmaaiers/fsa-45/');
    expect(response?.status()).toBe(200);

    const bodyText = (await page.textContent('body') || '').toLowerCase();
    expect(bodyText).toContain('fsa 45');

    // Strict battery context invariants
    expect(bodyText).not.toContain('carburateur');
    expect(bodyText).not.toContain('brandstoftank');
    expect(bodyText).not.toContain('m-tronic');

    // Verify parts page for battery machine also maintains drive context safety
    const partsResponse = await page.goto('/bosmaaiers/fsa-45/onderdelen/');
    expect(partsResponse?.status()).toBe(200);

    const partsBodyText = (await page.textContent('body') || '').toLowerCase();
    expect(partsBodyText).not.toContain('carburateur');
    expect(partsBodyText).not.toContain('brandstoftank');
    expect(partsBodyText).not.toContain('m-tronic');
    expect(partsBodyText).not.toContain('bougie');

    await page.waitForTimeout(500);
    gates.assertClean('Battery Machine FSA 45');
  });

  test('6. Security Invariant: /src/decoder.js retourneert HTTP 404', async ({ request }) => {
    const response = await request.get('/src/decoder.js');
    expect(response.status()).toBe(404);
  });

});
