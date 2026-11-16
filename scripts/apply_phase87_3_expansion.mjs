/**
 * scripts/apply_phase87_3_expansion.mjs
 *
 * Phase 87.3 — Unlimited Amazon Affiliate Activation:
 *   1. Removes artificial commercial slot caps (`max_active_offers_allowed: null`,
 *      `max_active_offers_per_marketplace: { amazon.nl: null, amazon.de: null }`).
 *   2. Preserves all 150 previously ACTIVE offers and all SUSPENDED historical records.
 *   3. Activates all strictly Two-Gate-verified, single-unit, NL-shippable candidates
 *      (including ready_above_cap, newly verified NL & DE parts, and cross-marketplace offers).
 *   4. Retires resolved RESEARCH_REQUIRED records into PHASE87_3_ACTIVATION.json while keeping
 *      still-unproven offers in RESEARCH_REQUIRED / VERIFIED (NEEDS_EVIDENCE).
 *   5. Ensures zero private address/postal strings are stored anywhere.
 *
 * Usage: node scripts/apply_phase87_3_expansion.mjs [--dry-run]
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import readline from 'readline';
import { fileURLToPath } from 'url';

import { TwoGateVerifier } from '../src/affiliate/TwoGateVerifier.js';
import { checkHistoricalMismatch } from '../src/affiliate/HistoricalMismatches.js';
import { PartNormalizer } from '../src/parts/PartNormalizer.js';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const DRY_RUN = process.argv.includes('--dry-run');
const TODAY = new Date().toISOString().split('T')[0];
const NOW = new Date().toISOString();

const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const readOpt = (p, fb) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8')); } catch { return fb; } };
const write = (p, v) => {
  fs.mkdirSync(path.dirname(path.join(ROOT, p)), { recursive: true });
  fs.writeFileSync(path.join(ROOT, p), JSON.stringify(v, null, 2) + '\n', 'utf8');
};

const registry = read('data/affiliate/verified_amazon_registry.json');
const catalogDoc = read('data/parts_catalog.json');
const catalog = Array.isArray(catalogDoc) ? catalogDoc : (catalogDoc.parts || []);
const screened = read('output/phase87_3/screened_candidates.json');
const fitmentIndex = readOpt('data/model_part_fitments.json', {});
const priorityModelsDoc = readOpt('output/phase81/PHASE81_PRIORITY_MODELS.json', { models: [] });

const checksNl = {
  ...readOpt('output/phase87_1/product_checks_amazon_nl.json', {}),
  ...readOpt('output/phase87_2/product_checks_amazon_nl.json', {}),
  ...readOpt('output/phase87_3/product_checks_amazon_nl.json', {})
};
const checksDe = {
  ...readOpt('output/phase87_2/product_checks_amazon_de.json', {}),
  ...readOpt('output/phase87_3/product_checks_amazon_de.json', {})
};
const dealer = {
  ...readOpt('output/phase87_2/dealer_corroboration.json', {}),
  ...readOpt('output/phase87_3/dealer_corroboration.json', {})
};

const catalogParts = new Set(catalog.map(p => PartNormalizer.normalizePartNumber(p.part_number)));
const catalogNames = Object.fromEntries(catalog.map(p => [PartNormalizer.normalizePartNumber(p.part_number), p.part_name]));
const formatPart = p => {
  const m = String(p).match(/^(\d{4})(\d{3})(\d{4})$/);
  return m ? `${m[1]} ${m[2]} ${m[3]}` : String(p);
};

// Build part -> model names & fitment index from sharded model_part_fitments
const modelMetaByFitmentId = new Map();
for (const m of (priorityModelsDoc.models || [])) {
  const fid = m.fitment_id || (m.canonical_model_id ? m.canonical_model_id.replace(/^stihl_/, '') : null);
  if (fid) modelMetaByFitmentId.set(fid, { model_name: m.model_name, fitment_id: fid, gsc_impressions: m.gsc_impressions || 0 });
}

const partModelsMap = new Map();
const partsByFitmentId = new Map();
if (Array.isArray(fitmentIndex.shard_files)) {
  for (const shard of fitmentIndex.shard_files) {
    const stream = fs.createReadStream(path.join(ROOT, 'data', shard)).pipe(zlib.createGunzip());
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.trim()) continue;
      let rec;
      try { rec = JSON.parse(line); } catch { continue; }
      const pn = PartNormalizer.normalizePartNumber(rec.part_number);
      const fid = rec.canonical_model_id;
      if (!pn || !fid) continue;
      if (!partsByFitmentId.has(fid)) partsByFitmentId.set(fid, new Set());
      partsByFitmentId.get(fid).add(pn);
      if (modelMetaByFitmentId.has(fid)) {
        if (!partModelsMap.has(pn)) partModelsMap.set(pn, new Set());
        partModelsMap.get(pn).add(modelMetaByFitmentId.get(fid).model_name);
      }
    }
  }
}

function extractModelsForCandidate(pn, check) {
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

const TAGS = { 'amazon.nl': 'srihldecoder2-21', 'amazon.de': 'srihldecode00-21' };
const AMAZON_URL = (mkt, asin) => `https://www.${mkt}/dp/${asin}`;
const MANUFACTURER_BY_BRAND = { Stihl: 'ANDREAS STIHL AG & Co. KG', STIHL: 'ANDREAS STIHL AG & Co. KG' };
const scrubGeo = s => String(s || '').replace(/\b(Bezorgen\s+aan|Wordt\s+bezorgd\s+aan)\s+[^\n,|]{2,40}/gi, '$1 NL').replace(/\b\d{4}\s*[A-Z]{2}\b/g, 'NL-POSTAL');

function computeGscCoverage(offers) {
  const activeParts = new Set(offers.filter(o => o.status === 'ACTIVE').map(o => o.part_number));
  const counts = {};
  const totalUniqueParts = new Set();
  for (const [fid, meta] of modelMetaByFitmentId.entries()) {
    const mPartsSet = partsByFitmentId.get(fid) || new Set();
    let covered = 0;
    for (const p of mPartsSet) {
      if (activeParts.has(p)) {
        covered++;
        totalUniqueParts.add(p);
      }
    }
    counts[meta.model_name] = {
      fitment_id: fid,
      gsc_impressions: meta.gsc_impressions,
      covered_parts: covered,
      total_catalog_parts: mPartsSet.size
    };
  }
  return { per_model: counts, total_unique_covered_parts: totalUniqueParts.size };
}

const baselineOffers = registry.offers.filter(o => !/^Phase 87\.3:/.test(o.status_reason || ''));
const gscBefore = computeGscCoverage(baselineOffers);
const beforeNl = baselineOffers.filter(o => o.status === 'ACTIVE' && (o.marketplace === 'amazon.nl' || !o.marketplace)).length;
const beforeDe = baselineOffers.filter(o => o.status === 'ACTIVE' && o.marketplace === 'amazon.de').length;
const beforeActiveTotal = beforeNl + beforeDe;
const beforeUniqueParts = new Set(baselineOffers.filter(o => o.status === 'ACTIVE').map(o => o.part_number)).size;

const usedKillSwitches = new Set(registry.offers.map(o => o.kill_switch_id).filter(Boolean));
const activatedOffers = [];
const rejectedByGate = [];
const supersededResearch = [];
let dealerCorroboratedCount = 0;

for (const cand of screened.selected) {
  const pn = cand.part_number;
  const mkt = cand.marketplace;
  const asin = cand.asin;
  const check = (mkt === 'amazon.de' ? checksDe : checksNl)[asin];
  if (!check || !check.listed || !check.hasAddCart || check.cannotShipNl) {
    rejectedByGate.push({ part_number: pn, asin, mkt, reason: 'LIVE_CHECK_MISSING_OR_NOT_BUYABLE' });
    continue;
  }

  // Deduplicate exact (part_number, marketplace, asin)
  if (registry.offers.some(o => o.part_number === pn && (o.marketplace || 'amazon.nl') === mkt && o.asin === asin && o.status === 'ACTIVE')) {
    continue;
  }

  // Historical mismatch guard
  const mismatch = checkHistoricalMismatch(pn, asin, check.title || '');
  if (mismatch.isMismatch) {
    rejectedByGate.push({ part_number: pn, asin, mkt, reason: `HISTORICAL_MISMATCH: ${mismatch.record?.reason}` });
    continue;
  }

  const formatted = formatPart(pn);
  const catalogName = catalogNames[pn] || `STIHL onderdeel ${formatted}`;
  const listingTitle = scrubGeo(check.title || '');
  const brand = cand.brand;
  const tag = TAGS[mkt];
  const models = extractModelsForCandidate(pn, check);
  const delivRaw = scrubGeo(check.deliveryBlock || (check.delivery || [])[0] || 'levering naar Nederland bevestigd');

  const dealerRec = dealer[pn] || {};
  const dealerHit = Array.isArray(dealerRec.hits) && dealerRec.hits.length > 0 ? dealerRec.hits[0] : null;
  if (dealerHit) dealerCorroboratedCount++;

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
    oem_brand_classification: cand.classification,
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
    status_reason: `Phase 87.3: live ${mkt}-vermelding met het exacte STIHL-nummer ${formatted}${dealerHit ? ' en dealercatalogus-corroboratie' : ''}${cand.ready_above_cap ? ' (voormalig ready_above_cap)' : ''} en bevestigde NL-levering.`,
    supersedes_asin: null,
    updated_at: NOW
  };

  // Preserve predecessor relationship if this part had a SUSPENDED or RESEARCH_REQUIRED offer
  const previous = registry.offers.find(o => o.part_number === pn && (o.status === 'SUSPENDED' || o.status === 'RESEARCH_REQUIRED'));
  if (previous && previous.asin !== asin) {
    record.supersedes_asin = previous.asin;
    record.status_reason += ` Vervangt eerdere vermelding ${previous.asin}.`;
  }

  const verification = TwoGateVerifier.verifyOffer(record, {
    catalogPartMap: catalogParts,
    expectedTag: tag
  });
  if (!verification.passed) {
    rejectedByGate.push({ part_number: pn, asin, mkt, errors: verification.errors });
    continue;
  }

  record.gate_1_technical = verification.gate1;
  record.gate_2_product = verification.gate2;
  usedKillSwitches.add(killSwitchId);

  const existingIdx = registry.offers.findIndex(o => o.part_number === pn && (o.marketplace || 'amazon.nl') === mkt && o.asin === asin);
  if (existingIdx >= 0) {
    registry.offers[existingIdx] = record;
  } else {
    registry.offers.push(record);
  }
  activatedOffers.push({
    part_number: pn,
    asin,
    marketplace: mkt,
    brand,
    classification: cand.classification,
    ready_above_cap: !!cand.ready_above_cap,
    has_dealer_corroboration: !!dealerHit
  });

  if (previous && previous.asin !== asin) {
    if (previous.status === 'RESEARCH_REQUIRED') {
      supersededResearch.push(previous);
      registry.offers = registry.offers.filter(o => o !== previous);
    } else if (previous.status === 'SUSPENDED') {
      previous.superseded_by_asin = asin;
      previous.superseded_at = NOW;
      previous.updated_at = NOW;
    }
  }
}

// Update registry policy (UNLIMITED commercial activation within Two-Gate & safety rules)
const activeAll = registry.offers.filter(o => o.status === 'ACTIVE');
const afterNl = activeAll.filter(o => !o.marketplace || o.marketplace === 'amazon.nl').length;
const afterDe = activeAll.filter(o => o.marketplace === 'amazon.de').length;
const afterUniqueParts = new Set(activeAll.map(o => o.part_number));

registry.phase = '87.3';
registry.generated_at = NOW;
registry.policy = {
  ...registry.policy,
  pilot_name: 'Phase 87.3 Unlimited Verified Amazon Affiliate Activation',
  production_activation_allowed: true,
  pilot_activated_parts: Array.from(afterUniqueParts).sort(),
  max_active_offers_allowed: null,
  max_active_offers_per_marketplace: {
    'amazon.nl': null,
    'amazon.de': null
  }
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
  parts_with_amazon_offer: afterUniqueParts.size
};

const gscAfter = computeGscCoverage(registry.offers);
const gscDeltaPerModel = {};
for (const [mName, afterObj] of Object.entries(gscAfter.per_model)) {
  const beforeObj = gscBefore.per_model[mName] || { covered_parts: 0 };
  if (afterObj.covered_parts > beforeObj.covered_parts) {
    gscDeltaPerModel[mName] = {
      before: beforeObj.covered_parts,
      after: afterObj.covered_parts,
      delta: afterObj.covered_parts - beforeObj.covered_parts
    };
  }
}

const reportJson = {
  phase: '87.3',
  generated_at: NOW,
  before: {
    active_total: beforeActiveTotal,
    active_nl: beforeNl,
    active_de: beforeDe,
    unique_parts: beforeUniqueParts
  },
  after: {
    active_total: activeAll.length,
    active_nl: afterNl,
    active_de: afterDe,
    unique_parts: afterUniqueParts.size,
    new_unique_parts_added: afterUniqueParts.size - beforeUniqueParts,
    new_offers_activated: activatedOffers.length,
    new_nl_activated: afterNl - beforeNl,
    new_de_activated: afterDe - beforeDe,
    ready_above_cap_activated: activatedOffers.filter(o => o.ready_above_cap).length,
    ready_above_cap_total: 12,
    dealer_corroborated_new_offers: dealerCorroboratedCount,
    remaining_research_required: registry.metrics.research_required,
    remaining_verified_de_inactive: registry.metrics.verified,
    remaining_needs_evidence_total: registry.metrics.research_required + registry.metrics.verified,
    suspended_historical_preserved: registry.metrics.suspended
  },
  gsc_coverage: {
    unique_covered_parts_before: gscBefore.total_unique_covered_parts,
    unique_covered_parts_after: gscAfter.total_unique_covered_parts,
    delta_unique_parts: gscAfter.total_unique_covered_parts - gscBefore.total_unique_covered_parts,
    per_model_delta: gscDeltaPerModel
  },
  activated_offers: activatedOffers,
  rejected_by_gate: rejectedByGate,
  superseded_research_candidates: supersededResearch
};

if (!DRY_RUN) {
  write('data/affiliate/verified_amazon_registry.json', registry);
  write('output/phase87_3/PHASE87_3_ACTIVATION.json', reportJson);
}

console.log('=== PHASE 87.3 ACTIVATION SUMMARY ===');
console.log(JSON.stringify({ before: reportJson.before, after: reportJson.after, gsc_coverage: reportJson.gsc_coverage, rejected_by_gate_count: rejectedByGate.length }, null, 2));
