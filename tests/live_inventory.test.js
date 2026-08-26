import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '..', 'data', 'stihl_database.json');
const database = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

// Import server.js dynamically or test against http://localhost:3000
const testUrls = [
  '/',
  '/robots.txt',
  '/sitemap.xml',
  '/kettingzagen/ms-261/',
  '/kettingzagen/ms-260/',
  '/bosmaaiers/fs-350/',
  '/bladblazers/br-600/',
  '/stihl-serienummer-decoder/',
  '/stihl-serienummer/',
  '/stihl-bouwjaar/',
  '/stihl-diefstalcheck/',
  '/stihl-waarde/',
  '/stihl-paspoort/',
  '/waar-staat-serienummer-stihl/',
  '/stihl-model-herkennen/',
  '/onderdeelnummer/',
  '/waarde/ms-261/',
  '/modellen/kettingzagen/stihl-ms-261-c-m'
];

// Start server on port 3099 for clean test isolation
process.env.PORT = '3099';
await import('../server.js');

// Wait 500ms for server startup
await new Promise(r => setTimeout(r, 500));

console.log('📡 Fetching Live Sitemap XML...');
const sitemapRes = await fetchUrl('http://localhost:3099/sitemap.xml');
const sitemapContent = sitemapRes.body;

const auditResults = [];

for (const path of testUrls) {
  const url = `http://localhost:3099${path}`;
  const res = await fetchUrl(url);

  let title = '-';
  let description = '-';
  let h1 = '-';
  let canonical = '-';
  let robots = '-';
  let hasBreadcrumbList = false;
  let hasFAQPage = false;
  let hasProductTechArticle = false;
  let internalLinksCount = 0;
  let inSitemap = false;

  const body = res.body;

  if (res.status === 200 && res.headers['content-type']?.includes('text/html')) {
    const titleMatch = body.match(/<title[^>]*>(.*?)<\/title>/i);
    if (titleMatch) title = titleMatch[1].trim();

    const descMatch = body.match(/<meta\s+name=["']description["']\s+content=["'](.*?)["']/i);
    if (descMatch) description = descMatch[1].trim();

    const h1Match = body.match(/<h1[^>]*>(.*?)<\/h1>/i);
    if (h1Match) h1 = h1Match[1].replace(/<[^>]+>/g, '').trim();

    const canonicalMatch = body.match(/<link\s+rel=["']canonical["']\s+href=["'](.*?)["']/i);
    if (canonicalMatch) canonical = canonicalMatch[1].trim();

    const robotsMatch = body.match(/<meta\s+name=["']robots["']\s+content=["'](.*?)["']/i);
    if (robotsMatch) robots = robotsMatch[1].trim();
    if (res.headers['x-robots-tag']) robots = res.headers['x-robots-tag'];

    const jsonLdMatch = body.match(/<script type="application\/ld\+json">(.*?)<\/script>/s);
    if (jsonLdMatch) {
      const jsonStr = jsonLdMatch[1];
      hasBreadcrumbList = jsonStr.includes('"BreadcrumbList"');
      hasFAQPage = jsonStr.includes('"FAQPage"');
      hasProductTechArticle = jsonStr.includes('"Product"') || jsonStr.includes('"TechArticle"') || jsonStr.includes('"WebApplication"');
    }

    const linksMatches = body.match(/<a\s+(?:[^>]*?\s+)?href=["']([^"']*)["']/g) || [];
    internalLinksCount = linksMatches.filter(l => !l.includes('http://') && !l.includes('https://') || l.includes('stihldecoder.nl')).length;
  }

  // Check sitemap presence
  const sitemapLoc = `https://stihldecoder.nl${path}`;
  inSitemap = sitemapContent.includes(`<loc>${sitemapLoc}</loc>`);

  auditResults.push({
    path,
    status: res.status,
    redirect: res.headers['location'] || '-',
    title,
    h1,
    canonical,
    robots,
    hasBreadcrumbList: hasBreadcrumbList ? '✅ Ja' : '❌ Nee',
    hasFAQPage: hasFAQPage ? '✅ Ja' : '❌ Nee',
    hasProductTechArticle: hasProductTechArticle ? '✅ Ja' : '❌ Nee',
    internalLinksCount,
    inSitemap: inSitemap ? '✅ Ja' : '❌ Nee'
  });
}

console.log('\n==================================================');
console.log('LIVE AUDIT RESULTS TABLE');
console.log('==================================================\n');

console.table(auditResults);

fs.writeFileSync(
  path.join(__dirname, 'live_audit_results.json'),
  JSON.stringify(auditResults, null, 2),
  'utf8'
);

process.exit(0);

function fetchUrl(url) {
  return new Promise((resolve) => {
    http.get(url, (res) => {
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
