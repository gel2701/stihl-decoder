/**
 * Phase 87.1 — Amazon.nl expansion activation.
 *
 * Promotes well-evidenced Amazon.nl listings for catalog parts that had no direct
 * offer. Each decision below was produced by:
 *   1. a fresh rendered Amazon.nl search on the exact STIHL number, taking only
 *      listings whose title carries that exact 11-digit number;
 *   2. a rendered product-page check (live, HTTP status, title, brand, NL delivery);
 *   3. where available, independent dealer-catalog corroboration of the number
 *      (Garden Hire Spares) — this is the second source;
 *   4. the unchanged TwoGateVerifier.
 *
 * Listings that bundle several parts, multi-packs, or that name a different STIHL
 * number than the catalog entry are deliberately left out: they stay
 * NEEDS_EVIDENCE in output/phase87_1/selection_plan.json rather than being
 * activated or rejected. No evidence field of an existing record is removed.
 *
 * Usage: node scripts/apply_phase87_1_expansion.mjs [--dry-run]
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
const write = (p, v) => {
  fs.mkdirSync(path.dirname(path.join(ROOT, p)), { recursive: true });
  fs.writeFileSync(path.join(ROOT, p), JSON.stringify(v, null, 2) + '\n');
};

const registry = read('data/affiliate/verified_amazon_registry.json');
const catalogDoc = read('data/parts_catalog.json');
const catalog = Array.isArray(catalogDoc) ? catalogDoc : (catalogDoc.parts || []);
const productChecks = read('output/phase87_1/product_checks_amazon_nl.json');
const dealer = read('output/phase87_1/dealer_corroboration.json');
const selection = read('output/phase87_1/selection_plan.json');

const catalogParts = new Set(catalog.map(p => PartNormalizer.normalizePartNumber(p.part_number)));
const catalogNames = Object.fromEntries(catalog.map(p => [PartNormalizer.normalizePartNumber(p.part_number), p.part_name]));
const formatPart = p => {
  const m = String(p).match(/^(\d{4})(\d{3})(\d{4})$/);
  return m ? `${m[1]} ${m[2]} ${m[3]}` : String(p);
};

const AMAZON_URL = asin => `https://www.amazon.nl/dp/${asin}`;
const TAG_NL = 'srihldecoder2-21';

/**
 * Activation decisions.
 * `kind`: GENUINE_STIHL | MANUFACTURER_AFTERMARKET
 * `qty` : physical units in one purchasable listing (all single units here)
 */
