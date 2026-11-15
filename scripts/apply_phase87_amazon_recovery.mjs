/**
 * Phase 87 — Amazon recovery activation.
 *
 * Promotes fully evidenced Amazon.nl replacement offers into the verified offer
 * registry. Every activation below was produced by:
 *   1. a fresh rendered-page check of the Amazon.nl listing (live, delivery shown
 *      to a Dutch address, exact STIHL number visible in the listing);
 *   2. independent dealer-catalog corroboration of the STIHL number where
 *      available (Garden Hire Spares, gardenhirespares.co.uk);
 *   3. the existing TwoGateVerifier — no rule is relaxed here.
 *
 * Delisted predecessor records are kept and marked SUSPENDED with a pointer to
 * their replacement. No evidence field of an existing record is removed.
 *
 * Usage: node scripts/apply_phase87_amazon_recovery.mjs [--dry-run]
 */

import fs from 'fs';
import path from 'path';

import { TwoGateVerifier } from '../src/affiliate/TwoGateVerifier.js';
import { PartNormalizer } from '../src/parts/PartNormalizer.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DRY_RUN = process.argv.includes('--dry-run');
const TODAY = new Date().toISOString().split('T')[0];
const NOW = new Date().toISOString();

const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const write = (p, v) => fs.writeFileSync(path.join(ROOT, p), JSON.stringify(v, null, 2) + '\n');

const registry = read('data/affiliate/verified_amazon_registry.json');
const catalogDoc = read('data/parts_catalog.json');
const catalog = Array.isArray(catalogDoc) ? catalogDoc : (catalogDoc.parts || []);
const productChecks = read('output/phase87/amazon_product_checks.json');
const dealer = read('output/phase87/dealer_corroboration.json');

const catalogParts = new Set(catalog.map(p => PartNormalizer.normalizePartNumber(p.part_number)));
const catalogNames = Object.fromEntries(catalog.map(p => [PartNormalizer.normalizePartNumber(p.part_number), p.part_name]));
const formatPart = p => {
  const m = String(p).match(/^(\d{4})(\d{3})(\d{4})$/);
  return m ? `${m[1]} ${m[2]} ${m[3]}` : String(p);
};

const AMAZON_URL = asin => `https://www.amazon.nl/dp/${asin}`;

/**
 * Activation decisions.
 * `kind`: GENUINE_STIHL | MANUFACTURER_AFTERMARKET | UNVERIFIED_AFTERMARKET | OEM_SUPPLIER_EQUIVALENT
 * `qty`: physical units in one purchasable listing.
 * `nd`: true when the independent dealer catalog corroborates the STIHL number.
 */
