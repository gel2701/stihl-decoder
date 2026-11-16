/**
 * scripts/phase87_3_dealer_enrich.mjs
 *
 * Fetches independent dealer-catalog corroboration from gardenhirespares.co.uk
 * for all candidate part numbers in output/phase87_3/existing_checked_pool.json
 * that are not yet cached in output/phase87_2/dealer_corroboration.json.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const OUT = path.join(ROOT, 'output', 'phase87_3');
const readOpt = (p, fb) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fb; } };

const prevDealer = readOpt(path.join(ROOT, 'output', 'phase87_2', 'dealer_corroboration.json'), {});
const outPath = path.join(OUT, 'dealer_corroboration.json');
const curDealer = { ...prevDealer, ...readOpt(outPath, {}) };
const pool = readOpt(path.join(OUT, 'existing_checked_pool.json'), []);

const digits = s => String(s || '').replace(/[^0-9]/g, '');
const formatPart = p => {
  const m = String(p).match(/^(\d{4})(\d{3})(\d{4})$/);
  return m ? `${m[1]} ${m[2]} ${m[3]}` : p;
};

const todoParts = [...new Set(pool.map(r => r.part_number))].filter(pn => !curDealer[pn]);
console.log(`[dealer] pending parts=${todoParts.length} (cached=${Object.keys(curDealer).length})`);

const sleep = ms => new Promise(r => setTimeout(r, ms));
let idx = 0;
let okCount = 0;

async function worker() {
  while (idx < todoParts.length) {
    const pn = todoParts[idx++];
    const query = formatPart(pn);
    const url = `https://www.gardenhirespares.co.uk/catalogsearch/result/?q=${encodeURIComponent(query)}`;
    try {
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; STIHLDecoder-Audit/1.0)' },
        signal: AbortSignal.timeout(12000)
      });
      if (!resp.ok) {
        curDealer[pn] = { part: pn, http_status: resp.status, hits: [], checked_at: new Date().toISOString() };
        continue;
      }
      const html = await resp.text();
      const links = [...html.matchAll(/<a[^>]+class="product-item-link"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)]
        .map(m => ({ url: m[1].trim(), title: m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() }))
        .filter(h => digits(h.title).includes(pn));
      curDealer[pn] = {
        part: pn,
        query,
        search_url: url,
        checked_at: new Date().toISOString(),
        hits: links.slice(0, 3)
      };
      if (links.length > 0) okCount++;
      await sleep(120);
    } catch (err) {
      curDealer[pn] = { part: pn, error: err.message.slice(0, 80), hits: [], checked_at: new Date().toISOString() };
    }
  }
}

await Promise.all([worker(), worker(), worker(), worker()]);
fs.writeFileSync(outPath, JSON.stringify(curDealer, null, 2) + '\n', 'utf8');
console.log(`[dealer] DONE total=${Object.keys(curDealer).length}, new_exact_hits=${okCount}`);