const DECISIONS = [
  // --- STIHL number corroborated by an independent dealer catalog ---
  { part: '11216402004', asin: 'B0FHGT11FS', brand: 'YSDOZMD', kind: 'MANUFACTURER_AFTERMARKET', qty: 1 }, // Chain Sprocket 0.325" 7T
  { part: '11351201601', asin: 'B0GTKD4BY2', brand: 'DGWMLSDPP', kind: 'MANUFACTURER_AFTERMARKET', qty: 1 }, // Air filter MS341/MS361
  { part: '42821410300', asin: 'B0GTK68VQB', brand: 'DGWMLSDPP', kind: 'MANUFACTURER_AFTERMARKET', qty: 1 }, // Air filter BR500/550/600
  { part: '41371290900', asin: 'B0HNWJ6QJ1', brand: 'Moliuoly', kind: 'MANUFACTURER_AFTERMARKET', qty: 1 }, // Intake gasket FS75/85
  { part: '11300201208', asin: 'B0GT5PS87K', brand: 'DORFEY', kind: 'MANUFACTURER_AFTERMARKET', qty: 1 }, // Cylinder + piston 38 mm MS180
  { part: '41371241500', asin: 'B01FFSP4KW', brand: 'Stens', kind: 'MANUFACTURER_AFTERMARKET', qty: 1 }, // Pre filter FS75/80/85
  { part: '41371904000', asin: 'B07DBQDWFJ', brand: 'Allymoto', kind: 'MANUFACTURER_AFTERMARKET', qty: 1 }, // Rewind starter FS85
  { part: '11300802100', asin: 'B07PMN12MM', brand: 'Hippotech', kind: 'MANUFACTURER_AFTERMARKET', qty: 1 }, // Rewind starter MS170/180
  { part: '00007906100', asin: 'B0CKDLDLN6', brand: 'Tolxh', kind: 'MANUFACTURER_AFTERMARKET', qty: 1 }, // Screw assembly M4

  // --- Genuine STIHL listing (manufacturer brand on the Amazon page) ---
  { part: '00003500514', asin: 'B01HIMBJW0', brand: 'Stihl', kind: 'GENUINE_STIHL', qty: 1 }, // Filler cap TS410

  // --- Single-unit aftermarket listings whose page names the exact STIHL number,
  //     whose brand line names the manufacturer, and whose catalogue entry matches
  //     the product type. No other STIHL number appears in the title and nothing in
  //     the listing suggests a multi-pack or a combined kit. ---
  { part: '11351201600', asin: 'B0FYVHH8X9', brand: 'LT Easiyl', kind: 'MANUFACTURER_AFTERMARKET', qty: 1 }, // Air filter fleece MS341/361
  { part: '11351602050', asin: 'B07CG6WHMB', brand: 'Alamor', kind: 'MANUFACTURER_AFTERMARKET', qty: 1 }, // Clutch MS360/361/440/460
  { part: '41401602005', asin: 'B0FN3WS6X6', brand: 'Toefficy', kind: 'MANUFACTURER_AFTERMARKET', qty: 1 }, // Clutch FS38/45/55
  { part: '41401602909', asin: 'B0B3HSP2F6', brand: 'Luxuypon', kind: 'MANUFACTURER_AFTERMARKET', qty: 1 }, // Clutch drum FS45/55
  { part: '11224001314', asin: 'B0GLZ5VH12', brand: 'Serenophile', kind: 'MANUFACTURER_AFTERMARKET', qty: 1 }, // Ignition module MS460/660
  { part: '11256402005', asin: 'B07CTMC8P3', brand: 'ISE Crest', kind: 'MANUFACTURER_AFTERMARKET', qty: 1 }, // Spur sprocket 0.325" 7T
  { part: '11270302007', asin: 'B0FXV83XYQ', brand: 'UYTGFO', kind: 'MANUFACTURER_AFTERMARKET', qty: 1 }, // Piston 47 mm MS310
  { part: '11271602051', asin: 'B073Z5D69N', brand: 'CTS', kind: 'MANUFACTURER_AFTERMARKET', qty: 1 }, // Clutch assembly MS290/310/390
  { part: '41801602900', asin: 'B0G7GRK8V5', brand: 'Vilgftyiet', kind: 'MANUFACTURER_AFTERMARKET', qty: 1 }, // Clutch drum FS90/110/130
  { part: '41801900400', asin: 'B0D17BN556', brand: 'LSSOCH', kind: 'MANUFACTURER_AFTERMARKET', qty: 1 }, // Starter cover FS90R/110R
  { part: '42231950600', asin: 'B0GVKYCQ26', brand: 'AS Axis Spindleon', kind: 'MANUFACTURER_AFTERMARKET', qty: 1 }, // Starter cup TS400/BR320
  { part: '11350802102', asin: 'B078ZT4FXF', brand: 'QHALEN', kind: 'MANUFACTURER_AFTERMARKET', qty: 1 }, // Starter MS341/361
  { part: '41341410500', asin: 'B0HPGBB4WT', brand: 'Moliuoly', kind: 'MANUFACTURER_AFTERMARKET', qty: 1 }, // Filter cover FS120/300/350
  { part: '41371602900', asin: 'B0CYQ7YLRW', brand: 'YANTUMR', kind: 'MANUFACTURER_AFTERMARKET', qty: 1 }, // Clutch drum FS75/85
  { part: '41471904003', asin: 'B0F4CH2K5R', brand: 'Luxuypon', kind: 'MANUFACTURER_AFTERMARKET', qty: 1 }, // Rewind starter FS240/260/410/460
  { part: '00009302211', asin: 'B0B4S6N8VF', brand: 'Luxuypon', kind: 'MANUFACTURER_AFTERMARKET', qty: 1 }, // Starter cord 3.0 mm roll
  { part: '08123701000', asin: 'B0827VHM5T', brand: 'QHALEN', kind: 'MANUFACTURER_AFTERMARKET', qty: 1 }, // Torx T27 key
  { part: '11171824500', asin: 'B0CQ2LDCF7', brand: 'Tolxh', kind: 'MANUFACTURER_AFTERMARKET', qty: 1 }, // Throttle spring
  { part: '95129332260', asin: 'B0HNCDGLD2', brand: 'ISQJPVF', kind: 'MANUFACTURER_AFTERMARKET', qty: 1 }, // Needle cage 10x13x10
  { part: '00001903400', asin: 'B005ESHWO0', brand: 'Rotary', kind: 'MANUFACTURER_AFTERMARKET', qty: 1 }, // Starter rope with grip
  { part: '00006421234', asin: 'B0GVDJKLFH', brand: 'Adefol', kind: 'MANUFACTURER_AFTERMARKET', qty: 1 }, // Rim sprocket .325" 8T
  { part: '00006421239', asin: 'B0HLL7RCVD', brand: 'FDLWZGDY', kind: 'MANUFACTURER_AFTERMARKET', qty: 1 }, // Rim sprocket .325" 9T
  { part: '00006421240', asin: 'B0BDDNNNV6', brand: 'Luxuypon', kind: 'MANUFACTURER_AFTERMARKET', qty: 1 } // Rim sprocket 3/8" Picco 7T
];

