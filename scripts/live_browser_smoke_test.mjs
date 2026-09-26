/**
 * PERMANENT POST-DEPLOY LIVE BROWSER SMOKE TEST
 *
 * Runs against live production (default: https://www.stihldecoder.nl) or a specified TARGET_URL.
 * Validates the live user experience using Chromium:
 * - /api/version health and commit SHA
 * - Module HTTP accessibility (publicEvidence.js: 200, plantResolver.js: 200, decoder.js: 404)
 * - Homepage DOM integrity and zero unhandled JS errors
 * - Serial analyze click journey (163118080 -> MS 440-Z)
 * - Serial analyze Enter-key journey (163118080)
 * - Model search journey (MS 261 C-M)
 * - Part number search journey (11210210800)
 */

import { chromium } from '@playwright/test';

const TARGET_URL = (process.env.TARGET_URL || process.argv[2] || 'https://www.stihldecoder.nl').replace(/\/$/, '');

async function runLiveSmoke() {
  console.log('===============================================================');
  console.log(`🌐 EXECUTING LIVE POST-DEPLOY BROWSER SMOKE TEST`);
  console.log(`   Target: ${TARGET_URL}`);
  console.log('===============================================================\n');

  // 1. Version API Check
  console.log('▶ Step 1: Querying live /api/version...');
  const verRes = await fetch(`${TARGET_URL}/api/version`);
  if (!verRes.ok) {
    throw new Error(`Failed to fetch /api/version: HTTP ${verRes.status}`);
  }
  const versionData = await verRes.json();
  console.log(`  ✅ Live version verified: commit ${versionData.commit} (${versionData.environment})`);

  // 2. Direct Module Status Checks
  console.log('\n▶ Step 2: Verifying critical client module HTTP statuses...');
  const moduleChecks = [
    { path: '/src/publicEvidence.js', expected: 200 },
    { path: '/src/plantResolver.js', expected: 200 },
    { path: '/src/decoder.js', expected: 404 }
  ];

  for (const check of moduleChecks) {
    const res = await fetch(`${TARGET_URL}${check.path}`);
    if (res.status !== check.expected) {
      throw new Error(`Module check failed for ${check.path}: expected HTTP ${check.expected}, got ${res.status}`);
    }
    console.log(`  ✅ ${check.path} -> HTTP ${res.status} (as expected)`);
  }

  // 3. Launch Chromium Browser for Real User Journey Tests
  console.log('\n▶ Step 3: Launching Chromium browser for user journey validation...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const pageErrors = [];
  const consoleErrors = [];

  page.on('pageerror', err => {
    pageErrors.push(err.message || String(err));
  });

  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  try {
    // A. Homepage Load
    console.log('\n▶ Step 4: Loading homepage and checking DOM integrity...');
    const navRes = await page.goto(`${TARGET_URL}/`);
    if (!navRes || navRes.status() !== 200) {
      throw new Error(`Homepage returned HTTP ${navRes?.status()}`);
    }

    const input = page.locator('#code-input');
    const btn = page.locator('#search-btn');
    await input.waitFor({ state: 'visible', timeout: 5000 });
    await btn.waitFor({ state: 'visible', timeout: 5000 });
    await page.waitForTimeout(500);

    if (pageErrors.length > 0) {
      throw new Error(`Page errors detected during homepage load: ${pageErrors.join('; ')}`);
    }
    console.log('  ✅ Homepage loaded cleanly (HTTP 200, zero page errors).');

    // B. Serial Number Click Journey (163118080)
    console.log('\n▶ Step 5: Testing Serial Number Click Journey (163118080)...');
    await input.fill('163118080');
    await btn.click();

    const resultCard = page.locator('#result-card');
    await resultCard.waitFor({ state: 'visible', timeout: 7000 });

    const serialText = await page.locator('#res-serial-display').innerText();
    const modelText = await page.locator('#res-model').innerText();

    if (!serialText.replace(/\s+/g, '').includes('163118080')) {
      throw new Error(`Expected serial display to contain 163118080, got "${serialText}"`);
    }
    if (!modelText.includes('MS 440')) {
      throw new Error(`Expected model display to contain MS 440, got "${modelText}"`);
    }
    console.log(`  ✅ Serial click test passed! (${serialText.trim()} -> ${modelText.trim()})`);

    // C. Model Search Journey (MS 261 C-M)
    console.log('\n▶ Step 6: Testing Model Search Journey (MS 261 C-M)...');
    await input.fill('MS 261 C-M');
    await btn.click();

    const modelCard = page.locator('#model-card');
    await modelCard.waitFor({ state: 'visible', timeout: 7000 });

    const modelTitle = await page.locator('#model-title-display').innerText();
    if (!modelTitle.includes('MS 261')) {
      throw new Error(`Expected model title to contain MS 261, got "${modelTitle}"`);
    }
    console.log(`  ✅ Model search test passed! (${modelTitle.trim()})`);

    // D. Part Number Search Journey (11210210800)
    console.log('\n▶ Step 7: Testing Part Number Search Journey (11210210800)...');
    await input.fill('11210210800');
    await btn.click();

    const warningCard = page.locator('#warning-card');
    await warningCard.waitFor({ state: 'visible', timeout: 7000 });

    const partNo = await page.locator('#warn-part-no').innerText();
    if (!partNo.includes('1121')) {
      throw new Error(`Expected warning part no to contain 1121, got "${partNo}"`);
    }
    console.log(`  ✅ Part number search test passed! (${partNo.trim()})`);

    // E. Enter Key Journey (163118080)
    console.log('\n▶ Step 8: Testing Serial Enter-Key Journey (163118080)...');
    await input.fill('163118080');
    await input.press('Enter');

    await resultCard.waitFor({ state: 'visible', timeout: 7000 });
    const enterSerial = await page.locator('#res-serial-display').innerText();
    if (!enterSerial.replace(/\s+/g, '').includes('163118080')) {
      throw new Error(`Enter key failed to render serial: "${enterSerial}"`);
    }
    console.log(`  ✅ Enter key test passed! (${enterSerial.trim()})`);

    console.log('\n===============================================================');
    console.log('🎉 ALL LIVE BROWSER SMOKE TESTS PASSED 100% CLEANLY!');
    console.log('===============================================================');
  } finally {
    await browser.close();
  }
}

runLiveSmoke().catch(err => {
  console.error('\n❌ LIVE BROWSER SMOKE TEST FAILED:', err);
  process.exit(1);
});
