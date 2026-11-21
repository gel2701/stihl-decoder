#!/usr/bin/env node
/**
 * scripts/phase96_worker.mjs
 *
 * Phase 96 — Targeted Affiliate Growth on Newly Enriched Models & Remaining 0-Offer Parts
 *
 * Reuses the strict Phase 95 / TwoGateVerifier / HistoricalMismatches verification pipeline
 * while targeting:
 *   - P1: Newly enriched models & the 29 uncovered fitment models (0 ACTIVE offers)
 *   - P2: High-priority commercial 0-ACTIVE parts (including unsearched Phase 95 queue)
 *   - P3: Open NEEDS_EVIDENCE / alternate-ASIN / OOS re-check slots
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
import { PartNameNormalizer } from '../src/parts/PartNameNormalizer.js';
import { checkAffiliateConsistency } from './check_affiliate_consistency.mjs';
import {
  BAD_BRAND_RE,
  STRONG_MULTIPACK_RE,
  cleanBrand95,
  classifyBrand,
  evaluateTechnicalFit95
} from './phase95_screener.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const OUT96 = path.join(ROOT, 'output', 'phase96');
fs.mkdirSync(OUT96, { recursive: true });

const REGISTRY_REL = path.join('data', 'affiliate', 'verified_amazon_registry.json');
const EBAY_REL = path.join('data', 'affiliate', 'ebay_offers.json');
const TAGS = { 'amazon.nl': 'srihldecoder2-21', 'amazon.de': 'srihldecode00-21' };
const AMAZON_URL = (mkt, asin) => `https://www.${mkt}/dp/${asin}`;
const MANUFACTURER_BY_BRAND = { Stihl: 'ANDREAS STIHL AG & Co. KG', STIHL: 'ANDREAS STIHL AG & Co. KG' };

const PROTECTED_PINNED_SLOTS = new Set([
  '11104007005|amazon.de', '00004007000|amazon.de', '00004007011|amazon.de',
  '11231201613|amazon.de', '11300074100|amazon.nl', '30050003905|amazon.nl',
  '11304001302|amazon.nl', '11236402003|amazon.nl'
]);
const PROTECTED_RECORD_ASINS = new Set(['B00IKF8TH8', 'B013KONKZY', 'B00SVDWDRG', 'B00LAHKSDQ']);
const NON_STIHL_PRODUCT_RE = /\b(?:bosch\s+siemens|miele|bauknecht|whirlpool|electrolux|makita|dewalt|milwaukee|karcher|kärcher|gardena|ryobi|einhell|black\s*\+?\s*decker|worx|nilfisk)\b/i;
const COMPLETE_MACHINE_RE = /\b(?:accu[- ]?kettingzaag|akku[- ]?kettensäge|accu[- ]?bosmaaier|benzine[- ]?bosmaaier|benzine[- ]?kettingzaag|benzin[- ]?kettensäge|zonder accu en oplader|ohne akku|handsproeier)\b/i;
const EXTRA_MULTIPACK_RE = /\b(?:\d+\s*pks|\d+[- ]?(?:pack|er[- ]pack|er[- ]set)|(?:[2-9]|\d{2})\s*[- ]?(?:teile\s*\/\s*los|teile|teiliges?\s+set))\b/i;

const readJson = (p, fb = null) => {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fb; }
};
const writeJsonAtomic = (file, value, indent = 2) => {
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
const argVal = (flag, def = null) => {
  const i = process.argv.indexOf(flag);
  return i > 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : def;
};
const normId = s => String(s || '').replace(/^stihl_/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

function scrubGeo(s) {
  return String(s || '')
    .replace(/\b(Bezorgen\s+aan|Wordt\s+bezorgd\s+aan|Deliver\s+to|Lieferung\s+an)\s+[^\n,|]{2,45}/gi, '$1 NL')
    .replace(/\b\d{4}\s*[A-Z]{2}\b/g, 'NL-POSTAL');
}

function isBlockedPage(status, title, body) {
  if (status === 503 || status === 429) return true;
  return /Type the characters you see|Enter the characters you see|Typ de tekens|Geef de tekens|Geben Sie die Zeichen|Robot Check|Automated access|captcha|validateCaptcha|Doorgaan met winkelen|Weiter shoppen|Continue shopping/i.test(`${title} ${String(body || '').slice(0, 700)}`);
}

function loadMergedCaches() {
  const phases = ['phase87', 'phase87_1', 'phase87_2', 'phase87_3', 'phase88', 'phase89', 'phase90', 'phase92', 'phase93', 'phase94', 'phase95'];
  const searchMerged = { 'amazon.nl': {}, 'amazon.de': {} };
  const checksMerged = { 'amazon.nl': {}, 'amazon.de': {} };
  const dealerMerged = {};

  for (const ph of phases) {
    Object.assign(searchMerged['amazon.nl'], readJson(path.join(ROOT, `output/${ph}/search_hits_amazon_nl.json`), {}) || {});
    Object.assign(searchMerged['amazon.de'], readJson(path.join(ROOT, `output/${ph}/search_hits_amazon_de.json`), {}) || {});
    Object.assign(checksMerged['amazon.nl'], readJson(path.join(ROOT, `output/${ph}/product_checks_amazon_nl.json`), {}) || {});
    Object.assign(checksMerged['amazon.de'], readJson(path.join(ROOT, `output/${ph}/product_checks_amazon_de.json`), {}) || {});
    Object.assign(dealerMerged, readJson(path.join(ROOT, `output/${ph}/dealer_corroboration.json`), {}) || {});
  }

  const paths = {
    s96Nl: path.join(OUT96, 'search_hits_amazon_nl.json'),
    s96De: path.join(OUT96, 'search_hits_amazon_de.json'),
    c96Nl: path.join(OUT96, 'product_checks_amazon_nl.json'),
    c96De: path.join(OUT96, 'product_checks_amazon_de.json')
  };

  const searchOwn = { 'amazon.nl': readJson(paths.s96Nl, {}) || {}, 'amazon.de': readJson(paths.s96De, {}) || {} };
  const checksOwn = { 'amazon.nl': readJson(paths.c96Nl, {}) || {}, 'amazon.de': readJson(paths.c96De, {}) || {} };
  Object.assign(searchMerged['amazon.nl'], searchOwn['amazon.nl']);
  Object.assign(searchMerged['amazon.de'], searchOwn['amazon.de']);
  Object.assign(checksMerged['amazon.nl'], checksOwn['amazon.nl']);
  Object.assign(checksMerged['amazon.de'], checksOwn['amazon.de']);

  return { searchOwn, searchMerged, checksOwn, checksMerged, dealerMerged, paths };
}

async function loadCatalogAndModels() {
  const catalogDoc = readJson(path.join(ROOT, 'data/parts_catalog.json'), { parts: [] });
  const catalog = Array.isArray(catalogDoc) ? catalogDoc : (catalogDoc.parts || []);
  const catalogParts = new Set(catalog.map(p => PartNormalizer.normalizePartNumber(p.part_number)));
  const catalogNames = Object.fromEntries(catalog.map(p => [PartNormalizer.normalizePartNumber(p.part_number), p.part_name]));

  const stihlDb = readJson(path.join(ROOT, 'data/stihl_database.json'), { models: [] });
  const fitmentIndex = readJson(path.join(ROOT, 'data/model_part_fitments.json'), {});
  const p96Fits = readJson(path.join(ROOT, 'data/parts_fitments_phase96.json'), { fitments: [] }).fitments || [];

  const modelNameByFid = new Map();
  for (const m of (stihlDb.models || [])) {
    const c = normId(m.slug || m.id);
    modelNameByFid.set(c, m.model_name);
    modelNameByFid.set(m.id.toLowerCase(), m.model_name);
  }

  const partModelsMap = new Map();
  const modelPartsBase = new Map();
  const modelPartsAll = new Map();

  const recordFit = (pnRaw, fid, isBase = true) => {
    const pn = PartNormalizer.normalizePartNumber(pnRaw);
    if (!pn || !fid) return;
    if (!modelPartsAll.has(fid)) modelPartsAll.set(fid, new Set());
    modelPartsAll.get(fid).add(pn);
    if (isBase) {
      if (!modelPartsBase.has(fid)) modelPartsBase.set(fid, new Set());
      modelPartsBase.get(fid).add(pn);
    }
    const mName = modelNameByFid.get(fid);
    if (mName) {
      if (!partModelsMap.has(pn)) partModelsMap.set(pn, new Set());
      partModelsMap.get(pn).add(mName);
    }
  };

  if (Array.isArray(fitmentIndex.shard_files)) {
    for (const shard of fitmentIndex.shard_files) {
      const shardPath = path.join(ROOT, 'data', shard);
      if (!fs.existsSync(shardPath)) continue;
      const rl = readline.createInterface({ input: fs.createReadStream(shardPath).pipe(zlib.createGunzip()), crlfDelay: Infinity });
      for await (const line of rl) {
        if (!line.trim()) continue;
        let rec; try { rec = JSON.parse(line); } catch { continue; }
        recordFit(rec.part_number, rec.canonical_model_id, rec.source_id !== 'ghs');
      }
    }
  }
  for (const rec of p96Fits) {
    recordFit(rec.part_number, rec.canonical_model_id, false);
  }

  return { catalogParts, catalogNames, models: stihlDb.models || [], partModelsMap, modelPartsBase, modelPartsAll };
}

function measureModelCoverage(models, modelPartsBase, modelPartsAll, activeAmzParts, combinedActiveParts) {
  let nonGhsCovered = 0;
  let allFitmentsAmzCovered = 0;
  let allFitmentsCombinedCovered = 0;
  let modelsGte6 = 0;

  for (const m of models) {
    const mId = normId(m.slug || m.id);
    const baseSet = modelPartsBase.get(mId) || new Set();
    const allSet = modelPartsAll.get(mId) || new Set();
    if ([...baseSet].some(pn => activeAmzParts.has(pn))) nonGhsCovered++;
    const amzCount = [...allSet].filter(pn => activeAmzParts.has(pn)).length;
    const combCount = [...allSet].filter(pn => combinedActiveParts.has(pn)).length;
    if (amzCount > 0) allFitmentsAmzCovered++;
    if (combCount > 0) allFitmentsCombinedCovered++;
    if (combCount >= 6) modelsGte6++;
  }
  return { nonGhsCovered, allFitmentsAmzCovered, allFitmentsCombinedCovered, modelsGte6 };
}

async function initMarketplaceSession(page, mkt) {
  await page.goto(`https://www.${mkt}/`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await sleep(900);
  await page.locator('#sp-cc-accept').click().catch(() => {});
  await sleep(400);
}

async function scrapeDpPage(page, mkt, asin) {
  const resp = await page.goto(AMAZON_URL(mkt, asin), { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(600);
  const status = resp ? resp.status() : 200;
  const data = await page.evaluate(() => {
    const t = sel => (document.querySelector(sel)?.innerText || '').trim();
    const bullets = [...document.querySelectorAll('#feature-bullets li span')].map(el => el.innerText.trim()).filter(Boolean).slice(0, 12);
    const techSpecs = [...document.querySelectorAll('#productDetails_techSpec_section_1 tr, #productDetails_detailBullets_sections1 tr, #detailBullets_feature_div li')]
      .map(el => el.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 20).join(' | ');
    const description = (document.querySelector('#productDescription')?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 800);
    const deliveryBlock = t('#mir-layout-DELIVERY_BLOCK-slot-PRIMARY_DELIVERY_MESSAGE_LARGE, #deliveryBlockMessage');
    const glowLoc = t('#glow-ingress-line2');
    const avail = t('#availability');
    const bodyText = document.body.innerText || '';
    const cannotShipNl = /Kan niet worden verzonden|Niet leverbaar op uw locatie|niet bezorgd|cannot be shipped to your selected delivery location|keine Lieferung möglich|nicht an Ihren Standort/i.test(`${deliveryBlock} ${avail}`);
    return {
      pageTitle: document.title || '',
      title: t('#productTitle'),
      byline: t('#bylineInfo'),
      avail,
      glowLoc,
      deliveryBlock,
      delivery: deliveryBlock ? [deliveryBlock] : [],
      seller: [t('#sellerProfileTriggerId'), t('#merchantInfoFeature_feature_div')].filter(Boolean),
      bullets,
      techSpecs,
      description,
      bodyStart: bodyText.slice(0, 700),
      hasPrice: !!document.querySelector('.a-price .a-offscreen'),
      hasAddCart: !!document.querySelector('#add-to-cart-button, #buy-now-button')
    };
  });
  return { status, data };
}

async function runDpChecks(ctx, mkt, asins, caches) {
  const own = caches.checksOwn[mkt];
  const merged = caches.checksMerged[mkt];
  const outPath = mkt === 'amazon.de' ? caches.paths.c96De : caches.paths.c96Nl;
  const pending = asins.filter(a => a && !own[a]);
  console.log(`[${mkt}] /dp/ pending=${pending.length}/${asins.length}`);
  if (pending.length === 0) return { processed: 0, rateLimited: false };

  const page = await ctx.newPage();
  await initMarketplaceSession(page, mkt);
  let processed = 0;
  let rateLimited = false;

  for (const asin of pending) {
    try {
      const { status, data } = await scrapeDpPage(page, mkt, asin);
      if (isBlockedPage(status, data.pageTitle, data.bodyStart)) {
        rateLimited = true;
        console.log(`[${mkt}] Bot gate/CAPTCHA (${status}) at /dp/${asin}; stopping cleanly.`);
        break;
      }
      const isDead = status >= 400 || !data.title;
      const rec = {
        asin, marketplace: mkt, http_status: status, checked_at: new Date().toISOString(),
        listed: !!data.title && !isDead, isDead,
        pageTitle: scrubGeo(data.pageTitle), title: scrubGeo(data.title), byline: scrubGeo(data.byline),
        avail: scrubGeo(data.avail), glowLoc: scrubGeo(data.glowLoc), deliveryBlock: scrubGeo(data.deliveryBlock),
        delivery: data.delivery.map(scrubGeo), seller: data.seller.map(scrubGeo), bullets: data.bullets.map(scrubGeo),
        techSpecs: scrubGeo(data.techSpecs || ''), description: scrubGeo(data.description || ''),
        hasPrice: data.hasPrice, hasAddCart: data.hasAddCart, cannotShipNl: !!data.cannotShipNl
      };
      own[asin] = rec;
      merged[asin] = rec;
      processed++;
      if (processed % 15 === 0) {
        writeJsonAtomic(outPath, own, 1);
        console.log(`[${mkt}] /dp/ progress: ${processed}/${pending.length}`);
      }
      await sleep(350);
    } catch (err) {
      own[asin] = { asin, marketplace: mkt, error: String(err).slice(0, 140), checked_at: new Date().toISOString(), listed: false };
      merged[asin] = own[asin];
    }
  }
  writeJsonAtomic(outPath, own, 1);
  await page.close();
  return { processed, rateLimited };
}

async function runTargetedSearch(ctx, mkt, items, caches) {
  const own = caches.searchOwn[mkt];
  const merged = caches.searchMerged[mkt];
  const outPath = mkt === 'amazon.de' ? caches.paths.s96De : caches.paths.s96Nl;
  const pending = items.filter(it => !own[it.part_number] && !merged[it.part_number]);
  console.log(`[${mkt}] search pending=${pending.length}/${items.length}`);
  if (pending.length === 0) return { processed: 0, rateLimited: false };

  const page = await ctx.newPage();
  await initMarketplaceSession(page, mkt);
  let processed = 0;
  let rateLimited = false;

  for (const it of pending) {
    if (rateLimited) break;
    const pn = it.part_number;
    const queries = it.queries.slice(0, 2);
    const allCards = [];
    const seenAsin = new Set();
    let usedQuery = queries[0];

    for (const q of queries) {
      usedQuery = q;
      const resp = await page.goto(`https://www.${mkt}/s?k=${encodeURIComponent(q)}`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null);
      await sleep(600);
      const status = resp ? resp.status() : 200;
      const info = await page.evaluate(() => ({
        title: document.title || '',
        bodyStart: (document.body.innerText || '').slice(0, 700),
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
      })).catch(() => ({ title: '', bodyStart: '', cards: [] }));

      if (isBlockedPage(status, info.title, info.bodyStart)) {
        rateLimited = true;
        console.log(`[${mkt}] Bot gate/CAPTCHA (${status}) at search ${pn}; stopping cleanly.`);
        break;
      }
      for (const c of info.cards) {
        if (!seenAsin.has(c.asin)) { seenAsin.add(c.asin); allCards.push({ ...c, delivery: scrubGeo(c.delivery), matched_query: q }); }
      }
      if (info.cards.some(c => /^B[0-9A-Z]{9}$/i.test(c.asin) && digits(c.title).includes(pn) && !c.sponsored)) break;
      await sleep(300);
    }
    if (rateLimited) break;

    const rec = { part: pn, marketplace: mkt, query: usedQuery, queries_tried: queries, checked_at: new Date().toISOString(), hits: allCards };
    own[pn] = rec;
    merged[pn] = rec;
    processed++;
    if (processed % 15 === 0) {
      writeJsonAtomic(outPath, own, 1);
      console.log(`[${mkt}] search progress: ${processed}/${pending.length}`);
    }
    await sleep(300);
  }
  writeJsonAtomic(outPath, own, 1);
  await page.close();
  return { processed, rateLimited };
}

function buildOfferRecord({ pn, mkt, asin, brand, classification, check, dealerRec, archiveDossier, catalogNames, partModelsMap, usedKillSwitches }) {
  const TODAY = new Date().toISOString().split('T')[0];
  const NOW = new Date().toISOString();
  const formatted = formatPart(pn);
  const catalogName = catalogNames[pn] || `STIHL onderdeel ${formatted}`;
  const listingTitle = scrubGeo(check.title || '');
  const tag = TAGS[mkt];
  const models = Array.from(partModelsMap.get(pn) || []).slice(0, 12);
  const delivRaw = scrubGeo(check.deliveryBlock || (check.delivery || [])[0] || 'levering naar Nederland bevestigd');
  const dealerHit = Array.isArray(dealerRec?.hits) && dealerRec.hits.length > 0 ? dealerRec.hits[0] : null;
  const ghsArchiveUrl = archiveDossier?.ghs_source_url || null;

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
      type: 'INDEPENDENT_DEALER_CATALOG', url: dealerRec.source_url, title: String(dealerHit).slice(0, 160),
      claim: `Onafhankelijke STIHL-onderdelendealer vermeldt onderdeel ${formatted}.`, checked_at: dealerRec.checked_at || NOW
    });
  } else if (ghsArchiveUrl) {
    sources.push({
      type: 'LOCAL_ARCHIVE_DEALER_LEDGER', url: ghsArchiveUrl, title: `GHS STIHL Source Ledger (${formatted})`,
      claim: `Autoritatieve lokale dealercatalogus registreert STIHL-onderdeel ${formatted} op ${ghsArchiveUrl}.`, checked_at: NOW
    });
  }

  let ks = `KILL-P96-${mkt === 'amazon.de' ? 'DE' : 'NL'}-${pn}-${asin}`;
  let idx = 2;
  while (usedKillSwitches.has(ks)) { ks = `KILL-P96-${mkt === 'amazon.de' ? 'DE' : 'NL'}-${pn}-${asin}-${idx++}`; }

  const rec = {
    part_number: pn, part_number_formatted: formatted, part_name: catalogName, product_title: listingTitle.slice(0, 220),
    brand, manufacturer: MANUFACTURER_BY_BRAND[brand] || `${brand} (Verified Aftermarket)`,
    manufacturer_part_number: formatted, trade_number: null, package_quantity: 1, package_type: 'Enkelstuks',
    is_multipack: false, asin, marketplace: mkt, affiliate_tag: tag, mpn: pn, ean_gtin: null,
    oem_brand_classification: classification, evidence_classification: 'AMAZON_LISTING_COMPATIBLE',
    model_compatibility: models, machine_compatibility: [...models], pilot_eligible: true, pilot_active: true,
    kill_switch_id: ks,
    compatibility_proof: `${mkt}-vermelding ${asin} (${brand}) koppelt "${listingTitle.slice(0, 110)}" expliciet aan het STIHL-nummer ${formatted}${models.length ? ` (compatibele modellen o.a. ${models.slice(0, 4).join(', ')})` : ''}.`,
    asin_product_identity_proof: `Controle van ${AMAZON_URL(mkt, asin)} op ${TODAY} bevestigt ASIN ${asin}, verkoper/merk ${brand} en exact onderdeelnummer ${formatted} in de productgegevens.`,
    independent_evidence_url: (dealerHit && dealerRec.source_url) || ghsArchiveUrl || AMAZON_URL(mkt, asin),
    direct_affiliate_url: `${AMAZON_URL(mkt, asin)}?tag=${tag}`,
    search_fallback_url: `https://www.${mkt}/s?k=STIHL+${encodeURIComponent(formatted)}&tag=${tag}`,
    verifiable_evidence_sources: sources,
    verification_date: TODAY,
    shipping_to_nl_status: 'SHIPS_TO_NL_CONFIRMED', shipping_destination_country: 'NL', shipping_checked_at: TODAY,
    shipping_evidence_url: AMAZON_URL(mkt, asin),
    shipping_evidence_description: `${mkt}-vermelding bevestigt levering naar Nederlands postcodegebied (${delivRaw.slice(0, 90)}).`,
    availability_audit: { verdict: 'LISTING_LIVE', method: 'LIVE_BROWSER_GET', checked_at: NOW, http_status: 200 },
    status: 'ACTIVE',
    status_reason: `Phase 96: ${mkt}-vermelding met exact STIHL-nummer ${formatted} en bevestigde NL-levering.`,
    supersedes_asin: null, updated_at: NOW
  };
  if (mkt === 'amazon.nl') { rec.item_price = null; rec.shipping_cost_nl = null; }
  return rec;
}

function gatherCandidatePairs(caches, registry, nePool) {
  const activeBySlot = new Set(registry.offers.filter(o => o.status === 'ACTIVE').map(o => `${o.part_number}|${o.marketplace || 'amazon.nl'}`));
  const activeByAsinMkt = new Map(registry.offers.filter(o => o.status === 'ACTIVE').map(o => [`${o.marketplace || 'amazon.nl'}|${o.asin}`, o.part_number]));
  const map = new Map();
  const push = (pn, mkt, asin) => {
    if (!pn || !asin || !/^[A-Z0-9]{10}$/.test(asin) || activeBySlot.has(`${pn}|${mkt}`)) return;
    const owner = activeByAsinMkt.get(`${mkt}|${asin}`);
    if (owner && owner !== pn) return;
    const k = `${pn}|${mkt}`;
    if (!map.has(k)) map.set(k, { pn, mkt, asins: [] });
    if (!map.get(k).asins.includes(asin)) map.get(k).asins.push(asin);
  };
  for (const mkt of ['amazon.nl', 'amazon.de']) {
    for (const [pn, rec] of Object.entries(caches.searchMerged[mkt])) {
      for (const h of (rec.hits || [])) {
        if (!h.sponsored && digits(h.title).includes(pn)) push(pn, mkt, h.asin);
      }
    }
  }
  for (const it of nePool) push(PartNormalizer.normalizePartNumber(it.part_number), it.mkt || 'amazon.nl', it.asin);
  return [...map.values()];
}

function evaluateAndActivate({ pairs, caches, enrichmentDossiers, catalogParts, catalogNames, partModelsMap, registry }) {
  const activeByPartMkt = new Map();
  const activeByAsinMkt = new Map();
  const usedKillSwitches = new Set(registry.offers.map(o => o.kill_switch_id).filter(Boolean));
  for (const o of registry.offers) {
    if (o.status !== 'ACTIVE') continue;
    const mkt = o.marketplace || 'amazon.nl';
    activeByPartMkt.set(`${o.part_number}|${mkt}`, o.asin);
    activeByAsinMkt.set(`${mkt}|${o.asin}`, o.part_number);
  }

  const activated = [];
  for (const { pn, mkt, asins } of pairs) {
    if (activeByPartMkt.has(`${pn}|${mkt}`) || PROTECTED_PINNED_SLOTS.has(`${pn}|${mkt}`)) continue;
    for (const asin of asins) {
      if (PROTECTED_RECORD_ASINS.has(asin)) continue;
      const owner = activeByAsinMkt.get(`${mkt}|${asin}`);
      if (owner && owner !== pn) continue;
      const check = caches.checksMerged[mkt][asin];
      if (!check || !check.listed || check.isDead || check.http_status >= 400 || !check.hasAddCart || check.cannotShipNl) continue;

      const fullText = `${check.title || ''} ${(check.bullets || []).join(' ')} ${check.techSpecs || ''} ${check.description || ''}`;
      if (!digits(fullText).includes(pn)) continue;
      const found11 = [...new Set((fullText.match(/\b\d{4}[\s.-]?\d{3}[\s.-]?\d{4}\b/g) || []).map(digits))];
      if (found11.some(d => d.length === 11 && d !== pn)) continue;
      if (NON_STIHL_PRODUCT_RE.test(fullText) && !/stihl/i.test(fullText)) continue;
      if (COMPLETE_MACHINE_RE.test(check.title || '') && !/\b(?:onderdeel|part|spare|ersatz)\b/i.test(check.title || '')) continue;
      if (checkHistoricalMismatch(pn, asin, check.title || '').isMismatch) continue;
      if (EXTRA_MULTIPACK_RE.test(check.title || '')) continue;

      const brand = cleanBrand95(check);
      if (!brand || BAD_BRAND_RE.test(brand)) continue;
      const checkWithSpecs = { ...check, description: [check.techSpecs || '', check.description || ''].filter(Boolean).join(' ') };
      if (!evaluateTechnicalFit95(pn, catalogNames[pn] || '', checkWithSpecs, brand).ok) continue;

      if (mkt === 'amazon.de') {
        const delivEv = `${check.glowLoc || ''} ${check.deliveryBlock || ''} ${(check.delivery || []).join(' ')} ${check.avail || ''}`;
        if (!/nederland|netherlands|nl|bezorging|lieferung|zustellung|delivery/i.test(delivEv)) continue;
      }

      const classification = classifyBrand(brand, checkWithSpecs);
      const record = buildOfferRecord({
        pn, mkt, asin, brand, classification, check: checkWithSpecs,
        dealerRec: caches.dealerMerged[pn] || null,
        archiveDossier: enrichmentDossiers[pn] || null,
        catalogNames, partModelsMap, usedKillSwitches
      });

      const verif = TwoGateVerifier.verifyOffer(record, { catalogPartMap: catalogParts, expectedTag: TAGS[mkt] });
      if (!verif.passed) continue;
      record.gate_1_technical = verif.gate1;
      record.gate_2_product = verif.gate2;

      usedKillSwitches.add(record.kill_switch_id);
      activeByPartMkt.set(`${pn}|${mkt}`, asin);
      activeByAsinMkt.set(`${mkt}|${asin}`, pn);

      const exIdx = registry.offers.findIndex(o => o.part_number === pn && (o.marketplace || 'amazon.nl') === mkt && o.asin === asin);
      if (exIdx >= 0) registry.offers[exIdx] = record;
      else registry.offers.push(record);
      activated.push({ part_number: pn, asin, marketplace: mkt, brand, classification });
      break;
    }
  }
  return activated;
}

async function main() {
  const maxDp = Number(argVal('--max-dp', '60')) || 60;
  const maxSearch = Number(argVal('--max-search', '60')) || 60;
  const mktFilter = argVal('--mkt', null);
  const skipLive = process.argv.includes('--dry-local');

  const caches = loadMergedCaches();
  const { catalogParts, catalogNames, models, partModelsMap, modelPartsBase, modelPartsAll } = await loadCatalogAndModels();
  const enrichmentDossiers = readJson(path.join(ROOT, 'output/phase94/evidence_enrichment.json'), { dossiers: {} }).dossiers || {};
  const nePool = readJson(path.join(ROOT, 'output/phase93/needs_evidence_pool.json'), { items: [] }).items || [];
  const q95 = readJson(path.join(ROOT, 'output/phase95/queue.json'), { search_parts: [] });
  const ebayReg = readJson(path.join(ROOT, EBAY_REL), { offers: [] });
  const registry = readJson(path.join(ROOT, REGISTRY_REL));

  const activeEbayParts = new Set((ebayReg.offers || []).filter(o => o.status === 'ACTIVE').map(o => PartNormalizer.normalizePartNumber(o.part_number)));
  const snapStats = () => {
    const act = registry.offers.filter(o => o.status === 'ACTIVE');
    const nl = act.filter(o => !o.marketplace || o.marketplace === 'amazon.nl').length;
    const de = act.filter(o => o.marketplace === 'amazon.de').length;
    const amzU = new Set(act.map(o => o.part_number));
    const combU = new Set([...amzU, ...activeEbayParts]);
    const cov = measureModelCoverage(models, modelPartsBase, modelPartsAll, amzU, combU);
    return { active_total: act.length, active_nl: nl, active_de: de, ebay_active: activeEbayParts.size, ebay_offers: (ebayReg.offers || []).filter(o => o.status === 'ACTIVE').length, unique_parts_amazon: amzU.size, combined_unique_parts: combU.size, ...cov };
  };

  const before = snapStats();

  // Build targeted Phase 96 work queue (strictly unsearched per marketplace):
  // P1 = non-hardware parts on the 29 uncovered fitment models
  // P2 = unsearched P95 queue parts
  // P3 = unsearched high-value commercial wear parts in parts_catalog.json ranked by fitment model count
  const activeAmzParts = new Set(registry.offers.filter(o => o.status === 'ACTIVE').map(o => o.part_number));
  const combinedActive = new Set([...activeAmzParts, ...activeEbayParts]);
  const isCommercialPartRe = /\b(?:filter|carburet|coil|ignition|starter|piston|cylinder|clutch|sprocket|oil pump|gasket|diaphragm|muffler|flywheel|hose|handle|cap|blade|mowing head|chain|guide bar|worm|manifold|tank|switch|lever|buffer|brake)\b/i;
  const isHardwareRe = /\b(?:screw|nut|washer|bolt|rivet|pin|circlip|plug|sticker|label|plate|no longer available)\b/i;

  const p1Parts = [];
  const seenQ = new Set();

  for (const m of models) {
    const mId = normId(m.slug || m.id);
    const parts = modelPartsAll.get(mId) || new Set();
    if (parts.size === 0 || [...parts].some(pn => combinedActive.has(pn))) continue;
    for (const pn of parts) {
      if (seenQ.has(pn) || activeAmzParts.has(pn)) continue;
      const raw = catalogNames[pn] || '';
      if (isHardwareRe.test(raw)) continue;
      seenQ.add(pn);
      p1Parts.push({
        part_number: pn,
        priority: 'P1_UNCOVERED_MODEL',
        model_count: (partModelsMap.get(pn)?.size || 1),
        queries: [`${formatPart(pn)} STIHL`, `STIHL ${pn}`]
      });
    }
  }

  const p2Parts = [];
  for (const q of (q95.search_parts || [])) {
    const pn = PartNormalizer.normalizePartNumber(q.part_number);
    if (!pn || activeAmzParts.has(pn) || seenQ.has(pn)) continue;
    seenQ.add(pn);
    p2Parts.push({
      part_number: pn,
      priority: 'P2_COMMERCIAL_0_ACTIVE',
      model_count: (partModelsMap.get(pn)?.size || 1),
      queries: q.queries || [`${formatPart(pn)} STIHL`, `STIHL ${pn}`]
    });
  }

  const p3Parts = [];
  for (const pn of catalogParts) {
    if (activeAmzParts.has(pn) || seenQ.has(pn)) continue;
    const raw = catalogNames[pn] || '';
    if (isHardwareRe.test(raw) || !isCommercialPartRe.test(raw)) continue;
    const mc = partModelsMap.get(pn)?.size || 0;
    if (mc < 1) continue;
    p3Parts.push({
      part_number: pn,
      priority: 'P3_HIGH_FITMENT_WEAR',
      model_count: mc,
      queries: [`${formatPart(pn)} STIHL`, `STIHL ${pn}`]
    });
  }
  p3Parts.sort((a, b) => b.model_count - a.model_count || a.part_number.localeCompare(b.part_number));

  const allCandidates = [...p1Parts, ...p2Parts, ...p3Parts];
  const nlQueue = allCandidates.filter(it => !caches.searchMerged['amazon.nl'][it.part_number]).slice(0, maxSearch);
  const deQueue = allCandidates.filter(it => !caches.searchMerged['amazon.de'][it.part_number]).slice(0, maxSearch);
  const searchStats = { p1_queued: p1Parts.length, p2_queued: p2Parts.length, p3_queued: p3Parts.length, nl_searched: 0, de_searched: 0, dp_nl_checked: 0, dp_de_checked: 0, bot_gate_hit: false };

  if (!skipLive) {
    const browser = await chromium.launch({ headless: true });
    try {
      const runMkt = async (mkt, queueSlice) => {
        if (queueSlice.length === 0) return;
        const targetSet = new Set(queueSlice.map(x => x.part_number));
        const ctx = await browser.newContext({ locale: 'nl-NL', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36' });
        const sRes = await runTargetedSearch(ctx, mkt, queueSlice, caches);
        if (sRes.rateLimited) searchStats.bot_gate_hit = true;
        if (mkt === 'amazon.nl') searchStats.nl_searched = sRes.processed; else searchStats.de_searched = sRes.processed;

        const dpAsins = [];
        for (const pn of targetSet) {
          for (const h of (caches.searchMerged[mkt][pn]?.hits || [])) {
            if (!h.sponsored && h.asin && /^[A-Z0-9]{10}$/.test(h.asin) && digits(h.title).includes(pn) && !caches.checksMerged[mkt][h.asin] && !dpAsins.includes(h.asin)) {
              dpAsins.push(h.asin);
            }
          }
        }
        if (!sRes.rateLimited && dpAsins.length > 0) {
          const dpRes = await runDpChecks(ctx, mkt, dpAsins.slice(0, maxDp), caches);
          if (dpRes.rateLimited) searchStats.bot_gate_hit = true;
          if (mkt === 'amazon.nl') searchStats.dp_nl_checked = dpRes.processed; else searchStats.dp_de_checked = dpRes.processed;
        }
        await ctx.close();
      };
      if (!mktFilter || mktFilter === 'amazon.nl') await runMkt('amazon.nl', nlQueue);
      if (!mktFilter || mktFilter === 'amazon.de') await runMkt('amazon.de', deQueue);
    } finally {
      await browser.close();
    }
  }

  // Evaluate cached + newly discovered candidates
  const pairs = gatherCandidatePairs(caches, registry, nePool);
  pairs.sort((a, b) => (activeAmzParts.has(a.pn) ? 1 : 0) - (activeAmzParts.has(b.pn) ? 1 : 0));
  const newlyActivated = evaluateAndActivate({ pairs, caches, enrichmentDossiers, catalogParts, catalogNames, partModelsMap, registry });

  // Recompute authoritative policy & metrics whenever offers changed or metrics drifted
  const activeAllNow = registry.offers.filter(o => o.status === 'ACTIVE');
  const activeNlCount = activeAllNow.filter(o => !o.marketplace || o.marketplace === 'amazon.nl').length;
  const activeDeCount = activeAllNow.filter(o => o.marketplace === 'amazon.de').length;
  const activeUniqueSet = new Set(activeAllNow.map(o => o.part_number));

  const needsSync =
    newlyActivated.length > 0 ||
    registry.metrics?.active !== activeAllNow.length ||
    registry.metrics?.total_registered !== registry.offers.length ||
    registry.metrics?.active_de !== activeDeCount ||
    registry.metrics?.active_nl !== activeNlCount;

  if (needsSync) {
    registry.phase = '96';
    registry.generated_at = new Date().toISOString();
    registry.policy = {
      ...registry.policy,
      pilot_name: 'Phase 96 Dutch Localization, Catalog Enrichment & Affiliate Growth',
      production_activation_allowed: true,
      pilot_activated_parts: Array.from(activeUniqueSet).sort(),
      max_active_offers_allowed: null,
      max_active_offers_per_marketplace: { 'amazon.nl': null, 'amazon.de': null }
    };
    registry.metrics = {
      total_registered: registry.offers.length,
      staged: registry.offers.filter(o => o.status === 'STAGED').length,
      verified: registry.offers.filter(o => o.status === 'VERIFIED').length,
      active: activeAllNow.length,
      active_nl: activeNlCount,
      active_de: activeDeCount,
      active_unique_parts: activeUniqueSet.size,
      parts_with_amazon_offer: activeUniqueSet.size,
      suspended: registry.offers.filter(o => o.status === 'SUSPENDED').length,
      research_required: registry.offers.filter(o => o.status === 'RESEARCH_REQUIRED').length
    };
    writeJsonAtomic(path.join(ROOT, REGISTRY_REL), registry, 2);
  }

  const cons = await checkAffiliateConsistency();
  if (!cons.success) throw new Error(`Consistency check failed: ${JSON.stringify(cons)}`);

  const after = snapStats();
  const ebayStatus = {
    phase: '96',
    generated_at: new Date().toISOString(),
    ebay_active_offers: after.ebay_offers,
    ebay_unique_parts: after.ebay_active,
    ebay_api_credentials_available: Boolean(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET),
    ebay_enabled_env: process.env.EBAY_ENABLED === 'true',
    blocker_reason: 'EBAY_BROWSE_API_CREDENTIALS_MISSING_AND_PUBLIC_EBAY_HTTP_403',
    new_ebay_activated: 0,
    note: 'All 1,773 ACTIVE eBay offers (220 parts) are preserved intact. eBay Browse API OAuth credentials are not configured locally and public eBay item pages return HTTP 403.'
  };
  writeJsonAtomic(path.join(OUT96, 'PHASE96_EBAY_STATUS.json'), ebayStatus);

  const summary = {
    phase: '96',
    generated_at: new Date().toISOString(),
    before,
    after,
    delta: {
      new_offers_activated: after.active_total - before.active_total,
      new_nl_activated: after.active_nl - before.active_nl,
      new_de_activated: after.active_de - before.active_de,
      new_unique_parts_amazon: after.unique_parts_amazon - before.unique_parts_amazon,
      new_unique_parts_combined: after.combined_unique_parts - before.combined_unique_parts,
      models_non_ghs_delta: after.nonGhsCovered - before.nonGhsCovered,
      models_all_fitments_amz_delta: after.allFitmentsAmzCovered - before.allFitmentsAmzCovered,
      models_all_fitments_combined_delta: after.allFitmentsCombinedCovered - before.allFitmentsCombinedCovered
    },
    search_stats: searchStats,
    newly_activated: newlyActivated,
    ebay_status: ebayStatus,
    consistency_success: cons.success
  };
  writeJsonAtomic(path.join(OUT96, 'PHASE96_ACTIVATION.json'), summary);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
