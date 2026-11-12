import { test, expect } from '@playwright/test';
import { attachIntegrityGates } from './e2e-gates.js';

test.describe('Critical Homepage User Journeys', () => {

  test('A. Homepage laadt met HTTP 200, zonder errors en met kerncontrols', async ({ page }) => {
    const gates = await attachIntegrityGates(page);

    const response = await page.goto('/');
    expect(response?.status()).toBe(200);

    const input = page.locator('#code-input');
    const btn = page.locator('#search-btn');

    await expect(input).toBeVisible();
    await expect(btn).toBeVisible();
    await expect(btn).toHaveText(/Zoeken|Analyseer/);
    expect(await page.locator('script[src*="cdn.tailwindcss.com"]').count()).toBe(0);
    await expect(page.locator('link[rel="stylesheet"][href="/css/tailwind.css"]')).toHaveCount(1);
    const modelRequests = [];
    page.on('request', request => {
      if (request.url().includes('/api/models')) modelRequests.push(request.url());
    });
    await page.reload();
    await page.waitForTimeout(300);
    expect(modelRequests).toHaveLength(0);

    // Wait a brief moment to ensure all async browser modules load completely
    await page.waitForTimeout(500);
    gates.assertClean('Homepage Load');
  });

  test('B. Serienummer analyse via klik op Analyseer toont resultaatkaart', async ({ page }) => {
    const gates = await attachIntegrityGates(page);
    await page.goto('/');

    const input = page.locator('#code-input');
    const btn = page.locator('#search-btn');
    const resultCard = page.locator('#result-card');
    const serialDisplay = page.locator('#res-serial-display');
    const modelDisplay = page.locator('#res-model');

    await input.fill('163118080');
    await btn.click();

    await expect(resultCard).toBeVisible({ timeout: 5000 });
    await expect(serialDisplay).toContainText('163118080'.replace(/(\d)(\d{3})(\d{3})(\d{2})/, '$1 $2 $3 $4'));
    await expect(modelDisplay).toContainText('MS 440-Z');

    gates.assertClean('Serial Click Journey');
  });

  test('C. Serienummer analyse via Enter-toets levert hetzelfde resultaat', async ({ page }) => {
    const gates = await attachIntegrityGates(page);
    await page.goto('/');

    const input = page.locator('#code-input');
    const resultCard = page.locator('#result-card');
    const serialDisplay = page.locator('#res-serial-display');
    const modelDisplay = page.locator('#res-model');

    await input.fill('163118080');
    await input.press('Enter');

    await expect(resultCard).toBeVisible({ timeout: 5000 });
    await expect(serialDisplay).toContainText('1 631 180 80');
    await expect(modelDisplay).toContainText('MS 440-Z');

    gates.assertClean('Serial Enter Journey');
  });

  test('D. Modelnaam analyse toont modelkaart met correcte specificaties', async ({ page }) => {
    const gates = await attachIntegrityGates(page);
    await page.goto('/');

    const input = page.locator('#code-input');
    const btn = page.locator('#search-btn');
    const modelCard = page.locator('#model-card');
    const modelTitle = page.locator('#model-title-display');
    const fuelDisplay = page.locator('#model-card-fuel');

    await input.fill('MS 261 C-M');
    await btn.click();

    await expect(modelCard).toBeVisible({ timeout: 5000 });
    await expect(modelTitle).toContainText('MS 261 C-M');
    await expect(fuelDisplay).toContainText('Benzine');

    gates.assertClean('Model Search Journey');
  });

  test('E. Onderdeelnummer analyse toont waarschuwingskaart en modelgroep', async ({ page }) => {
    const gates = await attachIntegrityGates(page);
    await page.goto('/');

    const input = page.locator('#code-input');
    const btn = page.locator('#search-btn');
    const warningCard = page.locator('#warning-card');
    const partNoDisplay = page.locator('#warn-part-no');
    const modelGroupDisplay = page.locator('#warn-model-group');

    await input.fill('11210210800');
    await btn.click();

    await expect(warningCard).toBeVisible({ timeout: 5000 });
    await expect(partNoDisplay).toContainText('1121 021 0800');
    await expect(modelGroupDisplay).toContainText('MS 260 / 026 familie');

    gates.assertClean('Part Number Journey');
  });

  test('F. Model-only paspoort flow is direct zichtbaar en opslaan zonder serienummer werkt', async ({ page }) => {
    const gates = await attachIntegrityGates(page);
    await page.goto('/');

    const input = page.locator('#code-input');
    const btn = page.locator('#search-btn');
    const modelCard = page.locator('#model-card');
    const passportBtn = page.locator('#model-card-passport-btn');
    const saveModal = page.locator('#save-dossier-modal');
    const confirmCheck = page.locator('#modal-dossier-confirm-check');
    const modalSaveBtn = page.locator('#modal-dossier-save-btn');
    const toast = page.locator('#toast-notification');

    await input.fill('MS 210');
    await btn.click();

    await expect(modelCard).toBeVisible({ timeout: 5000 });
    await expect(passportBtn).toBeVisible();
    await expect(passportBtn).toContainText('Maak machinepaspoort');
    await expect(modelCard).toContainText('Machinepaspoort');

    await passportBtn.click();
    await expect(saveModal).toBeVisible();
    await expect(page.locator('#save-dossier-modal')).toContainText('Serienummer (optioneel)');
    await expect(page.locator('#save-dossier-modal')).toContainText('Je kunt het serienummer later toevoegen.');

    await confirmCheck.check();
    await modalSaveBtn.click();

    await expect(saveModal).toBeHidden();
    await expect(toast).toBeVisible();
    await expect(toast).toContainText('Machinepaspoort aangemaakt');
    await expect(toast).toContainText('Bekijk machinepaspoort');

    gates.assertClean('Model-Only Passport Creation Journey');
  });

  test('G. Fase 3: Directe onderdelensectie toont direct bruikbare onderdelen voor gevonden model', async ({ page }) => {
    const gates = await attachIntegrityGates(page);
    await page.goto('/');

    const input = page.locator('#code-input');
    const btn = page.locator('#search-btn');
    const directPartsSection = page.locator('#model-direct-parts-section');
    const directPartsTitle = page.locator('#model-direct-parts-title-model');
    const directPartsGrid = page.locator('#model-direct-parts-grid');
    const allPartsBtn = page.locator('#model-direct-parts-all-btn');

    await input.fill('MS 260');
    await btn.click();

    await expect(directPartsSection).toBeVisible({ timeout: 5000 });
    await expect(directPartsTitle).toContainText('MS 260');
    await expect(directPartsGrid).toBeVisible();

    // Must show compact parts cards
    const cards = directPartsGrid.locator('> div');
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(4);

    // Check first card details
    const firstCard = cards.first();
    await expect(firstCard).toContainText('Bevestigde compatibiliteit');
    await expect(firstCard).not.toContainText('Gegarandeerd passend');
    await expect(firstCard.locator('a[href^="/onderdeelnummer/"]')).toBeVisible();

    // Bottom CTA: Bekijk alle onderdelen voor MS 260
    await expect(allPartsBtn).toBeVisible();
    await expect(allPartsBtn).toHaveAttribute('href', '/kettingzagen/ms-260/onderdelen/');

    gates.assertClean('Phase 3 Direct Parts Journey');
  });

  test('H. Machinepaspoort is direct zichtbaar en de PNG-export werkt zonder serienummer', async ({ page }) => {
    const gates = await attachIntegrityGates(page);

    // Deterministic QR image so the canvas export never depends on a third party
    const qrPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    await page.context().route(/api\.qrserver\.com/, route => route.fulfill({
      status: 200,
      contentType: 'image/png',
      headers: { 'access-control-allow-origin': '*' },
      body: qrPng
    }));

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    const passportCard = page.locator('#tab-intent-passport');
    await expect(passportCard).toBeVisible();
    await expect(passportCard).toContainText('Gratis STIHL Machinepaspoort');
    await expect(passportCard).toContainText('Ook zonder serienummer');
    await expect(passportCard).toContainText('Maak gratis Machinepaspoort');
    await expect(passportCard).toHaveAttribute('href', '/stihl-paspoort/#nieuw');
    await expect(page.locator('#tab-intent-partno')).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(passportCard).toBeVisible();
    await expect(passportCard).toContainText('Maak gratis Machinepaspoort');

    await passportCard.click();
    await page.waitForURL('**/stihl-paspoort/**');
    await expect(page.locator('#btn-open-create-modal')).toBeVisible();
    await expect(page.locator('#modal-add')).toBeVisible();

    await page.selectOption('#select-model', 'ms-440');
    await page.check('#check-confirm-model');
    await page.click('#form-add-machine button[type="submit"]');

    const passportBtn = page.locator('#dossier-grid button', { hasText: 'Paspoort bekijken' }).first();
    await expect(passportBtn).toBeVisible();
    await passportBtn.click();

    await expect(page.locator('#modal-passport')).toBeVisible();
    await expect(page.locator('#passport-preview-container')).toContainText('Nog niet toegevoegd');
    await expect(page.locator('#check-show-serial-export')).not.toBeChecked();

    const downloadPromise = page.waitForEvent('download', { timeout: 20000 });
    await page.click('#btn-download-passport');
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^STIHL_Machinepaspoort_ms-440_\d{4}-\d{2}-\d{2}\.png$/);

    gates.assertClean('Phase 79 Passport Journey');
  });

});
