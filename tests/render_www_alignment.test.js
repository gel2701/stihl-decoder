import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PRIMARY_HOST, PRIMARY_ORIGIN } from '../src/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Start server on port 3096 for test isolation
process.env.PORT = '3096';
await import('../server.js');

// Wait 500ms for server startup
await new Promise(r => setTimeout(r, 500));

console.log('🧪 Starting Render WWW Domain Alignment Audit...\n');

// 1. Audit Primary Config
console.log(`✅ PRIMARY_HOST: ${PRIMARY_HOST}`);
console.log(`✅ PRIMARY_ORIGIN: ${PRIMARY_ORIGIN}`);

// 2. Audit WWW Request (Node serves 200 OK directly)
const testWww = await fetchUrl('http://localhost:3096/kettingzagen/ms-261/?ref=test', {
  'x-forwarded-host': 'www.stihldecoder.nl',
  'x-forwarded-proto': 'https'
});

console.log(`✅ WWW Request Status: ${testWww.status}`);
console.log(`✅ WWW Redirect Location: ${testWww.headers.location || 'NONE (Direct 200 OK)'}`);

const wwwPass = (testWww.status === 200 && !testWww.headers.location);
console.log(`✅ WWW Direct 200 Test: ${wwwPass ? 'PASSED (0 Application Redirects)' : 'FAILED'}`);

// 3. Audit robots.txt sitemap pointer
const robotsRes = await fetchUrl('http://localhost:3096/robots.txt');
const robotsTxt = robotsRes.body;
console.log(`✅ robots.txt Content:`, robotsTxt.trim());

const robotsPass = robotsTxt.includes('Sitemap: https://www.stihldecoder.nl/sitemap.xml');
console.log(`✅ robots.txt Sitemap Pointer Test: ${robotsPass ? 'PASSED (Points to https://www.stihldecoder.nl/sitemap.xml)' : 'FAILED'}`);

// 4. Audit Sitemap XML
const sitemapRes = await fetchUrl('http://localhost:3096/sitemap.xml');
const sitemapXml = sitemapRes.body;
const sitemapLocs = (sitemapXml.match(/<loc>(.*?)<\/loc>/g) || []).map(l => l.replace(/<\/?loc>/g, ''));

let nonWwwMatches = 0;
let wwwMatches = 0;

sitemapLocs.forEach(loc => {
  if (loc.startsWith('https://www.stihldecoder.nl')) wwwMatches++;
  else nonWwwMatches++;
});

console.log(`📡 Total Sitemap URLs: ${sitemapLocs.length}`);
console.log(`📡 WWW Sitemap URLs: ${wwwMatches}`);
console.log(`📡 Non-WWW Sitemap URLs: ${nonWwwMatches}`);

const sitemapPass = (sitemapLocs.length === 90 && nonWwwMatches === 0 && wwwMatches === 90);
console.log(`✅ Sitemap WWW Canonical Test: ${sitemapPass ? 'PASSED (90/90 URLs use https://www.stihldecoder.nl)' : 'FAILED'}`);

// 5. Audit Model Page HTML Canonical Tag
const modelRes = await fetchUrl('http://localhost:3096/kettingzagen/ms-261/');
const modelHtml = modelRes.body;
const canonicalMatch = modelHtml.match(/<link rel="canonical" href="(.*?)"/);
const canonicalUrl = canonicalMatch ? canonicalMatch[1] : '';

console.log(`📄 Model Page Canonical Tag: ${canonicalUrl}`);
const canonicalPass = canonicalUrl === 'https://www.stihldecoder.nl/kettingzagen/ms-261/';
console.log(`✅ Model Canonical Tag Test: ${canonicalPass ? 'PASSED (Matches https://www.stihldecoder.nl/kettingzagen/ms-261/)' : 'FAILED'}`);

const isAllPassed = wwwPass && robotsPass && sitemapPass && canonicalPass;
console.log(`\n🚦 RENDER WWW ALIGNMENT DECISION: ${isAllPassed ? '✅ GO' : '❌ NO-GO'}`);

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
          headers: res.headers,
          body
        });
      });
    }).on('error', (err) => {
      resolve({ status: 500, headers: {}, body: err.message });
    });
  });
}
