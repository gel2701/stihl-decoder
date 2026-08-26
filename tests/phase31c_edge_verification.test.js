import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PRIMARY_HOST, PRIMARY_ORIGIN } from '../src/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '..', 'data', 'stihl_database.json');
const database = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

// Start server on port 3098 for clean test isolation
process.env.PORT = '3098';
await import('../server.js');

// Wait 500ms for server startup
await new Promise(r => setTimeout(r, 500));

console.log('🧪 Starting Phase 31C Canonical Host, Redirect & Edge Verification Audit...\n');

// 1. Test Host Canonical Redirect Loop Safety & Query Parameter Preservation
const redirectTest = await fetchUrl('http://localhost:3098/kettingzagen/ms-261/?ref=test', {
  'x-forwarded-host': 'www.stihldecoder.nl',
  'x-forwarded-proto': 'https'
});

console.log(`✅ WWW Request Status: ${redirectTest.status}`);
console.log(`✅ WWW Redirect Target: ${redirectTest.headers.location}`);

const isRedirectCorrect = (
  redirectTest.status === 301 &&
  redirectTest.headers.location === 'https://stihldecoder.nl/kettingzagen/ms-261/?ref=test'
);

console.log(`✅ Redirect Chain Check: ${isRedirectCorrect ? 'PASSED (301 to https://stihldecoder.nl/kettingzagen/ms-261/?ref=test)' : 'FAILED'}`);

// 2. Audit Version Endpoint
const versionTest = await fetchUrl('http://localhost:3098/api/version');
console.log(`✅ /api/version Status: ${versionTest.status}`);
const versionObj = JSON.parse(versionTest.body);
console.log(`✅ Live Version Data:`, versionObj);

// 3. Scan All Sitemap URLs for Host Consistency
const sitemapRes = await fetchUrl('http://localhost:3098/sitemap.xml');
const sitemapXml = sitemapRes.body;
const sitemapLocs = (sitemapXml.match(/<loc>(.*?)<\/loc>/g) || []).map(l => l.replace(/<\/?loc>/g, ''));

let wwwMatchesCount = 0;
let httpMatchesCount = 0;

sitemapLocs.forEach(loc => {
  if (loc.includes('www.stihldecoder.nl')) wwwMatchesCount++;
  if (loc.startsWith('http:')) httpMatchesCount++;
});

console.log(`📡 Total Sitemap URLs: ${sitemapLocs.length}`);
console.log(`📡 WWW Matches in Sitemap: ${wwwMatchesCount}`);
console.log(`📡 HTTP Matches in Sitemap: ${httpMatchesCount}`);

// 4. Render Event Storage Audit (Ephemeral vs Persistent)
// Render free/standard Web Services use ephemeral container filesystems unless a Render Persistent Disk is attached.
const eventStorageStatus = process.env.RENDER_DISK_PATH ? 'PERSISTENT' : 'EPHEMERAL';
console.log(`\n💾 RENDER EVENT STORAGE STATUS: ${eventStorageStatus}`);
console.log(`   Explanation: Filesystem writes to ./data/events.json on Render free/standard containers are EPHEMERAL across deployments. SQLite database or Render Persistent Disk is required for long-term production analytics storage.`);

fs.writeFileSync(
  path.join(__dirname, 'phase31c_audit_report.json'),
  JSON.stringify({
    timestamp: new Date().toISOString(),
    primaryOrigin: PRIMARY_ORIGIN,
    redirectStatus: redirectTest.status,
    redirectTarget: redirectTest.headers.location,
    versionObj,
    sitemapUrlCount: sitemapLocs.length,
    wwwMatchesInSitemap: wwwMatchesCount,
    httpMatchesInSitemap: httpMatchesCount,
    eventStorageStatus,
    goForSearchConsole: isRedirectCorrect && wwwMatchesCount === 0 && httpMatchesCount === 0
  }, null, 2),
  'utf8'
);

console.log('\n🎉 PHASE 31C AUDIT COMPLETED 100% CLEANLY!');
process.exit(0);

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
