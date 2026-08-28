import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const LIVE_VALIDATION_PATH = path.join(process.cwd(), 'data', 'phase34a_live_validation.json');
const OUTPUT_PATH = path.join(process.cwd(), 'data', 'seo_baseline.json');

function hashEntry(entry) {
  return crypto.createHash('sha256').update(JSON.stringify({
    title: entry.title || '',
    description: entry.description || '',
    h1: entry.h1 || '',
    canonical: entry.canonical || '',
    robots: entry.robots || '',
    jsonLdTypes: entry.json_ld_types || []
  })).digest('hex');
}

if (!fs.existsSync(LIVE_VALIDATION_PATH)) {
  throw new Error(`Missing live validation file: ${LIVE_VALIDATION_PATH}`);
}

const liveValidation = JSON.parse(fs.readFileSync(LIVE_VALIDATION_PATH, 'utf8'));
const crawlSource = Array.isArray(liveValidation.discovered_indexable_urls) && liveValidation.discovered_indexable_urls.length > 0
  ? liveValidation.discovered_indexable_urls
  : liveValidation.page_results;

const htmlIndexableEntries = crawlSource.filter((entry) => {
  const robots = String(entry.robots || 'index, follow').toLowerCase();
  return String(entry.content_type || '').includes('text/html') && !robots.includes('noindex');
});

const baselineEntries = htmlIndexableEntries.map((entry) => {
  const pathName = new URL(entry.url).pathname;
  const description = entry.meta_description || null;
  const h1 = entry.h1 || null;
  return {
    path: pathName,
    title: entry.title || null,
    description,
    h1,
    canonical: entry.canonical || null,
    robots: entry.robots || 'index, follow',
    json_ld_types: entry.json_ld_types || [],
    seo_hash: hashEntry({
      title: entry.title || null,
      description,
      h1,
      canonical: entry.canonical || null,
      robots: entry.robots || 'index, follow',
      json_ld_types: entry.json_ld_types || []
    })
  };
}).sort((a, b) => a.path.localeCompare(b.path));

const payload = {
  baseline_name: 'FASE 34B SEO CONTENT FREEZE BASELINE',
  generated_at: new Date().toISOString(),
  source: 'live_https_production_crawl',
  validation_target: liveValidation.validation_target,
  sitemap_pre_count: liveValidation.pre_url_count,
  sitemap_post_count: liveValidation.sitemap_url_count,
  url_added_count: liveValidation.url_delta.added.length,
  url_removed_count: liveValidation.url_delta.removed.length,
  discovered_indexable_total: liveValidation.discovered_indexable_total || htmlIndexableEntries.length,
  baseline_difference: Math.abs((liveValidation.discovered_indexable_total || htmlIndexableEntries.length) - baselineEntries.length),
  indexable_entries: baselineEntries.length,
  entries: baselineEntries
};

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2));
console.log(`✅ Wrote ${OUTPUT_PATH} with ${baselineEntries.length} normalized SEO signatures.`);
