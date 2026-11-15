/**
 * Phase 87 — browser-driven evidence collection for the Amazon recovery audit.
 *
 * The Amazon catalog cannot be read through the public HTTP path from this host
 * (503) and there is no PA-API authorization, so every observation below is taken
 * from the rendered page in a real browser session. The same session reads an
 * independent dealer catalog (Garden Hire Spares) for MPN/product corroboration.
 *
 * This module is executed from the browser sandbox, one bounded batch per call,
 * and appends to resumable JSON files under output/phase87/.
 */

const fs = require('fs');
const path = require('path');

const OUT_DIR = '/workspace/chats/270a802ba68d0ac21adbb1ad/output/phase87';

function ensureDir() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  ensureDir();
  fs.writeFileSync(file, JSON.stringify(value, null, 1) + '\n', 'utf8');
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function formatPart(p) {
  const m = String(p).match(/^(\d{4})(\d{3})(\d{4})$/);
  return m ? `${m[1]} ${m[2]} ${m[3]}` : String(p);
}

async function readAmazonProduct(page) {
  return page.evaluate(() => {
    const body = document.body.innerText.replace(/\s+/g, ' ');
    const isDead = /not a functioning page|Pagina niet gevonden|Sorry! Something went wrong/i.test(body);
    const title = (document.querySelector('#productTitle')?.innerText || '').replace(/\s+/g, ' ').trim();
    const avail = (document.querySelector('#availability')?.innerText || '').replace(/\s+/g, ' ').trim();
    const delivery = [
      ...(body.match(/(?:Levering|Bezorging|Delivery|Gratis bezorging|Free delivery)[^.|]{0,70}/gi) || [])
    ].slice(0, 4);
    const seller = [
      ...(body.match(/(?:Verkocht door|Verzonden door|Sold by|Dispatched from|Ships from)[:\s]*[A-Za-z0-9 .&'-]{2,40}/gi) || [])
    ].slice(0, 3);
    const pricePresent = !!document.querySelector('.a-price .a-offscreen, #corePrice_feature_div .a-offscreen');
    const asinShown = (body.match(/ASIN[:\s]*([A-Z0-9]{10})/) || [])[1] || null;
    const byline = (document.querySelector('#bylineInfo')?.innerText || '').replace(/\s+/g, ' ').trim();
    const bullets = [...document.querySelectorAll('#feature-bullets li')].map(li => li.innerText.replace(/\s+/g, ' ').trim()).slice(0, 6);
    return { isDead, title: title.slice(0, 220), avail: avail.slice(0, 80), delivery, seller, pricePresent, asinShown, byline: byline.slice(0, 120), bullets };
  });
}

async function checkAsins(page, asins, options = {}) {
  const statePath = path.join(OUT_DIR, 'amazon_product_checks.json');
  const state = readJson(statePath, {});
  const delay = options.delay ?? 2200;
  const results = [];
  for (const asin of asins) {
    if (state[asin] && !options.force) {
      results.push({ asin, cached: true });
      continue;
    }
    try {
      const resp = await page.goto(`https://www.amazon.nl/dp/${asin}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await sleep(1800);
      const data = await readAmazonProduct(page);
      const record = {
        asin,
        http_status: resp ? resp.status() : null,
        checked_at: new Date().toISOString(),
        listed: !data.isDead && data.http_status !== 404,
        ...data
      };
      state[asin] = record;
      results.push({ asin, listed: record.listed, title: record.title });
    } catch (err) {
      state[asin] = { asin, error: String(err).slice(0, 160), checked_at: new Date().toISOString(), listed: false };
      results.push({ asin, error: 'navigation failed' });
    }
    writeJson(statePath, state);
    await sleep(delay);
  }
  return results;
}

async function searchParts(page, parts, options = {}) {
  const statePath = path.join(OUT_DIR, 'amazon_search_hits.json');
  const state = readJson(statePath, {});
  const delay = options.delay ?? 2400;
  const results = [];
  for (const part of parts) {
    if (state[part] && !options.force) {
      results.push({ part, cached: true, hits: state[part].hits.length });
      continue;
    }
    const query = `STIHL ${formatPart(part)}`;
    try {
      await page.goto(`https://www.amazon.nl/s?k=${encodeURIComponent(query)}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await sleep(1800);
      const cards = await page.evaluate(() => {
        return [...document.querySelectorAll('div[data-component-type="s-search-result"]')].slice(0, 10).map(card => {
          const text = (card.innerText || '').replace(/\s+/g, ' ');
          const href = card.querySelector('a[href*="/dp/"]')?.getAttribute('href') || '';
          const asinFromHref = (href.match(/\/dp\/([A-Z0-9]{10})/) || [])[1] || null;
          return {
            asin: card.getAttribute('data-asin') || asinFromHref,
            title: ((card.querySelector('h2')?.innerText) || '').replace(/\s+/g, ' ').slice(0, 180),
            sponsored: /Gesponsord|Sponsored/i.test(text),
            has_price: !!card.querySelector('.a-price'),
            delivery: (text.match(/(?:Levering|Gratis bezorging|Delivery)[^.|]{0,40}/i) || [''])[0]
          };
        }).filter(c => c.asin);
      });
      state[part] = { part, query, checked_at: new Date().toISOString(), hits: cards };
      results.push({ part, hits: cards.length });
    } catch (err) {
      state[part] = { part, query, error: String(err).slice(0, 160), checked_at: new Date().toISOString(), hits: [] };
      results.push({ part, error: 'navigation failed' });
    }
    writeJson(statePath, state);
    await sleep(delay);
  }
  return results;
}

async function dealerCorroborate(page, parts, options = {}) {
  const statePath = path.join(OUT_DIR, 'dealer_corroboration.json');
  const state = readJson(statePath, {});
  const delay = options.delay ?? 1200;
  const results = [];
  for (const part of parts) {
    if (state[part] && !options.force) {
      results.push({ part, cached: true, found: !!state[part].found });
      continue;
    }
    const formatted = formatPart(part);
    try {
      await page.goto(`https://www.gardenhirespares.co.uk/catalogsearch/result/?q=${encodeURIComponent(formatted)}`, { waitUntil: 'domcontentloaded', timeout: 40000 });
      await sleep(900);
      const data = await page.evaluate(() => {
        const text = document.body.innerText;
        const clean = text.replace(/\r/g, '');
        const items = (clean.match(/(\d+)\s+Items?/) || [])[1] || '0';
        const lines = clean.split('\n').map(l => l.trim()).filter(Boolean);
        const start = lines.findIndex(l => /^\d+ Items?$/.test(l));
        const slice = start >= 0 ? lines.slice(start, start + 40) : [];
        // Product blocks start with a line containing the searched part number.
        const hits = [];
        for (let i = 0; i < slice.length; i++) {
          if (/^\d+ Items?$/.test(slice[i])) continue;
          if (/Part no\.|£|ADD|Sort By|View \d/i.test(slice[i])) continue;
          if (/^[A-Z0-9][A-Za-z0-9 ,./'"()&+-]{10,140}$/.test(slice[i]) && slice[i].split(' ').length >= 3) hits.push(slice[i]);
        }
        const pdfLike = /No results|Geen resultaten/i.test(text);
        return { items: Number(items), hits: [...new Set(hits)].slice(0, 3), noResults: pdfLike, pageText: clean.replace(/\s+/g, ' ').slice(0, 400) };
      });
      const exact = data.hits.filter(h => h.replace(/[\s.-]/g, '').includes(part));
      state[part] = {
        part,
        source: 'gardenhirespares.co.uk',
        source_url: page.url(),
        checked_at: new Date().toISOString(),
        found: exact.length > 0,
        items: data.items,
        hits: exact.slice(0, 3),
        all_hits: data.hits.slice(0, 3),
        no_results: data.noResults
      };
      results.push({ part, found: exact.length > 0, hits: exact.slice(0, 1) });
    } catch (err) {
      state[part] = { part, error: String(err).slice(0, 160), checked_at: new Date().toISOString(), found: false, hits: [] };
      results.push({ part, error: 'navigation failed' });
    }
    writeJson(statePath, state);
    await sleep(delay);
  }
  return results;
}

module.exports = { checkAsins, searchParts, dealerCorroborate, formatPart, OUT_DIR };