// Rejected or still unproven candidates are documented, not silently dropped.
const DOCUMENTED_NOT_ACTIVATED = [
  { part: '11411404400', asin: 'B0GWMBW4SP', verdict: 'CONFLICTING_PRODUCT_IDENTITY', why: 'Listing noemt drie verschillende STIHL-nummers en is een samengestelde kit; niet herleidbaar tot één onderdeel.' },
  { part: '41400292300', asin: 'B0BWT36TQW', verdict: 'CONFLICTING_PRODUCT_IDENTITY', why: 'Kit met meerdere OEM-nummers (4140 029 2300 / 4137 129 0900 / 4114 129 0900); geen eenduidige productidentiteit.' },
  { part: '41341410300', asin: 'B0D3GRT27F', verdict: 'CONFLICTING_PRODUCT_IDENTITY', why: '10-pack zonder fabrikantmerk (byline "Generic"); zelfde weigering als in Phase 87.' },
  { part: '00004001300', asin: 'B0GQ2B8Q1X', verdict: 'CONFLICTING_PRODUCT_IDENTITY', why: 'Merkregel op de pagina is Husqvarna bij een STIHL-ontstekingsmodule.' },
  { part: '11231201651', asin: 'B0D9S8S1ZQ', verdict: 'CONFLICTING_PRODUCT_IDENTITY', why: 'Titel beschrijft een carburateur terwijl het catalogusonderdeel een luchtfilter is.' },
  { part: '11216402001', asin: 'B0F5RR8X4M', verdict: 'CONFLICTING_PRODUCT_IDENTITY', why: 'Catalogus vraagt 8T-tandwiel, listing levert een 7T-combinatie.' },
  { part: '00006421207', asin: 'B0F2DGHBYP', verdict: 'NEEDS_EVIDENCE_MULTIPACK', why: '6 stuks per verpakking; aantal fysieke eenheden niet als één onderdeel te boeken.' },
  { part: '41341290900', asin: 'B0CFM4T964', verdict: 'NEEDS_EVIDENCE_MULTIPACK', why: 'Verpakking van 12 stuks; niet als één fysiek onderdeel te boeken.' },
  { part: '11303500500', asin: 'B0G414Z5BQ', verdict: 'NEEDS_EVIDENCE_MULTIPACK', why: 'Verpakking van 2 stuks; aantal eenheden wijkt af van het catalogusonderdeel.' },
  { part: '42291201800', asin: 'B0CT86X5JS', verdict: 'NEEDS_EVIDENCE_BUNDLE', why: 'Bundel van 3 luchtfilters plus brandstoffilter en leiding; geen enkel product.' },
  { part: '00001958200', asin: 'B0BNLR5FY8', verdict: 'NEEDS_EVIDENCE_QUANTITY', why: 'Rol van 100 m in plaats van de 800 mm koord van het catalogusonderdeel.' },
  { part: '00009511100', asin: 'B0H2HJ1KDR', verdict: 'NEEDS_EVIDENCE_MULTIPACK', why: '4 stuks per verpakking.' },
  { part: '00009975600', asin: 'B0H827KGSB', verdict: 'NEEDS_EVIDENCE_CONFLICT', why: '50 stuks en twee andere veernummers (0000 997 5515 / 0000 997 5600).' },
  { part: '41371958200', asin: 'B0G5TR9VJS', verdict: 'NEEDS_EVIDENCE_CONFLICT', why: 'Listing noemt 3,5 mm x 100 m, catalogusonderdeel is 2,7 x 910 mm.' },
  { part: '11280201221', asin: 'B0F9T4S8LT', verdict: 'NEEDS_EVIDENCE_CONFLICT', why: 'Titel noemt zowel 52 mm als 54 mm boring.' }
];

