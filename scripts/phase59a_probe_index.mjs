/**
 * Phase 59A public index probe — READ ONLY.
 * Queries the public DuckDuckGo HTML index for site:amazon.nl "<part number>"
 * and records exactly what is observable. Never contacts Amazon directly.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const samplePath = path.join(root, 'PHASE59A_PRODUCT_MATCH_SAMPLE.json');
const sample = JSON.parse(fs.readFileSync(samplePath, 'utf8'));
const probePath = path.join(root, 'PHASE59A_INDEX_PROBES.json');

const existing = fs.existsSync(probePath) ? JSON.parse(fs.readFileSync(probePath, 'utf8')) : { probes: [] };
const done = new Set(existing.probes.map(p => p.part_number));

const targets = [];
for (let i = 0; i < sample.parts.length; i += 20) targets.push(sample.parts[i]);
for (const extra of ['11231602050', '00000071043', '11211602050']) {
  const hit = sample.parts.find(p => p.part_number === extra);
  if (hit) targets.push(hit);
}
const unique = [...new Map(targets.map(p => [p.part_number, p])).values()].filter(p => !done.has(p.part_number));

function decode(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function parse(html) {
  const results = [];
  const blocks = html.split('result__body').slice(1);
  for (const b of blocks) {
    const link = b.match(/href="([^"]*uddg=[^"]+)"/);
    const title = b.match(/result__a[^>]*>([\s\S]*?)<\/a>/);
    const snippet = b.match(/result__snippet[^>]*>([\s\S]*?)<\/a>/);
    if (!link) continue;
    const uddg = new URL(decode(link[1]).replace(/^\/\//, 'https://'), 'https://duckduckgo.com');
    const target = uddg.searchParams.get('uddg') || '';
    results.push({
      url: target,
      title: title ? decode(title[1].replace(/<[^>]+>/g, '')).trim() : null,
      snippet: snippet ? decode(snippet[1].replace(/<[^>]+>/g, '')).trim() : null
    });
  }
  return results;
}

const probes = existing.probes;
for (const part of unique) {
  const q = `site:amazon.nl "${part.part_number_display}"`;
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
  let status = null, bodyText = '', results = [], error = null;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.8'
      }
    });
    status = res.status;
    bodyText = await res.text();
    results = parse(bodyText);
  } catch (e) {
    error = String(e && e.message || e);
  }
  const amazonResults = results.filter(r => /^https?:\/\/(www\.)?amazon\.nl\//i.test(r.url));
  const asins = amazonResults.map(r => (r.url.match(/\/dp\/([A-Z0-9]{10})/i) || [])[1]).filter(Boolean);
  const noResults = /No results found/i.test(bodyText);
  probes.push({
    part_number: part.part_number,
    part_number_display: part.part_number_display,
    part_name: part.part_name,
    query: q,
    probe_url: url,
    http_status: status,
    error,
    ddg_no_results: noResults,
    result_count: results.length,
    amazon_nl_result_count: amazonResults.length,
    amazon_nl_results: amazonResults.slice(0, 5),
    asins_observed: [...new Set(asins)],
    probed_at_utc: new Date().toISOString(),
    limits: 'Indexed snippets only. Amazon search/product pages were ACCESS_BLOCKED (HTTP 503 / CAPTCHA); nothing here is a live-verified Amazon offer.'
  });
  fs.writeFileSync(probePath, JSON.stringify({ schema_version: '1.0.0', phase: '59A', read_only: true, probes }, null, 2) + '\n');
  console.log(part.part_number, status, 'amazon_nl=', amazonResults.length, 'asins=', [...new Set(asins)].join(','));
  await new Promise(r => setTimeout(r, 2500));
}
console.log('probes total', probes.length);
