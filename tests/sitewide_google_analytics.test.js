import assert from 'assert';
import fs from 'fs';
import {
  SITE_ANALYTICS_SCRIPT_TAG,
  injectSiteAnalyticsIntoHtml,
  installSiteAnalyticsResponseInjection
} from '../src/components/SiteAnalyticsInjector.js';

console.log('🧪 Site-wide Google Analytics coverage test...');

const html = '<!doctype html><html><head><title>Test</title></head><body><a href="/x">X</a></body></html>';
const injected = injectSiteAnalyticsIntoHtml(html);

assert.ok(injected.includes(SITE_ANALYTICS_SCRIPT_TAG), 'Analytics script must be injected into HTML');
assert.strictEqual((injected.match(/data-stihl-site-analytics/g) || []).length, 1, 'Analytics injection must be idempotent');
assert.strictEqual(injectSiteAnalyticsIntoHtml(injected), injected, 'Second injection must not duplicate the analytics client');

let captured = null;
const fakeRes = {
  __siteAnalyticsInjectionInstalled: false,
  getHeader(name) {
    return name.toLowerCase() === 'content-type' ? 'text/html; charset=UTF-8' : undefined;
  },
  end(chunk) {
    captured = chunk;
    return true;
  }
};

installSiteAnalyticsResponseInjection(fakeRes);
fakeRes.end(Buffer.from(html, 'utf8'));
assert.ok(String(captured).includes('data-stihl-site-analytics'), 'HTML Buffer responses must receive analytics');

const serverSource = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const analyticsSource = fs.readFileSync(new URL('../src/components/SiteAnalytics.js', import.meta.url), 'utf8');

assert.ok(serverSource.includes("'/src/components/SiteAnalytics.js'"), 'Analytics browser module must be publicly served');
assert.ok(serverSource.includes('installSiteAnalyticsResponseInjection(res);'), 'Every request must install HTML analytics injection');

assert.ok(analyticsSource.includes("G-P2V0J69LDX"), 'Expected GA4 measurement ID must be configured');
assert.ok(analyticsSource.includes("stihl_cookie_consent"), 'Existing consent key must be preserved');
assert.ok(analyticsSource.includes("'site_click'"), 'Site-wide click event must be configured');
assert.ok(analyticsSource.includes("transport_type: 'beacon'"), 'Click tracking should use beacon transport for navigation clicks');
assert.ok(analyticsSource.includes("cookie-consent-banner"), 'Subpages need consent UI when users land there directly');
assert.ok(!analyticsSource.includes('input.value'), 'Analytics must not collect form input values');

console.log('✅ Site-wide GA4 injection, consent and click tracking contract PASS');
