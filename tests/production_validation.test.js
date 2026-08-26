import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '..', 'data', 'stihl_database.json');
const database = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

// Start server on port 3098 for clean test isolation
process.env.PORT = '3098';
await import('../server.js');

// Wait 500ms for server startup
await new Promise(r => setTimeout(r, 500));

console.log('🧪 Starting Phase 26 Production Audit & Validation Scan...\n');

const sitemapRes = await fetchUrl('http://localhost:3098/sitemap.xml');
const sitemapXml = sitemapRes.body;

// Extract all <loc> URLs from sitemap
const sitemapUrls = (sitemapXml.match(/<loc>(.*?)<\/loc>/g) || []).map(l => l.replace(/<\/?loc>/g, ''));

console.log(`📡 Sitemap URLs count: ${sitemapUrls.length}`);

// Audit Checks
let localhostMatchesCount = 0;
let canonicalErrorsCount = 0;
let noindexErrorsCount = 0;
let orphanPagesCount = 0;
let sitemapErrorsCount = 0;
const titleMap = new Map();
const descMap = new Map();
const duplicateTitles = [];
const duplicateDescriptions = [];
const pageAuditList = [];

// Internal Link Graph Tracker
const internalLinksFound = new Set();
internalLinksFound.add('/');

for (const fullUrl of sitemapUrls) {
  const relPath = fullUrl.replace('https://stihldecoder.nl', '');
  const localUrl = `http://localhost:3098${relPath}`;
  const res = await fetchUrl(localUrl);

  let status = res.status;
  let body = res.body;

  if (status !== 200) {
    sitemapErrorsCount++;
  }

  // 1. Check Localhost / Dev strings in HTML or JSON-LD
  if (body.includes('localhost') || body.includes('127.0.0.1') || body.includes('0.0.0.0')) {
    localhostMatchesCount++;
    console.error(`❌ Localhost match found in ${relPath}`);
  }

  // 2. Canonical Check
  const canonicalMatch = body.match(/<link\s+rel=["']canonical["']\s+href=["'](.*?)["']/i);
  const canonicalUrl = canonicalMatch ? canonicalMatch[1] : '';
  if (!canonicalUrl || canonicalUrl !== fullUrl) {
    canonicalErrorsCount++;
    console.error(`❌ Canonical error in ${relPath}: Expected ${fullUrl}, got ${canonicalUrl}`);
  }

  // 3. Noindex Check on indexable SEO pages
  if (body.includes('noindex') || res.headers['x-robots-tag']?.includes('noindex')) {
    noindexErrorsCount++;
    console.error(`❌ Noindex tag found on indexable SEO page ${relPath}`);
  }

  // 4. Extract Title & Description for Duplicates Check
  const titleMatch = body.match(/<title[^>]*>(.*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : '';

  const descMatch = body.match(/<meta\s+name=["']description["']\s+content=["'](.*?)["']/i);
  const description = descMatch ? descMatch[1].trim() : '';

  if (title) {
    if (titleMap.has(title)) {
      duplicateTitles.push({ title, pages: [titleMap.get(title), relPath] });
    } else {
      titleMap.set(title, relPath);
    }
  }

  if (description) {
    if (descMap.has(description)) {
      duplicateDescriptions.push({ description, pages: [descMap.get(description), relPath] });
    } else {
      descMap.set(description, relPath);
    }
  }

  // 5. Interlinking / Crawl Graph
  const linksMatches = body.match(/<a\s+(?:[^>]*?\s+)?href=["']([^"']*)["']/g) || [];
  linksMatches.forEach(l => {
    const hrefMatch = l.match(/href=["']([^"']*)["']/i);
    if (hrefMatch) {
      const href = hrefMatch[1];
      if (href.startsWith('/')) {
        internalLinksFound.add(href);
      }
    }
  });

  // Calculate Quality Score
  let qualityScore = 0;
  if (title && title.length >= 25) qualityScore += 10;
  if (description && description.length >= 70) qualityScore += 10;
  if (body.includes('<h1')) qualityScore += 10;
  if (canonicalUrl === fullUrl) qualityScore += 10;
  if (body.includes('BreadcrumbList')) qualityScore += 10;
  if (body.includes('application/ld+json')) qualityScore += 10;
  if (linksMatches.length >= 3) qualityScore += 10;
  if (body.length >= 2000) qualityScore += 10;
  if (status === 200) qualityScore += 10;
  if (!body.includes('noindex')) qualityScore += 10;

  pageAuditList.push({
    url: fullUrl,
    status,
    title,
    canonicalUrl,
    qualityScore
  });
}

// 6. Check Orphan Pages
for (const fullUrl of sitemapUrls) {
  const relPath = fullUrl.replace('https://stihldecoder.nl', '');
  if (!internalLinksFound.has(relPath) && relPath !== '/') {
    orphanPagesCount++;
    console.warn(`⚠️ Orphan page detected: ${relPath}`);
  }
}

console.log('\n==================================================');
console.log('PRODUCTION VALIDATION SUMMARY');
console.log('==================================================');
console.log(`- Sitemap URLs: ${sitemapUrls.length}`);
console.log(`- Localhost Matches: ${localhostMatchesCount}`);
console.log(`- Canonical Errors: ${canonicalErrorsCount}`);
console.log(`- Noindex Errors: ${noindexErrorsCount}`);
console.log(`- Sitemap HTTP Errors: ${sitemapErrorsCount}`);
console.log(`- Duplicate Titles: ${duplicateTitles.length}`);
console.log(`- Duplicate Descriptions: ${duplicateDescriptions.length}`);
console.log(`- Orphan Pages: ${orphanPagesCount}`);

const isGo = (
  localhostMatchesCount === 0 &&
  canonicalErrorsCount === 0 &&
  noindexErrorsCount === 0 &&
  sitemapErrorsCount === 0 &&
  duplicateTitles.length === 0 &&
  duplicateDescriptions.length === 0 &&
  orphanPagesCount === 0
);

console.log(`\n🚦 DECISION: ${isGo ? '✅ GO' : '❌ NO-GO'}\n`);

fs.writeFileSync(
  path.join(__dirname, 'production_audit_report.json'),
  JSON.stringify({
    decision: isGo ? 'GO' : 'NO-GO',
    sitemapUrlsCount: sitemapUrls.length,
    localhostMatchesCount,
    canonicalErrorsCount,
    noindexErrorsCount,
    sitemapErrorsCount,
    duplicateTitlesCount: duplicateTitles.length,
    duplicateDescriptionsCount: duplicateDescriptions.length,
    orphanPagesCount,
    pageAuditList
  }, null, 2),
  'utf8'
);

process.exit(isGo ? 0 : 1);

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
