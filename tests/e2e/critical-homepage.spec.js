import { test, expect } from '@playwright/test';
import { attachIntegrityGates } from './e2e-gates.js';

test.describe('Critical Homepage User Journeys', () => {

  test('A. Homepage laadt met HTTP 200, zonder errors en met kerncontrols', async ({ page }) => {
    const gates = attachIntegrityGates(page);

    const response = await page.goto('/');
    expect(response?.status()).toBe(200);

    const input = page.locator('#code-input');
    const btn = page.locator('#search-btn');

    await expect(input).toBeVisible();
    await expect(btn).toBeVisible();
    await expect(btn).toHaveText(/Analyseer/);

    // Wait a brief moment to ensure all async browser modules load completely
    await page.waitForTimeout(500);
    gates.assertClean('Homepage Load');
  });

  test('B. Serienummer analyse via klik op Analyseer toont resultaatkaart', async ({ page }) => {
    const gates = attachIntegrityGates(page);
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
    const gates = attachIntegrityGates(page);
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
    const gates = attachIntegrityGates(page);
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
    const gates = attachIntegrityGates(page);
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

});
