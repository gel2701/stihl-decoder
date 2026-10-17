import { test, expect } from '@playwright/test';

const TARGET = 'https://www.stihldecoder.nl';
const EXPECTED_COMMIT = 'ba3e14d9060622cfc3430f96d6d23bac8488b385';
const GA4 = 'https://www.googletagmanager.com/gtag/js?id=G-P2V0J69LDX';

test('Phase54F-C live production, GA4 and browser smoke', async ({ page, request }) => {
  const versionRes = await request.get(`${TARGET}/api/version`);
  expect(versionRes.status()).toBe(200);
  const version = await versionRes.json();
  expect(version.commit).toBe(EXPECTED_COMMIT);

  const paths = [
    '/',
    '/kettingzagen/ms-200/',
    '/kettingzagen/ms-200/onderdelen/',
    '/onderdeelnummer/42441824502/'
  ];

  for (const path of paths) {
    const res = await request.get(TARGET + path);
    expect(res.status(), `${path} HTTP status`).toBe(200);
    const html = await res.text();
    expect(html, `${path} direct GA4 tag`).toContain(GA4);
    expect(html, `${path} consent bootstrap`).toContain('data-stihl-ga4-consent-bootstrap');
    expect(html, `${path} SiteAnalytics client`).toContain('/src/components/SiteAnalytics.js');
  }

  const pageErrors = [];
  const consoleErrors = [];
  const ownOriginFailures = [];

  page.on('pageerror', error => pageErrors.push(error.message || String(error)));
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('requestfailed', req => {
    try {
      if (new URL(req.url()).origin === TARGET) {
        ownOriginFailures.push(`${req.url()} :: ${req.failure()?.errorText || 'request failed'}`);
      }
    } catch {}
  });
  page.on('response', res => {
    try {
      if (new URL(res.url()).origin === TARGET && [404, 500, 502, 503].includes(res.status())) {
        const allowed404 = res.url().endsWith('/src/decoder.js') && res.status() === 404;
        if (!allowed404) ownOriginFailures.push(`${res.status()} ${res.url()}`);
      }
    } catch {}
  });

  const nav = await page.goto(TARGET + '/', { waitUntil: 'domcontentloaded' });
  expect(nav?.status()).toBe(200);

  const input = page.locator('#code-input');
  const button = page.locator('#search-btn');
  await expect(input).toBeVisible();
  await expect(button).toBeVisible();

  await input.fill('163118080');
  await button.click();
  await expect(page.locator('#result-card')).toBeVisible();
  await expect(page.locator('#res-serial-display')).toContainText('163118080');
  await expect(page.locator('#res-model')).toContainText('MS 440-Z');

  await input.fill('MS 261 C-M');
  await button.click();
  await expect(page.locator('#model-card')).toBeVisible();
  await expect(page.locator('#model-title-display')).toContainText('MS 261');

  expect(pageErrors, 'live page errors').toEqual([]);
  expect(consoleErrors, 'live console errors').toEqual([]);
  expect(ownOriginFailures, 'live own-origin failures').toEqual([]);
});
