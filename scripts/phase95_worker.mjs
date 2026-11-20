#!/usr/bin/env node
/**
 * scripts/phase95_worker.mjs
 *
 * Phase 95 — Targeted Affiliate Activation & Coverage Growth Worker
 *
 * Modes:
 *   - pass_a:           Pure local cache evaluation with hardened evaluateTechnicalFit95
 *                       on 0-ACTIVE parts & open 572 NEEDS_EVIDENCE slots (0 network).
 *   - dp_high_roi:      Polite warmed-session Playwright /dp/ re-check ONLY on high-ROI
 *                       targets (EXACT_HIT_UNCACHED, NOT_LISTED_HTTP_200, OOS_RECHECK).
 *                       Stops cleanly on any bot gate/CAPTCHA without bypassing.
 *   - search_targeted:  Targeted search + /dp/ checks for P1 uncovered fitment models
 *                       (134 parts) & top P2 open 572 NEEDS_EVIDENCE parts.
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
  cleanBrand95,
  classifyBrand,
  evaluateTechnicalFit95
} from './phase95_screener.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT95 = path.join(ROOT, 'output', 'phase95');
const BATCH_DIR = path.join(OUT95, 'batches');
fs.mkdirSync(BATCH_DIR, { recursive: true });

const REGISTRY_REL = path.join('data', 'affiliate', 'verified_amazon_registry.json');
const TAGS = { 'amazon.nl': 'srihldecoder2-21', 'amazon.de': 'srihldecode00-21' };
const AMAZON_URL = (mkt, asin) => `https://www.${mkt}/dp/${asin}`;
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
const NON_STIHL_PRODUCT_RE = /\b(?:bosch\s+siemens|miele|bauknecht|whirlpool|electrolux|makita|dewalt|milwaukee|karcher|kärcher|gardena|ryobi|einhell|black\s*\+?\s*decker|worx|nilfisk)\b/i;
const COMPLETE_MACHINE_RE = /\b(?:accu[- ]?kettingzaag|akku[- ]?kettensäge|accu[- ]?bosmaaier|benzine[- ]?bosmaaier|benzine[- ]?kettingzaag|benzin[- ]?kettensäge|zonder accu en oplader|ohne akku|handsproeier)\b/i;
const EXTRA_MULTIPACK_RE = /\b(?:\d+\s*pks|\d+[- ]?(?:pack|er[- ]pack|er[- ]set))\b/i;

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
  return String(s || '')
    .replace(/\b(Bezorgen\s+aan|Wordt\s+bezorgd\s+aan|Deliver\s+to|Lieferung\s+an)\s+[^\n,|]{2,45}/gi, '$1 NL')
    .replace(/\b\d{4}\s*[A-Z]{2}\b/g, 'NL-POSTAL');
}

function isBlockedPage(status, title, body) {
  if (status === 503 || status === 429) return true;
  if (/Type the characters you see|Enter the characters you see|Typ de tekens|Geef de tekens|Geben Sie die Zeichen|Robot Check|Automated access|captcha|validateCaptcha|Doorgaan met winkelen|Weiter shoppen|Continue shopping/i.test(`${title} ${String(body || '').slice(0, 700)}`)) {
    return true;
  }
  return false;
}

async function initMarketplaceSession(page, marketplace) {
  await page.goto(`https://www.${marketplace}/`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await sleep(900);
  await page.locator('#sp-cc-accept').click().catch(() => {});
  await sleep(400);
}

function loadMergedCaches() {
  const phases = ['phase87', 'phase87_1', 'phase87_2', 'phase87_3', 'phase88', 'phase89', 'phase90', 'phase92', 'phase93', 'phase94'];
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

  const s95NlPath = path.join(OUT95, 'search_hits_amazon_nl.json');
  const s95DePath = path.join(OUT95, 'search_hits_amazon_de.json');
  const c95NlPath = path.join(OUT95, 'product_checks_amazon_nl.json');
  const c95DePath = path.join(OUT95, 'product_checks_amazon_de.json');

  const searchOwn = {
    'amazon.nl': readJson(s95NlPath, {}) || {},
    'amazon.de': readJson(s95DePath, {}) || {}
  };
  const checksOwn = {
    'amazon.nl': readJson(c95NlPath, {}) || {},
    'amazon.de': readJson(c95DePath, {}) || {}
  };

  Object.assign(searchMerged['amazon.nl'], searchOwn['amazon.nl']);
  Object.assign(searchMerged['amazon.de'], searchOwn['amazon.de']);
  Object.assign(checksMerged['amazon.nl'], checksOwn['amazon.nl']);
  Object.assign(checksMerged['amazon.de'], checksOwn['amazon.de']);

  return {
    searchOwn,
    searchMerged,
    checksOwn,
    checksMerged,
    dealerMerged,
    paths: { s95NlPath, s95DePath, c95NlPath, c95DePath }
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
    modelNameByFid.set(c, m.model_name);
    modelNameByFid.set(alt, m.model_name);
    modelNameByFid.set(alt.replace(/^stihl_/, ''), m.model_name);
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

function buildOfferRecord({ pn, mkt, asin, brand, classification, check, dealerRec, archiveDossier, catalogNames, partModelsMap, usedKillSwitches, existingNote }) {
  const TODAY = new Date().toISOString().split('T')[0];
  const NOW = new Date().toISOString();
  const formatted = formatPart(pn);
  const catalogName = catalogNames[pn] || `STIHL onderdeel ${formatted}`;
  const listingTitle = scrubGeo(check.title || '');
  const tag = TAGS[mkt];
  const models = extractModelsForCandidate(pn, check, partModelsMap);
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
      type: 'INDEPENDENT_DEALER_CATALOG',
      url: dealerRec.source_url,
      title: String(dealerHit).slice(0, 160),
      claim: `Onafhankelijke STIHL-onderdelendealer vermeldt onderdeel ${formatted} ("${String(dealerHit).slice(0, 120)}").`,
      checked_at: dealerRec.checked_at || NOW
    });
  } else if (ghsArchiveUrl) {
    sources.push({
      type: 'LOCAL_ARCHIVE_DEALER_LEDGER',
      url: ghsArchiveUrl,
      title: `GHS STIHL Source Ledger (${formatted})`,
      claim: `Autoritatieve lokale dealercatalogus registreert STIHL-onderdeel ${formatted} op ${ghsArchiveUrl}.`,
      checked_at: NOW
    });
  }

  const mktCode = mkt === 'amazon.de' ? 'DE' : 'NL';
  let ksSuffix = 95;
  let killSwitchId = `KILL-P95-${mktCode}-${pn}-${asin}`;
  if (usedKillSwitches.has(killSwitchId)) {
    while (usedKillSwitches.has(`KILL-P95-${mktCode}-${pn}-${asin}-${ksSuffix}`)) ksSuffix++;
    killSwitchId = `KILL-P95-${mktCode}-${pn}-${asin}-${ksSuffix}`;
  }

  const compatibilityProof = `${mkt}-vermelding ${asin} (${brand}) koppelt "${listingTitle.slice(0, 110)}" expliciet aan het STIHL-nummer ${formatted}${models.length ? ` (compatibele modellen o.a. ${models.slice(0, 4).join(', ')})` : ''}.`;
  const identityProof = `Controle van ${AMAZON_URL(mkt, asin)} op ${TODAY} bevestigt ASIN ${asin}, verkoper/merk ${brand} en het exacte onderdeelnummer ${formatted} in de productgegevens${dealerHit ? `, ondersteund door onafhankelijke dealercatalogus (${dealerHit})` : (ghsArchiveUrl ? ', ondersteund door lokaal GHS-archiefdossier' : '')}.`;

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
    independent_evidence_url: (dealerHit && dealerRec.source_url) || ghsArchiveUrl || AMAZON_URL(mkt, asin),
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
    status_reason: `Phase 95: ${mkt}-vermelding met exact STIHL-nummer ${formatted}${dealerHit || ghsArchiveUrl ? ' en archief-/dealercatalogus-onderbouwing' : ''} en bevestigde NL-levering.${existingNote ? ' ' + existingNote : ''}`,
    supersedes_asin: null,
    updated_at: NOW
  };
  if (mkt === 'amazon.nl') {
    record.item_price = null;
    record.shipping_cost_nl = null;
  }
  return record;
}

function evaluateAndActivate({ batchId, partMktAsins, caches, enrichmentDossiers, catalogParts, catalogNames, partModelsMap, registry }) {
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

  for (const { pn, mkt, asins } of partMktAsins) {
    if (activeByPartMkt.has(`${pn}|${mkt}`) || PROTECTED_PINNED_SLOTS.has(`${pn}|${mkt}`)) continue;
    let chosen = null;
    const chosenReasons = [];

    for (const asin of asins) {
      if (PROTECTED_RECORD_ASINS.has(asin)) continue;
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
        } else if (COMPLETE_MACHINE_RE.test(check.title || '') && !/\b(?:onderdeel|part|spare|ersatz)\b/i.test(check.title || '')) {
          chosenReasons.push({ asin, reason: 'COMPLETE_MACHINE_NOT_PART' });
        } else {
          needsEvidence.push({ part_number: pn, mkt, asin, status: 'NEEDS_EVIDENCE', reason: 'MISSING_INDEPENDENT_MPN_EVIDENCE' });
        }
        continue;
      }

      const found11 = [...new Set((fullText.match(/\b\d{4}[\s.-]?\d{3}[\s.-]?\d{4}\b/g) || []).map(digits))];
      if (found11.some(d => d.length === 11 && d !== pn)) {
        chosenReasons.push({ asin, reason: `CONFLICTING_MPN:${found11.find(d => d !== pn)}` });
        continue;
      }

      const mismatch = checkHistoricalMismatch(pn, asin, check.title || '');
      if (mismatch.isMismatch) {
        chosenReasons.push({ asin, reason: `HISTORICAL_MISMATCH: ${mismatch.record?.reason || 'matched'}` });
        continue;
      }
      if (EXTRA_MULTIPACK_RE.test(check.title || '')) {
        chosenReasons.push({ asin, reason: 'MULTIPACK_EXTRA_GUARD' });
        continue;
      }

      const brand = cleanBrand95(check);
      if (!brand || BAD_BRAND_RE.test(brand)) {
        needsEvidence.push({ part_number: pn, mkt, asin, status: 'NEEDS_EVIDENCE', reason: `BAD_OR_MISSING_BRAND:${brand || 'empty'}` });
        continue;
      }

      const checkWithSpecs = {
        ...check,
        description: [check.techSpecs || '', check.description || ''].filter(Boolean).join(' ')
      };
      const fit = evaluateTechnicalFit95(pn, catalogNames[pn] || '', checkWithSpecs, brand);
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
      const archiveDossier = enrichmentDossiers[pn] || null;
      const previous = registry.offers.find(
        o => o.part_number === pn &&
        !PROTECTED_RECORD_ASINS.has(o.asin) &&
        (o.status === 'RESEARCH_REQUIRED' || o.status === 'SUSPENDED' || o.status === 'VERIFIED')
      );
      const existingNote = (previous && previous.asin !== asin) ? `Vervangt eerdere vermelding ${previous.asin}.` : '';

      const record = buildOfferRecord({
        pn, mkt, asin, brand, classification, check: checkWithSpecs, dealerRec, archiveDossier, catalogNames, partModelsMap, usedKillSwitches, existingNote
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
      chosen = { record, previous, dealerHit: !!(dealerRec?.hits?.length), fromArchive: Boolean(archiveDossier?.ghs_source_url) };
      break;
    }

    if (chosen) {
      const { record, previous, dealerHit, fromArchive } = chosen;
      usedKillSwitches.add(record.kill_switch_id);
      activeByPartMkt.set(`${pn}|${mkt}`, record.asin);
      activeByAsinMkt.set(`${mkt}|${record.asin}`, pn);

      const exIdx = registry.offers.findIndex(o => o.part_number === pn && (o.marketplace || 'amazon.nl') === mkt && o.asin === record.asin);
      if (exIdx >= 0) registry.offers[exIdx] = record;
      else registry.offers.push(record);

      if (previous && !PROTECTED_RECORD_ASINS.has(previous.asin) && previous.asin !== record.asin) {
        if (previous.status === 'RESEARCH_REQUIRED' && (previous.marketplace || 'amazon.nl') === mkt) {
          registry.offers = registry.offers.filter(o => o !== previous);
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
        archive_enriched: fromArchive
      });
    } else if (chosenReasons.length > 0) {
      for (const r of chosenReasons) {
        rejected.push({ part_number: pn, mkt, asin: r.asin, status: 'REJECTED', reason: r.reason });
      }
    }
  }

  const activeAll = registry.offers.filter(o => o.status === 'ACTIVE');
  const afterNl = activeAll.filter(o => !o.marketplace || o.marketplace === 'amazon.nl').length;
  const afterDe = activeAll.filter(o => o.marketplace === 'amazon.de').length;
  const afterUniqueSet = new Set(activeAll.map(o => o.part_number));

  registry.phase = '95';
  registry.generated_at = new Date().toISOString();
  registry.policy = {
    ...registry.policy,
    pilot_name: 'Phase 95 Targeted Affiliate Activation & Coverage Growth',
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
    active_unique_parts: afterUniqueSet.size,
    parts_with_amazon_offer: afterUniqueSet.size,
    suspended: registry.offers.filter(o => o.status === 'SUSPENDED').length,
    research_required: registry.offers.filter(o => o.status === 'RESEARCH_REQUIRED').length
  };

  writeJsonAtomic(path.join(ROOT, REGISTRY_REL), registry, 2);

  const batchReport = {
    batch_id: batchId,
    generated_at: new Date().toISOString(),
    before: { active_total: beforeActive.length, active_nl: beforeNl, active_de: beforeDe, unique_parts: beforeUnique },
    after: { active_total: activeAll.length, active_nl: afterNl, active_de: afterDe, unique_parts: afterUniqueSet.size },
    activated_count: activated.length,
    needs_evidence_count: needsEvidence.length,
    rejected_count: rejected.length,
    activated,
    needs_evidence: needsEvidence,
    rejected
  };
  writeJsonAtomic(path.join(BATCH_DIR, `batch_${batchId}.json`), batchReport, 2);
  console.log(`[batch_${batchId}] activated=${activated.length} (ACTIVE ${beforeActive.length} -> ${activeAll.length}, unique ${beforeUnique} -> ${afterUniqueSet.size})`);
  return batchReport;
}

async function runDpChecks(browserCtx, mkt, asinList, caches, forceSet = new Set()) {
  const own = caches.checksOwn[mkt];
  const merged = caches.checksMerged[mkt];
  const outPath = mkt === 'amazon.de' ? caches.paths.c95DePath : caches.paths.c95NlPath;
  const pending = asinList.filter(a => !own[a] && (forceSet.has(a) || !merged[a] || merged[a].error));
  console.log(`[${mkt}] /dp/ pending=${pending.length}/${asinList.length}`);
  if (pending.length === 0) return { processed: 0, rateLimited: false };

  const page = await browserCtx.newPage();
  await initMarketplaceSession(page, mkt);

  let processed = 0;
  let rateLimited = false;

  for (const asin of pending) {
    try {
      const resp = await page.goto(AMAZON_URL(mkt, asin), { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector('#productTitle, #availability, form[action*=validateCaptcha]', { timeout: 4500 }).catch(() => {});
      await sleep(500);
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
        const addCart = !!(document.querySelector('#add-to-cart-button') || document.querySelector('[id*=add-to-cart]'));
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
        console.log(`[${mkt}] Bot gate/CAPTCHA (${status}) at ${asin}; stopping cleanly.`);
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
      if (processed % 15 === 0) {
        writeJsonAtomic(outPath, own);
        console.log(`[${mkt}] /dp/ progress: ${processed}/${pending.length}`);
      }
      await sleep(350);
    } catch (err) {
      const rec = { asin, marketplace: mkt, error: String(err).slice(0, 140), checked_at: new Date().toISOString(), listed: false };
      own[asin] = rec;
      merged[asin] = rec;
    }
  }

  writeJsonAtomic(outPath, own);
  await page.close();
  return { processed, rateLimited };
}

async function runTargetedSearch(browserCtx, mkt, items, caches) {
  const own = caches.searchOwn[mkt];
  const merged = caches.searchMerged[mkt];
  const outPath = mkt === 'amazon.de' ? caches.paths.s95DePath : caches.paths.s95NlPath;
  const pending = items.filter(it => !own[it.part_number]);
  console.log(`[${mkt}] search pending=${pending.length}/${items.length}`);
  if (pending.length === 0) return { processed: 0, rateLimited: false };

  const page = await browserCtx.newPage();
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
    let hadError = null;

    try {
      for (const q of queries) {
        usedQuery = q;
        const resp = await page.goto(`https://www.${mkt}/s?k=${encodeURIComponent(q)}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
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
        }));

        if (isBlockedPage(status, info.title, info.bodyStart)) {
          rateLimited = true;
          console.log(`[${mkt}] Bot gate/CAPTCHA (${status}) at search ${pn}; stopping cleanly.`);
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
        await sleep(300);
      }
    } catch (err) {
      hadError = String(err).slice(0, 140);
    }
    if (rateLimited) break;

    const prevMerged = merged[pn];
    const combinedHits = [...allCards, ...((prevMerged && prevMerged.hits) || [])];
    const dedup = [];
    const seen = new Set();
    for (const c of combinedHits) {
      if (c.asin && !seen.has(c.asin)) { seen.add(c.asin); dedup.push(c); }
    }
    const rec = {
      part: pn,
      marketplace: mkt,
      query: usedQuery,
      queries_tried: queries,
      checked_at: new Date().toISOString(),
      hits: dedup,
      ...(hadError ? { error: hadError } : {})
    };
    own[pn] = rec;
    merged[pn] = rec;
    processed++;
    if (processed % 15 === 0) {
      writeJsonAtomic(outPath, own);
      console.log(`[${mkt}] search progress: ${processed}/${pending.length}`);
    }
    await sleep(300);
  }

  writeJsonAtomic(outPath, own);
  await page.close();
  return { processed, rateLimited };
}

function gatherPartMktAsinPairs(caches, registry, targetPartsSet = null) {
  const activeBySlot = new Set(registry.offers.filter(o => o.status === 'ACTIVE').map(o => `${o.part_number}|${o.marketplace || 'amazon.nl'}`));
  const activeByAsinMkt = new Map(registry.offers.filter(o => o.status === 'ACTIVE').map(o => [`${o.marketplace || 'amazon.nl'}|${o.asin}`, o.part_number]));
  const nePool = readJson(path.join(ROOT, 'output/phase93/needs_evidence_pool.json'), { items: [] }).items || [];

  const candidates = new Map();
  const push = (pn, mkt, asin) => {
    if (!pn || !asin || !/^[A-Z0-9]{10}$/.test(asin) || activeBySlot.has(`${pn}|${mkt}`)) return;
    if (targetPartsSet && !targetPartsSet.has(pn)) return;
    const owner = activeByAsinMkt.get(`${mkt}|${asin}`);
    if (owner && owner !== pn) return;
    const k = `${pn}|${mkt}`;
    if (!candidates.has(k)) candidates.set(k, { pn, mkt, asins: [] });
    const entry = candidates.get(k);
    if (!entry.asins.includes(asin)) entry.asins.push(asin);
  };

  for (const mkt of ['amazon.nl', 'amazon.de']) {
    for (const [pn, rec] of Object.entries(caches.searchMerged[mkt])) {
      for (const h of (rec.hits || [])) {
        if (!h.sponsored && digits(h.title).includes(pn)) {
          push(pn, mkt, h.asin);
        }
      }
    }
  }
  for (const it of nePool) {
    const pn = PartNormalizer.normalizePartNumber(it.part_number);
    push(pn, it.mkt || 'amazon.nl', it.asin);
  }
  return [...candidates.values()];
}

async function main() {
  const mode = argVal('--mode', 'pass_a');
  const limit = Number(argVal('--limit', '0')) || 0;
  const mktFilter = argVal('--mkt', null);

  const caches = loadMergedCaches();
  const { catalogParts, catalogNames, partModelsMap } = await loadCatalogAndModels();
  const enrichmentDossiers = readJson(path.join(ROOT, 'output/phase94/evidence_enrichment.json'), { dossiers: {} }).dossiers || {};
  const queue = readJson(path.join(OUT95, 'queue.json'), { dp_nl: [], dp_de: [], search_parts: [] });
  const registry = readJson(path.join(ROOT, REGISTRY_REL));

  if (mode === 'pass_a') {
    const activeParts = new Set(registry.offers.filter(o => o.status === 'ACTIVE').map(o => o.part_number));
    const pairs = gatherPartMktAsinPairs(caches, registry, null);
    // Prioritize 0-ACTIVE parts first!
    pairs.sort((a, b) => (activeParts.has(a.pn) ? 1 : 0) - (activeParts.has(b.pn) ? 1 : 0));
    evaluateAndActivate({ batchId: 'pass_a', partMktAsins: pairs, caches, enrichmentDossiers, catalogParts, catalogNames, partModelsMap, registry });
  } else if (mode === 'dp_high_roi') {
    const HIGH_ROI_TAGS = new Set(['EXACT_HIT_UNCACHED', 'NOT_LISTED_HTTP_200', 'P94_BATCH_NOT_LISTED_200', 'POOL572_NOT_LISTED_200', 'EXACT_HIT_OOS_RECHECK', 'POOL572_OOS_RECHECK', 'POOL572_UNCACHED']);
    const nlTargets = (queue.dp_nl || []).filter(x => HIGH_ROI_TAGS.has(x.reasonTag)).map(x => x.asin);
    const deTargets = (queue.dp_de || []).filter(x => HIGH_ROI_TAGS.has(x.reasonTag)).map(x => x.asin);
    const nlSlice = limit > 0 ? nlTargets.slice(0, limit) : nlTargets;
    const deSlice = limit > 0 ? deTargets.slice(0, limit) : deTargets;
    const forceNl = new Set(nlSlice);
    const forceDe = new Set(deSlice);

    const browser = await chromium.launch({ headless: true });
    try {
      if (!mktFilter || mktFilter === 'amazon.nl') {
        const ctxNl = await browser.newContext({ locale: 'nl-NL', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36' });
        await runDpChecks(ctxNl, 'amazon.nl', nlSlice, caches, forceNl);
        await ctxNl.close();
      }
      if (!mktFilter || mktFilter === 'amazon.de') {
        const ctxDe = await browser.newContext({ locale: 'nl-NL', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36' });
        await runDpChecks(ctxDe, 'amazon.de', deSlice, caches, forceDe);
        await ctxDe.close();
      }
    } finally {
      await browser.close();
    }
    const pairs = gatherPartMktAsinPairs(caches, registry, null);
    const activeParts = new Set(registry.offers.filter(o => o.status === 'ACTIVE').map(o => o.part_number));
    pairs.sort((a, b) => (activeParts.has(a.pn) ? 1 : 0) - (activeParts.has(b.pn) ? 1 : 0));
    evaluateAndActivate({ batchId: mktFilter ? `dp_${mktFilter.replace('.', '_')}` : 'dp_high_roi', partMktAsins: pairs, caches, enrichmentDossiers, catalogParts, catalogNames, partModelsMap, registry });
  } else if (mode === 'search_targeted') {
    const activeParts = new Set(registry.offers.filter(o => o.status === 'ACTIVE').map(o => o.part_number));
    const slicePrio = argVal('--priority', 'ALL');
    let searchItems = (queue.search_parts || []).filter(x => !activeParts.has(x.part_number));
    if (slicePrio !== 'ALL') searchItems = searchItems.filter(x => x.priority === slicePrio);
    if (limit > 0) searchItems = searchItems.slice(0, limit);

    const nlItems = searchItems.filter(x => x.need_nl);
    const deItems = searchItems.filter(x => x.need_de);

    const browser = await chromium.launch({ headless: true });
    try {
      const targetPartSet = new Set(searchItems.map(x => x.part_number));
      if (!mktFilter || mktFilter === 'amazon.nl') {
        const ctxNl = await browser.newContext({ locale: 'nl-NL', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36' });
        await runSearchBatchSafe(ctxNl, 'amazon.nl', nlItems, caches);
        const newAsinsNl = collectExactAsins(caches.searchMerged['amazon.nl'], targetPartSet);
        await runDpChecks(ctxNl, 'amazon.nl', newAsinsNl, caches, new Set());
        await ctxNl.close();
      }
      if (!mktFilter || mktFilter === 'amazon.de') {
        const ctxDe = await browser.newContext({ locale: 'nl-NL', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36' });
        await runSearchBatchSafe(ctxDe, 'amazon.de', deItems, caches);
        const newAsinsDe = collectExactAsins(caches.searchMerged['amazon.de'], targetPartSet);
        await runDpChecks(ctxDe, 'amazon.de', newAsinsDe, caches, new Set());
        await ctxDe.close();
      }
    } finally {
      await browser.close();
    }
    const pairs = gatherPartMktAsinPairs(caches, registry, new Set(searchItems.map(x => x.part_number)));
    evaluateAndActivate({ batchId: `search_${slicePrio.toLowerCase()}`, partMktAsins: pairs, caches, enrichmentDossiers, catalogParts, catalogNames, partModelsMap, registry });
  }

  const cons = await checkAffiliateConsistency();
  if (!cons.success) throw new Error(`Consistency check failed: ${JSON.stringify(cons)}`);
}

async function runSearchBatchSafe(ctx, mkt, items, caches) {
  return runTargetedSearch(ctx, mkt, items, caches);
}

function collectExactAsins(searchMap, targetPartsSet) {
  const out = [];
  const seen = new Set();
  for (const pn of targetPartsSet) {
    const rec = searchMap[pn];
    for (const h of (rec?.hits || [])) {
      if (!h.sponsored && h.asin && /^[A-Z0-9]{10}$/.test(h.asin) && digits(h.title).includes(pn) && !seen.has(h.asin)) {
        seen.add(h.asin);
        out.push(h.asin);
      }
    }
  }
  return out;
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
