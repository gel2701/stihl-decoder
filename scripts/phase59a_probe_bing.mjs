/**
 * Phase 59A public index probe (Bing HTML) — READ ONLY.
 * Records only what an anonymous public index shows. No Amazon requests.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const sample = JSON.parse(fs.readFileSync(path.join(root, 'PHASE59A_PRODUCT_MATCH_SAMPLE.json'), 'utf8'));
const probePath = path.join(root, 'PHASE59A_INDEX_PROBES.json');
const existing = fs.existsSync(probePath) ? JSON.parse(fs.readFileSync(probePath, 'utf8')) : { probes: [] };
const done = new Set(existing.probes.filter(p => p.bing_http_status === 200).map(p => p.part_number));

const targets = [];
for (let i = 0; i < sample.parts.length; i += 20) targets.push(sample.parts[i]);
for (const extra of ['11231602050', '00000071043']) {
  const hit = sample.parts.find(p => p.part_number === extra);
  if (hit) targets.push(hit);
}
const unique = [...new Map(targets.map(p => [p.part_number, p])).values()].filter(p => !done.has(p.part_number));

function decode(s) {
  return s.replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
}

const probes = existing.probes;
for (const part of unique) {
  const q = `site:amazon.nl "${part.part_number_display}"`;
  const url = `https://www.bing.com/search?q=${encodeURIComponent(q)}&setlang=nl`;
  let status = null, body = '', error = null;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.8'
      }
    });
    status = res.status;
    body = await res.text();
  } catch (e) { error = String(e && e.message || e); }

  const results = [];
  for (const block of body.split('b_algo').slice(1)) {
    const link = block.match(/<h2[^>]*>\s*<a[^>]+href="([^"]+)"/);
    const title = block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/);
    const snip = block.match(/<p[^>]*>([\s\S]*?)<\/p>/);
    if (!link) continue;
    const target = decode(link[1]);
    results.push({
      url: target,
      title: title ? decode(title[1].replace(/<[^>]+>/g, '')).trim() : null,
      snippet: snip ? decode(snip[1].replace(/<[^>]+>/g, '')).trim() : null
    });
  }
  const amazon = results.filter(r => /^https?:\/\/(www\.)?amazon\.nl\//i.test(r.url));
  const asins = amazon.map(r => (r.url.match(/\/dp\/([A-Z0-9]{10})/i) || [])[1]).filter(Boolean);
  const noResults = /Er zijn geen resultaten|There are no results/i.test(body);

  const entry = {
    part_number: part.part_number,
    part_number_display: part.part_number_display,
    part_name: part.part_name,
    query: q,
    probe_url: url,
    bing_http_status: status,
    error,
    bing_no_results: noResults,
    bing_result_count: results.length,
    amazon_nl_result_count: amazon.length,
    amazon_nl_results: amazon.slice(0, 5),
    asins_observed: [...new Set(asins)],
    probed_at_utc: new Date().toISOString(),
    limits: 'Anonymous search-index snippets only. Amazon search/product pages were ACCESS_BLOCKED (HTTP 503 / CAPTCHA). No ASIN here is live-verified.'
  };
  const idx = probes.findIndex(p => p.part_number === part.part_number);
  if (idx >= 0) probes[idx] = { ...probes[idx], ...entry };
  else probes.push(entry);
  fs.writeFileSync(probePath, JSON.stringify({ schema_version: '1.0.0', phase: '59A', read_only: true, probes }, null, 2) + '\n');
  console.log(part.part_number, status, 'amazon=', amazon.length, 'asins=', [...new Set(asins)].join(','));
  await new Promise(r => setTimeout(r, 3000));
}
console.log('total', probes.length);