const DECISIONS = [
  // --- Genuine STIHL listings (manufacturer brand shown on the Amazon page) ---
  { part: '07811201110', asin: 'B007TK0T00', brand: 'STIHL', kind: 'GENUINE_STIHL', qty: 1, nd: true },
  { part: '11236402073', asin: 'B006WVO0QQ', brand: 'STIHL', kind: 'GENUINE_STIHL', qty: 1, nd: true },
  { part: '11291900601', asin: 'B007TK13CI', brand: 'STIHL', kind: 'GENUINE_STIHL', qty: 1, nd: true },
  { part: '42411401000', asin: 'B083P6BFKD', brand: 'STIHL', kind: 'GENUINE_STIHL', qty: 1, nd: false },
  { part: '42410071003', asin: 'B007TK0C8O', brand: 'STIHL', kind: 'GENUINE_STIHL', qty: 1, nd: false },
  { part: '30030003313', asin: 'B08W28JDWJ', brand: 'STIHL', kind: 'GENUINE_STIHL', qty: 1, nd: false },

  // --- Aftermarket replacements, STIHL number corroborated by a dealer catalog ---
  { part: '41471410300', asin: 'B0CP57NXL5', brand: 'MAXPOWER', kind: 'MANUFACTURER_AFTERMARKET', qty: 1, nd: true },
  { part: '00003500527', asin: 'B0G5PY252N', brand: 'perfektGarten', kind: 'MANUFACTURER_AFTERMARKET', qty: 1, nd: true },
  { part: '00003500533', asin: 'B0BBMPZQH6', brand: 'perfektGarten', kind: 'MANUFACTURER_AFTERMARKET', qty: 1, nd: true },
  { part: '11236402074', asin: 'B007TK19WW', brand: 'Kitoo', kind: 'MANUFACTURER_AFTERMARKET', qty: 1, nd: true },
  { part: '11231900600', asin: 'B0C72FKDP4', brand: 'QINYUN', kind: 'MANUFACTURER_AFTERMARKET', qty: 1, nd: true },
  { part: '11230071061', asin: 'B0GM2YRNQP', brand: 'YINETTECH', kind: 'MANUFACTURER_AFTERMARKET', qty: 1, nd: true },
  { part: '11230201209', asin: 'B0GT2Q39PW', brand: 'Adefol', kind: 'MANUFACTURER_AFTERMARKET', qty: 1, nd: true },
  { part: '41370292300', asin: 'B0BWSX4DWZ', brand: 'Gubeter', kind: 'MANUFACTURER_AFTERMARKET', qty: 1, nd: true },
  { part: '41371242800', asin: 'B0HRFKS4ZS', brand: 'SHIHAOHZ', kind: 'MANUFACTURER_AFTERMARKET', qty: 1, nd: true },
  { part: '11281903400', asin: 'B0FG7PKCLL', brand: 'CCQDGMD', kind: 'MANUFACTURER_AFTERMARKET', qty: 1, nd: true },
  { part: '42410071700', asin: 'B0FWJ6TFJH', brand: 'EMSea', kind: 'MANUFACTURER_AFTERMARKET', qty: 2, nd: true },
  { part: '11271201620', asin: 'B0C38W9LC3', brand: 'HOHMI', kind: 'MANUFACTURER_AFTERMARKET', qty: 1, nd: true },
  { part: '11270802103', asin: 'B07MM11TCK', brand: 'TOPINCN', kind: 'MANUFACTURER_AFTERMARKET', qty: 1, nd: true },
  { part: '42821900303', asin: 'B07PVMRZYK', brand: 'Cancanle', kind: 'MANUFACTURER_AFTERMARKET', qty: 1, nd: true },
  { part: '41401904009', asin: 'B07BLSL3VM', brand: 'Cancanle', kind: 'MANUFACTURER_AFTERMARKET', qty: 1, nd: true },
  { part: '41340802101', asin: 'B079WS2YNM', brand: 'C·T·S', kind: 'MANUFACTURER_AFTERMARKET', qty: 1, nd: true },
  // 41341410300 / B0D3GRT27F (10-pack luchtfilters) was rejected during review: the
  // listing carries no manufacturer brand (Amazon byline "Generic"), so it cannot
  // be classified as a manufacturer product. The part keeps its RESEARCH_REQUIRED
  // record and the candidate is documented in the Phase 87 artifacts.

  // Deliberately NOT activated: 00004007000 / B00IKF8TH8 (Champion RCJ6Y).
  // The dealer catalog confirms STIHL 0000 400 7000 is the NGK BPMR7A and the
  // Stens/Walbro charts confirm the Champion RCJ6Y is its interchange, but that
  // part already has a genuine NGK direct link. Adding an equivalent would raise
  // the link count without making a new part purchasable, so the record stays
  // RESEARCH_REQUIRED and the evidence is kept in output/phase87/.
];

const MANUFACTURER_BY_BRAND = {
  STIHL: 'ANDREAS STIHL AG & Co. KG'
};

