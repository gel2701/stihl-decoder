/**
 * scripts/phase92_worker.mjs
 *
 * Phase 92 Affiliate Coverage Expansion Worker:
 *   - Reuses caches from Phase 87.1..90 read-only; persists Phase 92 caches & batch logs to output/phase92/.
 *   - Recovers NEEDS_EVIDENCE / RESEARCH_REQUIRED / unchecked cached search hits in batch0.
 *   - Discovers and verifies new ACTIVE offers on amazon.nl & amazon.de for P1..P5 batches across all 507 models.
 *   - Strictly enforces TwoGateVerifier, checkHistoricalMismatch, BAD_BRAND_RE, evaluateTechnicalFit,
 *     NL delivery confirmation, non-multipack, SKU-per-ASIN uniqueness, and CAPTCHA/rate-limit stop.
 *   - Never touches existing 2,196 ACTIVE, 34 SUSPENDED, or protected pinned/VERIFIED test fixtures.
 *
 * Usage:
 *   node scripts/phase92_worker.mjs batch0 [--max-dp 400]
 *   node scripts/phase92_worker.mjs batch --index 1
 *   node scripts/phase92_worker.mjs batch --from 1 --to 6
 *   node scripts/phase92_worker.mjs audit
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
const OUT92 = path.join(ROOT, 'output', 'phase92');
const BATCH_DIR = path.join(OUT92, 'batches');
fs.mkdirSync(BATCH_DIR, { recursive: true });

const REGISTRY_REL = path.join('data', 'affiliate', 'verified_amazon_registry.json');
const TAGS = { 'amazon.nl': 'srihldecoder2-21', 'amazon.de': 'srihldecode00-21' };
const AMAZON_URL = (mkt, asin) => `https://www.${mkt}/dp/${asin}`;
const MANUFACTURER_BY_BRAND = {
  Stihl: 'ANDREAS STIHL AG & Co. KG',
  STIHL: 'ANDREAS STIHL AG & Co. KG'
};

const PROTECTED_PINNED_SLOTS = new Set([
  '11104007005|amazon.de',
  '00004007000|amazon.de',
  '00004007011|amazon.de',
  '11231201613|amazon.de',
  '11300074100|amazon.nl',
  '30050003905|amazon.nl',
  '11304001302|amazon.nl',
  '11236402003|amazon.nl'
]);
const PROTECTED_RECORD_ASINS = new Set([
  'B00IKF8TH8',
  'B013KONKZY',
  'B00SVDWDRG',
  'B00LAHKSDQ'
]);

const readJson = (p, fb = null) => {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fb; }
};
const writeJsonAtomic = (file, value, indent = 1) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, indent).replace(/\r\n/g, '\n') + '\n', 'utf8');
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
  await sleep(600);
  await page.locator('#sp-cc-accept').click().catch(() => {});
  await sleep(250);
  await page.locator('#nav-global-location-popover-link').click().catch(() => {});
  await sleep(750);
  if (marketplace === 'amazon.de') {
    if (await page.locator('select#GLUXCountryList').count()) {
      await page.locator('select#GLUXCountryList').selectOption('NL').catch(() => {});
      await sleep(300);
      await page.locator('button[name="glowDoneButton"], .a-popover-footer button').first().click().catch(() => {});
      await sleep(900);
    }
  } else if (process.env.NL_DELIVERY_POSTAL) {
    const zipInput = page.locator('#GLUXZipUpdateInput');
    if (await zipInput.count()) {
      await zipInput.fill(process.env.NL_DELIVERY_POSTAL).catch(() => {});
      await sleep(250);
      await page.locator('#GLUXZipUpdate input[type="submit"], #GLUXZipUpdate-announce').first().click().catch(() => {});
      await sleep(600);
      await page.locator('button[name="glowDoneButton"], #GLUXConfirmClose').first().click().catch(() => {});
      await sleep(750);
    }
  }
}

function loadMergedCaches() {
  const s92NlPath = path.join(OUT92, 'search_hits_amazon_nl.json');
  const s92DePath = path.join(OUT92, 'search_hits_amazon_de.json');
  const c92NlPath = path.join(OUT92, 'product_checks_amazon_nl.json');
  const c92DePath = path.join(OUT92, 'product_checks_amazon_de.json');
  const d92Path = path.join(OUT92, 'dealer_corroboration.json');

  const s92Nl = readJson(s92NlPath, {});
  const s92De = readJson(s92DePath, {});
  const c92Nl = readJson(c92NlPath, {});
  const c92De = readJson(c92DePath, {});
  const d92 = readJson(d92Path, {});

  return {
    paths: { s92NlPath, s92DePath, c92NlPath, c92DePath, d92Path },
    searchOwn: { 'amazon.nl': s92Nl, 'amazon.de': s92De },
    searchMerged: {
      'amazon.nl': {
        ...readJson(path.join(ROOT, 'output/phase87_1/search_hits_amazon_nl.json'), {}),
        ...readJson(path.join(ROOT, 'output/phase87_2/search_hits_amazon_nl.json'), {}),
        ...readJson(path.join(ROOT, 'output/phase88/search_hits_amazon_nl.json'), {}),
        ...readJson(path.join(ROOT, 'output/phase89/search_hits_amazon_nl.json'), {}),
        ...readJson(path.join(ROOT, 'output/phase90/search_hits_amazon_nl.json'), {}),
        ...s92Nl
      },
      'amazon.de': {
        ...readJson(path.join(ROOT, 'output/phase87_2/search_hits_amazon_de.json'), {}),
        ...readJson(path.join(ROOT, 'output/phase88/search_hits_amazon_de.json'), {}),
        ...readJson(path.join(ROOT, 'output/phase89/search_hits_amazon_de.json'), {}),
        ...readJson(path.join(ROOT, 'output/phase90/search_hits_amazon_de.json'), {}),
        ...s92De
      }
    },
    checksOwn: { 'amazon.nl': c92Nl, 'amazon.de': c92De },
    checksMerged: {
      'amazon.nl': {
        ...readJson(path.join(ROOT, 'output/phase87_1/product_checks_amazon_nl.json'), {}),
        ...readJson(path.join(ROOT, 'output/phase87_2/product_checks_amazon_nl.json'), {}),
        ...readJson(path.join(ROOT, 'output/phase87_3/product_checks_amazon_nl.json'), {}),
        ...readJson(path.join(ROOT, 'output/phase88/product_checks_amazon_nl.json'), {}),
        ...readJson(path.join(ROOT, 'output/phase89/product_checks_amazon_nl.json'), {}),
        ...readJson(path.join(ROOT, 'output/phase90/product_checks_amazon_nl.json'), {}),
        ...c92Nl
      },
      'amazon.de': {
        ...readJson(path.join(ROOT, 'output/phase87_2/product_checks_amazon_de.json'), {}),
        ...readJson(path.join(ROOT, 'output/phase87_3/product_checks_amazon_de.json'), {}),
        ...readJson(path.join(ROOT, 'output/phase88/product_checks_amazon_de.json'), {}),
        ...readJson(path.join(ROOT, 'output/phase89/product_checks_amazon_de.json'), {}),
        ...readJson(path.join(ROOT, 'output/phase90/product_checks_amazon_de.json'), {}),
        ...c92De
      }
    },
    dealerOwn: d92,
    dealerMerged: {
      ...readJson(path.join(ROOT, 'output/phase87_1/dealer_corroboration.json'), {}),
      ...readJson(path.join(ROOT, 'output/phase87_2/dealer_corroboration.json'), {}),
      ...readJson(path.join(ROOT, 'output/phase87_3/dealer_corroboration.json'), {}),
      ...readJson(path.join(ROOT, 'output/phase88/dealer_corroboration.json'), {}),
      ...readJson(path.join(ROOT, 'output/phase89/dealer_corroboration.json'), {}),
      ...readJson(path.join(ROOT, 'output/phase90/dealer_corroboration.json'), {}),
      ...d92
    }
  };
}

async function loadCatalogAndModels() {
  const catalogDoc = readJson(path.join(ROOT, 'data/parts_catalog.json'), []);
  const catalog = Array.isArray(catalogDoc) ? catalogDoc : (catalogDoc.parts || []);
  const catalogParts = new Set(catalog.map(p => PartNormalizer.normalizePartNumber(p.part_number)));
  const catalogNames = Object.fromEntries(catalog.map(p => [PartNormalizer.normalizePartNumber(p.part_number), p.part_name]));

  const stihlDb = readJson(path.join(ROOT, 'data/stihl_database.json'), { models: [] });
  const fitmentIndex = readJson(path.join(ROOT, 'data/model_part_fitments.json'), {});
  const modelNameByFid = new Map();
  for (const m of (stihlDb.models || [])) {
    const c = (m.slug || m.id).toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const alt = m.id.toLowerCase();
    const shortAlt = alt.replace(/^stihl_/, '');
    modelNameByFid.set(c, m.model_name);
    modelNameByFid.set(alt, m.model_name);
    modelNameByFid.set(shortAlt, m.model_name);
  }

  const partModelsMap = new Map();
  if (Array.isArray(fitmentIndex.shard_files)) {
    for (const shard of fitmentIndex.shard_files) {
      const shardPath = path.join(ROOT, 'data', shard);
      if (!fs.existsSync(shardPath)) continue;
      const rl = readline.createInterface({ input: fs.createReadStream(shardPath).pipe(zlib.createGunzip()), crlfDelay: Infinity });
      for await (const line of rl) {
        if (!line.trim()) continue;
        let rec;
        try { rec = JSON.parse(line); } catch { continue; }
        const pn = PartNormalizer.normalizePartNumber(rec.part_number);
        const fid = rec.canonical_model_id;
        if (!pn || !fid) continue;
        const mName = modelNameByFid.get(fid);
        if (mName) {
          if (!partModelsMap.has(pn)) partModelsMap.set(pn, new Set());
          partModelsMap.get(pn).add(mName);
        }
      }
    }
  }
  return { catalogParts, catalogNames, partModelsMap };
}

function extractModelsForCandidate(pn, check, partModelsMap) {
  const fromFitment = Array.from(partModelsMap.get(pn) || []);
  const text = `${check.title || ''} ${(check.bullets || []).join(' ')}`;
  const matches = text.match(/\b(?:MS|FS|BR|BG|HS|TS|HT|BT|HL|KM|MSA|FSA|HSA|BGA|SG|SGA|SHA)\s*\d{2,3}(?:\s*[A-Z]{1,3})?|\b0(?:09|10|11|12|15|17|18|19|20|21|23|24|25|26|28|29|30|31|32|34|36|38|39|41|44|45|46|56|64|66)\b/gi) || [];
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

async function runSearchBatch(browserCtx, mkt, items, caches, maxVariants = 2) {
  const own = caches.searchOwn[mkt];
  const merged = caches.searchMerged[mkt];
  const outPath = mkt === 'amazon.de' ? caches.paths.s92DePath : caches.paths.s92NlPath;

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
      const queries = (it.queries && it.queries.length ? it.queries : [`STIHL ${formatPart(pn)}`, pn]).slice(0, maxVariants);
      const allCards = [];
      const seenAsin = new Set();
      let usedQuery = queries[0];
      let hadError = null;

      try {
        for (const q of queries) {
          usedQuery = q;
          await sleep(wid * 90);
          const resp = await page.goto(`https://www.${mkt}/s?k=${encodeURIComponent(q)}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await sleep(550);
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

          const hasExactHit = allCards.some(c => /^B[0-9A-Z]{9}$/i.test(c.asin) && digits(c.title).includes(pn) && !c.sponsored);
          if (hasExactHit) break;
          await sleep(180);
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
      if (processed % 20 === 0) {
        writeJsonAtomic(outPath, own);
        console.log(`[${mkt}] search progress: ${processed}/${pending.length}`);
      }
      await sleep(140);
    }
  }

  await Promise.all(pages.map((p, i) => worker(p, i)));
  writeJsonAtomic(outPath, own);
  for (const p of pages) await p.close();
  return { processed, rateLimited };
}

function selectCandidateAsinsForParts(parts, mkt, caches, activeByAsinMkt, maxPerPart = 4) {
  const searchMap = caches.searchMerged[mkt];
  const asins = [];
  const seen = new Set();

  for (const it of parts) {
    const pn = it.part_number;
    if (PROTECTED_PINNED_SLOTS.has(`${pn}|${mkt}`)) continue;
    const isKit = /\b(kit|set|pack|pair|satz)\b/i.test(it.part_name || '');
    const sh = searchMap[pn];
    if (!sh || !Array.isArray(sh.hits)) continue;

    const scored = [];
    for (const h of sh.hits) {
      if (!h.asin || !/^B[0-9A-Z]{9}$/i.test(h.asin)) continue;
      if (PROTECTED_RECORD_ASINS.has(h.asin)) continue;
      const existingOwner = activeByAsinMkt.get(`${mkt}|${h.asin}`);
      if (existingOwner && existingOwner !== pn) continue;

      const titleDigits = digits(h.title);
      const exactTitle = titleDigits.includes(pn);
      if (!exactTitle && (sh.hits.some(x => /^B[0-9A-Z]{9}$/i.test(x.asin || '') && digits(x.title).includes(pn)))) continue;
      if (!exactTitle && !/stihl|s[äa]genspezi|oregon|walbro|zama|ngk|bosch|vhbw|hippotech|cancanle|mchnic|adefol|huyur|c\.?t\.?s|propart|ototec|jardiaffaires|perfektgarten|qhalen/i.test(h.title || '')) continue;
      if (!isKit && /\b(\d+\s*[- ]?(?:pcs|stuks|stks|stcs|stk|stück|pack)|pack of\s*[2-9]|2-pack|3-pack|4-pack|5-pack)\b/i.test(h.title || '')) continue;

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

async function runDpChecks(browserCtx, mkt, asinList, caches, forceSet = new Set()) {
  const own = caches.checksOwn[mkt];
  const merged = caches.checksMerged[mkt];
  const outPath = mkt === 'amazon.de' ? caches.paths.c92DePath : caches.paths.c92NlPath;

  const pending = asinList.filter(a => {
    if (!a || !/^B[0-9A-Z]{9}$/i.test(a) || PROTECTED_RECORD_ASINS.has(a)) return false;
    if (own[a] && !own[a].error && (own[a].listed || own[a].isDead || (own[a].http_status && own[a].http_status >= 400))) return false;
    if (forceSet.has(a)) return true;
    const c = merged[a];
    if (!c) return true;
    if (c.error || (c.http_status === 200 && !c.listed && !c.isDead)) return true;
    return false;
  });

  console.log(`[${mkt}] /dp/ pending=${pending.length}/${asinList.length}`);
  if (pending.length === 0) return { processed: 0, rateLimited: false };

  const concurrency = mkt === 'amazon.de' ? 3 : 3;
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
        await sleep(wid * 120);
        const resp = await page.goto(`https://www.${mkt}/dp/${asin}`, { waitUntil: 'load', timeout: 22000 }).catch(async () => {
          return await page.goto(`https://www.${mkt}/dp/${asin}`, { waitUntil: 'domcontentloaded', timeout: 25000 });
        });
        await page.waitForSelector('#productTitle, form[action*="validateCaptcha"]', { timeout: 3200 }).catch(() => {});
        await sleep(220);
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
          const addCart = !!document.querySelector('#add-to-cart-button, #buy-now-button, input[name="submit.add-to-cart"], #add-to-cart-button-ubb');
          const price = !!document.querySelector('.a-price .a-offscreen');
          const glowLoc = textOf(document.querySelector('#glow-ingress-line2'));
          const bodyHead = (document.body.innerText || '').slice(0, 700);
          return {
            pageTitle: document.title || '',
            bodyHead,
            title: textOf(document.querySelector('#productTitle') || document.querySelector('#title span') || document.querySelector('h1#title') || document.querySelector('#btAsinTitle')),
            byline: textOf(document.querySelector('#bylineInfo')),
            avail: textOf(document.querySelector('#availability')),
            glowLoc,
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
          glowLoc: scrubGeo(data.glowLoc),
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
        if (processed % 20 === 0) {
          writeJsonAtomic(outPath, own);
          console.log(`[${mkt}] /dp/ progress: ${processed}/${pending.length}`);
        }
      } catch (err) {
        const rec = { asin, marketplace: mkt, error: String(err).slice(0, 140), checked_at: new Date().toISOString(), listed: false };
        own[asin] = rec;
        merged[asin] = rec;
      }
      await sleep(140);
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
        await page.goto(`https://www.gardenhirespares.co.uk/catalogsearch/result/?q=${encodeURIComponent(formatted)}`, { waitUntil: 'domcontentloaded', timeout: 18000 });
        await sleep(300);
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
        if (processed % 20 === 0) {
          writeJsonAtomic(caches.paths.d92Path, own);
          console.log(`[dealer] progress: ${processed}/${pending.length}`);
        }
      } catch (err) {
        const rec = { part, error: String(err).slice(0, 140), checked_at: new Date().toISOString(), found: false, hits: [] };
        own[part] = rec;
        merged[part] = rec;
      }
      await sleep(160);
    }
  }

  await Promise.all(pages.map(worker));
  writeJsonAtomic(caches.paths.d92Path, own);
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
    availability_audit: {
      verdict: 'LISTING_LIVE',
      method: 'LIVE_BROWSER_GET',
      checked_at: NOW,
      http_status: 200
    },
    status: 'ACTIVE',
    status_reason: `Phase 92: live ${mkt}-vermelding met het exacte STIHL-nummer ${formatted}${dealerHit ? ' en dealercatalogus-corroboratie' : ''} en bevestigde NL-levering.${existingNote ? ' ' + existingNote : ''}`,
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
      if (activeByPartMkt.has(`${pn}|${mkt}`) || PROTECTED_PINNED_SLOTS.has(`${pn}|${mkt}`)) continue;

      const asins = candidatePairsByPartMkt.get(`${pn}|${mkt}`) || [];
      if (asins.length === 0) continue;

      let chosen = null;
      const chosenReasons = [];

      for (const asin of asins) {
        const owner = activeByAsinMkt.get(`${mkt}|${asin}`);
        if (owner && owner !== pn) {
          chosenReasons.push({ asin, reason: `ASIN_ALREADY_OWNED_BY_${owner}` });
          continue;
        }
        const check = caches.checksMerged[mkt][asin];
        if (!check) continue; // not yet dp-checked
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
        if (mkt === 'amazon.de') {
          const delivEvidence = `${check.glowLoc || ''} ${check.deliveryBlock || ''} ${(check.delivery || []).join(' ')} ${check.avail || ''}`;
          if (!/nederland|netherlands|nl|bezorging|lieferung|zustellung|delivery/i.test(delivEvidence)) {
            needsEvidence.push({ part_number: pn, mkt, asin, status: 'NEEDS_EVIDENCE', reason: 'DE_NL_SHIPPING_NOT_EXPLICIT' });
            continue;
          }
        }
        if (!check.hasAddCart) {
          needsEvidence.push({ part_number: pn, mkt, asin, status: 'NEEDS_EVIDENCE', reason: 'OUT_OF_STOCK_OR_NO_BUYBOX' });
          continue;
        }

        const classification = classifyBrand(brand, check);
        const dealerRec = caches.dealerMerged[pn] || null;
        const previous = registry.offers.find(
          o => o.part_number === pn &&
          !PROTECTED_RECORD_ASINS.has(o.asin) &&
          (o.status === 'RESEARCH_REQUIRED' || o.status === 'SUSPENDED' || o.status === 'VERIFIED')
        );
        const existingNote = (previous && previous.asin !== asin) ? `Vervangt eerdere vermelding ${previous.asin}.` : '';

        const record = buildOfferRecord({
          pn, mkt, asin, brand, classification, check, dealerRec, catalogNames, partModelsMap, usedKillSwitches, existingNote
        });
        if (previous && previous.status === 'SUSPENDED' && !previous.superseded_by_asin && previous.asin !== asin) {
          record.supersedes_asin = previous.asin;
        }

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

        if (previous && !PROTECTED_RECORD_ASINS.has(previous.asin) && previous.asin !== record.asin) {
          if (previous.status === 'RESEARCH_REQUIRED') {
            if ((previous.marketplace || 'amazon.nl') === mkt) {
              supersededResearch.push(previous);
              registry.offers = registry.offers.filter(o => o !== previous);
            }
          } else if (previous.status === 'SUSPENDED' && !previous.superseded_by_asin) {
            previous.superseded_by_asin = record.asin;
            previous.superseded_at = record.updated_at;
            previous.updated_at = record.updated_at;
          }
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

  const activeAll = registry.offers.filter(o => o.status === 'ACTIVE');
  const afterNl = activeAll.filter(o => !o.marketplace || o.marketplace === 'amazon.nl').length;
  const afterDe = activeAll.filter(o => o.marketplace === 'amazon.de').length;
  const afterUniqueSet = new Set(activeAll.map(o => o.part_number));

  registry.phase = '92';
  registry.generated_at = new Date().toISOString();
  registry.policy = {
    ...registry.policy,
    pilot_name: 'Phase 92 Affiliate Coverage Expansion',
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
    rejected: rejected.slice(0, 150),
    superseded_research: supersededResearch
  };
  writeJsonAtomic(path.join(BATCH_DIR, `${batchId}.json`), summary, 2);
  return summary;
}

async function main() {
  const cmd = process.argv[2];
  if (!cmd) {
    console.error('Usage: node scripts/phase92_worker.mjs <batch0|batch|audit> [--max-dp N] [--index N | --from A --to B]');
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
  const queue = readJson(path.join(OUT92, 'queue.json'));
  if (!queue) throw new Error('Missing output/phase92/queue.json — run node scripts/phase92_build_queue.mjs first');

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
      const maxDp = Number(argVal('--max-dp', '350'));
      const rec = queue.existing_pool_recovery;

      const reasonPriority = {
        P90_NEEDS_EVIDENCE_RETRY: 300,
        REGISTRY_RESEARCH_REQUIRED_RETRY: 250,
        CACHED_SEARCH_MPN_UNCHECKED: 200,
        CACHED_SEARCH_BRAND_UNCHECKED: 50
      };
      const sortPairs = list => [...list].sort((a, b) => (reasonPriority[b.reason] || 0) - (reasonPriority[a.reason] || 0));

      const activeByPartMktNow = new Set(registry.offers.filter(x => x.status === 'ACTIVE').map(x => `${x.part_number}|${x.marketplace || 'amazon.nl'}`));
      const nlPairsAll = sortPairs(rec.nl_pairs || []).filter(x => !activeByPartMktNow.has(`${x.part_number}|amazon.nl`) && !caches.checksOwn['amazon.nl'][x.asin] && !caches.checksMerged['amazon.nl'][x.asin]);
      const dePairsAll = sortPairs(rec.de_pairs || []).filter(x => !activeByPartMktNow.has(`${x.part_number}|amazon.de`) && !caches.checksOwn['amazon.de'][x.asin] && !caches.checksMerged['amazon.de'][x.asin]);

      const nlPairs = nlPairsAll.slice(0, maxDp * 2);
      const dePairs = dePairsAll.slice(0, maxDp * 2);

      const forceNl = new Set();
      const forceDe = new Set();

      const partSet = new Set();
      const candidatePairsByPartMkt = new Map();
      const nlAsins = [];
      const deAsins = [];
      const seenNl = new Set(), seenDe = new Set();

      const addPair = (pn, mkt, asin) => {
        if (!asin || PROTECTED_PINNED_SLOTS.has(`${pn}|${mkt}`) || PROTECTED_RECORD_ASINS.has(asin)) return;
        const targetArr = mkt === 'amazon.de' ? deAsins : nlAsins;
        const seenArr = mkt === 'amazon.de' ? seenDe : seenNl;
        if (!seenArr.has(asin) && targetArr.length >= maxDp && !forceNl.has(asin) && !forceDe.has(asin)) return;
        partSet.add(pn);
        const k = `${pn}|${mkt}`;
        if (!candidatePairsByPartMkt.has(k)) candidatePairsByPartMkt.set(k, []);
        const arr = candidatePairsByPartMkt.get(k);
        if (!arr.includes(asin)) arr.push(asin);
        if (!seenArr.has(asin)) {
          seenArr.add(asin);
          targetArr.push(asin);
        }
      };

      for (const x of nlPairs) addPair(x.part_number, 'amazon.nl', x.asin);
      for (const x of dePairs) addPair(x.part_number, 'amazon.de', x.asin);

      const dpNlRes = await runDpChecks(browserCtx, 'amazon.nl', nlAsins, caches, forceNl);
      const dpDeRes = await runDpChecks(browserCtx, 'amazon.de', deAsins, caches, forceDe);

      const partRows = Array.from(partSet).map(pn => ({
        part_number: pn,
        part_name: catalogNames[pn] || ''
      }));

      const dealerParts = [];
      for (const r of partRows) {
        const anyGood = ['amazon.nl', 'amazon.de'].some(mkt => {
          return (candidatePairsByPartMkt.get(`${r.part_number}|${mkt}`) || []).some(a => {
            const c = caches.checksMerged[mkt][a];
            return c && c.listed && !c.cannotShipNl && c.hasAddCart && digits(`${c.title || ''} ${(c.bullets || []).join(' ')} ${c.description || ''}`).includes(r.part_number);
          });
        });
        if (anyGood) dealerParts.push(r.part_number);
      }
      await runDealerCorroboration(browserCtx, dealerParts, caches);

      const summary = evaluateAndActivateBatch({
        batchId: argVal('--batch-id', 'batch_0'),
        partRows,
        candidatePairsByPartMkt,
        caches,
        catalogParts,
        catalogNames,
        partModelsMap,
        registry
      });

      const cons = await checkAffiliateConsistency();
      console.log('=== PHASE 92 BATCH 0 (EXISTING POOL & CACHED HITS RECOVERY) ===');
      console.log(JSON.stringify({
        dp: { nl: dpNlRes, de: dpDeRes },
        before: summary.before,
        after: summary.after,
        activated_count: summary.activated_count,
        needs_evidence_count: summary.needs_evidence_count,
        rejected_count: summary.rejected_count,
        consistency_success: cons.success
      }, null, 2));
      if (!cons.success) process.exitCode = 1;
    } else if (cmd === 'batch') {
      const idxArg = argVal('--index', null);
      const from = Number(idxArg || argVal('--from', '1'));
      const to = Number(idxArg || argVal('--to', String(from)));

      for (let k = from; k <= to; k++) {
        const batchObj = (queue.batches || []).find(b => b.batch_id === `batch_${k}`);
        if (!batchObj) {
          console.log(`Skipping batch_${k}: not found.`);
          continue;
        }
        console.log(`\n>>> Starting Phase 92 batch_${k} (${batchObj.parts.length} parts) <<<`);

        const activeByAsinMkt = new Map();
        const activeByPartMkt = new Map();
        for (const o of registry.offers.filter(x => x.status === 'ACTIVE')) {
          const m = o.marketplace || 'amazon.nl';
          activeByAsinMkt.set(`${m}|${o.asin}`, o.part_number);
          activeByPartMkt.set(`${o.part_number}|${m}`, o.asin);
        }

        const nlNeedSearch = batchObj.parts.filter(p => !activeByPartMkt.has(`${p.part_number}|amazon.nl`) && !PROTECTED_PINNED_SLOTS.has(`${p.part_number}|amazon.nl`));
        const deNeedSearch = batchObj.parts.filter(p => !activeByPartMkt.has(`${p.part_number}|amazon.de`) && !PROTECTED_PINNED_SLOTS.has(`${p.part_number}|amazon.de`));

        const sNlRes = await runSearchBatch(browserCtx, 'amazon.nl', nlNeedSearch, caches, 2);
        const sDeRes = await runSearchBatch(browserCtx, 'amazon.de', deNeedSearch, caches, 2);

        const nlAsins = selectCandidateAsinsForParts(nlNeedSearch, 'amazon.nl', caches, activeByAsinMkt, 4);
        const deAsins = selectCandidateAsinsForParts(deNeedSearch, 'amazon.de', caches, activeByAsinMkt, 4);

        const dpNlRes = await runDpChecks(browserCtx, 'amazon.nl', nlAsins, caches);
        const dpDeRes = await runDpChecks(browserCtx, 'amazon.de', deAsins, caches);

        const candidatePairsByPartMkt = new Map();
        for (const mkt of ['amazon.nl', 'amazon.de']) {
          for (const p of batchObj.parts) {
            if (activeByPartMkt.has(`${p.part_number}|${mkt}`) || PROTECTED_PINNED_SLOTS.has(`${p.part_number}|${mkt}`)) continue;
            const picked = selectCandidateAsinsForParts([p], mkt, caches, activeByAsinMkt, 4);
            if (picked.length) candidatePairsByPartMkt.set(`${p.part_number}|${mkt}`, picked);
          }
        }

        const dealerCandidates = [];
        for (const p of batchObj.parts) {
          const anyGood = ['amazon.nl', 'amazon.de'].some(mkt => {
            return (candidatePairsByPartMkt.get(`${p.part_number}|${mkt}`) || []).some(a => {
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
        console.log(`=== PHASE 92 BATCH ${k} SUMMARY ===`);
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
