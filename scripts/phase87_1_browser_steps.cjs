/**
 * Phase 87.1 — browser-driven Amazon evidence collection.
 *
 * Amazon.nl/.de cannot be read over plain HTTP from this host (503) and there is
 * no PA-API authorization, so every observation is taken from the rendered page in
 * a real browser session, the same way Phase 87 did it. Nothing here bypasses an
 * access control and no price/stock claim is stored beyond "a price element was
 * present" (a rendering fact, not a quotation).
 *
 * Executed from the browser sandbox, one bounded batch per call, appending to
 * resumable JSON files under output/phase87_1/.
 */

const fs = require('fs');
const path = require('path');

const OUT_DIR = '/workspace/chats/270a802ba68d0ac21adbb1ad/output/phase87_1';
const ROOT = '/workspace/chats/270a802ba68d0ac21adbb1ad';

function ensureDir() { fs.mkdirSync(OUT_DIR, { recursive: true }); }
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, value) {
  ensureDir();
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 1) + '\n', 'utf8');
  fs.renameSync(tmp, file);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

function formatPart(p) {
  const m = String(p).match(/^(\d{4})(\d{3})(\d{4})$/);
  return m ? `${m[1]} ${m[2]} ${m[3]}` : String(p);
}

function digits(s) { return String(s || '').replace(/[^0-9]/g, ''); }