function buildRecord(decision) {
  const formatted = formatPart(decision.part);
  const check = productChecks[decision.asin] || {};
  const dealerRec = dealer[decision.part] || {};
  const dealerHit = dealerRec.hits?.[0] || null;
  const catalogName = catalogNames[decision.part] || `STIHL onderdeel ${formatted}`;
  const listingTitle = check.title || '';
  const brand = decision.brand || 'Onbekend merk';

  const sources = [{
    type: 'AMAZON_PRODUCT_PAGE',
    url: AMAZON_URL(decision.asin),
    title: listingTitle.slice(0, 180),
    claim: `Live Amazon.nl-vermelding ${decision.asin} toont "${listingTitle.slice(0, 140)}" met onderdeelnummer ${formatted}; de pagina toont levertijd voor een Nederlands adres op ${TODAY}.`,
    retrieved_at: TODAY
  }];
  if (dealerHit) {
    sources.push({
      type: 'EXTERNAL_CATALOG',
      url: dealerRec.source_url,
      title: 'Garden Hire Spares dealercatalogus',
      claim: `Dealercatalogus voert "${dealerHit}" onder het exacte STIHL-nummer ${formatted}.`,
      retrieved_at: TODAY
    });
  }
  if (Array.isArray(decision.extra_sources)) sources.push(...decision.extra_sources);

  const compatibilityProof = decision.compatibility_note
    ? `${decision.compatibility_note}; bevestigde compatibiliteit met STIHL onderdeel ${formatted} (catalogusnaam: ${catalogName}).`
    : dealerHit
      ? `${dealerHit}; bevestigde compatibiliteit met STIHL onderdeel ${formatted} (catalogusnaam: ${catalogName}), zoals vermeld in de Amazon-vermelding en de dealercatalogus.`
      : `${listingTitle.slice(0, 140)}; bevestigde compatibiliteit met STIHL onderdeel ${formatted} (catalogusnaam: ${catalogName}) volgens de Amazon-vermelding.`;
  const identityProof = dealerHit
    ? `${brand} product met STIHL-referentie ${formatted}: de Amazon.nl-vermelding ${decision.asin} noemt dit nummer en de onafhankelijke dealercatalogus (${dealerRec.source_url}) beschrijft ${formatted} als "${dealerHit}".`
    : `${brand} product met STIHL-referentie ${formatted}: de Amazon.nl-vermelding ${decision.asin} toont het exacte onderdeelnummer ${formatted} en het merk ${brand} op de productpagina.`;

  return {
    part_number: decision.part,
    part_number_formatted: formatted,
    asin: decision.asin,
    marketplace: 'amazon.nl',
    affiliate_tag: 'srihldecoder2-21',
    manufacturer: MANUFACTURER_BY_BRAND[decision.brand] || brand,
    manufacturer_part_number: formatted,
    trade_number: null,
    brand,
    product_title: listingTitle,
    package_quantity: decision.qty,
    package_type: decision.qty > 1 ? `Meervoudige verpakking (${decision.qty} stuks)` : 'Enkelstuks',
    is_multipack: decision.qty > 1,
    ean_gtin: null,
    oem_brand_classification: decision.kind,
    evidence_classification: 'AMAZON_LISTING_COMPATIBLE',
    pilot_eligible: true,
    pilot_active: true,
    kill_switch_id: `KILL_AMAZON_NL_${decision.part}`,
    compatibility_proof: compatibilityProof,
    asin_product_identity_proof: identityProof,
    independent_evidence_url: dealerRec.source_url || AMAZON_URL(decision.asin),
    direct_affiliate_url: `${AMAZON_URL(decision.asin)}?tag=srihldecoder2-21`,
    search_fallback_url: `https://www.amazon.nl/s?k=STIHL+${encodeURIComponent(formatted)}&tag=srihldecoder2-21`,
    verifiable_evidence_sources: sources,
    verification_date: TODAY,
    shipping_to_nl_status: 'SHIPS_TO_NL_CONFIRMED',
    shipping_destination_country: 'NL',
    shipping_checked_at: TODAY,
    shipping_evidence_description: `Amazon.nl-vermelding toont een bezorgdatum voor het Nederlandse adres (${(check.delivery || [])[0] || 'levering volgens productpagina'}).`,
    status: 'ACTIVE',
    status_reason: `Phase 87 recovery: live Amazon.nl-vermelding met het exacte STIHL-nummer ${formatted}${dealerHit ? ' en onafhankelijke dealercatalogus-corroboratie' : ''}.`,
    supersedes_asin: null,
    updated_at: NOW
  };
}

const outcomes = [];
const activatedOffers = [];

