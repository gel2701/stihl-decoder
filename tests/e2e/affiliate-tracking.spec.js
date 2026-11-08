import { test, expect } from '@playwright/test';
import { attachIntegrityGates } from './e2e-gates.js';
import Database from 'better-sqlite3';
import { getDatabasePath } from '../../src/databaseConfig.js';

test.describe('Phase 60.1: Affiliate Tracking & Conversion Measurement', () => {

  test('A. Outbound affiliate clicks on model parts page fire non-blocking beacon with test flag and no PII', async ({ page }) => {
    const gates = attachIntegrityGates(page);

    // Simulate explicit visitor cookie consent
    await page.addInitScript(() => {
      localStorage.setItem('stihl_cookie_consent', 'granted');
    });

    // Collect beacon requests made to /api/affiliate/track
    const trackRequests = [];
    await page.route('**/api/affiliate/track', async (route) => {
      const request = route.request();
      const postData = request.postDataJSON();
      trackRequests.push({
        url: request.url(),
        method: request.method(),
        postData
      });
      // Continue route so server processes and records it in SQLite
      await route.continue();
    });

    // Navigate to FS 460 model parts page with test query parameter
    const response = await page.goto('/bosmaaiers/fs-460/onderdelen/?test=1');
    expect(response?.status()).toBe(200);

    // Locate external Amazon affiliate links
    const amazonLinks = page.locator('a[href*="amazon.nl"]');
    const linkCount = await amazonLinks.count();
    expect(linkCount).toBeGreaterThan(0);

    // Target the first link (which has an onclick handler calling handleAffiliateClick)
    const firstLink = amazonLinks.first();
    const href = await firstLink.getAttribute('href');
    expect(href).toContain('amazon.nl');
    expect(href).toContain('tag=srihldecoder2-21');

    // Click link (prevent actual browser tab opening via middle click or modifier, or trigger click handler)
    await firstLink.dispatchEvent('click');

    // Wait for the tracking request to be transmitted
    await expect.poll(() => trackRequests.length, { timeout: 5000 }).toBeGreaterThanOrEqual(1);

    const tracked = trackRequests[0].postData;
    expect(tracked).toBeTruthy();
    expect(tracked.provider).toBe('amazon');
    expect(tracked.marketplace).toBe('amazon.nl');
    expect(tracked.is_test).toBe(1);
    expect(tracked.destination_url).toContain('amazon.nl');
    expect(tracked.destination_url).toContain('tag=srihldecoder2-21');
    expect(tracked.event_id).toMatch(/^aff_/);

    // Verify zero PII stored in payload
    expect(tracked.ip).toBeUndefined();
    expect(tracked.cookie).toBeUndefined();
    expect(tracked.user_email).toBeUndefined();
    expect(tracked.user_name).toBeUndefined();

    // Verify database persistence in SQLite via polling
    await expect.poll(() => {
      const dbPath = getDatabasePath();
      const db = new Database(dbPath, { readonly: true });
      try {
        const eventRow = db.prepare(
          "SELECT event_id, event_type, is_test, model_slug, page_path, metadata_json FROM analytics_events WHERE event_id = ?"
        ).get(tracked.event_id);
        return eventRow ? eventRow.event_type : null;
      } finally {
        db.close();
      }
    }, { timeout: 7000 }).toBe('affiliate_click');

    const dbPath = getDatabasePath();
    const db = new Database(dbPath, { readonly: true });
    try {
      const eventRow = db.prepare(
        "SELECT event_id, event_type, is_test, model_slug, page_path, metadata_json FROM analytics_events WHERE event_id = ?"
      ).get(tracked.event_id);
      expect(eventRow.is_test).toBe(1);
      const meta = JSON.parse(eventRow.metadata_json);
      expect(meta.part_number).toBe(tracked.part_number);
    } finally {
      db.close();
    }

    gates.assertClean('Model Parts Affiliate Tracking');
  });

  test('B. Rapid double-click debounce prevents duplicate beacon transmissions', async ({ page }) => {
    const gates = attachIntegrityGates(page);

    // Simulate explicit visitor cookie consent
    await page.addInitScript(() => {
      localStorage.setItem('stihl_cookie_consent', 'granted');
    });

    const trackRequests = [];
    await page.route('**/api/affiliate/track', async (route) => {
      const request = route.request();
      trackRequests.push(request.postDataJSON());
      await route.continue();
    });

    await page.goto('/bosmaaiers/fs-460/onderdelen/?test=1');

    const amazonLinks = page.locator('a[href*="amazon.nl"]');
    const firstLink = amazonLinks.first();

    // Double-click rapidly
    await firstLink.dispatchEvent('click');
    await firstLink.dispatchEvent('click');

    await page.waitForTimeout(500);

    // Only one tracking event should have been dispatched due to client debounce
    expect(trackRequests.length).toBe(1);

    gates.assertClean('Debounce Check');
  });

  test('C. Parts discovery page (/onderdelen/) tracks affiliate clicks with model attribution', async ({ page }) => {
    const gates = attachIntegrityGates(page);

    // Simulate explicit visitor cookie consent
    await page.addInitScript(() => {
      localStorage.setItem('stihl_cookie_consent', 'granted');
    });

    const trackRequests = [];
    await page.route('**/api/affiliate/track', async (route) => {
      trackRequests.push(route.request().postDataJSON());
      await route.continue();
    });

    const response = await page.goto('/onderdelen/?q=bougie&test=1');
    expect(response?.status()).toBe(200);

    const amazonLinks = page.locator('a[href*="amazon.nl"]');
    await expect.poll(async () => await amazonLinks.count(), { timeout: 5000 }).toBeGreaterThan(0);

    await amazonLinks.first().dispatchEvent('click');

    await expect.poll(() => trackRequests.length, { timeout: 5000 }).toBeGreaterThanOrEqual(1);

    const tracked = trackRequests[0];
    expect(tracked.is_test).toBe(1);
    expect(tracked.destination_url).toContain('amazon.nl');

    gates.assertClean('Parts Discovery Affiliate Tracking');
  });

  test('D. Without consent (clean session), clicking affiliate link with ?test=1 sends ZERO tracking requests', async ({ page }) => {
    const gates = attachIntegrityGates(page);

    const trackRequests = [];
    await page.route('**/api/affiliate/track', async (route) => {
      trackRequests.push(route.request().postDataJSON());
      await route.continue();
    });

    // Clean browser session with no consent in localStorage
    await page.goto('/bosmaaiers/fs-460/onderdelen/?test=1');

    const amazonLinks = page.locator('a[href*="amazon.nl"]');
    const firstLink = amazonLinks.first();
    const href = await firstLink.getAttribute('href');
    expect(href).toContain('amazon.nl');

    // Click link without consent
    await firstLink.dispatchEvent('click');
    await page.waitForTimeout(600);

    // Verify zero tracking requests were dispatched
    expect(trackRequests.length).toBe(0);

    gates.assertClean('Zero Tracking Without Consent');
  });

  test('E. When consent is denied, clicking affiliate link with ?test=1 sends ZERO tracking requests', async ({ page }) => {
    const gates = attachIntegrityGates(page);

    // Explicitly denied consent
    await page.addInitScript(() => {
      localStorage.setItem('stihl_cookie_consent', 'denied');
    });

    const trackRequests = [];
    await page.route('**/api/affiliate/track', async (route) => {
      trackRequests.push(route.request().postDataJSON());
      await route.continue();
    });

    await page.goto('/bosmaaiers/fs-460/onderdelen/?test=1');

    const amazonLinks = page.locator('a[href*="amazon.nl"]');
    await amazonLinks.first().dispatchEvent('click');
    await page.waitForTimeout(600);

    expect(trackRequests.length).toBe(0);

    gates.assertClean('Zero Tracking On Consent Denied');
  });

  test('F. Without consent, client-side data.is_test dispatch sends ZERO tracking requests', async ({ page }) => {
    const gates = attachIntegrityGates(page);

    const trackRequests = [];
    await page.route('**/api/affiliate/track', async (route) => {
      trackRequests.push(route.request().postDataJSON());
      await route.continue();
    });

    // Clean session
    await page.goto('/bosmaaiers/fs-460/onderdelen/');

    // Invoke client-side handleAffiliateClick directly with is_test: true but without granted consent
    await page.evaluate(() => {
      if (window.handleAffiliateClick) {
        window.handleAffiliateClick(
          { href: 'https://amazon.nl/dp/B001RM8J76?tag=srihldecoder2-21', dataset: {} },
          { defaultPrevented: false },
          { is_test: true, part_number: '00004007000' }
        );
      }
    });

    await page.waitForTimeout(600);

    expect(trackRequests.length).toBe(0);

    gates.assertClean('Zero Tracking On Client is_test Without Consent');
  });

});