async function readProduct(page) {
  return page.evaluate(() => {
    const body = (document.body.innerText || '').replace(/\s+/g, ' ');
    const isDead = /not a functioning page|Pagina niet gevonden|Sorry! Something went wrong|Page Not Found/i.test(body);
    const title = (document.querySelector('#productTitle')?.innerText || '').replace(/\s+/g, ' ').trim();
    const byline = (document.querySelector('#bylineInfo')?.innerText || '').replace(/\s+/g, ' ').trim();
    const avail = (document.querySelector('#availability')?.innerText || '').replace(/\s+/g, ' ').trim();
    const delivery = [...(body.match(/(?:Levering|Bezorging|Delivery|Gratis bezorging|Free delivery|Lieferung)[^.|]{0,70}/gi) || [])].slice(0, 4);
    const seller = [...(body.match(/(?:Verkocht door|Verzonden door|Sold by|Dispatched from|Ships from|Verkauf durch)[:\s]*[A-Za-z0-9 .&'-]{2,40}/gi) || [])].slice(0, 3);
    const bullets = [...document.querySelectorAll('#feature-bullets li')].map(li => li.innerText.replace(/\s+/g, ' ').trim()).slice(0, 8);
    const description = (document.querySelector('#productDescription')?.innerText || document.body.innerText).replace(/\s+/g, ' ').slice(0, 1200);
    const hasPrice = !!document.querySelector('.a-price .a-offscreen, #corePrice_feature_div .a-offscreen');
    const asinShown = (body.match(/ASIN[:\s]*([A-Z0-9]{10})/) || [])[1] || null;
    const brandCrumb = (document.querySelector('#wayfinding-breadcrumbs_feature_div')?.innerText || '').replace(/\s+/g, ' ').trim();
    return { isDead, title: title.slice(0, 240), byline: byline.slice(0, 120), avail: avail.slice(0, 100), delivery, seller, bullets, description, hasPrice, asinShown, brandCrumb: brandCrumb.slice(0, 160) };
  });
}

async function searchParts(page, parts, options = {}) {
  const marketplace = options.marketplace || 'amazon.nl';
  const statePath = path.join(OUT_DIR, `search_hits_${marketplace.replace('.', '_')}.json`);
  const state = readJson(statePath, {});
  const results = [];
  for (const part of parts) {
    if (state[part] && !options.force) { results.push({ part, cached: true, hits: state[part].hits.length }); continue; }
    const query = `STIHL ${formatPart(part)}`;
    try {
      await page.goto(`https://www.${marketplace}/s?k=${encodeURIComponent(query)}`, { waitUntil: 'domcontentloaded', timeout: 40000 });
      await sleep(1100);
      const cards = await page.evaluate(() => {
        return [...document.querySelectorAll('div[data-component-type="s-search-result"]')].slice(0, 12).map(card => {
          const text = (card.innerText || '').replace(/\s+/g, ' ');
          const href = card.querySelector('a[href*="/dp/"]')?.getAttribute('href') || '';
          const asinFromHref = (href.match(/\/dp\/([A-Z0-9]{10})/) || [])[1] || null;
          return {
            asin: card.getAttribute('data-asin') || asinFromHref,
            title: ((card.querySelector('h2')?.innerText) || '').replace(/\s+/g, ' ').slice(0, 200),
            sponsored: /Gesponsord|Sponsored/i.test(text),
            has_price: !!card.querySelector('.a-price'),
            delivery: (text.match(/(?:Levering|Gratis bezorging|Delivery|Lieferung)[^.|]{0,40}/i) || [''])[0]
          };
        }).filter(c => c.asin);
      });
      state[part] = { part, marketplace, query, checked_at: new Date().toISOString(), hits: cards };
      results.push({ part, hits: cards.length, relevant: cards.filter(c => digits(c.title).includes(part)).length });
    } catch (err) {
      state[part] = { part, marketplace, query, error: String(err).slice(0, 160), checked_at: new Date().toISOString(), hits: [] };
      results.push({ part, error: 'navigation failed' });
    }
    writeJson(statePath, state);
    await sleep(options.delay ?? 600);
  }
  return results;
}

async function checkAsins(page, asins, options = {}) {
  const marketplace = options.marketplace || 'amazon.nl';
  const statePath = path.join(OUT_DIR, `product_checks_${marketplace.replace('.', '_')}.json`);
  const state = readJson(statePath, {});
  const results = [];
  for (const asin of asins) {
    if (state[asin] && !options.force) { results.push({ asin, cached: true, listed: state[asin].listed }); continue; }
    try {
      const resp = await page.goto(`https://www.${marketplace}/dp/${asin}`, { waitUntil: 'domcontentloaded', timeout: 40000 });
      await sleep(1400);
      const data = await readProduct(page);
      const record = { asin, marketplace, http_status: resp ? resp.status() : null, checked_at: new Date().toISOString(), listed: !data.isDead && (resp ? resp.status() : 200) < 400, ...data };
      state[asin] = record;
      results.push({ asin, listed: record.listed, title: record.title, byline: record.byline });
    } catch (err) {
      state[asin] = { asin, marketplace, error: String(err).slice(0, 160), checked_at: new Date().toISOString(), listed: false };
      results.push({ asin, error: 'navigation failed' });
    }
    writeJson(statePath, state);
    await sleep(options.delay ?? 700);
  }
  return results;
}

async function dealerCorroborate(page, parts, options = {}) {
  const statePath = path.join(OUT_DIR, 'dealer_corroboration.json');
  const state = readJson(statePath, {});
  const results = [];
  for (const part of parts) {
    if (state[part] && !options.force) { results.push({ part, cached: true, found: !!state[part].found }); continue; }
    const formatted = formatPart(part);
    try {
      await page.goto(`https://www.gardenhirespares.co.uk/catalogsearch/result/?q=${encodeURIComponent(formatted)}`, { waitUntil: 'domcontentloaded', timeout: 40000 });
      await sleep(800);
      const data = await page.evaluate(() => {
        const text = document.body.innerText.replace(/\r/g, '');
        const items = (text.match(/(\d+)\s+Items?/) || [])[1] || '0';
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        const start = lines.findIndex(l => /^\d+ Items?$/.test(l));
        const slice = start >= 0 ? lines.slice(start, start + 40) : [];
        const hits = [];
        for (const line of slice) {
          if (/^\d+ Items?$/.test(line)) continue;
          if (/Part no\.|£|ADD|Sort By|View \d/i.test(line)) continue;
          if (/^[A-Z0-9][A-Za-z0-9 ,./'"()&+-]{10,160}$/.test(line) && line.split(' ').length >= 3) hits.push(line);
        }
        return { items: Number(items), hits: [...new Set(hits)].slice(0, 4), noResults: /No results|Geen resultaten/i.test(text), pageText: text.replace(/\s+/g, ' ').slice(0, 500) };
      });
      const exact = data.hits.filter(h => digits(h).includes(part));
      state[part] = { part, source: 'gardenhirespares.co.uk', source_url: page.url(), checked_at: new Date().toISOString(), found: exact.length > 0, items: data.items, hits: exact.slice(0, 3), all_hits: data.hits.slice(0, 3), no_results: data.noResults };
      results.push({ part, found: exact.length > 0, hits: exact.slice(0, 1) });
    } catch (err) {
      state[part] = { part, error: String(err).slice(0, 160), checked_at: new Date().toISOString(), found: false, hits: [] };
      results.push({ part, error: 'navigation failed' });
    }
    writeJson(statePath, state);
    await sleep(options.delay ?? 700);
  }
  return results;
}

/** Search the OEM number plus an alternative keyword set (product name, brands). */
async function searchByName(page, entries, options = {}) {
  const marketplace = options.marketplace || 'amazon.nl';
  const statePath = path.join(OUT_DIR, `name_search_hits_${marketplace.replace('.', '_')}.json`);
  const state = readJson(statePath, {});
  const results = [];
  for (const entry of entries) {
    const key = `${entry.part}`;
    if (state[key] && !options.force) { results.push({ part: key, cached: true, hits: state[key].hits.length }); continue; }
    try {
      await page.goto(`https://www.${marketplace}/s?k=${encodeURIComponent(entry.query)}`, { waitUntil: 'domcontentloaded', timeout: 40000 });
      await sleep(1100);
      const cards = await page.evaluate(() => [...document.querySelectorAll('div[data-component-type="s-search-result"]')].slice(0, 12).map(card => {
        const text = (card.innerText || '').replace(/\s+/g, ' ');
        const href = card.querySelector('a[href*="/dp/"]')?.getAttribute('href') || '';
        return {
          asin: card.getAttribute('data-asin') || (href.match(/\/dp\/([A-Z0-9]{10})/) || [])[1] || null,
          title: ((card.querySelector('h2')?.innerText) || '').replace(/\s+/g, ' ').slice(0, 200),
          sponsored: /Gesponsord|Sponsored/i.test(text),
          has_price: !!card.querySelector('.a-price'),
          delivery: (text.match(/(?:Levering|Gratis bezorging|Delivery|Lieferung)[^.|]{0,40}/i) || [''])[0]
        };
      }).filter(c => c.asin));
      state[key] = { part: key, marketplace, query: entry.query, checked_at: new Date().toISOString(), hits: cards };
      results.push({ part: key, hits: cards.length, relevant: cards.filter(c => digits(c.title).includes(entry.part)).length });
    } catch (err) {
      state[key] = { part: key, marketplace, query: entry.query, error: String(err).slice(0, 200), hits: [] };
      results.push({ part: key, error: 'navigation failed' });
    }
    writeJson(statePath, state);
    await sleep(options.delay ?? 600);
  }
  return results;
}

module.exports = { searchParts, searchByName, checkAsins, dealerCorroborate, formatPart, digits, OUT_DIR, ROOT };
