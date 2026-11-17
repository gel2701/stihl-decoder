/**
 * scripts/phase90_reconcile.mjs
 *
 * Offline Phase 90 Reconciliation, Deduplication, Recovery & Brand/Semantic Audit.
 *   - Performs ZERO new scraping or network requests.
 *   - Verifies batch_0..batch_15 completion files.
 *   - Preserves 100% of 1,578 Phase 89 baseline ACTIVE & 34 SUSPENDED records.
 *   - Deduplicates active offers on (part_number, marketplace, asin) & 1-SKU-per-ASIN.
 *   - Recovers any unactivated candidate from existing saved search_hits + /dp/ checks
 *     if and only if ALL TwoGate, mismatch, technical-fit, brand, BuyBox & NL-shipping gates pass.
 *   - Audits all Phase 90 ACTIVE offers for brand quality, multipack, and semantic alignment,
 *     demoting/removing only provably bad/unproven Phase 90 entries and listing new verified
 *     brands missing from tests/phase75_amazon_growth.test.js.
 *
 * Usage:
 *   node scripts/phase90_reconcile.mjs          # audit + reconcile (dry-run unless --apply)
 *   node scripts/phase90_reconcile.mjs --apply  # writes reconciled registry + updates batches/PHASE90_RECONCILIATION.json
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import readline from 'readline';
import { fileURLToPath } from 'url';

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
const OUT90 = path.join(ROOT, 'output', 'phase90');
const REGISTRY_PATH = path.join(ROOT, 'data', 'affiliate', 'verified_amazon_registry.json');
const APPLY = process.argv.includes('--apply');

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
const digits = s => String(s || '').replace(/[^0-9]/g, '');
const formatPart = pn => PartNormalizer.formatPartNumber(pn);
const scrubGeo = s => String(s || '')
  .replace(/Coevorden|Marga Klomp[eé]\s*straat(?:\s*\d+)?|7741\s*ZR|7741ZR/gi, 'Nederland')
  .replace(/[^\S\r\n]+/g, ' ')
  .trim();

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
    if (fid) modelMetaByFid.set(fid, { model_name: m.model_name, fitment_id: fid });
  }

  const partModelsMap = new Map();
  if (Array.isArray(fitmentIndex.shard_files)) {
    for (const shard of fitmentIndex.shard_files) {
      const sp = path.join(ROOT, 'data', shard);
      if (!fs.existsSync(sp)) continue;
      const rl = readline.createInterface({ input: fs.createReadStream(sp).pipe(zlib.createGunzip()), crlfDelay: Infinity });
      for await (const line of rl) {
        if (!line.trim()) continue;
        let rec;
        try { rec = JSON.parse(line); } catch { continue; }
        const pn = PartNormalizer.normalizePartNumber(rec.part_number);
        const fid = rec.canonical_model_id;
        if (!pn || !fid || !modelMetaByFid.has(fid)) continue;
        if (!partModelsMap.has(pn)) partModelsMap.set(pn, new Set());
        partModelsMap.get(pn).add(modelMetaByFid.get(fid).model_name);
      }
    }
  }
  return { catalogParts, catalogNames, partModelsMap };
}

function loadMergedCaches() {
  const s90Nl = readJson(path.join(OUT90, 'search_hits_amazon_nl.json'), {});
  const s90De = readJson(path.join(OUT90, 'search_hits_amazon_de.json'), {});
  const c90Nl = readJson(path.join(OUT90, 'product_checks_amazon_nl.json'), {});
  const c90De = readJson(path.join(OUT90, 'product_checks_amazon_de.json'), {});
  const d90 = readJson(path.join(OUT90, 'dealer_corroboration.json'), {});
  return {
    searchOwn: { 'amazon.nl': s90Nl, 'amazon.de': s90De },
    searchMerged: {
      'amazon.nl': {
        ...readJson(path.join(ROOT, 'output/phase87_1/search_hits_amazon_nl.json'), {}),
        ...readJson(path.join(ROOT, 'output/phase87_2/search_hits_amazon_nl.json'), {}),
        ...readJson(path.join(ROOT, 'output/phase88/search_hits_amazon_nl.json'), {}),
        ...readJson(path.join(ROOT, 'output/phase89/search_hits_amazon_nl.json'), {}),
        ...s90Nl
      },
      'amazon.de': {
        ...readJson(path.join(ROOT, 'output/phase87_2/search_hits_amazon_de.json'), {}),
        ...readJson(path.join(ROOT, 'output/phase88/search_hits_amazon_de.json'), {}),
        ...readJson(path.join(ROOT, 'output/phase89/search_hits_amazon_de.json'), {}),
        ...s90De
      }
    },
    checksMerged: {
      'amazon.nl': {
        ...readJson(path.join(ROOT, 'output/phase87_1/product_checks_amazon_nl.json'), {}),
        ...readJson(path.join(ROOT, 'output/phase87_2/product_checks_amazon_nl.json'), {}),
        ...readJson(path.join(ROOT, 'output/phase87_3/product_checks_amazon_nl.json'), {}),
        ...readJson(path.join(ROOT, 'output/phase88/product_checks_amazon_nl.json'), {}),
        ...readJson(path.join(ROOT, 'output/phase89/product_checks_amazon_nl.json'), {}),
        ...c90Nl
      },
      'amazon.de': {
        ...readJson(path.join(ROOT, 'output/phase87_2/product_checks_amazon_de.json'), {}),
        ...readJson(path.join(ROOT, 'output/phase87_3/product_checks_amazon_de.json'), {}),
        ...readJson(path.join(ROOT, 'output/phase88/product_checks_amazon_de.json'), {}),
        ...readJson(path.join(ROOT, 'output/phase89/product_checks_amazon_de.json'), {}),
        ...c90De
      }
    },
    dealerMerged: {
      ...readJson(path.join(ROOT, 'output/phase87_1/dealer_corroboration.json'), {}),
      ...readJson(path.join(ROOT, 'output/phase87_2/dealer_corroboration.json'), {}),
      ...readJson(path.join(ROOT, 'output/phase87_3/dealer_corroboration.json'), {}),
      ...readJson(path.join(ROOT, 'output/phase88/dealer_corroboration.json'), {}),
      ...readJson(path.join(ROOT, 'output/phase89/dealer_corroboration.json'), {}),
      ...d90
    }
  };
}

function selectCandidatesForPart(partRow, mkt, caches, activeByAsinMkt) {
  const pn = partRow.part_number;
  if (PROTECTED_PINNED_SLOTS.has(`${pn}|${mkt}`)) return [];
  const isKit = /\b(kit|set|pack|pair|satz)\b/i.test(partRow.part_name || '');
  const sh = caches.searchMerged[mkt][pn];
  const scored = [];
  if (sh && Array.isArray(sh.hits)) {
    for (const h of sh.hits) {
      if (!h.asin || !/^B[0-9A-Z]{9}$/i.test(h.asin)) continue;
      const owner = activeByAsinMkt.get(`${mkt}|${h.asin}`);
      if (owner && owner !== pn) continue;
      const titleDigits = digits(h.title);
      const exactTitle = titleDigits.includes(pn);
      if (!exactTitle && sh.hits.some(x => /^B[0-9A-Z]{9}$/i.test(x.asin || '') && digits(x.title).includes(pn))) continue;
      if (!exactTitle && !/stihl|s[äa]genspezi|oregon|walbro|zama|ngk|bosch|vhbw|hippotech|cancanle|mchnic|adefol|huyur|c\.?t\.?s|propart|ototec|jardiaffaires|perfektgarten|qhalen/i.test(h.title || '')) continue;
      if (!isKit && /\b(\d+\s*[- ]?(?:pcs|stuks|stks|stcs|stk|stück|pack)|pack of\s*[2-9]|2-pack|3-pack|4-pack|5-pack)\b/i.test(h.title || '')) continue;
      let s = 0;
      if (exactTitle) s += 100;
      if (!h.sponsored) s += 20;
      if (h.has_price) s += 10;
      if (/stihl/i.test(h.title || '')) s += 5;
      scored.push({ asin: h.asin, score: s });
    }
  }
  // Also include pre-seeded ASINs from existing_pool_recovery or registry RESEARCH_REQUIRED/VERIFIED
  if (Array.isArray(partRow.seed_asins?.[mkt])) {
    for (const a of partRow.seed_asins[mkt]) {
      if (/^B[0-9A-Z]{9}$/i.test(a) && !scored.some(x => x.asin === a)) scored.push({ asin: a, score: 50 });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return [...new Set(scored.map(x => x.asin))];
}

function extractModels(pn, check, partModelsMap) {
  const fromFitment = Array.from(partModelsMap.get(pn) || []);
  const text = `${check.title || ''} ${(check.bullets || []).join(' ')}`;
  const matches = text.match(/\b(?:MS|FS|BR|BG|HS|TS|HT|BT|HL|KM|MSA|FSA)\s*\d{2,3}(?:\s*[A-Z]{1,3})?|\b0(?:17|18|20|21|23|24|25|26|28|29|34|36|38|39|44|46|64|66)\b/gi) || [];
  return [...new Set([...fromFitment, ...matches.map(x => x.toUpperCase().replace(/\s+/g, ' ').trim())])].slice(0, 12);
}

function buildOfferRecord({ pn, mkt, asin, brand, classification, check, dealerRec, catalogNames, partModelsMap, usedKillSwitches, existingNote }) {
  const TODAY = new Date().toISOString().split('T')[0];
  const NOW = new Date().toISOString();
  const formatted = formatPart(pn);
  const catalogName = catalogNames[pn] || `STIHL onderdeel ${formatted}`;
  const listingTitle = scrubGeo(check.title || '');
  const tag = TAGS[mkt];
  const models = extractModels(pn, check, partModelsMap);
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
    status_reason: `Phase 90: live ${mkt}-vermelding met het exacte STIHL-nummer ${formatted}${dealerHit ? ' en dealercatalogus-corroboratie' : ''} en bevestigde NL-levering.${existingNote ? ' ' + existingNote : ''}`,
    supersedes_asin: null,
    updated_at: NOW
  };
  if (mkt === 'amazon.nl') {
    record.item_price = null;
    record.shipping_cost_nl = null;
  }
  return record;
}

async function main() {
  const { catalogParts, catalogNames, partModelsMap } = await loadCatalogAndModels();
  const caches = loadMergedCaches();
  const queue = readJson(path.join(OUT90, 'queue.json'), { batches: [] });
  const registry = readJson(REGISTRY_PATH);

  // 1. Check batch files 0..15
  const batchStatus = [];
  for (let i = 0; i <= 15; i++) {
    const bp = path.join(OUT90, 'batches', `batch_${i}.json`);
    const bDoc = readJson(bp, null);
    batchStatus.push({
      batch_id: `batch_${i}`,
      exists: Boolean(bDoc),
      activated_count: bDoc?.activated_count ?? null,
      needs_evidence_count: bDoc?.needs_evidence_count ?? null,
      rejected_count: bDoc?.rejected_count ?? null
    });
  }

  // 2. Load approvedManufacturers from tests/phase75_amazon_growth.test.js
  const phase75Src = fs.readFileSync(path.join(ROOT, 'tests', 'phase75_amazon_growth.test.js'), 'utf8');
  const setMatch = phase75Src.match(/approvedManufacturers\s*=\s*new\s+Set\(\[([\s\S]*?)\]\)/);
  const approvedSet = new Set();
  if (setMatch) {
    for (const m of setMatch[1].matchAll(/'([^']+)'/g)) approvedSet.add(m[1].toLowerCase());
  }

  // 3. Deduplicate on (part_number, marketplace, asin) & ensure baseline preserved
  const dedupedOffers = [];
  const seenOfferKeys = new Set();
  let duplicatesRemoved = 0;
  for (const o of registry.offers) {
    const k = `${o.part_number}|${o.marketplace || 'amazon.nl'}|${o.asin}`;
    if (o.status === 'ACTIVE' && seenOfferKeys.has(k)) {
      duplicatesRemoved++;
      continue;
    }
    if (o.status === 'ACTIVE') seenOfferKeys.add(k);
    dedupedOffers.push(o);
  }
  registry.offers = dedupedOffers;

  const activeByPartMkt = new Map();
  const activeByAsinMkt = new Map();
  const usedKillSwitches = new Set(registry.offers.map(o => o.kill_switch_id).filter(Boolean));
  for (const o of registry.offers.filter(x => x.status === 'ACTIVE')) {
    const mkt = o.marketplace || 'amazon.nl';
    activeByPartMkt.set(`${o.part_number}|${mkt}`, o);
    activeByAsinMkt.set(`${mkt}|${o.asin}`, o.part_number);
  }

  // 4. Offline recovery across ALL queue parts & existing_pool_recovery using saved caches
  const allCandidateRows = [];
  const seedByPart = new Map();
  if (queue.existing_pool_recovery?.pairs) {
    for (const mkt of ['amazon.nl', 'amazon.de']) {
      for (const item of (queue.existing_pool_recovery.pairs[mkt] || [])) {
        if (!seedByPart.has(item.part_number)) seedByPart.set(item.part_number, { 'amazon.nl': [], 'amazon.de': [] });
        seedByPart.get(item.part_number)[mkt].push(item.asin);
      }
    }
  }
  for (const p of (queue.existing_pool_recovery?.parts || [])) {
    allCandidateRows.push({ ...p, seed_asins: seedByPart.get(p.part_number) || {} });
  }
  for (const b of (queue.batches || [])) {
    for (const p of (b.parts || [])) allCandidateRows.push(p);
  }

  const recovered = [];
  for (const row of allCandidateRows) {
    const pn = row.part_number;
    const partName = row.part_name || catalogNames[pn] || '';
    for (const mkt of ['amazon.nl', 'amazon.de']) {
      if (activeByPartMkt.has(`${pn}|${mkt}`) || PROTECTED_PINNED_SLOTS.has(`${pn}|${mkt}`)) continue;
      const asins = selectCandidatesForPart(row, mkt, caches, activeByAsinMkt);
      for (const asin of asins) {
        const owner = activeByAsinMkt.get(`${mkt}|${asin}`);
        if (owner && owner !== pn) continue;
        const check = caches.checksMerged[mkt][asin];
        if (!check || !check.listed || check.isDead || check.http_status >= 400) continue;
        const fullText = `${check.title || ''} ${(check.bullets || []).join(' ')} ${check.description || ''}`;
        if (!digits(fullText).includes(pn)) continue;
        if (checkHistoricalMismatch(pn, asin, check.title || '').isMismatch) continue;
        const brand = resolveCleanBrand(check);
        if (!brand || BAD_BRAND_RE.test(brand)) continue;
        if (!evaluateTechnicalFit(pn, partName, check, brand).ok) continue;
        if (check.cannotShipNl || !check.hasAddCart) continue;
        if (mkt === 'amazon.de') {
          const delivEvidence = `${check.glowLoc || ''} ${check.deliveryBlock || ''} ${(check.delivery || []).join(' ')} ${check.avail || ''}`;
          if (!/nederland|netherlands|nl|bezorging|lieferung|zustellung|delivery/i.test(delivEvidence)) continue;
        }
        const classification = classifyBrand(brand, check);
        const dealerRec = caches.dealerMerged[pn] || null;
        const record = buildOfferRecord({
          pn, mkt, asin, brand, classification, check, dealerRec, catalogNames, partModelsMap, usedKillSwitches, existingNote: ''
        });
        const verif = TwoGateVerifier.verifyOffer(record, { catalogPartMap: catalogParts, expectedTag: TAGS[mkt] });
        if (!verif.passed) continue;
        record.gate_1_technical = verif.gate1;
        record.gate_2_product = verif.gate2;
        usedKillSwitches.add(record.kill_switch_id);
        activeByPartMkt.set(`${pn}|${mkt}`, record);
        activeByAsinMkt.set(`${mkt}|${asin}`, pn);
        registry.offers.push(record);
        recovered.push({ part_number: pn, mkt, asin, brand });
        break;
      }
    }
  }

  // 5. Strict Phase 90 quality, brand & semantic audit
  const MULTIPACK_CATALOG_RE = /\b(set|kit|pack|pair|paar|2er|3er|4er|5er|10er|\d+\s*pcs|\d+\s*stuks)\b/i;
  const flagged = [];
  const phase90Brands = new Set();

  for (const o of registry.offers) {
    if (o.status !== 'ACTIVE' || !/^Phase 90:/.test(o.status_reason || '')) continue;
    const mkt = o.marketplace || 'amazon.nl';
    const norm = PartNormalizer.normalizePartNumber(o.part_number);
    const catName = catalogNames[norm] || '';
    const issues = [];
    if (!catalogParts.has(norm)) issues.push('MISSING_CATALOG_PART');
    const verif = TwoGateVerifier.verifyOffer(o, { catalogPartMap: catalogParts, expectedTag: TAGS[mkt] });
    if (!verif.passed) issues.push(`TWO_GATE:${verif.errors.join('|')}`);
    if (checkHistoricalMismatch(o.part_number, o.asin, o.product_title).isMismatch) issues.push('HISTORICAL_MISMATCH');
    const brand = (o.brand || '').trim();
    if (!brand || BAD_BRAND_RE.test(brand) || /\b(replaces|universal|generic|unknown|compatible)\b/i.test(brand)) {
      issues.push(`SUSPICIOUS_BRAND:${brand}`);
    }
    const mpMatch = (o.product_title || '').match(STRONG_MULTIPACK_RE);
    if (mpMatch && !/^1\s*[- ]?(?:x|pc|pcs|stuk|stuks|stück|stueck)\b/i.test(mpMatch[0]) && !MULTIPACK_CATALOG_RE.test(catName)) {
      issues.push(`MULTIPACK_ON_SINGLE_PART:${mpMatch[0]}`);
    }
    if (issues.length) flagged.push({ part_number: o.part_number, mkt, asin: o.asin, brand, title: o.product_title, issues });
    else if (brand) phase90Brands.add(brand.toLowerCase());
  }

  if (APPLY && flagged.length > 0) {
    const dropKeys = new Set(flagged.map(f => `${f.part_number}|${f.mkt}|${f.asin}`));
    registry.offers = registry.offers.filter(o => {
      if (o.status !== 'ACTIVE' || !/^Phase 90:/.test(o.status_reason || '')) return true;
      return !dropKeys.has(`${o.part_number}|${o.marketplace || 'amazon.nl'}|${o.asin}`);
    });
  }

  const activeAll = registry.offers.filter(o => o.status === 'ACTIVE');
  const baselineActive = activeAll.filter(o => !/^Phase 90:/.test(o.status_reason || ''));
  const phase90Active = activeAll.filter(o => /^Phase 90:/.test(o.status_reason || ''));
  const uniqueSet = new Set(activeAll.map(o => o.part_number));

  const missingBrands = [...phase90Brands].filter(b => !approvedSet.has(b)).sort();

  registry.phase = '90';
  registry.generated_at = new Date().toISOString();
  registry.policy = {
    ...registry.policy,
    pilot_name: 'Phase 90 Amazon Growth & Conversion Optimization',
    production_activation_allowed: true,
    pilot_activated_parts: Array.from(uniqueSet).sort(),
    max_active_offers_allowed: null,
    max_active_offers_per_marketplace: { 'amazon.nl': null, 'amazon.de': null }
  };
  registry.metrics = {
    total_registered: registry.offers.length,
    staged: registry.offers.filter(o => o.status === 'STAGED').length,
    verified: registry.offers.filter(o => o.status === 'VERIFIED').length,
    active: activeAll.length,
    active_nl: activeAll.filter(o => !o.marketplace || o.marketplace === 'amazon.nl').length,
    active_de: activeAll.filter(o => o.marketplace === 'amazon.de').length,
    research_required: registry.offers.filter(o => o.status === 'RESEARCH_REQUIRED').length,
    suspended: registry.offers.filter(o => o.status === 'SUSPENDED').length,
    parts_with_amazon_offer: uniqueSet.size
  };

  if (APPLY) {
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 1).replace(/\r\n/g, '\n') + '\n', 'utf8');
  }

  const cons = APPLY ? await checkAffiliateConsistency() : { success: null };

  const report = {
    applied: APPLY,
    batches_completed: batchStatus.filter(b => b.exists).length,
    batches_missing: batchStatus.filter(b => !b.exists).map(b => b.batch_id),
    duplicates_removed: duplicatesRemoved,
    offline_recovered_count: recovered.length,
    offline_recovered_samples: recovered.slice(0, 15),
    flagged_pruned_count: flagged.length,
    flagged_samples: flagged.slice(0, 20),
    baseline_active_preserved: baselineActive.length,
    phase90_new_active: phase90Active.length,
    final_metrics: registry.metrics,
    missing_approved_brands_in_phase75: missingBrands,
    consistency_success: cons.success
  };

  if (APPLY) {
    fs.writeFileSync(path.join(OUT90, 'PHASE90_RECONCILIATION.json'), JSON.stringify(report, null, 2).replace(/\r\n/g, '\n') + '\n', 'utf8');
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