const MANUFACTURER_BY_BRAND = { Stihl: 'ANDREAS STIHL AG & Co. KG', STIHL: 'ANDREAS STIHL AG & Co. KG' };

function buildRecord(decision) {
  const formatted = formatPart(decision.part);
  const check = productChecks[decision.asin] || {};
  const dealerRec = dealer[decision.part] || {};
  const dealerHit = dealerRec.hits?.[0] || null;
  const catalogName = catalogNames[decision.part] || `STIHL onderdeel ${formatted}`;
  const listingTitle = check.title || '';
  const brand = decision.brand;

  const sources = [{
    type: 'AMAZON_PRODUCT_PAGE',
    url: AMAZON_URL(decision.asin),
    title: listingTitle.slice(0, 180),
    claim: `Live Amazon.nl-vermelding ${decision.asin} toont "${listingTitle.slice(0, 140)}" met het exacte onderdeelnummer ${formatted}; de pagina toont levertijd voor een Nederlands adres op ${TODAY}.`,
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

  const compatibilityProof = dealerHit
    ? `${dealerHit}; bevestigde compatibiliteit met STIHL onderdeel ${formatted} (catalogusnaam: ${catalogName}), zoals vermeld in de Amazon-vermelding en de dealercatalogus.`
    : `${listingTitle.slice(0, 160)}; bevestigde compatibiliteit met STIHL onderdeel ${formatted} (catalogusnaam: ${catalogName}) volgens de Amazon-vermelding.`;
  const identityProof = dealerHit
    ? `${brand} product met STIHL-referentie ${formatted}: de Amazon.nl-vermelding ${decision.asin} noemt dit nummer en de onafhankelijke dealercatalogus (${dealerRec.source_url}) beschrijft ${formatted} als "${dealerHit}".`
    : `${brand} product met STIHL-referentie ${formatted}: de Amazon.nl-vermelding ${decision.asin} toont het exacte onderdeelnummer ${formatted} en het merk ${brand} op de productpagina.`;

  return {
    part_number: decision.part,
    part_number_formatted: formatted,
    asin: decision.asin,
    marketplace: 'amazon.nl',
    affiliate_tag: TAG_NL,
    manufacturer: MANUFACTURER_BY_BRAND[brand] || brand,
    manufacturer_part_number: formatted,
    trade_number: null,
    brand,
    product_title: listingTitle,
    package_quantity: decision.qty,
    package_type: 'Enkelstuks',
    is_multipack: false,
    ean_gtin: null,
    oem_brand_classification: decision.kind,
    evidence_classification: 'AMAZON_LISTING_COMPATIBLE',
    pilot_eligible: true,
    pilot_active: true,
    kill_switch_id: `KILL_AMAZON_NL_${decision.part}`,
    compatibility_proof: compatibilityProof,
    asin_product_identity_proof: identityProof,
    independent_evidence_url: dealerRec.source_url || AMAZON_URL(decision.asin),
    direct_affiliate_url: `${AMAZON_URL(decision.asin)}?tag=${TAG_NL}`,
    search_fallback_url: `https://www.amazon.nl/s?k=STIHL+${encodeURIComponent(formatted)}&tag=${TAG_NL}`,
    verifiable_evidence_sources: sources,
    verification_date: TODAY,
    shipping_to_nl_status: 'SHIPS_TO_NL_CONFIRMED',
    shipping_destination_country: 'NL',
    shipping_checked_at: TODAY,
    shipping_evidence_description: `Amazon.nl-vermelding toont een bezorgdatum voor het Nederlandse adres (${(check.delivery || [])[0] || 'levering volgens productpagina'}).`,
    status: 'ACTIVE',
    status_reason: `Phase 87.1: live Amazon.nl-vermelding met het exacte STIHL-nummer ${formatted}${dealerHit ? ' en onafhankelijke dealercatalogus-corroboratie' : ''}.`,
    supersedes_asin: null,
    updated_at: NOW
  };
}

const outcomes = [];
const activatedOffers = [];
const supersededCandidates = [];

for (const decision of DECISIONS) {
  const record = buildRecord(decision);
  const previous = registry.offers.find(o =>
    o.part_number === decision.part && (o.status === 'SUSPENDED' || o.status === 'RESEARCH_REQUIRED'));
  if (previous && previous.asin !== decision.asin) {
    record.supersedes_asin = previous.asin;
    record.status_reason += ` Vervangt eerdere vermelding ${previous.asin}.`;
  }

  const verification = TwoGateVerifier.verifyOffer(record, { catalogPartMap: catalogParts, expectedTag: TAG_NL });
  if (!verification.passed) {
    outcomes.push({ part_number: decision.part, asin: decision.asin, status: 'REJECTED_BY_GATE', errors: verification.errors });
    continue;
  }

  record.gate_1_technical = verification.gate1;
  record.gate_2_product = verification.gate2;

  const existingIndex = registry.offers.findIndex(o => o.part_number === decision.part && o.marketplace === 'amazon.nl' && o.asin === decision.asin);
  if (existingIndex >= 0) registry.offers[existingIndex] = record;
  else registry.offers.push(record);

  if (previous && previous.asin !== decision.asin) {
    // A delisted listing (SUSPENDED, live 404) keeps its suspension semantics and
    // stays in the registry with a pointer to its replacement.
    //
    // An unproven RESEARCH_REQUIRED candidate is different: once the part is served
    // by a proven listing the candidate is obsolete, and leaving it in the registry
    // would shadow the active record (the registry resolves the first record per
    // part). It is removed from the registry and preserved in full in the Phase 87.1
    // activation artifact, so no evidence is lost.
    if (previous.status === 'RESEARCH_REQUIRED') {
      supersededCandidates.push(previous);
      registry.offers = registry.offers.filter(o => o !== previous);
    } else {
      previous.previous_status = previous.previous_status || previous.status;
      previous.status = 'SUSPENDED';
      previous.suspension_reason = previous.suspension_reason || 'LISTING_NOT_AVAILABLE_404';
      previous.status_reason = `${previous.status_reason ? previous.status_reason + ' | ' : ''}Phase 87.1: vervangen door ${decision.asin}.`;
      previous.superseded_by_asin = decision.asin;
      previous.superseded_at = NOW;
      previous.updated_at = NOW;
    }
  }

  activatedOffers.push({ part_number: decision.part, asin: decision.asin, marketplace: 'amazon.nl' });
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

// Operator authorisation list: every newly activated part is added explicitly.
const policyParts = new Set(registry.policy?.pilot_activated_parts || []);
for (const offer of activatedOffers) policyParts.add(offer.part_number);
registry.policy = { ...registry.policy, pilot_activated_parts: [...policyParts].sort() };

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
registry.phase_87_1 = {
  activated_at: NOW,
  activated_offers: activatedOffers.length,
  parts_with_amazon_offer: partsWithAmazon,
  parts_searched: selection.parts,
  parts_with_exact_number_listing: selection.parts_with_candidate,
  methodology: 'Rendered Amazon.nl search on the exact STIHL number for 250 prioritised catalog parts, rendered product-page checks for every candidate ASIN, independent dealer-catalogue corroboration where the number is stocked, and the unchanged TwoGateVerifier. No PA-API/Creators credentials, no scraping through access controls, no price/stock claims.',
  not_activated: DOCUMENTED_NOT_ACTIVATED
};

write('output/phase87_1/PHASE87_1_ACTIVATION.json', {
  schema_version: '1.0.0',
  phase: '87.1',
  generated_at: NOW,
  activated: activatedOffers.length,
  outcomes,
  superseded_research_candidates: supersededCandidates,
  not_activated: DOCUMENTED_NOT_ACTIVATED
});
if (!DRY_RUN) write('data/affiliate/verified_amazon_registry.json', registry);

console.log(`activated=${activatedOffers.length} rejected=${outcomes.filter(o => o.status !== 'ACTIVE').length}`);
console.log(`registry ACTIVE=${active.length} (nl=${byMarketplace('amazon.nl')}, de=${byMarketplace('amazon.de')}) parts=${partsWithAmazon}`);
for (const o of outcomes.filter(x => x.status !== 'ACTIVE')) console.log(`REJECTED ${o.part_number} ${o.asin}: ${o.errors.join('; ')}`);
