import assert from 'assert';
import fs from 'fs';
import vm from 'node:vm';
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

let testHtml = null;
const testRes = {
  getHeader: () => 'text/html',
  end(chunk) { testHtml = String(chunk); }
};
installSiteAnalyticsResponseInjection(testRes, true);
testRes.end(html);
assert.ok(testHtml.includes('data-stihl-test-mode'), 'Trusted test mode must be marked for client click tracking');
assert.ok(!testHtml.includes('googletagmanager.com') && !testHtml.includes('data-stihl-ga4-config'), 'Trusted test mode must omit GA4');
assert.equal(injectSiteAnalyticsIntoHtml(testHtml, true), testHtml, 'Test injection must be idempotent');

const serverSource = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const analyticsSource = fs.readFileSync(new URL('../src/components/SiteAnalytics.js', import.meta.url), 'utf8');
const homepageSource = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const privacySource = fs.readFileSync(new URL('../src/components/PrivacyPolicyTemplate.js', import.meta.url), 'utf8');

assert.ok(serverSource.includes("'/src/components/SiteAnalytics.js'"), 'Analytics browser module must be publicly served');
assert.ok(serverSource.includes("process.env.NODE_ENV === 'test' && new URL(req.url, 'http://localhost').searchParams.get('test') === '1'"), 'Only server-controlled test mode may omit GA4');

assert.strictEqual(GA_MEASUREMENT_ID, 'G-P2V0J69LDX', 'Expected GA4 measurement ID must be configured');
assert.ok(SITE_ANALYTICS_TAGS.includes('googletagmanager.com/gtag/js'), 'Tag Assistant-visible Google tag must be server-injected');
assert.ok(analyticsSource.includes("stihl_cookie_consent"), 'Existing consent key must be preserved');
assert.ok(analyticsSource.includes("'site_click'"), 'Site-wide click event must be configured');
assert.ok(analyticsSource.includes("transport_type: 'beacon'"), 'Click tracking should use beacon transport for navigation clicks');
assert.ok(analyticsSource.includes("updateAnalyticsConsent"), 'Consent updates must be handled site-wide');
assert.ok(analyticsSource.includes("cookie-consent-banner"), 'Subpages need consent UI when users land there directly');
assert.ok(!analyticsSource.includes('input.value'), 'Analytics must not collect form input values');
assert.ok(!homepageSource.includes("function initGoogleAnalytics()"), 'Homepage must not keep a duplicate legacy GA loader');
assert.ok(analyticsSource.includes('Microsoft Clarity') && privacySource.includes('Microsoft Clarity'), 'Banner and privacy page must disclose Clarity');
assert.ok(privacySource.includes('window.location.reload()'), 'Revoking consent must stop active Clarity recorder');

function checkClarity(consent, testMode, accept = false) {
  const scripts = [];
  const stored = { stihl_cookie_consent: consent };
  const window = { __stihlTestMode: testMode, location: { protocol: 'https:' } };
  const document = {
    readyState: 'complete',
    cookie: '',
    head: { appendChild(script) { scripts.push(script); } },
    createElement() { return { dataset: {} }; },
    querySelector() { return scripts.find(script => script.dataset.stihlClarity) || null; },
    getElementById(id) { return id === 'cookie-consent-banner' ? {} : null; },
    addEventListener() {}
  };
  vm.runInNewContext(analyticsSource, {
    window, document, localStorage: {
      getItem(key) { return stored[key] || null; },
      setItem(key, value) { stored[key] = value; }
    }
  });
  if (accept) window.initGoogleAnalytics();
  return { scripts, stored, window };
}

assert.equal(checkClarity(null, false).scripts.length, 0, 'No Clarity without consent');
assert.equal(checkClarity('denied', false).scripts.length, 0, 'No Clarity after rejection');
assert.equal(checkClarity('granted', true).scripts.length, 0, 'Automated test must not load Clarity');
const granted = checkClarity('granted', false);
assert.equal(granted.scripts[0]?.src, 'https://www.clarity.ms/tag/zc7idfdot7', 'Existing consent loads Clarity');
granted.window.initGoogleAnalytics();
assert.equal(granted.scripts.length, 1, 'Consent update must not load Clarity twice');
assert.equal(checkClarity(null, false, true).scripts.length, 1, 'Explicit consent loads Clarity');
assert.equal(checkClarity(null, true, true).scripts.length, 0, 'Test consent must not load Clarity');

console.log('✅ Direct site-wide GA4 tag, Consent Mode and click tracking contract PASS');
