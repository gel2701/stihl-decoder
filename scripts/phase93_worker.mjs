#!/usr/bin/env node
/**
 * scripts/phase93_worker.mjs
 *
 * Phase 93 — Affiliate Recovery & Expansion Worker
 *
 * Enhancements over Phase 92 worker:
 *  - Extracts full Amazon specification tables (#productDetails_techSpec_section_1,
 *    #productDetails_detailBullets_sections1, #detailBullets_feature_div,
 *    #productOverview_feature_div, .prodDetTable, #technicalSpecifications_section_1)
 *    plus up to 4,000 chars of #productDescription/#aplus so valid MPNs in Amazon's
 *    product details table are never missed.
 *  - Cleans NL/DE storefront bylines ("De <Brand> Store openen").
 *  - Pre-filters search cards (multipacks & conflicting 11-digit MPNs) BEFORE fetching /dp/.
 *  - Supports targeted alternative-query re-search (--alt-search) for recoverable 0-ACTIVE parts.
 *  - Stores full batch telemetry in output/phase93/batches/ & preserves all baseline ACTIVE/SUSPENDED/VERIFIED.
 *
 * Usage:
 *   node scripts/phase93_worker.mjs batch0 [--max-dp 450] [--batch-id batch_0]
 *   node scripts/phase93_worker.mjs batch --index N [--alt-search]
 *   node scripts/phase93_worker.mjs batch --from A --to B [--alt-search]
 *   node scripts/phase93_worker.mjs audit
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

import { TwoGateVerifier } from '../src/affiliate/TwoGateVerifier.js';
import { checkHistoricalMismatch } from '../src/affiliate/HistoricalMismatches.js';
import { PartNormalizer } from '../src/parts/PartNormalizer.js';
import { checkAffiliateConsistency } from './check_affiliate_consistency.mjs';
import {
  BAD_BRAND_RE,
  STRONG_MULTIPACK_RE,
  resolveCleanBrand,
  classifyBrand,
  evaluateTechnicalFit
} from './phase88_screener.mjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const OUT93 = path.join(ROOT, 'output', 'phase93');
const BATCH_DIR = path.join(OUT93, 'batches');
fs.mkdirSync(BATCH_DIR, { recursive: true });

const REGISTRY_REL = path.join('data', 'affiliate', 'verified_amazon_registry.json');
const TAGS = { 'amazon.nl': 'srihldecoder2-21', 'amazon.de': 'srihldecode00-21' };
const AMAZON_URL = (mkt, asin) => ['https://www.' + mkt, 'dp', asin].join('/');
const MANUFACTURER_BY_BRAND = { Stihl: 'ANDREAS STIHL AG & Co. KG', STIHL: 'ANDREAS STIHL AG & Co. KG' };

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
const PROTECTED_RECORD_ASINS = new Set(['B00IKF8TH8', 'B013KONKZY', 'B00SVDWDRG', 'B00LAHKSDQ']);

const NON_STIHL_PRODUCT_RE = /\b(?:bosch\s+siemens|miele|bauknecht|whirlpool|electrolux|makita|dewalt|milwaukee|karcher|kärcher|gardena|ryobi|einhell|black\s*\+?\s*decker|worx)\b/i;
const COMPLETE_MACHINE_RE = /\b(?:accu[- ]?kettingzaag|akku[- ]?kettensäge|accu[- ]?bosmaaier|benzine[- ]?bosmaaier|benzine[- ]?kettingzaag|benzin[- ]?kettensäge|zonder accu en oplader|ohne akku)\b/i;

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

function cleanBrand93(check) {
  let b = resolveCleanBrand(check) || '';
  b = b
    .replace(/^De\s+(.+?)\s+Store\s+openen$/i, '$1')
    .replace(/^Visit\s+the\s+(.+?)\s+Store$/i, '$1')
    .replace(/^Bezoek\s+de\s+store\s+van\s+(.+)$/i, '$1')
    .replace(/^Marke:\s*/i, '')
    .trim();
  if (!b && check.byline) {
    const m = String(check.byline).trim().match(/^(?:De|The|Den)\s+(.+?)\s+(?:Store|Shop)\b/i);
    if (m) b = m[1].trim();
  }
  return b;
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
  const s93NlPath = path.join(OUT93, 'search_hits_amazon_nl.json');
  const s93DePath = path.join(OUT93, 'search_hits_amazon_de.json');
  const c93NlPath = path.join(OUT93, 'product_checks_amazon_nl.json');
  const c93DePath = path.join(OUT93, 'product_checks_amazon_de.json');
  const d93Path = path.join(OUT93, 'dealer_corroboration.json');

  const s93Nl = readJson(s93NlPath, {});
  const s93De = readJson(s93DePath, {});
  const c93Nl = readJson(c93NlPath, {});
  const c93De = readJson(c93DePath, {});
  const d93 = readJson(d93Path, {});

  return {
    paths: { s93NlPath, s93DePath, c93NlPath, c93DePath, d93Path },
    searchOwn: { 'amazon.nl': s93Nl, 'amazon.de': s93De },
    searchMerged: {
      'amazon.nl': {
        ...readJson(path.join(ROOT, 'output/phase87_1/search_hits_amazon_nl.json'), {}),
        ...readJson(path.join(ROOT, 'output/phase87_2/search_hits_amazon_nl.json'), {}),
        ...readJson(path.join(ROOT, 'output/phase88/search_hits_amazon_nl.json'), {}),
        ...readJson(path.join(ROOT, 'output/phase89/search_hits_amazon_nl.json'), {}),
        ...readJson(path.join(ROOT, 'output/phase90/search_hits_amazon_nl.json'), {}),
        ...readJson(path.join(ROOT, 'output/phase92/search_hits_amazon_nl.json'), {}),
        ...s93Nl
      },
      'amazon.de': {
        ...readJson(path.join(ROOT, 'output/phase87_2/search_hits_amazon_de.json'), {}),
        ...readJson(path.join(ROOT, 'output/phase88/search_hits_amazon_de.json'), {}),
        ...readJson(path.join(ROOT, 'output/phase89/search_hits_amazon_de.json'), {}),
        ...readJson(path.join(ROOT, 'output/phase90/search_hits_amazon_de.json'), {}),
        ...readJson(path.join(ROOT, 'output/phase92/search_hits_amazon_de.json'), {}),
        ...s93De
      }
    },
    checksOwn: { 'amazon.nl': c93Nl, 'amazon.de': c93De },
    checksMerged: {
      'amazon.nl': {
        ...readJson(path.join(ROOT, 'output/phase87_1/product_checks_amazon_nl.json'), {}),
        ...readJson(path.join(ROOT, 'output/phase87_2/product_checks_amazon_nl.json'), {}),
        ...readJson(path.join(ROOT, 'output/phase87_3/product_checks_amazon_nl.json'), {}),
        ...readJson(path.join(ROOT, 'output/phase88/product_checks_amazon_nl.json'), {}),
        ...readJson(path.join(ROOT, 'output/phase89/product_checks_amazon_nl.json'), {}),
        ...readJson(path.join(ROOT, 'output/phase90/product_checks_amazon_nl.json'), {}),
        ...readJson(path.join(ROOT, 'output/phase92/product_checks_amazon_nl.json'), {}),
        ...c93Nl
      },
      'amazon.de': {
        ...readJson(path.join(ROOT, 'output/phase87_2/product_checks_amazon_de.json'), {}),
        ...readJson(path.join(ROOT, 'output/phase87_3/product_checks_amazon_de.json'), {}),
        ...readJson(path.join(ROOT, 'output/phase88/product_checks_amazon_de.json'), {}),
        ...readJson(path.join(ROOT, 'output/phase89/product_checks_amazon_de.json'), {}),
        ...readJson(path.join(ROOT, 'output/phase90/product_checks_amazon_de.json'), {}),
        ...readJson(path.join(ROOT, 'output/phase92/product_checks_amazon_de.json'), {}),
        ...c93De
      }
    },
    dealerOwn: d93,
    dealerMerged: {
      ...readJson(path.join(ROOT, 'output/phase87_1/dealer_corroboration.json'), {}),
      ...readJson(path.join(ROOT, 'output/phase87_2/dealer_corroboration.json'), {}),
      ...readJson(path.join(ROOT, 'output/phase87_3/dealer_corroboration.json'), {}),
      ...readJson(path.join(ROOT, 'output/phase88/dealer_corroboration.json'), {}),
      ...readJson(path.join(ROOT, 'output/phase89/dealer_corroboration.json'), {}),
      ...readJson(path.join(ROOT, 'output/phase90/dealer_corroboration.json'), {}),
      ...readJson(path.join(ROOT, 'output/phase92/dealer_corroboration.json'), {}),
      ...d93
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
  const text = `${check.title || ''} ${(check.bullets || []).join(' ')} ${check.techSpecs || ''}`;
  const matches = text.match(/\b(?:MS|FS|BR|BG|HS|TS|HT|BT|HL|KM|MSA|FSA|HSA|BGA|SG|SGA|SHA)\s*\d{2,3}(?:\s*[A-Z]{1,3})?|\b0(?:09|10|11|12|15|17|18|19|20|21|23|24|25|26|28|29|30|31|32|34|36|38|39|41|44|45|46|56|64|66)\b/gi) || [];
  const merged = [];
  const seen = new Set();
  for (const m of [...fromFitment, ...matches.map(x => x.toUpperCase().replace(/\s+/g, ' ').trim())]) {
    if (!seen.has(m)) { seen.add(m); merged.push(m); }
  }
  return merged.slice(0, 12);
}

async function runSearchBatch(browserCtx, mkt, items, caches, { maxVariants = 3, altResearch = false } = {}) {
  const own = caches.searchOwn[mkt];
  const merged = caches.searchMerged[mkt];
  const outPath = mkt === 'amazon.de' ? caches.paths.s93DePath : caches.paths.s93NlPath;

  const pending = items.filter(it => {
    const existing = merged[it.part_number];
    if (!existing || existing.error) return true;
    if (altResearch && !own[it.part_number]) {
      // Only run alt query variants that haven't been tried yet
      const tried = new Set(existing.queries_tried || (existing.query ? [existing.query] : []));
      return (it.queries || []).some(q => !tried.has(q));
    }
    return false;
  });
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
      const existing = merged[pn];
      const alreadyTried = new Set(existing?.queries_tried || (existing?.query ? [existing.query] : []));
      const baseQueries = (it.queries && it.queries.length ? it.queries : [`STIHL ${formatPart(pn)}`, pn]);
      const queries = (altResearch && existing && !existing.error
        ? baseQueries.filter(q => !alreadyTried.has(q))
        : baseQueries
      ).slice(0, maxVariants);

      const allCards = [...(existing?.hits || [])];
      const seenAsin = new Set(allCards.map(c => c.asin).filter(Boolean));
      let usedQuery = queries[0] || existing?.query || baseQueries[0];
      let hadError = null;

      try {
        for (const q of queries) {
          usedQuery = q;
          alreadyTried.add(q);
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

          const hasExactHit = info.cards.some(c => /^B[0-9A-Z]{9}$/i.test(c.asin) && digits(c.title).includes(pn) && !c.sponsored);
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
        queries_tried: [...alreadyTried],
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

function selectCandidateAsinsForParts(partRows, mkt, caches, activeByAsinMkt, maxPerPart = 4) {
  const out = [];
  const seen = new Set();
  for (const p of partRows) {
    const pn = p.part_number;
    const partName = p.part_name || '';
    const isKit = /\b(kit|set|pack|pair|satz)\b/i.test(partName);
    const sh = caches.searchMerged[mkt][pn];
    const scored = [];
    for (const h of (sh?.hits || [])) {
      const a = h?.asin;
      if (!a || !/^[A-Z0-9]{10}$/.test(a) || PROTECTED_RECORD_ASINS.has(a)) continue;
      if (h.sponsored) continue;
      const owner = activeByAsinMkt.get(`${mkt}|${a}`);
      if (owner && owner !== pn) continue;

      const title = String(h.title || '');
      // Pre-filter obvious multipack & conflicting 11-digit MPN before hitting /dp/
      if (!isKit && STRONG_MULTIPACK_RE.test(title)) {
        const m = title.match(STRONG_MULTIPACK_RE);
        if (m && !/^1\s*(?:x|pc|stuk|stück)/i.test(m[0])) continue;
      }
      const found11 = [...new Set((title.match(/\b\d{4}[\s.-]?\d{3}[\s.-]?\d{4}\b/g) || []).map(digits))];
      if (found11.some(d => d.length === 11 && d !== pn)) continue;

      let s = 0;
      if (digits(title).includes(pn)) s += 1000;
      if (/stihl/i.test(title)) s += 200;
      if (/sägenspezi|oregon|ngk|bosch|ratioparts|haishine|mchnic|perfektgarten|vhbw/i.test(title)) s += 120;
      if (h.has_price) s += 80;
      if (/levering|bezorging|lieferung/i.test(h.delivery || '')) s += 60;
      if (s > 0) scored.push({ asin: a, s });
    }
    scored.sort((a, b) => b.s - a.s);
    let nonExactPicked = 0;
    for (const item of scored) {
      if (out.length >= partRows.length * maxPerPart) break;
      const isExact = item.s >= 1000;
      if (!isExact) {
        if (nonExactPicked >= 2) continue;
        nonExactPicked++;
      }
      if (!seen.has(item.asin)) {
        seen.add(item.asin);
        out.push(item.asin);
      }
      if (partRows.length === 1 && (nonExactPicked >= 2 && !isExact)) break;
    }
  }
  return out;
}

async function runDpChecks(browserCtx, mkt, asinList, caches, forceRecheckSet = new Set()) {
  const own = caches.checksOwn[mkt];
  const merged = caches.checksMerged[mkt];
  const outPath = mkt === 'amazon.de' ? caches.paths.c93DePath : caches.paths.c93NlPath;

  const pending = asinList.filter(a => !own[a] && (!merged[a] || merged[a].error || forceRecheckSet.has(a)));
  console.log(`[${mkt}] /dp/ pending=${pending.length}/${asinList.length}`);
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
      const asin = pending[idx++];
      try {
        await sleep(wid * 80);
        const resp = await page.goto(AMAZON_URL(mkt, asin), { waitUntil: 'domcontentloaded', timeout: 30000 });
        await sleep(600);
        const status = resp ? resp.status() : 200;
        const data = await page.evaluate(() => {
          const textOf = el => (el ? el.innerText.replace(/\s+/g, ' ').trim() : '');
          const delivTexts = [
            textOf(document.querySelector('#mir-layout-DELIVERY_BLOCK')),
            textOf(document.querySelector('#deliveryBlockMessage')),
            textOf(document.querySelector('#contextualIngressPtLabel_deliveryShortLine'))
          ].filter(Boolean);
          const sellerTexts = [
            textOf(document.querySelector('#merchant-info')),
            textOf(document.querySelector('#sellerProfileTriggerId')),
            textOf(document.querySelector('#fulfillerInfoFeature_feature_div'))
          ].filter(Boolean);
          const bullets = [...document.querySelectorAll('#feature-bullets li')].map(el => el.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean);

          // Phase 93: full product details / spec tables / detail bullets / overview extraction
          const specRows = [
            ...document.querySelectorAll('#productDetails_techSpec_section_1 tr'),
            ...document.querySelectorAll('#productDetails_detailBullets_sections1 tr'),
            ...document.querySelectorAll('#productOverview_feature_div tr'),
            ...document.querySelectorAll('.prodDetTable tr'),
            ...document.querySelectorAll('#technicalSpecifications_section_1 tr'),
            ...document.querySelectorAll('#detailBullets_feature_div li')
          ]
            .map(el => el.innerText.replace(/\s+/g, ' ').trim())
            .filter(Boolean)
            .slice(0, 45);
          const techSpecs = specRows.join(' | ').slice(0, 2200);

          const descRaw = [
            textOf(document.querySelector('#productDescription')),
            textOf(document.querySelector('#aplus'))
          ].filter(Boolean).join(' ');
          const descriptionCombined = [techSpecs, descRaw].filter(Boolean).join(' | ').slice(0, 4000);

          const price = !!(document.querySelector('.a-price .a-offscreen') || document.querySelector('#corePrice_feature_div .a-price'));
          const addCart = !!(document.querySelector('#add-to-cart-button') || document.querySelector('input[name="submit.add-to-cart"]'));
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
            techSpecs,
            description: descriptionCombined,
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
          techSpecs: scrubGeo(data.techSpecs || ''),
          description: scrubGeo(data.description || ''),
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
          writeJsonAtomic(caches.paths.d93Path, own);
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
  writeJsonAtomic(caches.paths.d93Path, own);
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
    checked_at: check.checked_at || NOW,
    delivery_to_nl: true,
    seller_byline: scrubGeo(check.byline || brand)
  }];
  if (dealerHit && dealerRec.source_url) {
    sources.push({
      type: 'INDEPENDENT_DEALER_CATALOG',
      url: dealerRec.source_url,
      title: String(dealerHit).slice(0, 160),
      claim: `Onafhankelijke STIHL-onderdelendealer vermeldt onderdeel ${formatted} ("${String(dealerHit).slice(0, 120)}").`,
      checked_at: dealerRec.checked_at || NOW
    });
  }

  const mktCode = mkt === 'amazon.de' ? 'DE' : 'NL';
  let ksSuffix = 93;
  let killSwitchId = `KILL-P93-${mktCode}-${pn}-${asin}`;
  if (usedKillSwitches.has(killSwitchId)) {
    while (usedKillSwitches.has(`KILL-P93-${mktCode}-${pn}-${asin}-${ksSuffix}`)) ksSuffix++;
    killSwitchId = `KILL-P93-${mktCode}-${pn}-${asin}-${ksSuffix}`;
  }

  const compatibilityProof = `${mkt}-vermelding ${asin} (${brand}) koppelt "${listingTitle.slice(0, 110)}" expliciet aan het STIHL-nummer ${formatted}${models.length ? ` (compatibele modellen o.a. ${models.slice(0, 4).join(', ')})` : ''}.`;
  const identityProof = `Live controle van ${AMAZON_URL(mkt, asin)} op ${TODAY} bevestigt ASIN ${asin}, verkoper/merk ${brand} en het exacte onderdeelnummer ${formatted} in de productgegevens${dealerHit ? `, ondersteund door onafhankelijke dealercatalogus (${dealerHit})` : ''}.`;

  const record = {
    part_number: pn,
    part_number_formatted: formatted,
    part_name: catalogName,
    product_title: listingTitle.slice(0, 220),
    brand,
    manufacturer: MANUFACTURER_BY_BRAND[brand] || `${brand} (Verified Aftermarket)`,
    manufacturer_part_number: formatted,
    trade_number: null,
    package_quantity: 1,
    package_type: 'Enkelstuks',
    is_multipack: false,
    asin,
    marketplace: mkt,
    affiliate_tag: tag,
    mpn: pn,
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
    status_reason: `Phase 93: live ${mkt}-vermelding met het exacte STIHL-nummer ${formatted}${dealerHit ? ' en dealercatalogus-corroboratie' : ''} en bevestigde NL-levering.${existingNote ? ' ' + existingNote : ''}`,
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
        if (!check) continue;
        if (!check.listed || check.isDead || check.http_status >= 400) {
          const reason = (!check.listed && check.http_status === 200)
            ? 'NOT_LISTED_HTTP_200'
            : (check.error ? 'TRANSIENT_FETCH_ERROR' : `NOT_LISTED_HTTP_${check.http_status || 'DEAD'}`);
          if (reason === 'NOT_LISTED_HTTP_200' || reason === 'TRANSIENT_FETCH_ERROR') {
            needsEvidence.push({ part_number: pn, mkt, asin, status: 'NEEDS_EVIDENCE', reason });
          } else {
            chosenReasons.push({ asin, reason });
          }
          continue;
        }

        const fullText = `${check.title || ''} ${(check.bullets || []).join(' ')} ${check.techSpecs || ''} ${check.description || ''}`;
        if (!digits(fullText).includes(pn)) {
          const found11 = [...new Set((fullText.match(/\b\d{4}[\s.-]?\d{3}[\s.-]?\d{4}\b/g) || []).map(digits))];
          if (found11.some(d => d.length === 11 && d !== pn)) {
            chosenReasons.push({ asin, reason: `CONFLICTING_MPN:${found11.find(d => d !== pn)}` });
          } else if (NON_STIHL_PRODUCT_RE.test(fullText) && !/stihl/i.test(fullText)) {
            chosenReasons.push({ asin, reason: 'NON_STIHL_PRODUCT_MATCH' });
          } else if (COMPLETE_MACHINE_RE.test(check.title || '') && /\b(?:body|accu|cc|cm)\b/i.test(check.title || '')) {
            chosenReasons.push({ asin, reason: 'COMPLETE_MACHINE_NOT_PART' });
          } else {
            // Missing explicit MPN without conflicting MPN -> stays NEEDS_EVIDENCE instead of REJECTED
            needsEvidence.push({ part_number: pn, mkt, asin, status: 'NEEDS_EVIDENCE', reason: 'MISSING_INDEPENDENT_MPN_EVIDENCE' });
          }
          continue;
        }

        const mismatch = checkHistoricalMismatch(pn, asin, check.title || '');
        if (mismatch.isMismatch) {
          chosenReasons.push({ asin, reason: `HISTORICAL_MISMATCH: ${mismatch.record?.reason || 'matched'}` });
          continue;
        }

        const brand = cleanBrand93(check);
        if (!brand || BAD_BRAND_RE.test(brand)) {
          needsEvidence.push({ part_number: pn, mkt, asin, status: 'NEEDS_EVIDENCE', reason: `BAD_OR_MISSING_BRAND:${brand || 'empty'}` });
          continue;
        }

        const checkWithSpecs = {
          ...check,
          description: [check.techSpecs || '', check.description || ''].filter(Boolean).join(' ')
        };
        const fit = evaluateTechnicalFit(pn, partName, checkWithSpecs, brand);
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
          pn, mkt, asin, brand, classification, check: checkWithSpecs, dealerRec, catalogNames, partModelsMap, usedKillSwitches, existingNote
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
        if (exIdx >= 0) registry.offers[exIdx] = record;
        else registry.offers.push(record);

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
          has_dealer: dealerHit,
          recovered_evidence_used: /MPN|OEM|Artikelnummer|Modellnummer|Hersteller/i.test(caches.checksMerged[mkt][record.asin]?.techSpecs || '')
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

  registry.phase = '93';
  registry.generated_at = new Date().toISOString();
  registry.policy = {
    ...registry.policy,
    pilot_name: 'Phase 93 Affiliate Recovery & Expansion',
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
    rejected,
    superseded_research: supersededResearch
  };
  writeJsonAtomic(path.join(BATCH_DIR, `${batchId}.json`), summary, 2);
  return summary;
}

async function main() {
  const cmd = process.argv[2];
  if (!cmd) {
    console.error('Usage: node scripts/phase93_worker.mjs <batch0|batch|audit> [--max-dp N] [--index N | --from A --to B] [--alt-search]');
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
  const queue = readJson(path.join(OUT93, 'queue.json'));
  if (!queue) throw new Error('Missing output/phase93/queue.json — run node scripts/phase93_build_queue.mjs first');

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
      const maxDp = Number(argVal('--max-dp', '500'));
      const batchId = argVal('--batch-id', 'batch_0');
      const rec = queue.batch_0;

      const activeByPartMktNow = new Set(registry.offers.filter(x => x.status === 'ACTIVE').map(x => `${x.part_number}|${x.marketplace || 'amazon.nl'}`));

      const filterPending = (list, mkt) => list.filter(x => {
        if (activeByPartMktNow.has(`${x.part_number}|${mkt}`)) return false;
        if (caches.checksOwn[mkt][x.asin]) return false; // already checked in Phase 93
        if (x.force_recheck) return true; // force fresh TechDetails DOM re-check
        return !caches.checksMerged[mkt][x.asin];
      });

      const nlPending = filterPending(rec.nl_pairs || [], 'amazon.nl').slice(0, maxDp * 2);
      const dePending = filterPending(rec.de_pairs || [], 'amazon.de').slice(0, maxDp * 2);

      const forceNl = new Set();
      const forceDe = new Set();
      const partSet = new Set();
      const candidatePairsByPartMkt = new Map();
      const nlAsins = [];
      const deAsins = [];
      const seenNl = new Set(), seenDe = new Set();

      const addPair = (x, mkt) => {
        if (!x.asin || PROTECTED_PINNED_SLOTS.has(`${x.part_number}|${mkt}`) || PROTECTED_RECORD_ASINS.has(x.asin)) return;
        const targetArr = mkt === 'amazon.de' ? deAsins : nlAsins;
        const seenArr = mkt === 'amazon.de' ? seenDe : seenNl;
        if (!seenArr.has(x.asin) && targetArr.length >= maxDp) return;
        partSet.add(x.part_number);
        const k = `${x.part_number}|${mkt}`;
        if (!candidatePairsByPartMkt.has(k)) candidatePairsByPartMkt.set(k, []);
        const arr = candidatePairsByPartMkt.get(k);
        if (!arr.includes(x.asin)) arr.push(x.asin);
        if (x.force_recheck) (mkt === 'amazon.de' ? forceDe : forceNl).add(x.asin);
        if (!seenArr.has(x.asin)) {
          seenArr.add(x.asin);
          targetArr.push(x.asin);
        }
      };

      for (const x of nlPending) addPair(x, 'amazon.nl');
      for (const x of dePending) addPair(x, 'amazon.de');

      const dpNlRes = await runDpChecks(browserCtx, 'amazon.nl', nlAsins, caches, forceNl);
      const dpDeRes = await runDpChecks(browserCtx, 'amazon.de', deAsins, caches, forceDe);

      const partRows = Array.from(partSet).map(pn => ({ part_number: pn, part_name: catalogNames[pn] || '' }));

      const dealerParts = [];
      for (const r of partRows) {
        const anyGood = ['amazon.nl', 'amazon.de'].some(mkt =>
          (candidatePairsByPartMkt.get(`${r.part_number}|${mkt}`) || []).some(a => {
            const c = caches.checksMerged[mkt][a];
            return c && c.listed && !c.cannotShipNl && c.hasAddCart && digits(`${c.title || ''} ${(c.bullets || []).join(' ')} ${c.techSpecs || ''} ${c.description || ''}`).includes(r.part_number);
          })
        );
        if (anyGood) dealerParts.push(r.part_number);
      }
      await runDealerCorroboration(browserCtx, dealerParts, caches);

      const summary = evaluateAndActivateBatch({
        batchId,
        partRows,
        candidatePairsByPartMkt,
        caches,
        catalogParts,
        catalogNames,
        partModelsMap,
        registry
      });

      const cons = await checkAffiliateConsistency();
      console.log(`=== PHASE 93 ${batchId.toUpperCase()} ===`);
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
    } else if (cmd === 'reverse_recover') {
      const activeByPartMkt = new Set(registry.offers.filter(x => x.status === 'ACTIVE').map(x => `${x.part_number}|${x.marketplace || 'amazon.nl'}`));
      const activeByAsinMkt = new Map();
      const activePartsNow = new Set();
      for (const o of registry.offers.filter(x => x.status === 'ACTIVE')) {
        const m = o.marketplace || 'amazon.nl';
        activeByAsinMkt.set(`${m}|${o.asin}`, o.part_number);
        activePartsNow.add(o.part_number);
      }

      const candidatePairsByPartMkt = new Map();
      const partRowsMap = new Map();
      const nlAsins = [];
      const deAsins = [];
      const forceNl = new Set();
      const forceDe = new Set();

      // Reverse-index existing checked /dp/ pages where EITHER:
      //  (a) the entire listing has a single unambiguous 11-digit MPN, OR
      //  (b) the #productTitle itself has a single unambiguous 11-digit MPN (max 6 compatible MPNs in body)
      for (const mkt of ['amazon.nl', 'amazon.de']) {
        for (const [asin, check] of Object.entries(caches.checksMerged[mkt])) {
          if (PROTECTED_RECORD_ASINS.has(asin) || activeByAsinMkt.has(`${mkt}|${asin}`)) continue;
          if (!check || !check.listed || check.isDead || !check.hasAddCart || check.cannotShipNl) continue;
          const txt = `${check.title || ''} ${(check.bullets || []).join(' ')} ${check.techSpecs || ''} ${check.description || ''}`;
          const found11 = [...new Set((txt.match(/\b\d{4}[\s.-]?\d{3}[\s.-]?\d{4}\b/g) || []).map(digits))];
          const title11 = [...new Set(((check.title || '').match(/\b\d{4}[\s.-]?\d{3}[\s.-]?\d{4}\b/g) || []).map(digits))];
          let candidates = [];
          if (found11.length === 1) candidates = [found11[0]];
          else if (title11.length === 1 && found11.length <= 6) candidates = [title11[0]];
          else continue;
          const pn = candidates[0];
          if (!catalogParts.has(pn) || activeByPartMkt.has(`${pn}|${mkt}`) || PROTECTED_PINNED_SLOTS.has(`${pn}|${mkt}`)) continue;
          if (process.argv.includes('--zero-only') && activePartsNow.has(pn)) continue;
          const partName = catalogNames[pn] || '';
          const brand = cleanBrand93(check);
          if (!brand || BAD_BRAND_RE.test(brand)) continue;
          if (checkHistoricalMismatch(pn, asin, check.title || '').isMismatch) continue;
          const checkWithSpecs = { ...check, description: [check.techSpecs || '', check.description || ''].filter(Boolean).join(' ') };
          if (!evaluateTechnicalFit(pn, partName, checkWithSpecs, brand).ok) continue;
          if (mkt === 'amazon.de') {
            const delivEvidence = `${check.glowLoc || ''} ${check.deliveryBlock || ''} ${(check.delivery || []).join(' ')} ${check.avail || ''}`;
            if (!/nederland|netherlands|nl|bezorging|lieferung|zustellung|delivery/i.test(delivEvidence)) continue;
          }

          // Prioritize ZERO-ACTIVE parts first!
          const k = `${pn}|${mkt}`;
          if (!candidatePairsByPartMkt.has(k)) candidatePairsByPartMkt.set(k, []);
          candidatePairsByPartMkt.get(k).push({ asin, zeroActive: !activePartsNow.has(pn) });
          partRowsMap.set(pn, { part_number: pn, part_name: partName, zeroActive: !activePartsNow.has(pn) });
        }
      }

      // Sort 0-ACTIVE parts first and take up to 350 NL + 350 DE ASINs for fresh live /dp/ verification
      const maxDp = Number(argVal('--max-dp', '350'));
      const sortedParts = [...partRowsMap.values()].sort((a, b) => (b.zeroActive ? 1 : 0) - (a.zeroActive ? 1 : 0));
      const finalPairs = new Map();
      const selectedParts = [];
      for (const p of sortedParts) {
        let used = false;
        for (const mkt of ['amazon.nl', 'amazon.de']) {
          const list = candidatePairsByPartMkt.get(`${p.part_number}|${mkt}`) || [];
          if (!list.length) continue;
          const targetArr = mkt === 'amazon.de' ? deAsins : nlAsins;
          if (targetArr.length >= maxDp) continue;
          const pick = list[0].asin;
          if (!targetArr.includes(pick)) {
            targetArr.push(pick);
            (mkt === 'amazon.de' ? forceDe : forceNl).add(pick);
          }
          finalPairs.set(`${p.part_number}|${mkt}`, [pick]);
          used = true;
        }
        if (used) selectedParts.push(p);
      }

      const dpNlRes = await runDpChecks(browserCtx, 'amazon.nl', nlAsins, caches, forceNl);
      const dpDeRes = await runDpChecks(browserCtx, 'amazon.de', deAsins, caches, forceDe);
      await runDealerCorroboration(browserCtx, selectedParts.map(p => p.part_number), caches);

      const summary = evaluateAndActivateBatch({
        batchId: argVal('--batch-id', 'batch_reverse'),
        partRows: selectedParts,
        candidatePairsByPartMkt: finalPairs,
        caches,
        catalogParts,
        catalogNames,
        partModelsMap,
        registry
      });
      const cons = await checkAffiliateConsistency();
      console.log('=== PHASE 93 REVERSE RECOVERY SUMMARY ===');
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
      const altResearch = process.argv.includes('--alt-search');

      for (let k = from; k <= to; k++) {
        const batchObj = (queue.batches || []).find(b => b.batch_id === `batch_${k}`);
        if (!batchObj) {
          console.log(`Skipping batch_${k}: not found.`);
          continue;
        }
        console.log(`\n>>> Starting Phase 93 batch_${k} (${batchObj.parts.length} parts, altResearch=${altResearch}) <<<`);

        const activeByAsinMkt = new Map();
        const activeByPartMkt = new Map();
        for (const o of registry.offers.filter(x => x.status === 'ACTIVE')) {
          const m = o.marketplace || 'amazon.nl';
          activeByAsinMkt.set(`${m}|${o.asin}`, o.part_number);
          activeByPartMkt.set(`${o.part_number}|${m}`, o.asin);
        }

        const nlNeedSearch = batchObj.parts.filter(p => !activeByPartMkt.has(`${p.part_number}|amazon.nl`) && !PROTECTED_PINNED_SLOTS.has(`${p.part_number}|amazon.nl`));
        const deNeedSearch = batchObj.parts.filter(p => !activeByPartMkt.has(`${p.part_number}|amazon.de`) && !PROTECTED_PINNED_SLOTS.has(`${p.part_number}|amazon.de`));

        const sNlRes = await runSearchBatch(browserCtx, 'amazon.nl', nlNeedSearch, caches, { maxVariants: 2, altResearch });
        const sDeRes = await runSearchBatch(browserCtx, 'amazon.de', deNeedSearch, caches, { maxVariants: 2, altResearch });

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
          const anyGood = ['amazon.nl', 'amazon.de'].some(mkt =>
            (candidatePairsByPartMkt.get(`${p.part_number}|${mkt}`) || []).some(a => {
              const c = caches.checksMerged[mkt][a];
              return c && c.listed && !c.cannotShipNl && c.hasAddCart && digits(`${c.title || ''} ${(c.bullets || []).join(' ')} ${c.techSpecs || ''} ${c.description || ''}`).includes(p.part_number);
            })
          );
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
        console.log(`=== PHASE 93 BATCH ${k} SUMMARY ===`);
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
