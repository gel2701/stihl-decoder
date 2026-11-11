/**
 * scripts/apply_phase75f_ms180_coverage.mjs
 *
 * Phase 75F: STIHL MS 180 Commercial Coverage (10 Core Categories)
 *
 * 1. Canonical parts catalog addition:
 *    - STIHL 3636 000 0044 (12" / 30 cm Chain 3/8" P 1.3 mm .050" 44 DL — 63 PM3 44)
 * 2. Reuse alignment:
 *    - Explicitly ensures MS 180 / 018 (with exact variant, bar/chain gauge & serial boundaries)
 *      is documented in model_compatibility and machine_compatibility across all 23 reusable
 *      MS 170 active offers covering the 10 core categories.
 * 3. Activates 8 proven MS 180 offers on Amazon.de (Sägenspezi & Bosch, confirmed NL shipping €10.00):
 *    - B00LAHKMBO (1130 140 2803): Sägenspezi Luftfilter mit Gehäuse alte Version passend für Stihl 018 MS180 MS 180
 *    - B077X8JMG9 (0000 400 7009): Sägenspezi Zündkerze Bosch USR7AC passend für Stihl MS 180 MS180 (neues Modell, SW16 / 2-MIX)
 *    - B0723GG5VR (3636 000 0044): 30cm Sägenspezi Kette (Vollmeißel) 3/8"P 44TG 1,3mm passend für Stihl 018 MS 180 MS180
 *    - B071J6WTSR (3636 000 0050): 35cm Sägenspezi Kette (Vollmeißel) 3/8"P 50TG 1,3mm passend für Stihl 018 MS 180 MS180
 *    - B07R9J97NQ (3610 000 0050): 35cm Sägenspezi Kette (Vollmeißel) 3/8"PM 50TG 1,1mm passend für Stihl 018 MS 180 MS180
 *    - B00LAHPOXA (1123 640 2073, corrected from 1123 640 2074): Sägenspezi Kettenrad 3/8" 6Z passend für Stihl 018 MS180 MS 180
 *    - B074CH7JFY (1130 120 0603): Sägenspezi Vergaser mit Kompensatoranschluss 3 Einstellschrauben passend für Stihl 018 MS 180 MS180
 *    - B00LAHQFX8 (1130 120 0608): Sägenspezi Vergaser mit Kompensatoranschluss 1 Einstellschraube passend für Stihl 018 MS 180 MS180 baugleich ZAMA
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const { TwoGateVerifier } = await import(pathToFileURL(path.join(rootDir, 'src/affiliate/TwoGateVerifier.js')).href);

// 1. Ensure 3636 000 0044 is in data/parts_catalog.json and SQLite parts table
const catalogPath = path.join(rootDir, 'data', 'parts_catalog.json');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

const newCanonicalParts = [
  {
    part_number: '36360000044',
    part_number_display: '3636 000 0044',
    part_name: '12" - Chain 3/8" P - 050" - 44 Links - 3636 000 0044 (Picco Micro 3 / 63 PM3 44)',
    part_name_normalized: '12" - Chain 3/8" P - 050" - 44 Links - 3636 000 0044 (Picco Micro 3 / 63 PM3 44)',
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
console.log('✅ SQLite parts table synchronized with 3636 000 0044.');

const canonicalParts = new Map(catalog.parts.map(p => [p.part_number, p]));

// 2. Update data/affiliate/verified_amazon_registry.json
const registryPath = path.join(rootDir, 'data', 'affiliate', 'verified_amazon_registry.json');
const reg = JSON.parse(fs.readFileSync(registryPath, 'utf8'));

// Remove stale/incorrectly mapped VERIFIED record for B00LAHPOXA under 11236402074 (.325" 7T)
reg.offers = reg.offers.filter(o => !(o.asin === 'B00LAHPOXA' && o.part_number === '11236402074'));

// 2a. Reuse alignment: ensure existing MS 170 active offers that also fit MS 180 explicitly document MS 180 compatibility
const reuseCompatibilityUpdates = new Map([
  ['B001RM8J76', ['MS 170 (zonder 2-MIX)', 'MS 180 (zonder 2-MIX)', '017', '018', 'MS 210', 'MS 230', 'MS 250', 'FS 55', 'BG 86']],
  ['B0068M5NAG', ['MS 170 (zonder 2-MIX)', 'MS 180 (zonder 2-MIX)', '017', '018', 'MS 210', 'MS 230', 'MS 250', 'FS 55']],
  ['B001RMA5S2', ['MS 170 2-MIX', 'MS 180 2-MIX', 'FS 55 2-MIX', 'FS 460', 'BR 600', 'BG 86']],
  ['B09QH68W83', ['MS 170 2-MIX', 'MS 180 2-MIX', 'FS 38', 'FS 55', 'HS 45', 'BG 86', 'BR 600']],
  ['B0874SJ4CK', ['MS 170', 'MS 180', '017', '018', 'MS 210', 'MS 230', 'MS 250', 'FS 55']],
  ['B002X3IIYC', ['MS 170', 'MS 180 (met 30 cm / 1,1 mm geleider 3005 000 3905)', '017', '018', 'MS 171', 'MS 181']],
  ['B00HQ63YUY', ['MS 170', 'MS 180 (met 35 cm / 1,1 mm geleider 3005 000 3909)', '017', '018', 'MS 171', 'MS 181']],
  ['B00FYRVGHU', ['MS 180 (standaard 35 cm / 1,3 mm geleider 3005 000 4809)', '018', 'MS 170 (met 35 cm / 1,3 mm geleider 3005 000 4809)', 'MS 210', 'MS 230', 'MS 250']],
  ['B007QJL16A', ['MS 180 (met 35 cm / 1,3 mm geleider 3005 000 4809)', '018', 'MS 170 (met 35 cm / 1,3 mm geleider 3005 000 4809)', 'MS 210', 'MS 230', 'MS 250']],
  ['B001FUALX0', ['MS 180 (standaard 35 cm / 1,3 mm)', '018', 'MS 170 (met 1,3 mm ketting)', 'MS 210', 'MS 230', 'MS 250']],
  ['B002VAAQC4', ['MS 180 (met 40 cm / 1,3 mm ketting 3636 000 0055)', '018', 'MS 170 (met 40 cm / 1,3 mm ketting 3636 000 0055)', 'MS 210', 'MS 230', 'MS 250']],
  ['B00LAHPOEO', ['MS 170', 'MS 180', '017', '018']],
  ['B00LAHQK2Y', ['MS 170 (zonder 2-MIX)', 'MS 180 (zonder 2-MIX, zonder compensator)', '017', '018']],
  ['B074CJTFJY', ['MS 170 (zonder 2-MIX)', 'MS 180 (zonder 2-MIX, met compensator)', '017', '018']]
]);

for (const offer of reg.offers) {
  if (reuseCompatibilityUpdates.has(offer.asin)) {
    const compat = reuseCompatibilityUpdates.get(offer.asin);
    offer.model_compatibility = compat;
    offer.machine_compatibility = compat;
  }
}

// 2b. 8 New Active Offers for MS 180 on Amazon.de (Sägenspezi & Bosch, confirmed shipping to NL)
const storePageUrl = 'https://www.amazon.de/stores/page/D3E472CD-96D0-49D1-A4F2-6EE8FE49BB43';

const newActiveOffers = [
  // 1. Cat 1 — Luchtfilter met behuizing (MS 180 zonder 2-MIX): STIHL 1130 140 2803 -> B00LAHKMBO
  {
    part_number: '11301402803',
    part_number_formatted: '1130 140 2803',
    asin: 'B00LAHKMBO',
    marketplace: 'amazon.de',
    affiliate_tag: 'srihldecode00-21',
    manufacturer: 'Sägenspezi',
    brand: 'Sägenspezi',
    seller_name: 'Sägenspezi',
    seller_id: 'A1GMRJIURBAM28',
    manufacturer_part_number: '1130-140-2803-SPEZI',
    product_title: 'Sägenspezi Luftfilter mit Gehäuse alte Version passend für Stihl 018 MS180 MS 180',
    package_quantity: 1,
    package_type: 'SINGLE_UNIT',
    oem_brand_classification: 'MANUFACTURER_AFTERMARKET',
    evidence_classification: 'AMAZON_LISTING_COMPATIBLE',
    focus_model: 'MS 180',
    model_compatibility: ['MS 180 (zonder 2-MIX / oude uitvoering)', '018'],
    machine_compatibility: ['MS 180 (zonder 2-MIX / oude uitvoering)', '018'],
    item_price: 9.49,
    shipping_to_nl_status: 'SHIPS_TO_NL_CONFIRMED',
    shipping_destination_country: 'NL',
    shipping_cost_nl: 10.00,
    shipping_checked_at: '2026-11-11',
    shipping_evidence_url: 'https://www.amazon.de/dp/B00LAHKMBO',
    shipping_evidence_description: 'Confirmed on official Sägenspezi Amazon.de MS 180 store page with NL destination (€9.49 item price + €10.00 Sägenspezi merchant shipping to NL).',
    currency: 'EUR',
    pilot_eligible: true,
    pilot_active: true,
    kill_switch_id: 'KILL_PILOT_DE_11301402803',
    compatibility_proof: 'Sägenspezi Luftfilter mit Gehäuse (alte Version) voor STIHL 018 en MS 180 zonder 2-MIX, vervangt het filterhuis STIHL 1130 140 2803 inclusief vliesfilter.',
    asin_product_identity_proof: 'Verified on official Sägenspezi Amazon.de Store (Geschikt voor Stihl 018 MS180): ASIN B00LAHKMBO "Sägenspezi Luftfilter mit Gehäuse alte Version passend für Stihl 018 MS180 MS 180".',
    independent_evidence_url: 'https://www.amazon.de/dp/B00LAHKMBO',
    verifiable_evidence_sources: [
      {
        source_name: 'Sägenspezi Official Store Amazon.de (018 / MS 180)',
        source_type: 'AMAZON_MARKETPLACE_LISTING',
        source_url: 'https://www.amazon.de/dp/B00LAHKMBO',
        url: storePageUrl,
        claim: 'Sägenspezi Luftfilter mit Gehäuse alte Version passend für Stihl 018 MS180 MS 180 (€9,49).',
        verified_attributes: ['asin', 'part_number', 'seller_id', 'model_compatibility', 'ships_to_nl']
      }
    ],
    direct_affiliate_url: 'https://www.amazon.de/dp/B00LAHKMBO?tag=srihldecode00-21',
    search_fallback_url: 'https://www.amazon.de/s?k=STIHL+1130+140+2803&tag=srihldecode00-21',
    verification_date: '2026-11-11',
    status: 'ACTIVE',
    status_reason: 'Verified Sägenspezi air filter with housing for STIHL 018 / MS 180 (non-2-MIX) with confirmed NL shipping.',
    evidence_audit_category: 'VERIFIED_ACTIVE'
  },

  // 2. Cat 2 — Bougie (MS 180 2-MIX, M10 / SW16): STIHL 0000 400 7009 -> Bosch USR7AC B077X8JMG9
  {
    part_number: '00004007009',
    part_number_formatted: '0000 400 7009',
    asin: 'B077X8JMG9',
    marketplace: 'amazon.de',
    affiliate_tag: 'srihldecode00-21',
    manufacturer: 'Bosch Automotive Aftermarket',
    brand: 'Bosch',
    seller_name: 'Sägenspezi',
    seller_id: 'A1GMRJIURBAM28',
    manufacturer_part_number: 'USR7AC',
    product_title: 'Sägenspezi Zündkerze Bosch USR7AC passend für Stihl MS 180 MS180 (neues Modell, SW16)',
    package_quantity: 1,
    package_type: 'SINGLE_UNIT',
    oem_brand_classification: 'OEM_SUPPLIER_EQUIVALENT',
    evidence_classification: 'AMAZON_LISTING_COMPATIBLE',
    focus_model: 'MS 180',
    model_compatibility: ['MS 180 2-MIX (nieuw model, M10 / SW16)', 'MS 170 2-MIX'],
    machine_compatibility: ['MS 180 2-MIX (nieuw model, M10 / SW16)', 'MS 170 2-MIX'],
    item_price: 5.99,
    shipping_to_nl_status: 'SHIPS_TO_NL_CONFIRMED',
    shipping_destination_country: 'NL',
    shipping_cost_nl: 10.00,
    shipping_checked_at: '2026-11-11',
    shipping_evidence_url: 'https://www.amazon.de/dp/B077X8JMG9',
    shipping_evidence_description: 'Confirmed on official Sägenspezi Amazon.de MS 180 store page with NL destination (€5.99 item price + €10.00 Sägenspezi merchant shipping to NL).',
    currency: 'EUR',
    pilot_eligible: true,
    pilot_active: true,
    kill_switch_id: 'KILL_PILOT_DE_00004007009',
    compatibility_proof: 'Bosch USR7AC (M10x1,0 schroefdraad, sleutelwijdte SW16) komt exact overeen met STIHL 0000 400 7009 voor de STIHL MS 180 2-MIX (nieuw model).',
    asin_product_identity_proof: 'Verified on official Sägenspezi Amazon.de Store (Geschikt voor Stihl 018 MS180): ASIN B077X8JMG9 "Sägenspezi Zündkerze Bosch USR7AC passend für Stihl MS 180 MS180 (neues Modell, SW16)".',
    independent_evidence_url: 'https://www.amazon.de/dp/B077X8JMG9',
    verifiable_evidence_sources: [
      {
        source_name: 'Sägenspezi Official Store Amazon.de (018 / MS 180)',
        source_type: 'AMAZON_MARKETPLACE_LISTING',
        source_url: 'https://www.amazon.de/dp/B077X8JMG9',
        url: storePageUrl,
        claim: 'Sägenspezi Zündkerze Bosch USR7AC passend für Stihl MS 180 MS180 (neues Modell, SW16).',
        verified_attributes: ['asin', 'part_number', 'mpn', 'seller_id', 'model_compatibility', 'ships_to_nl']
      }
    ],
    direct_affiliate_url: 'https://www.amazon.de/dp/B077X8JMG9?tag=srihldecode00-21',
    search_fallback_url: 'https://www.amazon.de/s?k=STIHL+0000+400+7009&tag=srihldecode00-21',
    verification_date: '2026-11-11',
    status: 'ACTIVE',
    status_reason: 'Verified Bosch USR7AC spark plug via Sägenspezi for MS 180 2-MIX with confirmed NL shipping.',
    evidence_audit_category: 'VERIFIED_ACTIVE'
  },

  // 3. Cat 5 — Zaagketting 30 cm 3/8" P 1,3 mm 44 TG: STIHL 3636 000 0044 -> B0723GG5VR
  {
    part_number: '36360000044',
    part_number_formatted: '3636 000 0044',
    asin: 'B0723GG5VR',
    marketplace: 'amazon.de',
    affiliate_tag: 'srihldecode00-21',
    manufacturer: 'Sägenspezi',
    brand: 'Sägenspezi',
    seller_name: 'Sägenspezi',
    seller_id: 'A1GMRJIURBAM28',
    manufacturer_part_number: '3636-000-0044-SPEZI',
    product_title: '30cm Sägenspezi Kette (Vollmeißel) 3/8"P 44TG 1,3mm passend für Stihl 018 MS 180 MS180',
    package_quantity: 1,
    package_type: 'SINGLE_UNIT',
    oem_brand_classification: 'MANUFACTURER_AFTERMARKET',
    evidence_classification: 'AMAZON_LISTING_COMPATIBLE',
    focus_model: 'MS 180',
    model_compatibility: ['MS 180 (met 30 cm / 1,3 mm geleider 3005 000 4805)', '018', 'MS 170 (met 30 cm / 1,3 mm geleider 3005 000 4805)'],
    machine_compatibility: ['MS 180 (met 30 cm / 1,3 mm geleider 3005 000 4805)', '018', 'MS 170 (met 30 cm / 1,3 mm geleider 3005 000 4805)'],
    item_price: 6.99,
    shipping_to_nl_status: 'SHIPS_TO_NL_CONFIRMED',
    shipping_destination_country: 'NL',
    shipping_cost_nl: 10.00,
    shipping_checked_at: '2026-11-11',
    shipping_evidence_url: 'https://www.amazon.de/dp/B0723GG5VR',
    shipping_evidence_description: 'Confirmed on official Sägenspezi Amazon.de MS 180 store page with NL destination (€6.99 item price + €10.00 Sägenspezi merchant shipping to NL).',
    currency: 'EUR',
    pilot_eligible: true,
    pilot_active: true,
    kill_switch_id: 'KILL_PILOT_DE_36360000044',
    compatibility_proof: 'Sägenspezi 30 cm zaagketting met exacte specificaties voor STIHL 3636 000 0044 (63 PM3 44): kettingsteek 3/8" Picco, groefdikte 1,3 mm (.050") en 44 aandrijfschakels voor STIHL 018 / MS 180 met 30 cm 1,3 mm geleider.',
    asin_product_identity_proof: 'Verified on official Sägenspezi Amazon.de Store (Geschikt voor Stihl 018 MS180): ASIN B0723GG5VR "30cm Sägenspezi Kette (Vollmeißel) 3/8\\"P 44TG 1,3mm passend für Stihl 018 MS 180 MS180".',
    independent_evidence_url: 'https://www.amazon.de/dp/B0723GG5VR',
    verifiable_evidence_sources: [
      {
        source_name: 'Sägenspezi Official Store Amazon.de (018 / MS 180)',
        source_type: 'AMAZON_MARKETPLACE_LISTING',
        source_url: 'https://www.amazon.de/dp/B0723GG5VR',
        url: storePageUrl,
        claim: '30cm Sägenspezi Kette (Vollmeißel) 3/8"P 44TG 1,3mm passend für Stihl 018 MS 180 MS180 (€6,99).',
        verified_attributes: ['asin', 'part_number', 'pitch', 'gauge', 'drive_links', 'seller_id', 'ships_to_nl']
      }
    ],
    direct_affiliate_url: 'https://www.amazon.de/dp/B0723GG5VR?tag=srihldecode00-21',
    search_fallback_url: 'https://www.amazon.de/s?k=STIHL+3636+000+0044&tag=srihldecode00-21',
    verification_date: '2026-11-11',
    status: 'ACTIVE',
    status_reason: 'Verified Sägenspezi 30cm 3/8"P 1.3mm 44DL saw chain for STIHL 018 / MS 180 with confirmed NL shipping.',
    evidence_audit_category: 'VERIFIED_ACTIVE'
  },

  // 4. Cat 5 — Zaagketting 35 cm 3/8" P 1,3 mm 50 TG: STIHL 3636 000 0050 -> B071J6WTSR
  {
    part_number: '36360000050',
    part_number_formatted: '3636 000 0050',
    asin: 'B071J6WTSR',
    marketplace: 'amazon.de',
    affiliate_tag: 'srihldecode00-21',
    manufacturer: 'Sägenspezi',
    brand: 'Sägenspezi',
    seller_name: 'Sägenspezi',
    seller_id: 'A1GMRJIURBAM28',
    manufacturer_part_number: '3636-000-0050-SPEZI',
    product_title: '35cm Sägenspezi Kette (Vollmeißel) 3/8"P 50TG 1,3mm passend für Stihl 018 MS 180 MS180',
    package_quantity: 1,
    package_type: 'SINGLE_UNIT',
    oem_brand_classification: 'MANUFACTURER_AFTERMARKET',
    evidence_classification: 'AMAZON_LISTING_COMPATIBLE',
    focus_model: 'MS 180',
    model_compatibility: ['MS 180 (standaard 35 cm / 1,3 mm geleider 3005 000 4809)', '018', 'MS 170 (met 35 cm / 1,3 mm geleider 3005 000 4809)', 'MS 210', 'MS 230', 'MS 250'],
    machine_compatibility: ['MS 180 (standaard 35 cm / 1,3 mm geleider 3005 000 4809)', '018', 'MS 170 (met 35 cm / 1,3 mm geleider 3005 000 4809)', 'MS 210', 'MS 230', 'MS 250'],
    item_price: 7.99,
    shipping_to_nl_status: 'SHIPS_TO_NL_CONFIRMED',
    shipping_destination_country: 'NL',
    shipping_cost_nl: 10.00,
    shipping_checked_at: '2026-11-11',
    shipping_evidence_url: 'https://www.amazon.de/dp/B071J6WTSR',
    shipping_evidence_description: 'Confirmed on official Sägenspezi Amazon.de MS 180 store page with NL destination (€7.99 item price + €10.00 Sägenspezi merchant shipping to NL).',
    currency: 'EUR',
    pilot_eligible: true,
    pilot_active: true,
    kill_switch_id: 'KILL_PILOT_DE_36360000050',
    compatibility_proof: 'Sägenspezi 35 cm zaagketting met exacte specificaties voor STIHL 3636 000 0050 (63 PM3 50): kettingsteek 3/8" Picco, groefdikte 1,3 mm (.050") en 50 aandrijfschakels voor STIHL 018 / MS 180.',
    asin_product_identity_proof: 'Verified on official Sägenspezi Amazon.de Store (Geschikt voor Stihl 018 MS180): ASIN B071J6WTSR "35cm Sägenspezi Kette (Vollmeißel) 3/8\\"P 50TG 1,3mm passend für Stihl 018 MS 180 MS180".',
    independent_evidence_url: 'https://www.amazon.de/dp/B071J6WTSR',
    verifiable_evidence_sources: [
      {
        source_name: 'Sägenspezi Official Store Amazon.de (018 / MS 180)',
        source_type: 'AMAZON_MARKETPLACE_LISTING',
        source_url: 'https://www.amazon.de/dp/B071J6WTSR',
        url: storePageUrl,
        claim: '35cm Sägenspezi Kette (Vollmeißel) 3/8"P 50TG 1,3mm passend für Stihl 018 MS 180 MS180 (€7,99).',
        verified_attributes: ['asin', 'part_number', 'pitch', 'gauge', 'drive_links', 'seller_id', 'ships_to_nl']
      }
    ],
    direct_affiliate_url: 'https://www.amazon.de/dp/B071J6WTSR?tag=srihldecode00-21',
    search_fallback_url: 'https://www.amazon.de/s?k=STIHL+3636+000+0050&tag=srihldecode00-21',
    verification_date: '2026-11-11',
    status: 'ACTIVE',
    status_reason: 'Verified Sägenspezi 35cm 3/8"P 1.3mm 50DL saw chain for STIHL 018 / MS 180 with confirmed NL shipping.',
    evidence_audit_category: 'VERIFIED_ACTIVE'
  },

  // 5. Cat 5 — Zaagketting 35 cm 3/8" P 1,1 mm 50 TG: STIHL 3610 000 0050 -> B07R9J97NQ
  {
    part_number: '36100000050',
    part_number_formatted: '3610 000 0050',
    asin: 'B07R9J97NQ',
    marketplace: 'amazon.de',
    affiliate_tag: 'srihldecode00-21',
    manufacturer: 'Sägenspezi',
    brand: 'Sägenspezi',
    seller_name: 'Sägenspezi',
    seller_id: 'A1GMRJIURBAM28',
    manufacturer_part_number: '3610-000-0050-SPEZI',
    product_title: '35cm Sägenspezi Kette (Vollmeißel) 3/8"PM 50TG 1,1mm passend für Stihl 018 MS 180 MS180',
    package_quantity: 1,
    package_type: 'SINGLE_UNIT',
    oem_brand_classification: 'MANUFACTURER_AFTERMARKET',
    evidence_classification: 'AMAZON_LISTING_COMPATIBLE',
    focus_model: 'MS 180',
    model_compatibility: ['MS 180 (met 35 cm / 1,1 mm geleider 3005 000 3909)', '018', 'MS 170', '017'],
    machine_compatibility: ['MS 180 (met 35 cm / 1,1 mm geleider 3005 000 3909)', '018', 'MS 170', '017'],
    item_price: 7.99,
    shipping_to_nl_status: 'SHIPS_TO_NL_CONFIRMED',
    shipping_destination_country: 'NL',
    shipping_cost_nl: 10.00,
    shipping_checked_at: '2026-11-11',
    shipping_evidence_url: 'https://www.amazon.de/dp/B07R9J97NQ',
    shipping_evidence_description: 'Confirmed on official Sägenspezi Amazon.de MS 180 store page with NL destination (€7.99 item price + €10.00 Sägenspezi merchant shipping to NL).',
    currency: 'EUR',
    pilot_eligible: true,
    pilot_active: true,
    kill_switch_id: 'KILL_PILOT_DE_36100000050',
    compatibility_proof: 'Sägenspezi 35 cm zaagketting met exacte specificaties voor STIHL 3610 000 0050 (61 PMM3 50): kettingsteek 3/8" Picco, groefdikte 1,1 mm (.043") en 50 aandrijfschakels voor STIHL 018 / MS 180 met 35 cm 1,1 mm geleider (3005 000 3909) en MS 170.',
    asin_product_identity_proof: 'Verified on official Sägenspezi Amazon.de Store (Geschikt voor Stihl 018 MS180): ASIN B07R9J97NQ "35cm Sägenspezi Kette (Vollmeißel) 3/8\\"PM 50TG 1,1mm passend für Stihl 018 MS 180 MS180".',
    independent_evidence_url: 'https://www.amazon.de/dp/B07R9J97NQ',
    verifiable_evidence_sources: [
      {
        source_name: 'Sägenspezi Official Store Amazon.de (018 / MS 180)',
        source_type: 'AMAZON_MARKETPLACE_LISTING',
        source_url: 'https://www.amazon.de/dp/B07R9J97NQ',
        url: storePageUrl,
        claim: '35cm Sägenspezi Kette (Vollmeißel) 3/8"PM 50TG 1,1mm passend für Stihl 018 MS 180 MS180 (€7,99).',
        verified_attributes: ['asin', 'part_number', 'pitch', 'gauge', 'drive_links', 'seller_id', 'ships_to_nl']
      }
    ],
    direct_affiliate_url: 'https://www.amazon.de/dp/B07R9J97NQ?tag=srihldecode00-21',
    search_fallback_url: 'https://www.amazon.de/s?k=STIHL+3610+000+0050&tag=srihldecode00-21',
    verification_date: '2026-11-11',
    status: 'ACTIVE',
    status_reason: 'Verified Sägenspezi 35cm 3/8"PM 1.1mm 50DL saw chain for STIHL 018 / MS 180 / MS 170 with confirmed NL shipping.',
    evidence_audit_category: 'VERIFIED_ACTIVE'
  },

  // 6. Cat 7 — Kettingwiel 3/8" Picco 6T: STIHL 1123 640 2073 -> B00LAHPOXA (corrected from 11236402074)
  {
    part_number: '11236402073',
    part_number_formatted: '1123 640 2073',
    asin: 'B00LAHPOXA',
    marketplace: 'amazon.de',
    affiliate_tag: 'srihldecode00-21',
    manufacturer: 'Sägenspezi',
    brand: 'Sägenspezi',
    seller_name: 'Sägenspezi',
    seller_id: 'A1GMRJIURBAM28',
    manufacturer_part_number: '1123-640-2073-SPEZI',
    product_title: 'Sägenspezi Kettenrad 3/8" 6Z passend für Stihl 018 MS180 MS 180',
    package_quantity: 1,
    package_type: 'SINGLE_UNIT',
    oem_brand_classification: 'MANUFACTURER_AFTERMARKET',
    evidence_classification: 'AMAZON_LISTING_COMPATIBLE',
    focus_model: 'MS 180',
    model_compatibility: ['MS 180', '018', 'MS 170', '017'],
    machine_compatibility: ['MS 180', '018', 'MS 170', '017'],
    item_price: 7.99,
    shipping_to_nl_status: 'SHIPS_TO_NL_CONFIRMED',
    shipping_destination_country: 'NL',
    shipping_cost_nl: 10.00,
    shipping_checked_at: '2026-11-11',
    shipping_evidence_url: 'https://www.amazon.de/dp/B00LAHPOXA',
    shipping_evidence_description: 'Confirmed on official Sägenspezi Amazon.de MS 180 store page with NL destination (€7.99 item price + €10.00 Sägenspezi merchant shipping to NL).',
    currency: 'EUR',
    pilot_eligible: true,
    pilot_active: true,
    kill_switch_id: 'KILL_PILOT_DE_11236402073',
    compatibility_proof: 'Sägenspezi 3/8" Picco 6-tands kettingwiel (Kettenrad 3/8" 6Z) voor STIHL 018 en MS 180, vervangt STIHL 1123 640 2073 / 1123 640 2003.',
    asin_product_identity_proof: 'Verified on official Sägenspezi Amazon.de Store (Geschikt voor Stihl 018 MS180): ASIN B00LAHPOXA "Sägenspezi Kettenrad 3/8\\" 6Z passend für Stihl 018 MS180 MS 180".',
    independent_evidence_url: 'https://www.amazon.de/dp/B00LAHPOXA',
    verifiable_evidence_sources: [
      {
        source_name: 'Sägenspezi Official Store Amazon.de (018 / MS 180)',
        source_type: 'AMAZON_MARKETPLACE_LISTING',
        source_url: 'https://www.amazon.de/dp/B00LAHPOXA',
        url: storePageUrl,
        claim: 'Sägenspezi Kettenrad 3/8" 6Z passend für Stihl 018 MS180 MS 180 (€7,99).',
        verified_attributes: ['asin', 'part_number', 'seller_id', 'model_compatibility', 'ships_to_nl']
      }
    ],
    direct_affiliate_url: 'https://www.amazon.de/dp/B00LAHPOXA?tag=srihldecode00-21',
    search_fallback_url: 'https://www.amazon.de/s?k=STIHL+1123+640+2073&tag=srihldecode00-21',
    verification_date: '2026-11-11',
    status: 'ACTIVE',
    status_reason: 'Verified Sägenspezi 3/8" 6T spur sprocket for STIHL 018 / MS 180 (corrected from 1123 640 2074 to 1123 640 2073) with confirmed NL shipping.',
    evidence_audit_category: 'VERIFIED_ACTIVE'
  },

  // 7. Cat 8 — Carburateur met compensator en 3 stelschroeven (MS 180 zonder 2-MIX): STIHL 1130 120 0603 -> B074CH7JFY
  {
    part_number: '11301200603',
    part_number_formatted: '1130 120 0603',
    asin: 'B074CH7JFY',
    marketplace: 'amazon.de',
    affiliate_tag: 'srihldecode00-21',
    manufacturer: 'Sägenspezi',
    brand: 'Sägenspezi',
    seller_name: 'Sägenspezi',
    seller_id: 'A1GMRJIURBAM28',
    manufacturer_part_number: '1130-120-0603-SPEZI-MS180',
    product_title: 'Sägenspezi Vergaser mit Kompensatoranschluss 3 Einstellschrauben passend für Stihl 018 MS 180 MS180',
    package_quantity: 1,
    package_type: 'SINGLE_UNIT',
    oem_brand_classification: 'MANUFACTURER_AFTERMARKET',
    evidence_classification: 'AMAZON_LISTING_COMPATIBLE',
    focus_model: 'MS 180',
    model_compatibility: ['MS 180 (zonder 2-MIX, met compensator & 3 stelschroeven)', '018', 'MS 170 (zonder 2-MIX)', '017'],
    machine_compatibility: ['MS 180 (zonder 2-MIX, met compensator & 3 stelschroeven)', '018', 'MS 170 (zonder 2-MIX)', '017'],
    item_price: 33.99,
    shipping_to_nl_status: 'SHIPS_TO_NL_CONFIRMED',
    shipping_destination_country: 'NL',
    shipping_cost_nl: 10.00,
    shipping_checked_at: '2026-11-11',
    shipping_evidence_url: 'https://www.amazon.de/dp/B074CH7JFY',
    shipping_evidence_description: 'Confirmed on official Sägenspezi Amazon.de MS 180 store page with NL destination ("Bezorging tussen 16 november - 19 november", direct "In winkelwagen leggen" CTA, €33.99 + €10.00 shipping).',
    currency: 'EUR',
    pilot_eligible: true,
    pilot_active: true,
    kill_switch_id: 'KILL_PILOT_DE_11301200603_MS180',
    compatibility_proof: 'Sägenspezi carburateur met compensatoraansluiting en 3 stelschroeven (H, L, LA) voor STIHL 018 en MS 180 zonder 2-MIX, vervangt STIHL 1130 120 0603 (Zama C1Q-S57H).',
    asin_product_identity_proof: 'Verified on official Sägenspezi Amazon.de Store (Geschikt voor Stihl 018 MS180): ASIN B074CH7JFY "Sägenspezi Vergaser mit Kompensatoranschluss 3 Einstellschrauben passend für Stihl 018 MS 180 MS180".',
    independent_evidence_url: 'https://www.amazon.de/dp/B074CH7JFY',
    verifiable_evidence_sources: [
      {
        source_name: 'Sägenspezi Official Store Amazon.de (018 / MS 180)',
        source_type: 'AMAZON_MARKETPLACE_LISTING',
        source_url: 'https://www.amazon.de/dp/B074CH7JFY',
        url: storePageUrl,
        claim: 'Sägenspezi Vergaser mit Kompensatoranschluss 3 Einstellschrauben passend für Stihl 018 MS 180 MS180 (€33,99).',
        verified_attributes: ['asin', 'part_number', 'seller_id', 'model_compatibility', 'ships_to_nl']
      }
    ],
    direct_affiliate_url: 'https://www.amazon.de/dp/B074CH7JFY?tag=srihldecode00-21',
    search_fallback_url: 'https://www.amazon.de/s?k=STIHL+1130+120+0603&tag=srihldecode00-21',
    verification_date: '2026-11-11',
    status: 'ACTIVE',
    status_reason: 'Verified Sägenspezi 3-screw compensator carburetor for STIHL 018 / MS 180 (non-2-MIX) with confirmed NL shipping.',
    evidence_audit_category: 'VERIFIED_ACTIVE'
  },

  // 8. Cat 8 — Carburateur met compensator en 1 stelschroef (MS 180 zonder 2-MIX, C1Q-S152E): STIHL 1130 120 0608 -> B00LAHQFX8
  {
    part_number: '11301200608',
    part_number_formatted: '1130 120 0608',
    asin: 'B00LAHQFX8',
    marketplace: 'amazon.de',
    affiliate_tag: 'srihldecode00-21',
    manufacturer: 'Sägenspezi',
    brand: 'Sägenspezi',
    seller_name: 'Sägenspezi',
    seller_id: 'A1GMRJIURBAM28',
    manufacturer_part_number: '1130-120-0608-SPEZI',
    product_title: 'Sägenspezi Vergaser mit Kompensatoranschluss 1 Einstellschraube passend für Stihl 018 MS 180 MS180 baugleich ZAMA',
    package_quantity: 1,
    package_type: 'SINGLE_UNIT',
    oem_brand_classification: 'MANUFACTURER_AFTERMARKET',
    evidence_classification: 'AMAZON_LISTING_COMPATIBLE',
    focus_model: 'MS 180',
    model_compatibility: ['MS 180 (zonder 2-MIX, met compensator & 1 stelschroef C1Q-S152E)', '018', 'MS 170 (zonder 2-MIX)', '017'],
    machine_compatibility: ['MS 180 (zonder 2-MIX, met compensator & 1 stelschroef C1Q-S152E)', '018', 'MS 170 (zonder 2-MIX)', '017'],
    item_price: 31.99,
    shipping_to_nl_status: 'SHIPS_TO_NL_CONFIRMED',
    shipping_destination_country: 'NL',
    shipping_cost_nl: 10.00,
    shipping_checked_at: '2026-11-11',
    shipping_evidence_url: 'https://www.amazon.de/dp/B00LAHQFX8',
    shipping_evidence_description: 'Confirmed on official Sägenspezi Amazon.de MS 180 store page with NL destination (€31.99 item price + €10.00 Sägenspezi merchant shipping to NL).',
    currency: 'EUR',
    pilot_eligible: true,
    pilot_active: true,
    kill_switch_id: 'KILL_PILOT_DE_11301200608',
    compatibility_proof: 'Sägenspezi carburateur (baugleich ZAMA) met compensatoraansluiting en 1 stelschroef (LD) voor STIHL 018 en MS 180 zonder 2-MIX, vervangt STIHL 1130 120 0608 (Zama C1Q-S152E).',
    asin_product_identity_proof: 'Verified on official Sägenspezi Amazon.de Store (Geschikt voor Stihl 018 MS180): ASIN B00LAHQFX8 "Sägenspezi Vergaser mit Kompensatoranschluss 1 Einstellschraube passend für Stihl 018 MS 180 MS180 baugleich ZAMA".',
    independent_evidence_url: 'https://www.amazon.de/dp/B00LAHQFX8',
    verifiable_evidence_sources: [
      {
        source_name: 'Sägenspezi Official Store Amazon.de (018 / MS 180)',
        source_type: 'AMAZON_MARKETPLACE_LISTING',
        source_url: 'https://www.amazon.de/dp/B00LAHQFX8',
        url: storePageUrl,
        claim: 'Sägenspezi Vergaser mit Kompensatoranschluss 1 Einstellschraube passend für Stihl 018 MS 180 MS180 baugleich ZAMA (€31,99).',
        verified_attributes: ['asin', 'part_number', 'seller_id', 'model_compatibility', 'ships_to_nl']
      }
    ],
    direct_affiliate_url: 'https://www.amazon.de/dp/B00LAHQFX8?tag=srihldecode00-21',
    search_fallback_url: 'https://www.amazon.de/s?k=STIHL+1130+120+0608&tag=srihldecode00-21',
    verification_date: '2026-11-11',
    status: 'ACTIVE',
    status_reason: 'Verified Sägenspezi 1-screw compensator carburetor (Zama C1Q-S152E equivalent) for STIHL 018 / MS 180 (non-2-MIX) with confirmed NL shipping.',
    evidence_audit_category: 'VERIFIED_ACTIVE'
  }
];

for (const off of newActiveOffers) {
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

// 3. Synchronize catalog count assertions across test & script files (18376 -> 18377)
const files18377 = [
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

for (const rel of files18377) {
  const fp = path.join(rootDir, rel);
  const content = fs.readFileSync(fp, 'utf8').replaceAll('18376', '18377');
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
    "!['36100000050', '36360000055', '36100000055'].includes(p.part_number)",
    "!['36100000050', '36360000055', '36100000055', '36360000044'].includes(p.part_number)"
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
    "part_number NOT IN ('36100000050', '36360000055', '36100000055')",
    "part_number NOT IN ('36100000050', '36360000055', '36100000055', '36360000044')"
  );
  fs.writeFileSync(fp, content, 'utf8');
}
console.log('✅ Synchronized catalog count assertions in test & script files.');
