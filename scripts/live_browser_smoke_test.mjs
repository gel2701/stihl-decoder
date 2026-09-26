/**
 * PERMANENT POST-DEPLOY LIVE BROWSER SMOKE TEST (FAIL-CLOSED)
 *
 * Runs against live production (default: https://www.stihldecoder.nl) or a specified TARGET_URL.
 * Validates the live user experience using Chromium:
 * - /api/version health and commit SHA (with optional EXPECTED_COMMIT validation)
 * - Module HTTP accessibility (publicEvidence.js: 200, plantResolver.js: 200, decoder.js: 404)
 * - Browser integrity gates: zero page errors, zero console errors, zero failed own-origin requests
 * - Homepage DOM integrity (#code-input, #search-btn)
 * - Serial analyze click journey (163118080 -> MS 440-Z)
 * - Model search journey (MS 261 C-M)
 * - Part number search journey (11210210800)
 * - Serial analyze Enter-key journey (163118080)
 */

import { chromium } from '@playwright/test';

const TARGET_URL = (process.env.TARGET_URL || process.argv[2] || 'https://www.stihldecoder.nl').replace(/\/$/, '');
const targetOrigin = new URL(TARGET_URL).origin;

async function runLiveSmoke() {
  console.log('===============================================================');
  console.log(`🌐 EXECUTING LIVE POST-DEPLOY BROWSER SMOKE TEST (FAIL-CLOSED)`);
  console.log(`   Target Origin: ${targetOrigin}`);
  if (process.env.EXPECTED_COMMIT) {
    console.log(`   Enforcing EXPECTED_COMMIT: ${process.env.EXPECTED_COMMIT}`);
  }
  console.log('===============================================================\n');

  // 1. Version API Check & Commit Verification
  console.log('▶ Step 1: Querying live /api/version and verifying commit...');
  const verRes = await fetch(`${TARGET_URL}/api/version`);
  if (!verRes.ok) {
    throw new Error(`Failed to fetch /api/version: HTTP ${verRes.status}`);
  }
  const versionData = await verRes.json();

  if (typeof versionData.commit !== 'string' || !/^[0-9a-f]{7,40}$/i.test(versionData.commit)) {
    throw new Error(`Invalid or missing commit SHA in /api/version: "${versionData.commit}"`);
  }

  if (process.env.EXPECTED_COMMIT) {
    if (versionData.commit !== process.env.EXPECTED_COMMIT) {
      throw new Error(`Commit mismatch! Expected ${process.env.EXPECTED_COMMIT}, but live site reports ${versionData.commit}`);
    }
    console.log(`  ✅ Live version verified: exact expected commit ${versionData.commit} (${versionData.environment})`);
  } else {
    console.log(`  ✅ Live version verified: valid commit SHA ${versionData.commit} (${versionData.environment})`);
  }

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
  console.log('\n▶ Step 3: Launching Chromium browser with strict fail-closed integrity gates...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const pageErrors = [];
  const consoleErrors = [];
  const failedRequests = [];

  function isOwnOrigin(url) {
    try {
      const u = new URL(url);
      return u.origin === targetOrigin;
    } catch {
      return false;
    }
  }

  page.on('pageerror', err => {
    const msg = err.message || String(err);
    pageErrors.push(msg);
  });

  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  page.on('requestfailed', req => {
    const url = req.url();
    if (isOwnOrigin(url)) {
      const failure = req.failure();
      failedRequests.push({
        type: 'REQUEST_FAILED',
        url,
        reason: failure?.errorText || 'Unknown failure'
      });
    }
  });

  page.on('response', res => {
    const url = res.url();
    if (isOwnOrigin(url)) {
      const status = res.status();
      // Allow only explicitly permitted security probe
      const isAllowed404 = url.endsWith('/src/decoder.js') && status === 404;
      if ([404, 500, 502, 503].includes(status) && !isAllowed404) {
        failedRequests.push({
          type: 'HTTP_STATUS_FAILURE',
          url,
          status,
          statusText: res.statusText()
        });
      }
    }
  });

  function assertGateClean(contextName) {
    if (pageErrors.length > 0) {
      throw new Error(`[${contextName}] JAVASCRIPT PAGE ERROR GATE FAILED: ${pageErrors.length} unhandled error(s):\n${pageErrors.join('\n')}`);
    }
    if (consoleErrors.length > 0) {
      throw new Error(`[${contextName}] CONSOLE ERROR GATE FAILED: ${consoleErrors.length} console.error(s):\n${consoleErrors.join('\n')}`);
    }
    if (failedRequests.length > 0) {
      const details = failedRequests.map(r => ` - [${r.type}] ${r.status || ''} ${r.url} (${r.reason || r.statusText || ''})`).join('\n');
      throw new Error(`[${contextName}] FAILED OWN-ORIGIN NETWORK REQUEST GATE: ${failedRequests.length} failure(s):\n${details}`);
    }
  }

  try {
    // A. Homepage Load
    console.log('\n▶ Step 4: Loading homepage and verifying DOM integrity...');
    const navRes = await page.goto(`${TARGET_URL}/`);
    if (!navRes || navRes.status() !== 200) {
      throw new Error(`Homepage returned HTTP ${navRes?.status()}`);
    }

    const input = page.locator('#code-input');
    const btn = page.locator('#search-btn');
    await input.waitFor({ state: 'visible', timeout: 5000 });
    await btn.waitFor({ state: 'visible', timeout: 5000 });
    await page.waitForTimeout(500);

    assertGateClean('Homepage Load');
    console.log('  ✅ Homepage loaded cleanly (HTTP 200, controls visible, 0 errors).');

    // B. Serial Number Click Journey (163118080 -> MS 440-Z)
    console.log('\n▶ Step 5: Testing Serial Number Click Journey (163118080 -> MS 440-Z)...');
    await input.fill('163118080');
    await btn.click();

    const resultCard = page.locator('#result-card');
    await resultCard.waitFor({ state: 'visible', timeout: 7000 });

    const serialText = await page.locator('#res-serial-display').innerText();
    const modelText = await page.locator('#res-model').innerText();

    if (!serialText.replace(/\s+/g, '').includes('163118080')) {
      throw new Error(`Expected serial display to contain 163118080, got "${serialText}"`);
    }
    if (!modelText.includes('MS 440-Z')) {
      throw new Error(`Expected model display to contain MS 440-Z, got "${modelText}"`);
    }
    assertGateClean('Serial Click Journey');
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
    assertGateClean('Model Search Journey');
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
    assertGateClean('Part Number Search Journey');
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
    assertGateClean('Serial Enter Key Journey');
    console.log(`  ✅ Enter key test passed! (${enterSerial.trim()})`);

    // Final FAIL-CLOSED Assertion
    console.log('\n▶ Step 9: Final Fail-Closed Gate Verifications:');
    console.log(`  PAGE_ERRORS = ${pageErrors.length}`);
    console.log(`  CONSOLE_ERRORS = ${consoleErrors.length}`);
    console.log(`  FAILED_OWN_ORIGIN_REQUESTS = ${failedRequests.length}`);

    if (pageErrors.length !== 0 || consoleErrors.length !== 0 || failedRequests.length !== 0) {
      throw new Error(`FAIL-CLOSED GATE BREACHED: pageErrors=${pageErrors.length}, consoleErrors=${consoleErrors.length}, failedRequests=${failedRequests.length}`);
    }

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
