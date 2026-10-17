import assert from 'assert';
import fs from 'fs';
import {
  GA_MEASUREMENT_ID,
  SITE_ANALYTICS_TAGS,
  injectSiteAnalyticsIntoHtml,
  installSiteAnalyticsResponseInjection
} from '../src/components/SiteAnalyticsInjector.js';

console.log('🧪 Site-wide Google Analytics coverage test...');

const html = '<!doctype html><html><head><title>Test</title></head><body><a href="/x">X</a></body></html>';
const injected = injectSiteAnalyticsIntoHtml(html);

assert.ok(injected.includes('data-stihl-ga4-consent-bootstrap'), 'Consent bootstrap must be injected into HTML');
assert.ok(injected.includes(`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`), 'Direct Google tag must be present in every HTML head');
assert.ok(injected.includes('data-stihl-site-analytics'), 'Site analytics client must be injected into HTML');
assert.ok(injected.includes("analytics_storage: analyticsConsent"), 'Consent Mode must initialize analytics storage from saved consent');
assert.ok(injected.includes("ad_storage: 'denied'"), 'Ad storage must remain denied');
assert.strictEqual((injected.match(/data-stihl-ga4-consent-bootstrap/g) || []).length, 1, 'Analytics injection must be idempotent');
assert.strictEqual(injectSiteAnalyticsIntoHtml(injected), injected, 'Second injection must not duplicate the Google tag');

let captured = null;
let writeHeadCalls = 0;
const fakeRes = {
  __siteAnalyticsInjectionInstalled: false,
  getHeader() {
    return undefined;
  },
  writeHead() {
    writeHeadCalls += 1;
    return this;
  },
  end(chunk) {
    captured = chunk;
    return true;
  }
};

installSiteAnalyticsResponseInjection(fakeRes);
fakeRes.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
fakeRes.end(Buffer.from(html, 'utf8'));
assert.strictEqual(writeHeadCalls, 1, 'Wrapped writeHead must preserve the underlying call');
assert.ok(String(captured).includes('googletagmanager.com/gtag/js'), 'Direct writeHead HTML responses must receive the direct Google tag');
assert.ok(String(captured).includes('data-stihl-ga4-consent-bootstrap'), 'Direct writeHead HTML responses must receive Consent Mode bootstrap');

const serverSource = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const analyticsSource = fs.readFileSync(new URL('../src/components/SiteAnalytics.js', import.meta.url), 'utf8');
const homepageSource = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

assert.ok(serverSource.includes("'/src/components/SiteAnalytics.js'"), 'Analytics browser module must be publicly served');
assert.ok(serverSource.includes('installSiteAnalyticsResponseInjection(res);'), 'Every request must install HTML analytics injection');

assert.strictEqual(GA_MEASUREMENT_ID, 'G-P2V0J69LDX', 'Expected GA4 measurement ID must be configured');
assert.ok(SITE_ANALYTICS_TAGS.includes('googletagmanager.com/gtag/js'), 'Tag Assistant-visible Google tag must be server-injected');
assert.ok(analyticsSource.includes("stihl_cookie_consent"), 'Existing consent key must be preserved');
assert.ok(analyticsSource.includes("'site_click'"), 'Site-wide click event must be configured');
assert.ok(analyticsSource.includes("transport_type: 'beacon'"), 'Click tracking should use beacon transport for navigation clicks');
assert.ok(analyticsSource.includes("updateAnalyticsConsent"), 'Consent updates must be handled site-wide');
assert.ok(analyticsSource.includes("cookie-consent-banner"), 'Subpages need consent UI when users land there directly');
assert.ok(!analyticsSource.includes('input.value'), 'Analytics must not collect form input values');
assert.ok(!homepageSource.includes("function initGoogleAnalytics()"), 'Homepage must not keep a duplicate legacy GA loader');

console.log('✅ Direct site-wide GA4 tag, Consent Mode and click tracking contract PASS');
