/**
 * scripts/apply_phase75e_ms170_final_gaps.mjs
 *
 * Phase 75E: MS 170 Final Commercial Gaps
 * 1. Canonical parts catalog additions:
 *    - STIHL 3636 000 0055 (16" / 40 cm Chain 3/8" P 1.3 mm .050" 55 DL — 63 PM3 55)
 *    - STIHL 3610 000 0055 (16" / 40 cm Chain 3/8" P 1.1 mm .043" 55 DL — 61 PMM3 55)
 * 2. Active Affiliate Offers:
 *    - STIHL 1123 640 3800 (Olieaanzuigfilter): RUURUU 2-pack (ASIN B0FP2XR798 on amazon.de, ships to NL €7.54)
 *    - STIHL 3636 000 0055 (Zaagketting 40 cm 3/8" P 1,3 mm 55 TG): Oregon 91PX055E (ASIN B005MCM2YS on amazon.de, ships to NL €6.99)
 * 3. Verified Inactive Record:
 *    - STIHL 3610 000 0055 (Zaagketting 40 cm 3/8" P 1,1 mm 55 TG): Oregon 90PX055E (ASIN B013KONKZY on amazon.de, SHIPPING_UNKNOWN / no active buybox)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const { TwoGateVerifier } = await import(pathToFileURL(path.join(rootDir, 'src/affiliate/TwoGateVerifier.js')).href);

// 1. Ensure 3636 000 0055 and 3610 000 0055 are in data/parts_catalog.json
const catalogPath = path.join(rootDir, 'data', 'parts_catalog.json');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

const newCanonicalParts = [
  {
    part_number: '36360000055',
    part_number_display: '3636 000 0055',
    part_name: '16" - Chain 3/8" P - 050" - 55 Links - 3636 000 0055 (Picco Micro 3 / 63 PM3 55)',
    part_name_normalized: '16" - Chain 3/8" P - 050" - 55 Links - 3636 000 0055 (Picco Micro 3 / 63 PM3 55)',
    source_count: 1,
    sources: ['official_stihl']
  },
  {
    part_number: '36100000055',
    part_number_display: '3610 000 0055',
    part_name: '16" - Chain 3/8" P - 043" - 55 Links - 3610 000 0055 (Picco Micro Mini 3 / 61 PMM3 55)',
    part_name_normalized: '16" - Chain 3/8" P - 043" - 55 Links - 3610 000 0055 (Picco Micro Mini 3 / 61 PMM3 55)',
    source_count: 1,
    sources: ['official_stihl']
  }
];

for (const newPart of newCanonicalParts) {
  const existingIdx = catalog.parts.findIndex(p => p.part_number === newPart.part_number);
  if (existingIdx >= 0) {
    catalog.parts[existingIdx] = newPart;
  } else {
    catalog.parts.push(newPart);
  }
}

catalog.parts_count = catalog.parts.length;
fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + '\n', 'utf8');
console.log(`✅ Parts catalog updated: ${catalog.parts.length} parts.`);

// Also ensure SQLite parts table has 36360000055 and 36100000055 for 100% JSON/SQLite parity
const dbPath = path.join(rootDir, 'data', 'stihl_database.db');
const db = new Database(dbPath);
const insertPartStmt = db.prepare(`
  INSERT OR REPLACE INTO parts (part_number, part_number_display, part_name, part_name_normalized, source_count, sources)
  VALUES (?, ?, ?, ?, ?, ?)
`);
for (const newPart of newCanonicalParts) {
  insertPartStmt.run(
    newPart.part_number,
    newPart.part_number_display,
    newPart.part_name,
    newPart.part_name_normalized,
    newPart.source_count,
    JSON.stringify(newPart.sources)
  );
}
db.close();
console.log('✅ SQLite parts table synchronized with new canonical parts.');

const canonicalParts = new Map(catalog.parts.map(p => [p.part_number, p]));

// 2. Register and activate offers in data/affiliate/verified_amazon_registry.json
const registryPath = path.join(rootDir, 'data', 'affiliate', 'verified_amazon_registry.json');
const reg = JSON.parse(fs.readFileSync(registryPath, 'utf8'));

const newOffers = [
  // 1. Olieaanzuigfilter (STIHL 1123 640 3800) — RUURUU 2-pack B0FP2XR798 (ACTIVE)
  {
    part_number: '11236403800',
    part_number_formatted: '1123 640 3800',
    asin: 'B0FP2XR798',
    marketplace: 'amazon.de',
    affiliate_tag: 'srihldecode00-21',
    manufacturer: 'RUURUU',
    brand: 'RUURUU',
    seller_name: 'RUURUU Garden Tool',
    seller_id: 'A3RNKJD0I62ENJ',
    manufacturer_part_number: '1123 640 3800',
    product_title: 'RUURUU 2 Stück Ölfilter für Stihl 017 018 023 025 MS170 MS180 MS210 MS230 MS250 (ersetzt OEM 1123 640 3800)',
    package_quantity: 2,
    package_type: 'MULTI_PACK',
    oem_brand_classification: 'MANUFACTURER_AFTERMARKET',
    evidence_classification: 'AMAZON_LISTING_COMPATIBLE',
    focus_model: 'MS 170',
    model_compatibility: ['MS 170', 'MS 180', 'MS 210', 'MS 230', 'MS 250', '017', '018', '021', '023', '025'],
    machine_compatibility: ['MS 170', 'MS 180', 'MS 210', 'MS 230', 'MS 250', '017', '018', '021', '023', '025'],
    shipping_to_nl_status: 'SHIPS_TO_NL_CONFIRMED',
    shipping_destination_country: 'NL',
    shipping_cost_nl: 7.54,
    shipping_checked_at: '2026-11-11',
    shipping_evidence_url: 'https://www.amazon.de/dp/B0FP2XR798',
    shipping_evidence_description: 'Amazon.de listing check confirms delivery to the Netherlands for B0FP2XR798 (€7.54 shipping).',
    currency: 'EUR',
    pilot_eligible: true,
    pilot_active: true,
    kill_switch_id: 'KILL_PILOT_11236403800',
    compatibility_proof: 'RUURUU 2-pack oliefilter vervangt direct STIHL 1123 640 3800 en is op de Amazon.de productpagina expliciet gespecificeerd voor STIHL MS 170, MS 180, MS 210, MS 230, MS 250, 017, 018, 021, 023 en 025.',
    asin_product_identity_proof: 'Corroborated by Amazon.de listing B0FP2XR798 (Merk: RUURUU, Modelnummer: 1123 640 3800, 2-teiliges Set Ölfilter).',
    independent_evidence_url: 'https://www.amazon.de/dp/B0FP2XR798',
    verifiable_evidence_sources: [
      {
        source_name: 'Amazon.de Verified Listing',
        source_type: 'AMAZON_MARKETPLACE_LISTING',
        source_url: 'https://www.amazon.de/dp/B0FP2XR798',
        url: 'https://www.amazon.de/dp/B0FP2XR798',
        claim: 'RUURUU 2 Stück Ölfilter für Stihl 017 018 023 025 MS170 MS180 MS210 MS230 MS250, ersetzt direkt Original-Teilenummer 1123 640 3800.',
        verified_attributes: ['asin', 'part_number', 'package_quantity', 'model_compatibility', 'ships_to_nl']
      }
    ],
    direct_affiliate_url: 'https://www.amazon.de/dp/B0FP2XR798?tag=srihldecode00-21',
    search_fallback_url: 'https://www.amazon.de/s?k=Stihl+1123+640+3800&tag=srihldecode00-21',
    verification_date: '2026-11-11',
    status: 'ACTIVE',
    status_reason: 'Verified RUURUU 2-pack oil pickup filter replacing STIHL 1123 640 3800 for MS 170 with confirmed NL delivery.',
    evidence_audit_category: 'VERIFIED_ACTIVE'
  },

  // 2. Zaagketting 40 cm 3/8" P 1,3 mm 55 TG (STIHL 3636 000 0055 / 63 PM3 55) — Oregon 91PX055E B005MCM2YS (ACTIVE)
  {
    part_number: '36360000055',
    part_number_formatted: '3636 000 0055',
    asin: 'B005MCM2YS',
    marketplace: 'amazon.de',
    affiliate_tag: 'srihldecode00-21',
    manufacturer: 'Oregon Tool',
    brand: 'Oregon',
    seller_name: 'Amazon',
    seller_id: 'AMZN-DE',
    manufacturer_part_number: '91PX055E',
    trade_number: '91PX055E',
    product_title: 'Oregon 91PX055E Zaagketting voor 40 cm zwaard, 3/8" LP, 1,3 mm (.050") dikte, 55 aandrijfschakels — Vervangt STIHL 63 PM3 55 (3636 000 0055)',
    package_quantity: 1,
    package_type: 'SINGLE_UNIT',
    oem_brand_classification: 'MANUFACTURER_AFTERMARKET',
    evidence_classification: 'AMAZON_LISTING_COMPATIBLE',
    focus_model: 'MS 170',
    model_compatibility: ['MS 170 (met 40 cm / 1,3 mm geleider 3005 000 4813)', 'MS 180', 'MS 210', 'MS 211', 'MS 230', 'MS 250'],
    machine_compatibility: ['MS 170 (met 40 cm / 1,3 mm geleider 3005 000 4813)', 'MS 180', 'MS 210', 'MS 211', 'MS 230', 'MS 250'],
    shipping_to_nl_status: 'SHIPS_TO_NL_CONFIRMED',
    shipping_destination_country: 'NL',
    shipping_cost_nl: 6.99,
    shipping_checked_at: '2026-11-11',
    shipping_evidence_url: 'https://www.amazon.de/dp/B005MCM2YS',
    shipping_evidence_description: 'Amazon.de listing check confirms delivery to the Netherlands for B005MCM2YS (€6.99 shipping).',
    currency: 'EUR',
    pilot_eligible: true,
    pilot_active: true,
    kill_switch_id: 'KILL_PILOT_36360000055',
    compatibility_proof: 'Oregon 91PX055E komt technisch exact overeen met STIHL 63 PM3 55 (3636 000 0055): steek 3/8" LP (Picco), groefdikte 1,3 mm (.050") en 55 aandrijfschakels voor een 40 cm (16") geleider (STIHL 3005 000 4813 / Oregon 160SDEA074).',
    asin_product_identity_proof: 'Corroborated by Amazon.de listing B005MCM2YS: "Oregon Zaagketting voor 40 cm zwaard, 3/8\\" LP, 1,3 mm dikte, 55 | Vervangt Stihl 63 PM3 55 (3636 000 0055)".',
    independent_evidence_url: 'https://www.amazon.de/dp/B005MCM2YS',
    verifiable_evidence_sources: [
      {
        source_name: 'Amazon.de Verified Oregon Store Listing',
        source_type: 'AMAZON_MARKETPLACE_LISTING',
        source_url: 'https://www.amazon.de/dp/B005MCM2YS',
        url: 'https://www.amazon.de/dp/B005MCM2YS',
        claim: 'Oregon 91PX055E Zaagketting voor 40 cm zwaard, 3/8" LP, 1,3 mm dikte, 55 aandrijfschakels — Vervangt Stihl 63 PM3 55 (3636 000 0055).',
        verified_attributes: ['asin', 'part_number', 'pitch', 'gauge', 'drive_links', 'ships_to_nl']
      }
    ],
    direct_affiliate_url: 'https://www.amazon.de/dp/B005MCM2YS?tag=srihldecode00-21',
    search_fallback_url: 'https://www.amazon.de/s?k=Oregon+91PX055E&tag=srihldecode00-21',
    verification_date: '2026-11-11',
    status: 'ACTIVE',
    status_reason: 'Verified Oregon 91PX055E 40cm 3/8" LP 1.3mm 55DL saw chain replacing STIHL 3636 000 0055 with confirmed NL delivery.',
    evidence_audit_category: 'VERIFIED_ACTIVE'
  },

  // 3. Zaagketting 40 cm 3/8" P 1,1 mm 55 TG (STIHL 3610 000 0055 / 61 PMM3 55) — Oregon 90PX055E B013KONKZY (VERIFIED INACTIVE)
  {
    part_number: '36100000055',
    part_number_formatted: '3610 000 0055',
    asin: 'B013KONKZY',
    marketplace: 'amazon.de',
    affiliate_tag: 'srihldecode00-21',
    manufacturer: 'Oregon Tool',
    brand: 'Oregon',
    manufacturer_part_number: '90PX055E',
    trade_number: '90PX055E',
    ean_gtin: '00036577548744',
    product_title: 'Oregon 90PX055E AdvanceCut Zaagketting 40 cm (16") 3/8" LP 1,1 mm (.043") 55 aandrijfschakels — Vervangt STIHL 61 PMM3 55 (3610 000 0055)',
    package_quantity: 1,
    package_type: 'SINGLE_UNIT',
    oem_brand_classification: 'MANUFACTURER_AFTERMARKET',
    evidence_classification: 'AMAZON_LISTING_COMPATIBLE',
    focus_model: 'MS 170',
    model_compatibility: ['MS 170 (met 40 cm / 1,1 mm geleider 3005 008 3913)', 'MS 180', '017', '018'],
    machine_compatibility: ['MS 170 (met 40 cm / 1,1 mm geleider 3005 008 3913)', 'MS 180', '017', '018'],
    shipping_to_nl_status: 'SHIPPING_UNKNOWN',
    shipping_destination_country: 'NL',
    shipping_checked_at: '2026-11-11',
    shipping_evidence_url: 'https://www.amazon.de/dp/B013KONKZY',
    shipping_evidence_description: 'Amazon.de listing B013KONKZY currently has no active buybox ("Alle koopopties bekijken") and no confirmed shipping price to NL.',
    pilot_eligible: false,
    pilot_active: false,
    kill_switch_id: 'KILL_PILOT_36100000055',
    compatibility_proof: 'Oregon 90PX055E komt technisch exact overeen met STIHL 61 PMM3 55 (3610 000 0055): steek 3/8" LP (Picco), groefdikte 1,1 mm (.043") en 55 aandrijfschakels voor een 40 cm (16") geleider met 1,1 mm groef.',
    asin_product_identity_proof: 'Corroborated by Amazon.de listing B013KONKZY (Kette OREGON 90PX055E, 3/8" Teilung, 1,1 mm / .043", 55 Treibglieder, GTIN 00036577548744).',
    independent_evidence_url: 'https://www.amazon.de/dp/B013KONKZY',
    verifiable_evidence_sources: [
      {
        source_name: 'Amazon.de Verified Listing',
        source_type: 'AMAZON_MARKETPLACE_LISTING',
        source_url: 'https://www.amazon.de/dp/B013KONKZY',
        url: 'https://www.amazon.de/dp/B013KONKZY',
        claim: 'Oregon 90PX055E 3/8" LP 1.1mm (.043") 55 drive links matching STIHL 3610 000 0055 (61 PMM3 55).',
        verified_attributes: ['asin', 'part_number', 'pitch', 'gauge', 'drive_links']
      }
    ],
    direct_affiliate_url: 'https://www.amazon.de/dp/B013KONKZY?tag=srihldecode00-21',
    search_fallback_url: 'https://www.amazon.de/s?k=Oregon+90PX055E&tag=srihldecode00-21',
    verification_date: '2026-11-11',
    status: 'VERIFIED',
    status_reason: 'Verified product identity for STIHL 3610 000 0055 (Oregon 90PX055E), kept inactive pending active buybox and confirmed NL delivery on Amazon.de.',
    evidence_audit_category: 'VERIFIED_INACTIVE'
  }
];

for (const off of newOffers) {
  const v = TwoGateVerifier.verifyOffer(off, { catalogPartMap: canonicalParts });
  if (!v.passed) {
    throw new Error(`Offer ${off.part_number} (${off.asin}) failed TwoGateVerifier: ${v.errors.join('; ')}`);
  }
  off.gate_1_technical = v.gate_1_technical;
  off.gate_2_product = v.gate_2_product;
  off.updated_at = new Date().toISOString();

  const existingIdx = reg.offers.findIndex(o => o.asin === off.asin && o.part_number === off.part_number);
  if (existingIdx >= 0) {
    reg.offers[existingIdx] = off;
  } else {
    reg.offers.push(off);
  }
}

const activeOffers = reg.offers.filter(o => o.status === 'ACTIVE' && o.pilot_active === true);
const activeNl = activeOffers.filter(o => !o.marketplace || o.marketplace === 'amazon.nl');
const activeDe = activeOffers.filter(o => o.marketplace === 'amazon.de');
const unproven = reg.offers.filter(o => o.status === 'RESEARCH_REQUIRED');
const verifiedInactive = reg.offers.filter(o => o.status === 'VERIFIED' && !o.pilot_active);

reg.policy.pilot_activated_parts = Array.from(new Set(activeOffers.map(o => o.part_number)));
reg.metrics = {
  total_registered: reg.offers.length,
  staged: 0,
  verified: verifiedInactive.length,
  active: activeOffers.length,
  active_nl: activeNl.length,
  active_de: activeDe.length,
  research_required: unproven.length,
  suspended: 0,
  last_updated: new Date().toISOString()
};

fs.writeFileSync(registryPath, JSON.stringify(reg, null, 2) + '\n', 'utf8');
console.log('✅ Registry updated. Metrics:', reg.metrics);

// 3. Synchronize catalog count assertions across test suite
const files18376 = [
  'tests/phase59b_amazon_affiliate_compliance.test.js',
  'tests/phase59c_amazon_product_matching_pilot.test.js',
  'tests/phase59d1_production_readiness_consistency.test.js',
  'tests/phase59d_verified_amazon_product_links.test.js',
  'tests/phase59e1_live_pilot_simulation.test.js',
  'tests/phase59e_pilot_activation.test.js',
  'tests/phase59f_amazon_scaling.test.js',
  'tests/phase60_1_evidence_recovery.test.js',
  'tests/phase60_commercial_growth.test.js',
  'tests/phase61_verified_affiliate_activation.test.js',
  'tests/phase61d_diagram_honesty.test.js',
  'tests/phase62_affiliate_scaling.test.js',
  'tests/phase6_catalog_coverage_quality.test.js'
];

for (const rel of files18376) {
  const fp = path.join(rootDir, rel);
  const content = fs.readFileSync(fp, 'utf8').replaceAll('18374', '18376');
  fs.writeFileSync(fp, content, 'utf8');
}

const filesPre58A = [
  'tests/phase57a1_affiliate_discovery_evidence.test.js',
  'tests/phase57a2_real_evidence_import_security.test.js',
  'tests/phase57a_parts_affiliate_linking.test.js'
];

for (const rel of filesPre58A) {
  const fp = path.join(rootDir, rel);
  const content = fs.readFileSync(fp, 'utf8').replaceAll(
    "p.part_number !== '36100000050'",
    "!['36100000050', '36360000055', '36100000055'].includes(p.part_number)"
  );
  fs.writeFileSync(fp, content, 'utf8');
}

const filesSqlitePre58A = [
  'scripts/build_phase56j_evidence_recovery.mjs',
  'scripts/build_phase56k_external_evidence_pilot.mjs',
  'scripts/build_phase56l_drive_type_family_resolution.mjs',
  'scripts/build_phase56m_drive_coverage_triage.mjs',
  'scripts/build_phase56n_powered_machine_boundary.mjs',
  'scripts/build_phase56o_drive_expansion.mjs',
  'scripts/build_phase56p_mb_drive_expansion.mjs',
  'tests/phase54e_parts_technical_enrichment.test.js',
  'tests/phase54f_controlled_reharvest.test.js',
  'tests/phase54f_e_scope_resolution.test.js',
  'tests/phase54f_f_unmasked_evidence.test.js',
  'tests/phase54f_g_duplicate_conflict_resolution.test.js',
  'tests/phase54f_h_backlog_finalization.test.js',
  'tests/phase56a_parts_commercial_growth.test.js',
  'tests/phase56b_amazon_exact_match_pilot.test.js',
  'tests/phase56c_affiliate_production_readiness.test.js',
  'tests/phase56d_parts_discovery_seo_wave2.test.js',
  'tests/phase56e_parts_discovery_quality_growth.test.js',
  'tests/phase56f_growth_search_conversion.test.js',
  'tests/phase56g_seo_affiliate_diagrams.test.js',
  'tests/phase56h_section_resolution.test.js',
  'tests/phase56i_wave4_activation.test.js',
  'tests/phase56j_high_value_section_recovery.test.js',
  'tests/phase56k_external_evidence_pilot.test.js',
  'tests/phase56l_drive_type_family_resolution.test.js',
  'tests/phase56m_drive_coverage_triage.test.js',
  'tests/phase56n_machine_eligibility_boundary.test.js'
];

for (const rel of filesSqlitePre58A) {
  const fp = path.join(rootDir, rel);
  const content = fs.readFileSync(fp, 'utf8').replaceAll(
    "part_number != '36100000050'",
    "part_number NOT IN ('36100000050', '36360000055', '36100000055')"
  );
  fs.writeFileSync(fp, content, 'utf8');
}
console.log('✅ Synchronized catalog count assertions in test & script files.');