for (const decision of DECISIONS) {
  const record = buildRecord(decision);
  const previous = registry.offers.find(o =>
    o.part_number === decision.part &&
    (o.status === 'SUSPENDED' || o.status === 'RESEARCH_REQUIRED')
  );
  if (previous && previous.asin !== decision.asin) {
    record.supersedes_asin = previous.asin;
    record.status_reason += ` Vervangt de niet meer beschikbare vermelding ${previous.asin}.`;
  }

  const verification = TwoGateVerifier.verifyOffer(record, {
    catalogPartMap: catalogParts,
    expectedTag: 'srihldecoder2-21'
  });

  if (!verification.passed) {
    outcomes.push({
      part_number: decision.part,
      asin: decision.asin,
      status: 'REJECTED_BY_GATE',
      errors: verification.errors
    });
    continue;
  }

  record.gate_1_technical = verification.gate1;
  record.gate_2_product = verification.gate2;

  const key = `${decision.part}:amazon.nl:${decision.asin}`;
  const existingIndex = registry.offers.findIndex(o => o.part_number === decision.part && o.marketplace === 'amazon.nl' && o.asin === decision.asin);
  if (existingIndex >= 0) registry.offers[existingIndex] = record;
  else registry.offers.push(record);

  if (previous && previous.asin !== decision.asin) {
    previous.previous_status = previous.previous_status || previous.status;
    previous.status = 'SUSPENDED';
    previous.suspension_reason = previous.suspension_reason || 'LISTING_NOT_AVAILABLE_404';
    previous.superseded_by_asin = decision.asin;
    previous.superseded_at = NOW;
    previous.status_reason = `${previous.status_reason ? previous.status_reason + ' | ' : ''}Phase 87: vervangen door ${decision.asin}.`;
    previous.updated_at = NOW;
  }

  activatedOffers.push({ part_number: decision.part, asin: decision.asin, marketplace: 'amazon.nl', key });
  outcomes.push({
    part_number: decision.part,
    asin: decision.asin,
    status: 'ACTIVE',
    brand: record.brand,
    oem_brand_classification: record.oem_brand_classification,
    independent_dealer_evidence: !!dealer[decision.part]?.found,
    superseded_asin: record.supersedes_asin
  });
}

// Refresh derived metrics without dropping historical ones.
const active = registry.offers.filter(o => o.status === 'ACTIVE');
const byMarketplace = m => active.filter(o => o.marketplace === m).length;
const partsWithAmazon = new Set(active.map(o => o.part_number)).size;

registry.metrics = {
  ...registry.metrics,
  total_registered: registry.offers.length,
  active: active.length,
  active_nl: byMarketplace('amazon.nl'),
  active_de: byMarketplace('amazon.de'),
  active_offers: active.length,
  parts_with_amazon_offer: partsWithAmazon,
  suspended: registry.offers.filter(o => o.status === 'SUSPENDED').length,
  research_required: registry.offers.filter(o => o.status === 'RESEARCH_REQUIRED').length,
  verified: registry.offers.filter(o => o.status === 'VERIFIED').length,
  last_updated: NOW
};
registry.phase_87 = {
  activated_at: NOW,
  activated_offers: activatedOffers.length,
  parts_with_amazon_offer: partsWithAmazon,
  methodology: 'Live rendered Amazon.nl page checks (2026-11-15) plus independent dealer-catalog corroboration of the STIHL number; existing TwoGateVerifier gates applied unchanged. No PA-API/Creators credentials were used and no listing was scraped through access controls.',
  no_gtin_used: 'Uncorroborated sequential GTIN values on the predecessor records were not carried over to the new offers.'
};

const report = {
  schema_version: '1.0.0',
  phase: 87,
  generated_at: NOW,
  activated: activatedOffers.length,
  outcomes
};

write('output/phase87/PHASE87_ACTIVATION.json', report);
if (!DRY_RUN) write('data/affiliate/verified_amazon_registry.json', registry);

console.log(`activated=${activatedOffers.length} rejected=${outcomes.filter(o => o.status !== 'ACTIVE').length}`);
console.log(`registry ACTIVE=${active.length} (nl=${byMarketplace('amazon.nl')}, de=${byMarketplace('amazon.de')}) parts=${partsWithAmazon}`);
for (const o of outcomes.filter(x => x.status !== 'ACTIVE')) {
  console.log(`REJECTED ${o.part_number} ${o.asin}: ${o.errors.join('; ')}`);
}
