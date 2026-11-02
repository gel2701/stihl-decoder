import { test, expect } from '@playwright/test';
import { attachIntegrityGates } from './e2e-gates.js';

test.describe('Phase 4: Intelligent Search & Model Recognition E2E Journeys', () => {

  test('Journey 1: Autocomplete suggestions appear during typing and can be selected via click', async ({ page }) => {
    const gates = attachIntegrityGates(page);
    await page.goto('/');

    const input = page.locator('#code-input');
    const dropdown = page.locator('#search-suggestions-dropdown');

    // Type "MS 26" to trigger suggestions
    await input.fill('MS 26');
    await page.waitForTimeout(300); // debounce 150ms

    await expect(dropdown).toBeVisible({ timeout: 5000 });
    const items = dropdown.locator('.suggestion-item');
    await expect(items).toHaveCount(await items.count());
    expect(await items.count()).toBeGreaterThanOrEqual(2);

    // Click on MS 260 suggestion item
    const ms260Item = dropdown.locator('.suggestion-item', { hasText: 'MS 260' }).first();
    await expect(ms260Item).toBeVisible();
    await ms260Item.click();

    // Model card should be revealed
    const modelCard = page.locator('#model-card');
    await expect(modelCard).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#model-title-display')).toContainText('MS 260');

    // Direct parts section must be rendered
    const directPartsSec = page.locator('#model-direct-parts-section');
    await expect(directPartsSec).toBeVisible();

    gates.assertClean('Autocomplete Click Journey');
  });

  test('Journey 2: Keyboard navigation in autocomplete (ArrowDown + Enter)', async ({ page }) => {
    const gates = attachIntegrityGates(page);
    await page.goto('/');

    const input = page.locator('#code-input');
    const dropdown = page.locator('#search-suggestions-dropdown');

    await input.fill('MS 26');
    await page.waitForTimeout(300);

    await expect(dropdown).toBeVisible({ timeout: 5000 });

    // Press ArrowDown to highlight first item, then press Enter
    await input.press('ArrowDown');
    await input.press('Enter');

    const modelCard = page.locator('#model-card');
    await expect(modelCard).toBeVisible({ timeout: 5000 });

    gates.assertClean('Autocomplete Keyboard Navigation Journey');
  });

  test('Journey 3: Typo recovery (MS 26O -> MS 260) shows typo notice banner and direct parts', async ({ page }) => {
    const gates = attachIntegrityGates(page);
    await page.goto('/');

    const input = page.locator('#code-input');
    const btn = page.locator('#search-btn');

    await input.fill('MS 26O');
    await btn.click();

    const modelCard = page.locator('#model-card');
    await expect(modelCard).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#model-title-display')).toContainText('MS 260');

    const typoNotice = page.locator('#model-typo-notice');
    await expect(typoNotice).toBeVisible();
    await expect(page.locator('#model-typo-notice-text')).toContainText('MS 260');

    // Direct parts for MS 260 should be rendered
    await expect(page.locator('#model-direct-parts-section')).toBeVisible();

    gates.assertClean('Typo Recovery Journey');
  });

  test('Journey 4: Ambiguous query (MS 26) shows disambiguation cards and allows selecting candidate', async ({ page }) => {
    const gates = attachIntegrityGates(page);
    await page.goto('/');

    const input = page.locator('#code-input');
    const btn = page.locator('#search-btn');

    await input.fill('MS 26');
    await btn.click();

    const disambiguationCard = page.locator('#model-disambiguation-card');
    await expect(disambiguationCard).toBeVisible({ timeout: 5000 });

    // Check candidate cards exist
    const candidatesGrid = page.locator('#disambiguation-candidates-grid');
    await expect(candidatesGrid).toBeVisible();
    await expect(candidatesGrid).toContainText('MS 260');
    await expect(candidatesGrid).toContainText('MS 261');

    // Click select button for MS 261
    const ms261Btn = candidatesGrid.locator('.disambiguation-select-btn[data-model="MS 261"]').first();
    await expect(ms261Btn).toBeVisible();
    await ms261Btn.click();

    // Now model card for MS 261 should be displayed
    const modelCard = page.locator('#model-card');
    await expect(modelCard).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#model-title-display')).toContainText('MS 261');

    gates.assertClean('Disambiguation Selection Journey');
  });

  test('Journey 5: Bounded fuzzy suggestion (MS 2500 -> suggests MS 250 in empty state)', async ({ page }) => {
    const gates = attachIntegrityGates(page);
    await page.goto('/');

    const input = page.locator('#code-input');
    const btn = page.locator('#search-btn');

    await input.fill('MS 2500');
    await btn.click();

    const emptyContainer = page.locator('#empty-state-suggestions-container');
    await expect(emptyContainer).toBeVisible({ timeout: 5000 });

    const pill = emptyContainer.locator('.empty-suggestion-pill[data-model="MS 250"]').first();
    await expect(pill).toBeVisible();
    await pill.click();

    // After clicking suggestion, MS 250 model card is shown
    const modelCard = page.locator('#model-card');
    await expect(modelCard).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#model-title-display')).toContainText('MS 250');

    gates.assertClean('Fuzzy Suggestion Journey');
  });

  test('Journey 6: 11-digit part number guard (never matches model or disambiguation)', async ({ page }) => {
    const gates = attachIntegrityGates(page);
    await page.goto('/');

    const input = page.locator('#code-input');
    const btn = page.locator('#search-btn');

    await input.fill('1121 021 0800');
    await btn.click();

    const warningCard = page.locator('#warning-card');
    await expect(warningCard).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#model-disambiguation-card')).toBeHidden();
    await expect(page.locator('#model-card')).toBeHidden();

    gates.assertClean('Part Number Strict Guard Journey');
  });

});
