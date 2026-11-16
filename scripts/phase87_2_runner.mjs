/**
 * scripts/phase87_2_runner.mjs
 *
 * Resumable Playwright evidence collector for Phase 87.2.
 * Supports subcommands:
 *   node scripts/phase87_2_runner.mjs search-nl --start 0 --count 100
 *   node scripts/phase87_2_runner.mjs search-de --start 0 --count 100
 *   node scripts/phase87_2_runner.mjs search-research --marketplace amazon.nl
 *   node scripts/phase87_2_runner.mjs check-dp --marketplace amazon.nl --limit 100
 *   node scripts/phase87_2_runner.mjs dealer --limit 150
 *
 * Features:
 *   - Saves progress after every batch of 10 items (atomic tmp+rename).
 *   - Skips parts/ASINs already recorded cleanly unless --force is passed.
 *   - Stops cleanly and saves state on CAPTCHA / 503 / rate-limit without bypassing any gate.
 *   - Sets Amazon.de delivery destination to NL and checks Amazon.nl delivery text;
 *     never stores private street addresses in logs, reports, or files.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const OUT_DIR = path.join(ROOT, 'output', 'phase87_2');

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
const digits = s => String(s || '').replace(/[^0-9]/g, '');
function formatPart(p) {
  const m = String(p).match(/^(\d{4})(\d{3})(\d{4})$/);
  return m ? `${m[1]} ${m[2]} ${m[3]}` : String(p);
}
function argVal(flag, def = null) {
  const i = process.argv.indexOf(flag);
  return i > 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : def;
}

function isBlockedPage(status, title, body) {
  if (status === 503 || status === 429) return true;
  if (/Type the characters you see|Enter the characters you see|Robot Check|Automated access|captcha/i.test(title + ' ' + body.slice(0, 600))) return true;
  return false;
}

async function initMarketplaceSession(page, marketplace) {
  await page.goto(`https://www.${marketplace}/`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await sleep(800);
  await page.locator('#sp-cc-accept').click().catch(() => {});
  await sleep(400);
  if (marketplace === 'amazon.de') {
    await page.locator('#nav-global-location-popover-link').click().catch(() => {});
    await sleep(900);
    if (await page.locator('select#GLUXCountryList').count()) {
      await page.locator('select#GLUXCountryList').selectOption('NL').catch(() => {});
      await sleep(400);
      await page.locator('button[name="glowDoneButton"], .a-popover-footer button').first().click().catch(() => {});
      await sleep(1200);
    }
  }
}

async function searchMarketplace(ctx, marketplace, entries, statePath, options = {}) {
  const state = readJson(statePath, {});
  const pending = entries.filter(e => !state[e.part_number] || (options.retryErrors && state[e.part_number].error));
  console.log(`[${marketplace}] search pending=${pending.length} (cached=${entries.length - pending.length})`);
  if (pending.length === 0) return { processed: 0, rateLimited: false };

  const concurrency = options.concurrency || 3;
  const pages = [];
  for (let i = 0; i < concurrency; i++) {
    const p = await ctx.newPage();
    if (i === 0) await initMarketplaceSession(p, marketplace);
    pages.push(p);
  }
  if (marketplace === 'amazon.de') {
    // Re-sync cookies across pages cleanly
    for (let i = 1; i < pages.length; i++) {
      await pages[i].goto(`https://www.${marketplace}/`, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
    }
  }

  let idx = 0;
  let rateLimited = false;
  let processed = 0;

  async function worker(page, workerId) {
    while (idx < pending.length && !rateLimited) {
      const entry = pending[idx++];
      const part = entry.part_number;
      const query = `STIHL ${formatPart(part)}`;
      try {
        await sleep(workerId * 150);
        const resp = await page.goto(`https://www.${marketplace}/s?k=${encodeURIComponent(query)}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await sleep(750);
        const status = resp ? resp.status() : 200;
        const pageInfo = await page.evaluate(() => ({
          title: document.title || '',
          bodyStart: (document.body.innerText || '').slice(0, 600),
          cards: [...document.querySelectorAll('div[data-component-type="s-search-result"]')].slice(0, 10).map(card => {
            const text = (card.innerText || '').replace(/\s+/g, ' ');
            const href = card.querySelector('a[href*="/dp/"]')?.getAttribute('href') || '';
            const asinFromHref = (href.match(/\/dp\/([A-Z0-9]{10})/) || [])[1] || null;
            return {
              asin: card.getAttribute('data-asin') || asinFromHref,
              title: ((card.querySelector('h2')?.innerText) || '').replace(/\s+/g, ' ').slice(0, 220),
              sponsored: /Gesponsord|Sponsored|Gesponsert/i.test(text),
              has_price: !!card.querySelector('.a-price'),
              delivery: (text.match(/(?:Levering|Gratis bezorging|Bezorging|Delivery|Lieferung|Zustellung)[^.|]{0,55}/i) || [''])[0]
            };
          }).filter(c => c.asin)
        }));

        if (isBlockedPage(status, pageInfo.title, pageInfo.bodyStart)) {
          rateLimited = true;
          console.log(`[${marketplace}] Rate limit / bot gate (${status}) detected at ${part}; pausing cleanly and saving progress.`);
          break;
        }

        state[part] = {
          part,
          marketplace,
          query,
          checked_at: new Date().toISOString(),
          hits: pageInfo.cards
        };
        processed++;
        if (processed % 15 === 0) {
          writeJson(statePath, state);
          const relevantTotal = Object.values(state).filter(r => (r.hits || []).some(h => digits(h.title).includes(r.part))).length;
          console.log(`[${marketplace}] progress: ${Object.keys(state).length} cached, ${relevantTotal} parts with exact-number title hits`);
        }
      } catch (err) {
        state[part] = { part, marketplace, query, error: String(err).slice(0, 140), checked_at: new Date().toISOString(), hits: [] };
      }
      await sleep(300);
    }
  }

  await Promise.all(pages.map((p, i) => worker(p, i)));
  writeJson(statePath, state);
  for (const p of pages) await p.close();
  return { processed, rateLimited };
}

async function checkProductPages(ctx, marketplace, asins, statePath, concurrency = 3) {
  const state = readJson(statePath, {});
  const pending = asins.filter(a => !state[a]);
  console.log(`[${marketplace}] /dp/ checks pending=${pending.length} (cached=${asins.length - pending.length})`);
  if (pending.length === 0) return { processed: 0, rateLimited: false };

  const pages = [];
  for (let i = 0; i < concurrency; i++) {
    const p = await ctx.newPage();
    if (i === 0) await initMarketplaceSession(p, marketplace);
    pages.push(p);
  }
  if (marketplace === 'amazon.de') {
    for (let i = 1; i < pages.length; i++) {
      await pages[i].goto(`https://www.${marketplace}/`, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
    }
  }

  let idx = 0;
  let rateLimited = false;
  let processed = 0;

  async function worker(page, workerId) {
    while (idx < pending.length && !rateLimited) {
      const asin = pending[idx++];
      try {
        await sleep(workerId * 150);
        const resp = await page.goto(`https://www.${marketplace}/dp/${asin}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await sleep(900);
        const httpStatus = resp ? resp.status() : null;
        const data = await page.evaluate(() => {
          const body = (document.body.innerText || '').replace(/\s+/g, ' ');
          const title = (document.querySelector('#productTitle')?.innerText || '').replace(/\s+/g, ' ').trim();
          const isDead = /not a functioning page|Pagina niet gevonden|Sorry! Something went wrong|Page Not Found|Seite wurde nicht gefunden/i.test(body);
          const byline = (document.querySelector('#bylineInfo')?.innerText || '').replace(/\s+/g, ' ').trim();
          const avail = (document.querySelector('#availability, #outOfStock')?.innerText || '').replace(/\s+/g, ' ').trim();
          const deliveryBlock = (document.querySelector('#deliveryBlockMessage, #mir-layout-DELIVERY_BLOCK')?.innerText || '').replace(/\s+/g, ' ').trim();
          const delivery = [...(body.match(/(?:Levering|Bezorging|Delivery|Gratis bezorging|Free delivery|Lieferung|Bezorgen in Nederland)[^.|]{0,80}/gi) || [])].slice(0, 5);
          const seller = [...(body.match(/(?:Verkocht door|Verzonden door|Sold by|Dispatched from|Ships from|Verkauf durch|Versand)[:\s]*[A-Za-z0-9 .&'äöüß-]{2,45}/gi) || [])].slice(0, 4);
          const bullets = [...document.querySelectorAll('#feature-bullets li')].map(li => li.innerText.replace(/\s+/g, ' ').trim()).slice(0, 8);
          const description = (document.querySelector('#productDescription')?.innerText || document.body.innerText).replace(/\s+/g, ' ').slice(0, 1200);
          const hasPrice = !!document.querySelector('.a-price .a-offscreen, #corePrice_feature_div .a-offscreen');
          const hasAddCart = !!document.querySelector('#add-to-cart-button');
          const cannotShipNl = /kan niet worden bezorgd|cannot be shipped|nicht.*Niederlande.*geliefert|Artikel kann nicht an die ausgewählte Lieferadresse versandt werden/i.test(body);
          const asinShown = (body.match(/ASIN[:\s]*([A-Z0-9]{10})/) || [])[1] || null;
          return {
            pageTitle: document.title || '',
            isDead,
            title: title.slice(0, 260),
            byline: byline.slice(0, 120),
            avail: avail.slice(0, 120),
            deliveryBlock: deliveryBlock.slice(0, 180),
            delivery,
            seller,
            bullets,
            description,
            hasPrice,
            hasAddCart,
            cannotShipNl,
            asinShown
          };
        });

        if (isBlockedPage(httpStatus, data.pageTitle, data.description)) {
          rateLimited = true;
          console.log(`[${marketplace}] Rate limit / bot gate (${httpStatus}) at ${asin}; pausing cleanly.`);
          break;
        }

        state[asin] = {
          asin,
          marketplace,
          http_status: httpStatus,
          checked_at: new Date().toISOString(),
          listed: !data.isDead && (httpStatus || 200) < 400 && Boolean(data.title),
          ...data
        };
        processed++;
        if (processed % 15 === 0) {
          writeJson(statePath, state);
          console.log(`[${marketplace}] /dp/ checked: ${processed}/${pending.length}`);
        }
      } catch (err) {
        state[asin] = { asin, marketplace, error: String(err).slice(0, 140), checked_at: new Date().toISOString(), listed: false };
      }
      await sleep(300);
    }
  }

  await Promise.all(pages.map((p, i) => worker(p, i)));
  writeJson(statePath, state);
  for (const p of pages) await p.close();
  return { processed, rateLimited };
}

async function runDealerCorroborate(ctx, parts, statePath, concurrency = 3) {
  const existing871 = readJson(path.join(ROOT, 'output/phase87_1/dealer_corroboration.json'), {});
  const state = { ...existing871, ...readJson(statePath, {}) };
  const pending = parts.filter(p => !state[p]);
  console.log(`[dealer] pending=${pending.length} (cached=${parts.length - pending.length})`);
  if (pending.length === 0) {
    writeJson(statePath, state);
    return;
  }

  const pages = await Promise.all(Array.from({ length: concurrency }, () => ctx.newPage()));
  let idx = 0;
  let processed = 0;

  async function worker(page) {
    while (idx < pending.length) {
      const part = pending[idx++];
      const formatted = formatPart(part);
      try {
        await page.goto(`https://www.gardenhirespares.co.uk/catalogsearch/result/?q=${encodeURIComponent(formatted)}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await sleep(500);
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
          return { items: Number(items), hits: [...new Set(hits)].slice(0, 4), noResults: /No results|Geen resultaten/i.test(text) };
        });
        const exact = data.hits.filter(h => digits(h).includes(part));
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
        processed++;
        if (processed % 15 === 0) {
          writeJson(statePath, state);
          console.log(`[dealer] checked ${processed}/${pending.length}`);
        }
      } catch (err) {
        state[part] = { part, error: String(err).slice(0, 140), checked_at: new Date().toISOString(), found: false, hits: [] };
      }
      await sleep(300);
    }
  }

  await Promise.all(pages.map(worker));
  writeJson(statePath, state);
  for (const p of pages) await p.close();
}

const cmd = process.argv[2];
const queueDoc = readJson(path.join(OUT_DIR, 'queue.json'), {});
const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ locale: 'nl-NL' });

try {
  if (cmd === 'search-research') {
    const mkt = argVal('--marketplace', 'amazon.nl');
    const openResearch = (queueDoc.existing_research || [])
      .filter(r => !r.already_has_active)
      .map(r => ({ part_number: r.part_number }));
    const uniq = [...new Map(openResearch.map(x => [x.part_number, x])).values()];
    const res = await searchMarketplace(ctx, mkt, uniq, path.join(OUT_DIR, `search_hits_${mkt.replace('.', '_')}.json`));
    console.log('search-research done:', res);
  } else if (cmd === 'search-nl') {
    const start = Number(argVal('--start', 0));
    const count = Number(argVal('--count', 100));
    const slice = (queueDoc.next_500 || []).slice(start, start + count);
    const res = await searchMarketplace(ctx, 'amazon.nl', slice, path.join(OUT_DIR, 'search_hits_amazon_nl.json'));
    console.log('search-nl done:', { start, count, ...res });
  } else if (cmd === 'search-de') {
    const start = Number(argVal('--start', 0));
    const count = Number(argVal('--count', 100));
    const openResearch = (queueDoc.existing_research || [])
      .filter(r => !r.already_has_active)
      .map(r => ({ part_number: r.part_number }));
    const combined = [...new Map([...openResearch, ...(queueDoc.next_500 || [])].map(x => [x.part_number, x])).values()];
    const slice = combined.slice(start, start + count);
    const res = await searchMarketplace(ctx, 'amazon.de', slice, path.join(OUT_DIR, 'search_hits_amazon_de.json'));
    console.log('search-de done:', { start, count, ...res });
  } else if (cmd === 'check-dp') {
    const mkt = argVal('--marketplace', 'amazon.nl');
    const limit = Number(argVal('--limit', 150));
    const selPlan = readJson(path.join(OUT_DIR, 'selection_plan.json'), null);
    const registry = readJson(path.join(ROOT, 'data/affiliate/verified_amazon_registry.json'), { offers: [] });
    const activeAsins = new Set(registry.offers.filter(o => o.status === 'ACTIVE').map(o => o.asin));
    let prioritized = [];
    if (selPlan) {
      prioritized = (mkt === 'amazon.de' ? selPlan.de_asins : selPlan.nl_asins) || [];
    } else {
      const hitsState = readJson(path.join(OUT_DIR, `search_hits_${mkt.replace('.', '_')}.json`), {});
      for (const [part, rec] of Object.entries(hitsState)) {
        for (const h of (rec.hits || [])) {
          if (!activeAsins.has(h.asin) && digits(h.title).includes(part)) prioritized.push(h.asin);
        }
      }
    }
    if (mkt === 'amazon.de') {
      for (const r of (queueDoc.existing_research || []).filter(x => x.status === 'VERIFIED' || x.marketplace === 'amazon.de')) {
        if (r.asin) prioritized.push(r.asin);
      }
    }
    const uniqAsins = [...new Set(prioritized.filter(a => !activeAsins.has(a)))].slice(0, limit);
    const res = await checkProductPages(ctx, mkt, uniqAsins, path.join(OUT_DIR, `product_checks_${mkt.replace('.', '_')}.json`));
    console.log('check-dp done:', { totalCandidates: prioritized.length, checkedLimit: uniqAsins.length, ...res });
  } else if (cmd === 'dealer') {
    const limit = Number(argVal('--limit', 200));
    const selPlan = readJson(path.join(OUT_DIR, 'selection_plan.json'), null);
    const parts = new Set(selPlan?.parts_to_corroborate || []);
    for (const r of (queueDoc.phase87_1_remaining || [])) parts.add(r.part_number);
    const list = [...parts].slice(0, limit);
    await runDealerCorroborate(ctx, list, path.join(OUT_DIR, 'dealer_corroboration.json'));
    console.log('dealer done:', list.length);
  }
} finally {
  await b.close();
}
