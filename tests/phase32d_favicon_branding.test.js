import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Start server on port 3094 for test isolation
process.env.PORT = '3094';
await import('../server.js');

// Wait 500ms for server startup
await new Promise(r => setTimeout(r, 500));

console.log('🧪 Starting Phase 32D STIHLDecoder Favicon & Google Search Branding Audit...\n');

const FAVICON_ASSETS = [
  { path: '/favicon.ico', expectedType: 'image/x-icon' },
  { path: '/favicon-16x16.png', expectedType: 'image/png' },
  { path: '/favicon-32x32.png', expectedType: 'image/png' },
  { path: '/favicon-48x48.png', expectedType: 'image/png' },
  { path: '/favicon-96x96.png', expectedType: 'image/png' },
  { path: '/favicon-192x192.png', expectedType: 'image/png' },
  { path: '/favicon-512x512.png', expectedType: 'image/png' },
  { path: '/apple-touch-icon.png', expectedType: 'image/png' },
  { path: '/site.webmanifest', expectedType: 'application/manifest+json' }
];

let totalAssetChecks = 0;
let passedAssetChecks = 0;

for (const asset of FAVICON_ASSETS) {
  const res = await fetchUrl(`http://localhost:3094${asset.path}`);
  totalAssetChecks++;
  
  const is200 = (res.status === 200);
  const isTypeValid = res.contentType.includes(asset.expectedType.split('/')[1]);

  if (is200 && isTypeValid) {
    passedAssetChecks++;
    console.log(`✅ Asset ${asset.path}: PASSED (200 OK, ${res.contentType})`);
  } else {
    console.warn(`❌ Asset ${asset.path}: FAILED (Status: ${res.status}, Content-Type: ${res.contentType})`);
  }
}

// 2. Audit HTML Head Declarations on Homepage & Model Page
const homepageRes = await fetchUrl('http://localhost:3094/');
const modelRes = await fetchUrl('http://localhost:3094/kettingzagen/ms-261/');

const hasIcoLink = homepageRes.body.includes('href="/favicon.ico"') && modelRes.body.includes('href="/favicon.ico"');
const hasGoogle48Link = homepageRes.body.includes('href="/favicon-48x48.png"') && modelRes.body.includes('href="/favicon-48x48.png"');
const hasManifestLink = homepageRes.body.includes('href="/site.webmanifest"') && modelRes.body.includes('href="/site.webmanifest"');

console.log(`\n📋 HTML Head Favicon Declarations:`);
console.log(`   ${hasIcoLink ? '✅' : '❌'} favicon.ico link present in <head>`);
console.log(`   ${hasGoogle48Link ? '✅' : '❌'} favicon-48x48.png (Google Search primary) link present in <head>`);
console.log(`   ${hasManifestLink ? '✅' : '❌'} site.webmanifest link present in <head>`);

// 3. Audit Robots.txt Googlebot Access
const robotsRes = await fetchUrl('http://localhost:3094/robots.txt');
const isFaviconBlocked = robotsRes.body.includes('Disallow: /favicon');

console.log(`\n🤖 Robots.txt Googlebot Audit:`);
console.log(`   ${!isFaviconBlocked ? '✅' : '❌'} Favicon resources accessible to Googlebot (Not disallowed)`);

const isAllPassed = (passedAssetChecks === totalAssetChecks) && hasIcoLink && hasGoogle48Link && hasManifestLink && !isFaviconBlocked;
console.log(`\n🚦 PHASE 32D FAVICON BRANDING DECISION: ${isAllPassed ? '✅ GO' : '❌ NO-GO'}`);

fs.writeFileSync(
  path.join(__dirname, 'phase32d_audit_report.json'),
  JSON.stringify({
    timestamp: new Date().toISOString(),
    totalAssetChecks,
    passedAssetChecks,
    hasIcoLink,
    hasGoogle48Link,
    hasManifestLink,
    isFaviconBlocked,
    seoContentFreeze: 'ACTIVE',
    decision: isAllPassed ? 'GO' : 'NO-GO'
  }, null, 2),
  'utf8'
);

process.exit(isAllPassed ? 0 : 1);

function fetchUrl(url, headers = {}) {
  return new Promise((resolve) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers
    };

    http.get(options, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          contentType: res.headers['content-type'] || '',
          body
        });
      });
    }).on('error', (err) => {
      resolve({ status: 500, contentType: '', body: err.message });
    });
  });
}
