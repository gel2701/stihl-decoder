/**
 * Live HTML Crawl & Page Hash Generator for FASE 34 SEO Baseline Snapshot
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

import { PRIMARY_ORIGIN } from '../src/config.js';

const PORT = 3097;
process.env.PORT = String(PORT);
process.env.NODE_ENV = 'production';

await import('../server.js');
await new Promise(r => setTimeout(r, 600));

const databasePath = path.join(process.cwd(), 'data', 'stihl_database.json');
const database = JSON.parse(fs.readFileSync(databasePath, 'utf8'));

console.log(`🚀 Live Crawl connected to test server on port ${PORT}...`);

const urlsToCrawl = [
  '/',
  '/kettingzagen/ms-261/',
  '/bosmaaiers/fs-100/',
  '/bladblazers/br-600/',
  '/doorslijpers/ts-420/',
  '/stihl-serienummer-decoder/',
  '/sitemap.xml',
  '/robots.txt',
  '/favicon.ico'
];

function fetchUrl(urlPath) {
  return new Promise((resolve, reject) => {
    http.get({
      hostname: 'localhost',
      port: PORT,
      path: urlPath,
      headers: {
        'Host': 'www.stihldecoder.nl',
        'x-forwarded-host': 'www.stihldecoder.nl',
        'x-forwarded-proto': 'https'
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
    }).on('error', reject);
  });
}

const crawlResults = [];
const pageHashes = {};

for (const urlPath of urlsToCrawl) {
  const res = await fetchUrl(urlPath);
  const hash = crypto.createHash('sha256').update(res.body).digest('hex').substring(0, 16);
  pageHashes[urlPath] = hash;

  const titleMatch = res.body.match(/<title>(.*?)<\/title>/);
  const h1Count = (res.body.match(/<h1[\s>]/g) || []).length;
  const canonicalMatch = res.body.match(/<link rel="canonical" href="(.*?)"/);

  crawlResults.push({
    path: urlPath,
    status: res.statusCode,
    title: titleMatch ? titleMatch[1] : null,
    h1Count,
    canonical: canonicalMatch ? canonicalMatch[1] : null,
    hash
  });
}

console.log('CRAWL RESULTS:');
console.table(crawlResults);

// Generate data/seo_baseline_current.json
const preUrlsData = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'phase34_pre_urls.json'), 'utf8'));

const baselineData = {
  baseline_status: 'SEO_CONTENT_FREEZE_ACTIVE',
  based_on_commit: '1f7dacb',
  created_at: new Date().toISOString(),
  primary_origin: PRIMARY_ORIGIN,
  sitemap_url_count: preUrlsData.total_count,
  category_count: 5,
  model_page_count: (database.models || []).length,
  intent_count: (database.intent_pages || []).length,
  guide_count: (database.guides || []).length,
  page_hashes: pageHashes
};

fs.writeFileSync(path.join(process.cwd(), 'data', 'seo_baseline_current.json'), JSON.stringify(baselineData, null, 2));
console.log('✅ Generated data/seo_baseline_current.json successfully!');
process.exit(0);
