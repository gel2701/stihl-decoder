import { test, expect } from '@playwright/test';
import { attachIntegrityGates } from './e2e-gates.js';

test.describe('Phase 91 Model Recovery & Machine Passport Journeys', () => {
  test('023, Stihl 023, 025 C and MS 250 C-BE decode cleanly on homepage without errors', async ({ page }) => {
    const gates = await attachIntegrityGates(page);
    await page.goto('/');

    const input = page.locator('#code-input');
    const btn = page.locator('#search-btn');

    await input.fill('023');
    await btn.click();
    await expect(page.locator('#model-title-display')).toContainText('023');
    await expect(page.locator('#model-spec-disp')).toContainText('40.2 cc');

    await input.fill('Stihl 023');
    await btn.click();
    await expect(page.locator('#model-title-display')).toContainText('023');

    await input.fill('025 C');
    await btn.click();
    await expect(page.locator('#model-title-display')).toContainText('025');
    await expect(page.locator('#model-title-display')).toContainText('025 C');
    await expect(page.locator('#model-typo-notice')).toBeVisible();

    await input.fill('MS 250 C-BE');
    await btn.click();
    await expect(page.locator('#model-title-display')).toContainText('MS 250');

    gates.assertClean('Phase 91 Homepage Model Decode');
  });

  test('Recovered model page and parts page render cleanly', async ({ page }) => {
    const gates = await attachIntegrityGates(page);
    const resModel = await page.goto('/kettingzagen/023/');
    expect(resModel?.status()).toBe(200);
    await expect(page.locator('h1')).toContainText('STIHL 023');

    const resParts = await page.goto('/kettingzagen/023/onderdelen/');
    expect(resParts?.status()).toBe(200);
    await expect(page.locator('h1')).toContainText('023');

    gates.assertClean('Phase 91 Recovered Pages');
  });

  test('Create machine passport without serial, generate shareable URL + QR, and view public passport', async ({ page }) => {
    const gates = await attachIntegrityGates(page);
    await page.goto('/stihl-paspoort/');

    const cookieReject = page.locator('#cookie-consent-banner button', { hasText: /Weiger|Sluit|Accepteren/i }).first();
    if (await cookieReject.isVisible({ timeout: 500 }).catch(() => false)) {
      await cookieReject.click();
    }

    await page.locator('#btn-open-add').click();
    await expect(page.locator('#modal-add')).toBeVisible();

    await page.locator('#search-model-input').fill('025');
    await page.locator('#select-model').selectOption('025');
    await page.locator('#input-variant').fill('025 C');
    await page.locator('#select-condition').selectOption('Goed');
    await page.locator('#input-nickname').fill('Zaag schuur');
    await page.locator('#input-purchase-year').fill('1998');
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    await page.locator('#input-photos').setInputFiles({
      name: 'saw.png',
      mimeType: 'image/png',
      buffer: Buffer.from(pngBase64, 'base64')
    });
    await expect(page.locator('#photo-preview-strip img')).toHaveCount(1);

    await page.locator('#check-confirm-model').check();
    await page.locator('#form-add-machine button[type="submit"]').click();

    await expect(page.locator('#dossier-grid')).toContainText('025');

    // Edit machine & test cancel-edit state isolation
    await page.locator('#dossier-grid button', { hasText: /Dossier/i }).first().click();
    await expect(page.locator('#modal-detail')).toBeVisible();
    await page.locator('#btn-detail-edit-machine').click();
    await expect(page.locator('#modal-add')).toBeVisible();
    await page.locator('#select-condition').selectOption('Nieuwstaat');
    await page.locator('#input-nickname').fill('Zaag schuur bijgewerkt');
    await page.locator('#form-add-machine button[type="submit"]').click();
    await expect(page.locator('#dossier-grid')).toContainText('Zaag schuur bijgewerkt');

    // Open passport modal & verify inline QR SVG + publish shareable passport
    await page.locator('#dossier-grid button', { hasText: /paspoort/i }).first().click();
    await expect(page.locator('#modal-passport')).toBeVisible();
    await expect(page.locator('#passport-preview-container svg')).toBeVisible();

    await page.locator('#btn-share-passport').click();
    const shareLink = page.locator('#passport-share-link');
    await expect(shareLink).toBeVisible({ timeout: 5000 });
    const href = await shareLink.getAttribute('href');
    expect(href).toMatch(/^\/paspoort\/p[a-z0-9]+\/$/);

    await page.setViewportSize({ width: 390, height: 844 });
    const shareResp = await page.goto(href);
    expect(shareResp?.status()).toBe(200);
    await expect(page.locator('h1')).toContainText('STIHL 025 (025 C)');
    await expect(page.locator('main')).toContainText('SERIAL_UNVERIFIED');
    await expect(page.locator('main')).toContainText('Nieuwstaat');
    await expect(page.locator('main svg').first()).toBeVisible();
    await expect(page.locator('main img').first()).toBeVisible();
    const overflowX = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflowX).toBe(false);

    gates.assertClean('Phase 91 Shareable Passport Journey');
  });
  test('Mobile passport form scrolls to the save action on a short touchscreen viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 640 });
    await page.goto('/stihl-paspoort/');
    const cookieReject = page.locator('#cookie-consent-banner button', { hasText: /Weiger|Sluit|Accepteren/i }).first();
    if (await cookieReject.isVisible({ timeout: 500 }).catch(() => false)) await cookieReject.click();

    await page.locator('#btn-open-add').click();
    const modal = page.locator('#modal-add');
    await expect(modal).toBeVisible();

    const scrollRegion = modal.locator('> div');
    const before = await scrollRegion.evaluate(el => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      top: el.getBoundingClientRect().top
    }));
    expect(before.scrollHeight).toBeGreaterThan(before.clientHeight);
    expect(before.top).toBeGreaterThanOrEqual(0);

    await scrollRegion.evaluate(el => { el.scrollTop = el.scrollHeight; });
    const after = await scrollRegion.evaluate(el => ({
      scrollTop: el.scrollTop,
      bottom: el.getBoundingClientRect().bottom
    }));
    expect(after.scrollTop).toBeGreaterThan(0);
    expect(after.bottom).toBeLessThanOrEqual(640);
    await expect(page.locator('#form-add-machine button[type="submit"]')).toBeInViewport();

    await page.locator('#select-model').selectOption('ms-260');
    await page.locator('#check-confirm-model').check();
    await page.locator('#form-add-machine button[type="submit"]').click();
    await expect(page.locator('#dossier-grid')).toContainText('MS 260');
  });

});
