/**
 * scripts/phase88_worker.mjs
 *
 * Resumable Playwright research, verification, and incremental activation worker for Phase 88.
 *
 * Subcommands:
 *   node scripts/phase88_worker.mjs batch0
 *   node scripts/phase88_worker.mjs batch --index 1
 *   node scripts/phase88_worker.mjs batch --from 1 --to 3
 *   node scripts/phase88_worker.mjs audit
 *
 * Privacy & Safety:
 *   - Optional `NL_DELIVERY_POSTAL` env var is used purely in volatile memory for Amazon.nl GLUX
 *     delivery verification and NEVER logged or persisted anywhere.
 *   - All scraped delivery/page strings pass through scrubGeo() before saving.
 *   - Stops cleanly and persists progress on 503/429/CAPTCHA without bypassing any gate.
 *   - Enforces TwoGateVerifier, checkHistoricalMismatch, 1-SKU-per-ASIN uniqueness,
 *     item_price:null/shipping_cost_nl:null on amazon.nl, and checkAffiliateConsistency() after every batch.
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

import { TwoGateVerifier } from '../src/affiliate/TwoGateVerifier.js';
import { checkHistoricalMismatch } from '../src/affiliate/HistoricalMismatches.js';
import { PartNormalizer } from '../src/parts/PartNormalizer.js';
import { checkAffiliateConsistency } from './check_affiliate_consistency.mjs';
import {
  BAD_BRAND_RE,
  resolveCleanBrand,
  classifyBrand,
  evaluateTechnicalFit
} from './phase88_screener.mjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const OUT88 = path.join(ROOT, 'output', 'phase88');
const BATCH_DIR = path.join(OUT88, 'batches');
fs.mkdirSync(BATCH_DIR, { recursive: true });

const REGISTRY_REL = path.join('data', 'affiliate', 'verified_amazon_registry.json');
const TAGS = { 'amazon.nl': 'srihldecoder2-21', 'amazon.de': 'srihldecode00-21' };
const AMAZON_URL = (mkt, asin) => `https://www.${mkt}/dp/${asin}`;
const MANUFACTURER_BY_BRAND = {
  Stihl: 'ANDREAS STIHL AG & Co. KG',
  STIHL: 'ANDREAS STIHL AG & Co. KG'
};

const readJson = (p, fb = null) => {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fb; }
};
const writeJsonAtomic = (file, value, indent = 1) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, indent) + '\n', 'utf8');
  fs.renameSync(tmp, file);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const digits = s => String(s || '').replace(/[^0-9]/g, '');
const formatPart = p => {
  const m = String(p).match(/^(\d{4})(\d{3})(\d{4})$/);
  return m ? `${m[1]} ${m[2]} ${m[3]}` : String(p);
};
function argVal(flag, def = null) {
  const i = process.argv.indexOf(flag);
  return i > 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : def;
}

function scrubGeo(s) {
  let out = String(s || '');
  if (process.env.NL_DELIVERY_POSTAL) {
    const escaped = process.env.NL_DELIVERY_POSTAL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(escaped, 'gi'), 'NL-POSTAL');
  }
  return out
    .replace(/\b(Bezorgen\s+aan|Wordt\s+bezorgd\s+aan|Deliver\s+to|Lieferung\s+an)\s+[^\n,|]{2,45}/gi, '$1 NL')
    .replace(/\b\d{4}\s*[A-Z]{2}\b/g, 'NL-POSTAL');
}

function isBlockedPage(status, title, body) {
  if (status === 503 || status === 429) return true;
  if (/Type the characters you see|Enter the characters you see|Typ de tekens|Geef de tekens|Geben Sie die Zeichen|Robot Check|Automated access|captcha|validateCaptcha/i.test(`${title} ${String(body || '').slice(0, 700)}`)) {
    return true;
  }
  return false;
}

async function initMarketplaceSession(page, marketplace) {
  await page.goto(`https://www.${marketplace}/`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await sleep(750);
  await page.locator('#sp-cc-accept').click().catch(() => {});
  await sleep(350);
  await page.locator('#nav-global-location-popover-link').click().catch(() => {});
  await sleep(850);
  if (marketplace === 'amazon.de') {
    if (await page.locator('select#GLUXCountryList').count()) {
      await page.locator('select#GLUXCountryList').selectOption('NL').catch(() => {});
      await sleep(350);
      await page.locator('button[name="glowDoneButton"], .a-popover-footer button').first().click().catch(() => {});
      await sleep(1100);
    }
  } else if (process.env.NL_DELIVERY_POSTAL) {
    const zipInput = page.locator('#GLUXZipUpdateInput');
    if (await zipInput.count()) {
      await zipInput.fill(process.env.NL_DELIVERY_POSTAL).catch(() => {});
      await sleep(250);
      await page.locator('#GLUXZipUpdate input[type="submit"], #GLUXZipUpdate-announce').first().click().catch(() => {});
      await sleep(650);
      await page.locator('button[name="glowDoneButton"], #GLUXConfirmClose').first().click().catch(() => {});
      await sleep(850);
    }
  }
}

function loadMergedCaches() {
  const s871Nl = readJson(path.join(ROOT, 'output/phase87_1/search_hits_amazon_nl.json'), {});
  const s872Nl = readJson(path.join(ROOT, 'output/phase87_2/search_hits_amazon_nl.json'), {});
  const s88NlPath = path.join(OUT88, 'search_hits_amazon_nl.json');
  const s88Nl = readJson(s88NlPath, {});

  const s872De = readJson(path.join(ROOT, 'output/phase87_2/search_hits_amazon_de.json'), {});
  const s88DePath = path.join(OUT88, 'search_hits_amazon_de.json');
  const s88De = readJson(s88DePath, {});

  const c871Nl = readJson(path.join(ROOT, 'output/phase87_1/product_checks_amazon_nl.json'), {});
  const c872Nl = readJson(path.join(ROOT, 'output/phase87_2/product_checks_amazon_nl.json'), {});
  const c873Nl = readJson(path.join(ROOT, 'output/phase87_3/product_checks_amazon_nl.json'), {});
  const c88NlPath = path.join(OUT88, 'product_checks_amazon_nl.json');
  const c88Nl = readJson(c88NlPath, {});

  const c872De = readJson(path.join(ROOT, 'output/phase87_2/product_checks_amazon_de.json'), {});
  const c873De = readJson(path.join(ROOT, 'output/phase87_3/product_checks_amazon_de.json'), {});
  const c88DePath = path.join(OUT88, 'product_checks_amazon_de.json');
  const c88De = readJson(c88DePath, {});

  const d871 = readJson(path.join(ROOT, 'output/phase87_1/dealer_corroboration.json'), {});
  const d872 = readJson(path.join(ROOT, 'output/phase87_2/dealer_corroboration.json'), {});
  const d873 = readJson(path.join(ROOT, 'output/phase87_3/dealer_corroboration.json'), {});
  const d88Path = path.join(OUT88, 'dealer_corroboration.json');
  const d88 = readJson(d88Path, {});

  return {
    paths: { s88NlPath, s88DePath, c88NlPath, c88DePath, d88Path },
    searchOwn: { 'amazon.nl': s88Nl, 'amazon.de': s88De },
    searchMerged: {
      'amazon.nl': { ...s871Nl, ...s872Nl, ...s88Nl },
      'amazon.de': { ...s872De, ...s88De }
    },
    checksOwn: { 'amazon.nl': c88Nl, 'amazon.de': c88De },
    checksMerged: {
      'amazon.nl': { ...c871Nl, ...c872Nl, ...c873Nl, ...c88Nl },
      'amazon.de': { ...c872De, ...c873De, ...c88De }
    },
    dealerOwn: d88,
    dealerMerged: { ...d871, ...d872, ...d873, ...d88 }
  };
}

async function loadCatalogAndModels() {
  const catalogDoc = readJson(path.join(ROOT, 'data/parts_catalog.json'), []);
  const catalog = Array.isArray(catalogDoc) ? catalogDoc : (catalogDoc.parts || []);
  const catalogParts = new Set(catalog.map(p => PartNormalizer.normalizePartNumber(p.part_number)));
  const catalogNames = Object.fromEntries(catalog.map(p => [PartNormalizer.normalizePartNumber(p.part_number), p.part_name]));

  const fitmentIndex = readJson(path.join(ROOT, 'data/model_part_fitments.json'), {});
  const priorityModelsDoc = readJson(path.join(ROOT, 'output/phase81/PHASE81_PRIORITY_MODELS.json'), { models: [] });
  const modelMetaByFid = new Map();
  for (const m of (priorityModelsDoc.models || [])) {
    const fid = m.fitment_id || (m.canonical_model_id ? m.canonical_model_id.replace(/^stihl_/, '') : null);
    if (fid) modelMetaByFid.set(fid, { model_name: m.model_name, fitment_id: fid, gsc_impressions: m.gsc_impressions || 0 });
  }

  const partModelsMap = new Map();
  if (Array.isArray(fitmentIndex.shard_files)) {
    for (const shard of fitmentIndex.shard_files) {
      const shardPath = path.join(ROOT, 'data', shard);
      if (!fs.existsSync(shardPath)) continue;
      const stream = fs.createReadStream(shardPath).pipe(zlib.createGunzip());
      const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
      for await (const line of rl) {
        if (!line.trim()) continue;
        let rec;
        try { rec = JSON.parse(line); } catch { continue; }
        const pn = PartNormalizer.normalizePartNumber(rec.part_number);
        const fid = rec.canonical_model_id;
        if (!pn || !fid) continue;
        if (modelMetaByFid.has(fid)) {
          if (!partModelsMap.has(pn)) partModelsMap.set(pn, new Set());
          partModelsMap.get(pn).add(modelMetaByFid.get(fid).model_name);
        }
      }
    }
  }
  return { catalogParts, catalogNames, partModelsMap };
}

function extractModelsForCandidate(pn, check, partModelsMap) {
  const fromFitment = Array.from(partModelsMap.get(pn) || []);
  const text = `${check.title || ''} ${(check.bullets || []).join(' ')}`;
  const matches = text.match(/\b(?:MS|FS|BR|BG|HS|TS|HT|BT|HL|KM|MSA|FSA)\s*\d{2,3}(?:\s*[A-Z]{1,3})?|\b0(?:17|18|20|21|23|24|25|26|28|29|34|36|38|39|44|46|64|66)\b/gi) || [];
  const merged = [];
  const seen = new Set();
  for (const m of [...fromFitment, ...matches.map(x => x.toUpperCase().replace(/\s+/g, ' ').trim())]) {
    if (!seen.has(m)) {
      seen.add(m);
      merged.push(m);
    }
  }
  return merged.slice(0, 12);
}

async function runSearchBatch(browserCtx, mkt, items, caches, maxVariants = 3) {
  const own = caches.searchOwn[mkt];
  const merged = caches.searchMerged[mkt];
  const outPath = mkt === 'amazon.de' ? caches.paths.s88DePath : caches.paths.s88NlPath;

  const pending = items.filter(it => !merged[it.part_number] || merged[it.part_number].error);
  console.log(`[${mkt}] search pending=${pending.length}/${items.length}`);
  if (pending.length === 0) return { processed: 0, rateLimited: false };

  const concurrency = 3;
  const pages = [];
  for (let i = 0; i < concurrency; i++) {
    const p = await browserCtx.newPage();
    if (i === 0) await initMarketplaceSession(p, mkt);
    pages.push(p);
  }
  if (mkt === 'amazon.de') {
    for (let i = 1; i < pages.length; i++) {
      await pages[i].goto(`https://www.${mkt}/`, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
    }
  }

  let idx = 0;
  let processed = 0;
  let rateLimited = false;

  async function worker(page, wid) {
    while (idx < pending.length && !rateLimited) {
      const it = pending[idx++];
      const pn = it.part_number;
      const queries = (it.queries && it.queries.length ? it.queries : [`STIHL ${formatPart(pn)}`, formatPart(pn)]).slice(0, maxVariants);
      const allCards = [];
      const seenAsin = new Set();
      let usedQuery = queries[0];
      let hadError = null;

      try {
        for (const q of queries) {
          usedQuery = q;
          await sleep(wid * 120);
          const resp = await page.goto(`https://www.${mkt}/s?k=${encodeURIComponent(q)}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await sleep(650);
          const status = resp ? resp.status() : 200;
          const info = await page.evaluate(() => ({
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

          if (isBlockedPage(status, info.title, info.bodyStart)) {
            rateLimited = true;
            console.log(`[${mkt}] Rate limit / bot gate (${status}) at search ${pn}; stopping cleanly.`);
            break;
          }

          for (const c of info.cards) {
            if (!seenAsin.has(c.asin)) {
              seenAsin.add(c.asin);
              allCards.push({ ...c, delivery: scrubGeo(c.delivery), matched_query: q });
            }
          }

          const hasExactHit = allCards.some(c => digits(c.title).includes(pn) && !c.sponsored);
          if (hasExactHit) break;
          await sleep(220);
        }
      } catch (err) {
        hadError = String(err).slice(0, 140);
      }

      if (rateLimited) break;

      const rec = {
        part: pn,
        marketplace: mkt,
        query: usedQuery,
        queries_tried: queries,
        checked_at: new Date().toISOString(),
        hits: allCards,
        ...(hadError ? { error: hadError } : {})
      };
      own[pn] = rec;
      merged[pn] = rec;
      processed++;
      if (processed % 15 === 0) {
        writeJsonAtomic(outPath, own);
        console.log(`[${mkt}] search progress: ${processed}/${pending.length}`);
      }
      await sleep(220);
    }
  }

  await Promise.all(pages.map((p, i) => worker(p, i)));
  writeJsonAtomic(outPath, own);
  for (const p of pages) await p.close();
  return { processed, rateLimited };
}

function selectCandidateAsinsForParts(parts, mkt, caches, activeByAsinMkt, maxPerPart = 2) {
  const searchMap = caches.searchMerged[mkt];
  const asins = [];
  const seen = new Set();

  for (const it of parts) {
    const pn = it.part_number;
    const isKit = /\b(kit|set|pack|pair|satz)\b/i.test(it.part_name || '');
    const sh = searchMap[pn];
    if (!sh || !Array.isArray(sh.hits)) continue;

    const scored = [];
    for (const h of sh.hits) {
      if (!h.asin || !/^B[0-9A-Z]{9}$/i.test(h.asin)) continue;
      const existingOwner = activeByAsinMkt.get(`${mkt}|${h.asin}`);
      if (existingOwner && existingOwner !== pn) continue;

      const titleDigits = digits(h.title);
      const exactTitle = titleDigits.includes(pn);
      if (!exactTitle && (sh.hits.some(x => /^B[0-9A-Z]{9}$/i.test(x.asin || '') && digits(x.title).includes(pn)))) continue;
      if (!exactTitle && !/stihl|s[äa]genspezi|oregon|walbro|zama|ngk|bosch|vhbw|hippotech|cancanle|mchnic|adefol|huyur|c\.?t\.?s|propart|ototec|jardiaffaires|perfektgarten|qhalen/i.test(h.title || '')) continue;
      if (!isKit && /\b(\d+\s*(?:pcs|stuks|stks|stcs|stk|stück)|pack of\s*[2-9]|2-pack|3-pack|4-pack|5-pack)\b/i.test(h.title || '')) continue;

      let s = 0;
      if (exactTitle) s += 100;
      if (!h.sponsored) s += 20;
      if (h.has_price) s += 10;
      if (/stihl/i.test(h.title || '')) s += 5;
      scored.push({ asin: h.asin, score: s });
    }
    scored.sort((a, b) => b.score - a.score);
    for (const c of scored.slice(0, maxPerPart)) {
      if (!seen.has(c.asin)) {
        seen.add(c.asin);
        asins.push(c.asin);
      }
    }
  }
  return asins;
}

async function runDpChecks(browserCtx, mkt, asinList, caches) {
  const own = caches.checksOwn[mkt];
  const merged = caches.checksMerged[mkt];
  const outPath = mkt === 'amazon.de' ? caches.paths.c88DePath : caches.paths.c88NlPath;

  const pending = asinList.filter(a => a && !merged[a]);
  console.log(`[${mkt}] /dp/ pending=${pending.length}/${asinList.length}`);
  if (pending.length === 0) return { processed: 0, rateLimited: false };

  const concurrency = mkt === 'amazon.de' ? 2 : 3;
  const pages = [];
  for (let i = 0; i < concurrency; i++) {
    const p = await browserCtx.newPage();
    if (i === 0) await initMarketplaceSession(p, mkt);
    pages.push(p);
  }
  for (let i = 1; i < pages.length; i++) {
    await pages[i].goto(`https://www.${mkt}/`, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
  }

  let idx = 0;
  let processed = 0;
  let rateLimited = false;

  async function worker(page, wid) {
    while (idx < pending.length && !rateLimited) {
      const asin = pending[idx++];
      try {
        await sleep(wid * 150);
        const resp = await page.goto(`https://www.${mkt}/dp/${asin}`, { waitUntil: 'load', timeout: 22000 });
        await page.waitForSelector('#productTitle, form[action*="validateCaptcha"]', { timeout: 3000 }).catch(() => {});
        await sleep(250);
        const status = resp ? resp.status() : 200;
        if (status === 404 || status === 410) {
          const rec = { asin, marketplace: mkt, http_status: status, checked_at: new Date().toISOString(), listed: false };
          own[asin] = rec;
          merged[asin] = rec;
          processed++;
          continue;
        }
        const data = await page.evaluate(() => {
          const textOf = el => el ? el.innerText.replace(/\s+/g, ' ').trim() : '';
          const delivTexts = [...document.querySelectorAll('#mir-layout-DELIVERY_BLOCK, #deliveryBlockMessage, #contextualIngressPtLabel_deliveryShortLine, #exports_desktop_qualifiedBuybox_deliveryBlock_feature_div')]
            .map(textOf).filter(Boolean);
          const sellerTexts = [...document.querySelectorAll('#merchant-info, #sellerProfileTriggerId, #tabular-buybox')]
            .map(textOf).filter(Boolean).slice(0, 3);
          const bullets = [...document.querySelectorAll('#feature-bullets li span')].map(textOf).filter(Boolean).slice(0, 8);
          const addCart = !!document.querySelector('#add-to-cart-button, #buy-now-button');
          const price = !!document.querySelector('.a-price .a-offscreen');
          const bodyHead = (document.body.innerText || '').slice(0, 700);
          return {
            pageTitle: document.title || '',
            bodyHead,
            title: textOf(document.querySelector('#productTitle') || document.querySelector('#title span') || document.querySelector('h1#title') || document.querySelector('#btAsinTitle')),
            byline: textOf(document.querySelector('#bylineInfo')),
            avail: textOf(document.querySelector('#availability')),
            deliveryBlock: delivTexts.join(' | ').slice(0, 350),
            delivery: delivTexts.map(s => s.slice(0, 180)),
            seller: sellerTexts.map(s => s.slice(0, 180)),
            bullets,
            description: textOf(document.querySelector('#productDescription, #aplus')).slice(0, 800),
            hasPrice: price,
            hasAddCart: addCart,
            cannotShipNl: /kan niet worden bezorgd|cannot be shipped|nicht.*Niederlande.*geliefert|nicht an die ausgewählte/i.test(`${delivTexts.join(' ')} ${textOf(document.querySelector('#availability'))}`)
          };
        });

        if (isBlockedPage(status, data.pageTitle, data.bodyHead)) {
          rateLimited = true;
          console.log(`[${mkt}] Rate limit/CAPTCHA (${status}) at ${asin}; stopping cleanly.`);
          break;
        }

        const isDead = /Page Not Found|Pagina niet gevonden|Seite wurde nicht gefunden/i.test(data.pageTitle);
        const rec = {
          asin,
          marketplace: mkt,
          http_status: status,
          checked_at: new Date().toISOString(),
          listed: !!data.title && !isDead,
          isDead,
          pageTitle: scrubGeo(data.pageTitle),
          title: scrubGeo(data.title),
          byline: scrubGeo(data.byline),
          avail: scrubGeo(data.avail),
          deliveryBlock: scrubGeo(data.deliveryBlock),
          delivery: data.delivery.map(scrubGeo),
          seller: data.seller.map(scrubGeo),
          bullets: data.bullets.map(scrubGeo),
          description: scrubGeo(data.description),
          hasPrice: data.hasPrice,
          hasAddCart: data.hasAddCart,
          cannotShipNl: data.cannotShipNl
        };
        own[asin] = rec;
        merged[asin] = rec;
        processed++;
        if (processed % 15 === 0) {
          writeJsonAtomic(outPath, own);
          console.log(`[${mkt}] /dp/ progress: ${processed}/${pending.length}`);
        }
      } catch (err) {
        const rec = { asin, marketplace: mkt, error: String(err).slice(0, 140), checked_at: new Date().toISOString(), listed: false };
        own[asin] = rec;
        merged[asin] = rec;
      }
      await sleep(180);
    }
  }

  await Promise.all(pages.map((p, i) => worker(p, i)));
  writeJsonAtomic(outPath, own);
  for (const p of pages) await p.close();
  return { processed, rateLimited };
}

async function runDealerCorroboration(browserCtx, partList, caches) {
  const own = caches.dealerOwn;
  const merged = caches.dealerMerged;
  const pending = partList.filter(p => !merged[p]);
  console.log(`[dealer] pending=${pending.length}/${partList.length}`);
  if (pending.length === 0) return;

  const concurrency = 3;
  const pages = await Promise.all(Array.from({ length: concurrency }, () => browserCtx.newPage()));
  let idx = 0;
  let processed = 0;

  async function worker(page) {
    while (idx < pending.length) {
      const part = pending[idx++];
      const formatted = formatPart(part);
      try {
        await page.goto(`https://www.gardenhirespares.co.uk/catalogsearch/result/?q=${encodeURIComponent(formatted)}`, { waitUntil: 'domcontentloaded', timeout: 25000 });
        await sleep(400);
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
        const rec = {
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
        own[part] = rec;
        merged[part] = rec;
        processed++;
        if (processed % 15 === 0) {
          writeJsonAtomic(caches.paths.d88Path, own);
          console.log(`[dealer] progress: ${processed}/${pending.length}`);
        }
      } catch (err) {
        const rec = { part, error: String(err).slice(0, 140), checked_at: new Date().toISOString(), found: false, hits: [] };
        own[part] = rec;
        merged[part] = rec;
      }
      await sleep(220);
    }
  }

  await Promise.all(pages.map(worker));
  writeJsonAtomic(caches.paths.d88Path, own);
  for (const p of pages) await p.close();
}

function buildOfferRecord({ pn, mkt, asin, brand, classification, check, dealerRec, catalogNames, partModelsMap, usedKillSwitches, existingNote }) {
  const TODAY = new Date().toISOString().split('T')[0];
  const NOW = new Date().toISOString();
  const formatted = formatPart(pn);
  const catalogName = catalogNames[pn] || `STIHL onderdeel ${formatted}`;
  const listingTitle = scrubGeo(check.title || '');
  const tag = TAGS[mkt];
  const models = extractModelsForCandidate(pn, check, partModelsMap);
  const delivRaw = scrubGeo(check.deliveryBlock || (check.delivery || [])[0] || 'levering naar Nederland bevestigd');

  const dealerHit = Array.isArray(dealerRec?.hits) && dealerRec.hits.length > 0 ? dealerRec.hits[0] : null;
  const sources = [{
    type: 'AMAZON_PRODUCT_PAGE',
    url: AMAZON_URL(mkt, asin),
    title: listingTitle.slice(0, 180),
    claim: `Live ${mkt}-vermelding ${asin} toont "${listingTitle.slice(0, 140)}" met het exacte onderdeelnummer ${formatted}; de pagina bevestigt verzending naar Nederlands afleveradres op ${TODAY}.`,
    retrieved_at: TODAY
  }];
  if (dealerHit && dealerRec.source_url) {
    sources.push({
      type: 'EXTERNAL_CATALOG',
      url: dealerRec.source_url,
      title: 'Garden Hire Spares dealercatalogus',
      claim: `Dealercatalogus voert "${dealerHit}" onder het exacte STIHL-nummer ${formatted}.`,
      retrieved_at: TODAY
    });
  }

  const modelText = models.length ? ` Compatibele modellen: ${models.join(', ')}.` : '';
  const compatibilityProof = dealerHit
    ? `${dealerHit}; bevestigde compatibiliteit met STIHL onderdeel ${formatted} (catalogusnaam: ${catalogName}), zoals vermeld in de Amazon-vermelding en de dealercatalogus.${modelText}`
    : `${listingTitle.slice(0, 160)}; bevestigde compatibiliteit met STIHL onderdeel ${formatted} (catalogusnaam: ${catalogName}) volgens de Amazon-vermelding.${modelText}`;
  const identityProof = dealerHit
    ? `${brand} product met STIHL-referentie ${formatted}: de ${mkt}-vermelding ${asin} noemt dit nummer en de onafhankelijke dealercatalogus (${dealerRec.source_url}) beschrijft ${formatted} als "${dealerHit}".`
    : `${brand} product met STIHL-referentie ${formatted}: de ${mkt}-vermelding ${asin} toont het exacte onderdeelnummer ${formatted} en merk ${brand} op de productpagina.`;

  let killSwitchId = `KILL_${mkt === 'amazon.de' ? 'AMAZON_DE' : 'AMAZON_NL'}_${pn}`;
  if (usedKillSwitches.has(killSwitchId)) {
    killSwitchId = `KILL_${mkt === 'amazon.de' ? 'AMAZON_DE' : 'AMAZON_NL'}_${pn}_${asin}`;
  }

  const record = {
    part_number: pn,
    part_number_formatted: formatted,
    asin,
    marketplace: mkt,
    affiliate_tag: tag,
    manufacturer: MANUFACTURER_BY_BRAND[brand] || brand,
    manufacturer_part_number: formatted,
    trade_number: null,
    brand,
    product_title: listingTitle,
    package_quantity: 1,
    package_type: 'Enkelstuks',
    is_multipack: false,
    ean_gtin: null,
    oem_brand_classification: classification,
    evidence_classification: 'AMAZON_LISTING_COMPATIBLE',
    model_compatibility: models,
    machine_compatibility: [...models],
    pilot_eligible: true,
    pilot_active: true,
    kill_switch_id: killSwitchId,
    compatibility_proof: compatibilityProof,
    asin_product_identity_proof: identityProof,
    independent_evidence_url: (dealerHit && dealerRec.source_url) || AMAZON_URL(mkt, asin),
    direct_affiliate_url: `${AMAZON_URL(mkt, asin)}?tag=${tag}`,
    search_fallback_url: `https://www.${mkt}/s?k=STIHL+${encodeURIComponent(formatted)}&tag=${tag}`,
    verifiable_evidence_sources: sources,
    verification_date: TODAY,
    shipping_to_nl_status: 'SHIPS_TO_NL_CONFIRMED',
    shipping_destination_country: 'NL',
    shipping_checked_at: TODAY,
    shipping_evidence_url: AMAZON_URL(mkt, asin),
    shipping_evidence_description: `${mkt}-vermelding bevestigt levering naar Nederlands postcodegebied (${delivRaw.slice(0, 90)}).`,
    status: 'ACTIVE',
    status_reason: `Phase 88: live ${mkt}-vermelding met het exacte STIHL-nummer ${formatted}${dealerHit ? ' en dealercatalogus-corroboratie' : ''} en bevestigde NL-levering.${existingNote ? ' ' + existingNote : ''}`,
    supersedes_asin: null,
    updated_at: NOW
  };
  if (mkt === 'amazon.nl') {
    record.item_price = null;
    record.shipping_cost_nl = null;
  }
  return record;
}

function evaluateAndActivateBatch({ batchId, partRows, candidatePairsByPartMkt, caches, catalogParts, catalogNames, partModelsMap, registry }) {
  const beforeActive = registry.offers.filter(o => o.status === 'ACTIVE');
  const beforeNl = beforeActive.filter(o => !o.marketplace || o.marketplace === 'amazon.nl').length;
  const beforeDe = beforeActive.filter(o => o.marketplace === 'amazon.de').length;
  const beforeUnique = new Set(beforeActive.map(o => o.part_number)).size;

  const activeByPartMkt = new Map();
  const activeByAsinMkt = new Map();
  const usedKillSwitches = new Set(registry.offers.map(o => o.kill_switch_id).filter(Boolean));
  for (const o of beforeActive) {
    const mkt = o.marketplace || 'amazon.nl';
    activeByPartMkt.set(`${o.part_number}|${mkt}`, o.asin);
    activeByAsinMkt.set(`${mkt}|${o.asin}`, o.part_number);
  }

  const activated = [];
  const needsEvidence = [];
  const rejected = [];
  const supersededResearch = [];

  for (const row of partRows) {
    const pn = row.part_number;
    const partName = row.part_name || catalogNames[pn] || '';

    for (const mkt of ['amazon.nl', 'amazon.de']) {
      if (activeByPartMkt.has(`${pn}|${mkt}`)) continue; // Preserve already-ACTIVE slot

      const asins = candidatePairsByPartMkt.get(`${pn}|${mkt}`) || [];
      if (asins.length === 0) continue;

      let chosen = null;
      let chosenReasons = [];

      for (const asin of asins) {
        const owner = activeByAsinMkt.get(`${mkt}|${asin}`);
        if (owner && owner !== pn) {
          chosenReasons.push({ asin, reason: `ASIN_ALREADY_OWNED_BY_${owner}` });
          continue;
        }
        const check = caches.checksMerged[mkt][asin];
        if (!check) {
          chosenReasons.push({ asin, reason: 'NO_DP_CHECK' });
          continue;
        }
        if (!check.listed || check.isDead || check.http_status >= 400) {
          chosenReasons.push({ asin, reason: `NOT_LISTED_HTTP_${check.http_status || 'DEAD'}` });
          continue;
        }
        const fullText = `${check.title || ''} ${(check.bullets || []).join(' ')} ${check.description || ''}`;
        if (!digits(fullText).includes(pn)) {
          chosenReasons.push({ asin, reason: 'MPN_MISSING_ON_DP' });
          continue;
        }
        const mismatch = checkHistoricalMismatch(pn, asin, check.title || '');
        if (mismatch.isMismatch) {
          chosenReasons.push({ asin, reason: `HISTORICAL_MISMATCH: ${mismatch.record?.reason || 'matched'}` });
          continue;
        }

        const brand = resolveCleanBrand(check);
        if (!brand || BAD_BRAND_RE.test(brand)) {
          chosenReasons.push({ asin, reason: `BAD_OR_MISSING_BRAND:${brand || 'empty'}` });
          continue;
        }
        const fit = evaluateTechnicalFit(pn, partName, check, brand);
        if (!fit.ok) {
          chosenReasons.push({ asin, reason: fit.reason });
          continue;
        }
        if (check.cannotShipNl) {
          needsEvidence.push({ part_number: pn, mkt, asin, status: 'NEEDS_EVIDENCE', reason: 'CANNOT_SHIP_TO_NL' });
          continue;
        }
        if (!check.hasAddCart) {
          needsEvidence.push({ part_number: pn, mkt, asin, status: 'NEEDS_EVIDENCE', reason: 'OUT_OF_STOCK_OR_NO_BUYBOX' });
          continue;
        }

        const classification = classifyBrand(brand, check);
        const dealerRec = caches.dealerMerged[pn] || null;
        const previous = registry.offers.find(o => o.part_number === pn && (o.status === 'RESEARCH_REQUIRED' || o.status === 'SUSPENDED' || o.status === 'VERIFIED'));
        const existingNote = (previous && previous.asin !== asin) ? `Vervangt eerdere vermelding ${previous.asin}.` : '';

        const record = buildOfferRecord({
          pn, mkt, asin, brand, classification, check, dealerRec, catalogNames, partModelsMap, usedKillSwitches, existingNote
        });
        if (previous && previous.asin !== asin) record.supersedes_asin = previous.asin;

        const verif = TwoGateVerifier.verifyOffer(record, { catalogPartMap: catalogParts, expectedTag: TAGS[mkt] });
        if (!verif.passed) {
          chosenReasons.push({ asin, reason: `TWO_GATE_FAILED:${verif.errors.join(';')}` });
          continue;
        }
        record.gate_1_technical = verif.gate1;
        record.gate_2_product = verif.gate2;
        chosen = { record, previous, dealerHit: !!(dealerRec?.hits?.length) };
        break;
      }

      if (chosen) {
        const { record, previous, dealerHit } = chosen;
        usedKillSwitches.add(record.kill_switch_id);
        activeByPartMkt.set(`${pn}|${mkt}`, record.asin);
        activeByAsinMkt.set(`${mkt}|${record.asin}`, pn);

        const exIdx = registry.offers.findIndex(o => o.part_number === pn && (o.marketplace || 'amazon.nl') === mkt && o.asin === record.asin);
        if (exIdx >= 0) {
          registry.offers[exIdx] = record;
        } else {
          registry.offers.push(record);
        }

        if (previous && previous.asin !== record.asin) {
          if (previous.status === 'RESEARCH_REQUIRED' || previous.status === 'VERIFIED') {
            supersededResearch.push(previous);
            registry.offers = registry.offers.filter(o => o !== previous);
          } else if (previous.status === 'SUSPENDED' && !previous.superseded_by_asin) {
            previous.superseded_by_asin = record.asin;
            previous.superseded_at = record.updated_at;
            previous.updated_at = record.updated_at;
          }
        }
        // Also retire same-part RESEARCH_REQUIRED/VERIFIED even if another marketplace got activated cleanly
        const sameMktRes = registry.offers.find(o => o !== record && o.part_number === pn && (o.marketplace || 'amazon.nl') === mkt && (o.status === 'RESEARCH_REQUIRED' || o.status === 'VERIFIED'));
        if (sameMktRes) {
          supersededResearch.push(sameMktRes);
          registry.offers = registry.offers.filter(o => o !== sameMktRes);
        }

        activated.push({
          part_number: pn,
          asin: record.asin,
          marketplace: mkt,
          brand: record.brand,
          classification: record.oem_brand_classification,
          has_dealer: dealerHit
        });
      } else if (chosenReasons.length > 0) {
        for (const r of chosenReasons) {
          rejected.push({ part_number: pn, mkt, asin: r.asin, status: 'REJECTED', reason: r.reason });
        }
      }
    }
  }

  // Sync registry policy + metrics
  const activeAll = registry.offers.filter(o => o.status === 'ACTIVE');
  const afterNl = activeAll.filter(o => !o.marketplace || o.marketplace === 'amazon.nl').length;
  const afterDe = activeAll.filter(o => o.marketplace === 'amazon.de').length;
  const afterUniqueSet = new Set(activeAll.map(o => o.part_number));

  registry.phase = '88';
  registry.generated_at = new Date().toISOString();
  registry.policy = {
    ...registry.policy,
    pilot_name: 'Phase 88 Unlimited Amazon Maximum Growth',
    production_activation_allowed: true,
    pilot_activated_parts: Array.from(afterUniqueSet).sort(),
    max_active_offers_allowed: null,
    max_active_offers_per_marketplace: { 'amazon.nl': null, 'amazon.de': null }
  };
  registry.metrics = {
    total_registered: registry.offers.length,
    staged: registry.offers.filter(o => o.status === 'STAGED').length,
    verified: registry.offers.filter(o => o.status === 'VERIFIED').length,
    active: activeAll.length,
    active_nl: afterNl,
    active_de: afterDe,
    research_required: registry.offers.filter(o => o.status === 'RESEARCH_REQUIRED').length,
    suspended: registry.offers.filter(o => o.status === 'SUSPENDED').length,
    parts_with_amazon_offer: afterUniqueSet.size
  };

  writeJsonAtomic(path.join(ROOT, REGISTRY_REL), registry, 2);

  const summary = {
    batch_id: batchId,
    generated_at: new Date().toISOString(),
    before: { active_total: beforeActive.length, active_nl: beforeNl, active_de: beforeDe, unique_parts: beforeUnique },
    after: {
      active_total: activeAll.length,
      active_nl: afterNl,
      active_de: afterDe,
      unique_parts: afterUniqueSet.size,
      delta_total: activeAll.length - beforeActive.length,
      delta_nl: afterNl - beforeNl,
      delta_de: afterDe - beforeDe,
      delta_unique_parts: afterUniqueSet.size - beforeUnique
    },
    activated_count: activated.length,
    needs_evidence_count: needsEvidence.length,
    rejected_count: rejected.length,
    superseded_research_count: supersededResearch.length,
    activated,
    needs_evidence: needsEvidence,
    rejected: rejected.slice(0, 100),
    superseded_research: supersededResearch
  };
  writeJsonAtomic(path.join(BATCH_DIR, `${batchId}.json`), summary, 2);
  return summary;
}

async function main() {
  const cmd = process.argv[2];
  if (!cmd) {
    console.error('Usage: node scripts/phase88_worker.mjs <batch0|batch|audit> [--index N | --from A --to B]');
    process.exit(1);
  }

  if (cmd === 'audit') {
    const res = await checkAffiliateConsistency();
    const reg = readJson(path.join(ROOT, REGISTRY_REL));
    console.log(JSON.stringify({ consistency: res, metrics: reg.metrics }, null, 2));
    if (!res.success) process.exit(1);
    return;
  }

  const registry = readJson(path.join(ROOT, REGISTRY_REL));
  const caches = loadMergedCaches();
  const { catalogParts, catalogNames, partModelsMap } = await loadCatalogAndModels();

  const browser = await chromium.launch({ headless: true });
  const browserCtx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    locale: 'nl-NL',
    viewport: { width: 1280, height: 900 }
  });

  try {
    if (cmd === 'batch0') {
      const unchecked = readJson(path.join(ROOT, 'output/phase87_3/unchecked_queue.json'), { nl: [], de: [] });
      const activeByAsinMkt = new Map();
      for (const o of registry.offers.filter(x => x.status === 'ACTIVE')) {
        activeByAsinMkt.set(`${o.marketplace || 'amazon.nl'}|${o.asin}`, o.part_number);
      }

      const needsRows = registry.offers.filter(o => o.status === 'RESEARCH_REQUIRED' || o.status === 'VERIFIED');
      const needsParts = Array.from(new Set(needsRows.map(o => o.part_number)));

      // Collect all part numbers touched in batch0
      const partSet = new Set(needsParts);
      for (const row of unchecked.nl || []) partSet.add(row.part_number);
      for (const row of unchecked.de || []) partSet.add(row.part_number);

      const partRows = Array.from(partSet).map(pn => ({
        part_number: pn,
        part_name: catalogNames[pn] || '',
        queries: [`STIHL ${formatPart(pn)}`, formatPart(pn)]
      }));

      // Search remaining non-ACTIVE parts that don't yet have cached search hits
      const sNlRes = await runSearchBatch(browserCtx, 'amazon.nl', partRows.filter(r => needsParts.includes(r.part_number)), caches, 2);
      const sDeRes = await runSearchBatch(browserCtx, 'amazon.de', partRows.filter(r => needsParts.includes(r.part_number)), caches, 2);

      const candidatePairsByPartMkt = new Map();
      const nlAsins = new Set();
      const deAsins = new Set();

      const addPair = (pn, mkt, asin) => {
        if (!asin) return;
        const k = `${pn}|${mkt}`;
        if (!candidatePairsByPartMkt.has(k)) candidatePairsByPartMkt.set(k, []);
        const list = candidatePairsByPartMkt.get(k);
        if (!list.includes(asin)) list.push(asin);
        (mkt === 'amazon.de' ? deAsins : nlAsins).add(asin);
      };

      for (const row of unchecked.nl || []) addPair(row.part_number, 'amazon.nl', row.asin);
      for (const row of unchecked.de || []) addPair(row.part_number, 'amazon.de', row.asin);
      for (const o of needsRows) addPair(o.part_number, o.marketplace || 'amazon.nl', o.asin);

      // Also add top 2 search-hit ASINs for batch0 parts (especially alternatives for RESEARCH_REQUIRED)
      for (const mkt of ['amazon.nl', 'amazon.de']) {
        for (const r of partRows) {
          const picked = selectCandidateAsinsForParts([r], mkt, caches, activeByAsinMkt, 2);
          for (const a of picked) addPair(r.part_number, mkt, a);
        }
      }

      const dpNlRes = await runDpChecks(browserCtx, 'amazon.nl', Array.from(nlAsins), caches);
      const dpDeRes = await runDpChecks(browserCtx, 'amazon.de', Array.from(deAsins), caches);

      // Corroborate dealer for parts that have at least one listed NL-shippable candidate
      const dealerCandidates = [];
      for (const r of partRows) {
        const anyGood = ['amazon.nl', 'amazon.de'].some(mkt => {
          const list = candidatePairsByPartMkt.get(`${r.part_number}|${mkt}`) || [];
          return list.some(a => {
            const c = caches.checksMerged[mkt][a];
            return c && c.listed && !c.cannotShipNl && c.hasAddCart && digits(`${c.title || ''} ${(c.bullets || []).join(' ')} ${c.description || ''}`).includes(r.part_number);
          });
        });
        if (anyGood) dealerCandidates.push(r.part_number);
      }
      await runDealerCorroboration(browserCtx, dealerCandidates, caches);

      const summary = evaluateAndActivateBatch({
        batchId: 'batch_0',
        partRows,
        candidatePairsByPartMkt,
        caches,
        catalogParts,
        catalogNames,
        partModelsMap,
        registry
      });

      const cons = await checkAffiliateConsistency();
      console.log('=== PHASE 88 BATCH 0 SUMMARY ===');
      console.log(JSON.stringify({
        search: { nl: sNlRes, de: sDeRes },
        dp: { nl: dpNlRes, de: dpDeRes },
        before: summary.before,
        after: summary.after,
        activated_count: summary.activated_count,
        needs_evidence_count: summary.needs_evidence_count,
        rejected_count: summary.rejected_count,
        superseded_research_count: summary.superseded_research_count,
        consistency_success: cons.success
      }, null, 2));
      if (!cons.success) process.exitCode = 1;
    } else if (cmd === 'batch') {
      const idxArg = argVal('--index', null);
      const from = Number(idxArg || argVal('--from', '1'));
      const to = Number(idxArg || argVal('--to', String(from)));
      const queue = readJson(path.join(OUT88, 'queue.json'));
      if (!queue || !Array.isArray(queue.batches)) throw new Error('Missing output/phase88/queue.json');

      for (let k = from; k <= to; k++) {
        const batchObj = queue.batches.find(b => b.batch_id === `batch_${k}`);
        if (!batchObj) {
          console.log(`Skipping batch_${k}: not found in queue.json`);
          continue;
        }
        console.log(`\n>>> Starting batch_${k} (${batchObj.parts.length} parts) <<<`);

        const activeByAsinMkt = new Map();
        const activeByPartMkt = new Map();
        for (const o of registry.offers.filter(x => x.status === 'ACTIVE')) {
          const m = o.marketplace || 'amazon.nl';
          activeByAsinMkt.set(`${m}|${o.asin}`, o.part_number);
          activeByPartMkt.set(`${o.part_number}|${m}`, o.asin);
        }

        const nlNeedSearch = batchObj.parts.filter(p => !activeByPartMkt.has(`${p.part_number}|amazon.nl`));
        const deNeedSearch = batchObj.parts.filter(p => !activeByPartMkt.has(`${p.part_number}|amazon.de`));

        const sNlRes = await runSearchBatch(browserCtx, 'amazon.nl', nlNeedSearch, caches, 3);
        const sDeRes = await runSearchBatch(browserCtx, 'amazon.de', deNeedSearch, caches, 3);

        const nlAsins = selectCandidateAsinsForParts(nlNeedSearch, 'amazon.nl', caches, activeByAsinMkt, 2);
        const deAsins = selectCandidateAsinsForParts(deNeedSearch, 'amazon.de', caches, activeByAsinMkt, 2);

        const dpNlRes = await runDpChecks(browserCtx, 'amazon.nl', nlAsins, caches);
        const dpDeRes = await runDpChecks(browserCtx, 'amazon.de', deAsins, caches);

        const candidatePairsByPartMkt = new Map();
        for (const mkt of ['amazon.nl', 'amazon.de']) {
          for (const p of batchObj.parts) {
            if (activeByPartMkt.has(`${p.part_number}|${mkt}`)) continue;
            const picked = selectCandidateAsinsForParts([p], mkt, caches, activeByAsinMkt, 2);
            if (picked.length) candidatePairsByPartMkt.set(`${p.part_number}|${mkt}`, picked);
          }
        }

        const dealerCandidates = [];
        for (const p of batchObj.parts) {
          const anyGood = ['amazon.nl', 'amazon.de'].some(mkt => {
            const list = candidatePairsByPartMkt.get(`${p.part_number}|${mkt}`) || [];
            return list.some(a => {
              const c = caches.checksMerged[mkt][a];
              return c && c.listed && !c.cannotShipNl && c.hasAddCart && digits(`${c.title || ''} ${(c.bullets || []).join(' ')} ${c.description || ''}`).includes(p.part_number);
            });
          });
          if (anyGood) dealerCandidates.push(p.part_number);
        }
        await runDealerCorroboration(browserCtx, dealerCandidates, caches);

        const summary = evaluateAndActivateBatch({
          batchId: `batch_${k}`,
          partRows: batchObj.parts,
          candidatePairsByPartMkt,
          caches,
          catalogParts,
          catalogNames,
          partModelsMap,
          registry
        });

        const cons = await checkAffiliateConsistency();
        console.log(`=== PHASE 88 BATCH ${k} SUMMARY ===`);
        console.log(JSON.stringify({
          search: { nl: sNlRes, de: sDeRes },
          dp: { nl: dpNlRes, de: dpDeRes },
          before: summary.before,
          after: summary.after,
          activated_count: summary.activated_count,
          needs_evidence_count: summary.needs_evidence_count,
          rejected_count: summary.rejected_count,
          consistency_success: cons.success
        }, null, 2));

        if (!cons.success) {
          console.error('Consistency check FAILED after batch', k, cons);
          process.exitCode = 1;
          break;
        }
        if (sNlRes.rateLimited || sDeRes.rateLimited || dpNlRes.rateLimited || dpDeRes.rateLimited) {
          console.log('Rate limit / CAPTCHA encountered; stopping cleanly after saving progress.');
          break;
        }
      }
    } else {
      console.error(`Unknown subcommand: ${cmd}`);
      process.exit(1);
    }
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
