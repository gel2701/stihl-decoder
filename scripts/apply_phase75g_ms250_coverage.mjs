/**
 * scripts/apply_phase75g_ms250_coverage.mjs
 *
 * Phase 75G: STIHL MS 250 / 025 Commercial Coverage & Zama/Walbro Separation
 *
 * 1. Reuse alignment:
 *    - Explicitly ensures MS 250 / 025 (with technical variant distinctions: 3/8" Picco 1,3 mm vs
 *      .325" 1,6 mm, and Walbro WT vs Zama C1Q carburetors) is documented in model_compatibility
 *      and machine_compatibility across all 19 reusable active offers covering 8 of the 10 core
 *      categories (plus 5 existing general MS 250 active offers = 24 reusable MS 250 active offers).
 *    - Strictly preserves technical boundaries: MS 170/180-only parts (M10 2-MIX spark plugs
 *      0000 400 7009 / 7011 and 1,1 mm .043" chains/bars 3610* / 3005 000 3905 / 3909) are never
 *      linked to the MS 250 / 025.
 * 2. Zama / Walbro separation:
 *    - Keeps STIHL 1123 007 1060 exclusively mapped to the Walbro K20-WAT kit (B073NJNXMF) and
 *      STIHL 1123 007 1061 to the Walbro D10-WAT kit (B08F9ML22K).
 *    - Deactivates ASIN B00LAHUJAS (Sägenspezi Vergasermembrankit für Zama passend für Stihl 025
 *      MS250) as an exact replacement for 1123 007 1060 and parks it as a RESEARCH_REQUIRED
 *      candidate (pilot_active: false) on canonical Zama carburetor 1123 120 0606 until the exact
 *      OEM kit number or accessory relationship is established.
 * 3. Activates 6 proven MS 250 offers on Amazon.de (Sägenspezi official MS 250 (025) store page,
 *    confirmed NL shipping €10.00):
 *    - B00LAHOXZK (3005 000 4713): Sägenspezi geleidingsrail zwaard 40cm .325" 62TG 1,6mm geschikt voor Stihl 025 MS250
 *    - B00LAHEP26 (3636 000 0050): 35cm Sägenspezi Kette (Halbmeißel) 3/8"P 50TG 1,3mm passend für Stihl 025 MS250 MS 250
 *    - B00LAHFGYW (3636 000 0055): 40cm Sägenspezi Kette (Halbmeißel) 3/8"P 55TG 1,3mm passend für Stihl 025 MS250 MS 250
 *    - B00LAHPSUO (1123 640 2073): Sägenspezi Kettenrad 3/8" 6Z passend für Stihl 025 MS250 MS 250
 *    - B072PXRKSW (3005 000 4813): 40cm Sägenspezi Schwert-Set Drive mit 2 Vollmeißelketten 3/8"P 55TG 1,3mm passend für Stihl 025 MS 250 MS250
 *    - B00LA7AW0K (3005 000 4809): 35cm Sägenspezi Schwert-Set Drive mit 2 Halbmeißelketten 3/8"P 50TG 1,3mm passend für Stihl 025 MS 250 MS250
 * 4. Registers the parked MS 250 research backlog for a future batch without activating unproven items.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const { TwoGateVerifier } = await import(pathToFileURL(path.join(rootDir, 'src/affiliate/TwoGateVerifier.js')).href);

const catalogPath = path.join(rootDir, 'data', 'parts_catalog.json');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const canonicalParts = new Map(catalog.parts.map(p => [p.part_number, p]));

const registryPath = path.join(rootDir, 'data', 'affiliate', 'verified_amazon_registry.json');
const reg = JSON.parse(fs.readFileSync(registryPath, 'utf8'));

// Remove any previous mapping of B00LAHUJAS on 11230071060 (Walbro K20-WAT)
reg.offers = reg.offers.filter(o => !(o.asin === 'B00LAHUJAS' && o.part_number === '11230071060'));

// 1. Reuse alignment on existing active offers proven to fit MS 250 / 025
const reuseCompatibilityUpdates = new Map([
  // Cat 1 — Luchtfilter
  ['B0DPCHJ2TD', ['MS 250', '025', 'MS 230', '023', 'MS 210', '021']],
  ['B079DM87N4', ['MS 210', 'MS 230', 'MS 250', '021', '023', '025']],
  // Cat 2 — Bougie (M14x1,25; M10 2-MIX plugs are strictly excluded)
  ['B001RM8J76', ['MS 250', '025', 'MS 230', '023', 'MS 210', '021', 'MS 170 (zonder 2-MIX)', 'MS 180 (zonder 2-MIX)', '017', '018', 'FS 55', 'BG 86']],
  ['B0068M5NAG', ['MS 250', '025', 'MS 230', '023', 'MS 210', '021', 'MS 170 (zonder 2-MIX)', 'MS 180 (zonder 2-MIX)', '017', '018', 'FS 55']],
  // Cat 3 — Brandstoffilter
  ['B0874SJ4CK', ['MS 250', '025', 'MS 230', '023', 'MS 210', '021', 'MS 170', 'MS 180', '017', '018', 'FS 55']],
  // Cat 4 — Olieaanzuigfilter
  ['B0FP2XR798', ['MS 250', '025', 'MS 230', '023', 'MS 210', '021', 'MS 170', '017', 'MS 180', '018']],
  // Cat 5 — Zaagkettingen 30, 35, 40 cm (3/8" Picco, 1,3 mm uitvoering; 1,1 mm kettingen zijn uitgesloten)
  ['B0723GG5VR', ['MS 180 (met 30 cm / 1,3 mm geleider 3005 000 4805)', '018', 'MS 170 (met 30 cm / 1,3 mm geleider 3005 000 4805)', 'MS 250 (met 30 cm / 3/8" P 1,3 mm geleider 3005 000 4805)', '025 (met 30 cm / 3/8" P 1,3 mm geleider 3005 000 4805)', 'MS 210', 'MS 230']],
  ['B00FYRVGHU', ['MS 250 (met 35 cm / 3/8" P 1,3 mm geleider 3005 000 4809)', '025 (met 35 cm / 3/8" P 1,3 mm geleider 3005 000 4809)', 'MS 180 (standaard 35 cm / 1,3 mm geleider 3005 000 4809)', '018', 'MS 170 (met 35 cm / 1,3 mm geleider 3005 000 4809)', 'MS 210', 'MS 230']],
  ['B007QJL16A', ['MS 250 (met 35 cm / 3/8" P 1,3 mm geleider 3005 000 4809)', '025 (met 35 cm / 3/8" P 1,3 mm geleider 3005 000 4809)', 'MS 180 (met 35 cm / 1,3 mm geleider 3005 000 4809)', '018', 'MS 170 (met 35 cm / 1,3 mm geleider 3005 000 4809)', 'MS 210', 'MS 230']],
  ['B071J6WTSR', ['MS 180 (standaard 35 cm / 1,3 mm geleider 3005 000 4809)', '018', 'MS 170 (met 35 cm / 1,3 mm geleider 3005 000 4809)', 'MS 210', 'MS 230', 'MS 250 (met 35 cm / 3/8" P 1,3 mm geleider 3005 000 4809)', '025']],
  ['B005MCM2YS', ['MS 250 (met 40 cm / 3/8" P 1,3 mm geleider 3005 000 4813, 55 TG)', '025', 'MS 170 (met 40 cm / 1,3 mm geleider 3005 000 4813)', '017', 'MS 180 (met 40 cm / 1,3 mm geleider 3005 000 4813)', '018', 'MS 210', 'MS 230']],
  ['B003V4L8NA', ['MS 210', 'MS 230', 'MS 250 (met 40 cm / 3/8" P 1,3 mm geleider, 56 TG)', '025']],
  // Cat 6 — Bijpassende geleiders (3/8" Picco, 1,3 mm uitvoering; 1,1 mm geleiders zijn uitgesloten)
  ['B001FUALX0', ['MS 250 (3/8" P 1,3 mm uitvoering, 35 cm / 50 TG)', '025 (3/8" P 1,3 mm uitvoering)', 'MS 180 (standaard 35 cm / 1,3 mm)', '018', 'MS 170 (met 1,3 mm ketting)', 'MS 210', 'MS 230']],
  ['B002VAAQC4', ['MS 250 (3/8" P 1,3 mm uitvoering, 40 cm / 55 TG)', '025 (3/8" P 1,3 mm uitvoering)', 'MS 180 (met 40 cm / 1,3 mm ketting 3636 000 0055)', '018', 'MS 170 (met 40 cm / 1,3 mm ketting 3636 000 0055)', 'MS 210', 'MS 230']],
  // Cat 7 — Kettingwiel (3/8" Picco 6Z uitvoering)
  ['B079DN88M2', ['MS 170', 'MS 180', 'MS 210', 'MS 230', 'MS 250 (3/8" Picco 6Z uitvoering)', '017', '018', '021', '023', '025 (3/8" Picco 6Z uitvoering)']],
  ['B006WVO0QQ', ['MS 170', '017', 'MS 180', '018', 'MS 210', '021', 'MS 230', '023', 'MS 250 (3/8" Picco 6Z uitvoering)', '025 (3/8" Picco 6Z uitvoering)']],
  // Cat 8 — Carburateur + Walbro WT revisiesets (intact)
  ['B00LAHQRM2', ['MS 250 (Walbro WT-215 uitvoering)', '025']],
  ['B073NJNXMF', ['MS 210', 'MS 230', 'MS 250 (Walbro WT carburateur)', '021', '023', '025 (Walbro WT carburateur)', 'MS 170', 'MS 180', 'FS 55', 'BG 86']],
  ['B08F9ML22K', ['MS 210', 'MS 230', 'MS 250 (Walbro WT carburateur)', '021', '023', '025 (Walbro WT carburateur)']]
]);

for (const offer of reg.offers) {
  if (reuseCompatibilityUpdates.has(offer.asin)) {
    const compat = reuseCompatibilityUpdates.get(offer.asin);
    offer.model_compatibility = compat;
    offer.machine_compatibility = compat;
  }
}

// 2. 6 Proven Active Offers + 1 Parked Research Offer (B00LAHUJAS) for MS 250 / 025 on Amazon.de
const storePageUrl = 'https://www.amazon.de/stores/page/A50D41D8-6AE9-4A84-ACAF-6AE8FE49BB43';

const ms250Offers = [
  // 1. Cat 6 — Bijpassende geleider 40 cm .325" 1,6 mm 62 TG: STIHL 3005 000 4713 -> B00LAHOXZK
  {
    part_number: '30050004713',
    part_number_formatted: '3005 000 4713',
    asin: 'B00LAHOXZK',
    marketplace: 'amazon.de',
    affiliate_tag: 'srihldecode00-21',
    manufacturer: 'Sägenspezi',
    brand: 'Sägenspezi',
    seller_name: 'Sägenspezi',
    seller_id: 'A1GMRJIURBAM28',
    manufacturer_part_number: '3005-000-4713-SPEZI',
    product_title: 'Sägenspezi geleidingsrail zwaard 40cm 325" 62TG 1,6mm geschikt voor Stihl 025 MS250',
    package_quantity: 1,
    package_type: 'SINGLE_UNIT',
    oem_brand_classification: 'MANUFACTURER_AFTERMARKET',
    evidence_classification: 'AMAZON_LISTING_COMPATIBLE',
    focus_model: 'MS 250',
    model_compatibility: ['MS 250 (.325" 1,6 mm uitvoering, 40 cm / 62 TG)', '025 (.325" 1,6 mm uitvoering, 40 cm / 62 TG)'],
    machine_compatibility: ['MS 250 (.325" 1,6 mm uitvoering, 40 cm / 62 TG)', '025 (.325" 1,6 mm uitvoering, 40 cm / 62 TG)'],
    item_price: 24.99,
    shipping_to_nl_status: 'SHIPS_TO_NL_CONFIRMED',
    shipping_destination_country: 'NL',
    shipping_cost_nl: 10.00,
    shipping_checked_at: '2026-11-11',
    shipping_evidence_url: 'https://www.amazon.de/dp/B00LAHOXZK',
    shipping_evidence_description: 'Confirmed on official Sägenspezi Amazon.de MS 250 (025) store page with NL destination ("Bezorging tussen 16 november - 19 november", direct "In winkelwagen leggen" CTA, €24.99 + €10.00 shipping).',
    currency: 'EUR',
    pilot_eligible: true,
    pilot_active: true,
    kill_switch_id: 'KILL_PILOT_DE_30050004713_MS250',
    compatibility_proof: 'Sägenspezi 40 cm zaagblad met exacte specificaties voor STIHL 3005 000 4713: kettingsteek .325", groefdikte 1,6 mm (.063") en 62 aandrijfschakels voor STIHL 025 / MS 250 met .325" 7Z kettingwiel.',
    asin_product_identity_proof: 'Verified on official Sägenspezi Amazon.de Store (MS 250 / 025): ASIN B00LAHOXZK "Sägenspezi geleidingsrail zwaard 40cm 325\\" 62TG 1,6mm geschikt voor Stihl 025 MS250".',
    independent_evidence_url: 'https://www.amazon.de/dp/B00LAHOXZK',
    verifiable_evidence_sources: [
      {
        source_name: 'Sägenspezi Official Store Amazon.de (025 / MS 250)',
        source_type: 'AMAZON_MARKETPLACE_LISTING',
        source_url: 'https://www.amazon.de/dp/B00LAHOXZK',
        url: storePageUrl,
        claim: 'Sägenspezi geleidingsrail zwaard 40cm 325" 62TG 1,6mm geschikt voor Stihl 025 MS250 (€24,99).',
        verified_attributes: ['asin', 'part_number', 'pitch', 'gauge', 'drive_links', 'seller_id', 'ships_to_nl']
      }
    ],
    direct_affiliate_url: 'https://www.amazon.de/dp/B00LAHOXZK?tag=srihldecode00-21',
    search_fallback_url: 'https://www.amazon.de/s?k=STIHL+3005+000+4713&tag=srihldecode00-21',
    verification_date: '2026-11-11',
    status: 'ACTIVE',
    status_reason: 'Verified Sägenspezi 40cm .325" 1.6mm 62DL guide bar for STIHL 025 / MS 250 with confirmed NL shipping.',
    evidence_audit_category: 'VERIFIED_ACTIVE'
  },

  // 2. Cat 5 — Zaagketting 35 cm 3/8" P 1,3 mm 50 TG (Halbmeißel): STIHL 3636 000 0050 -> B00LAHEP26
  {
    part_number: '36360000050',
    part_number_formatted: '3636 000 0050',
    asin: 'B00LAHEP26',
    marketplace: 'amazon.de',
    affiliate_tag: 'srihldecode00-21',
    manufacturer: 'Sägenspezi',
    brand: 'Sägenspezi',
    seller_name: 'Sägenspezi',
    seller_id: 'A1GMRJIURBAM28',
    manufacturer_part_number: '3636-000-0050-SPEZI-HM-MS250',
    product_title: '35cm Sägenspezi Kette (Halbmeißel) 3/8"P 50TG 1,3mm passend für Stihl 025 MS250 MS 250',
    package_quantity: 1,
    package_type: 'SINGLE_UNIT',
    oem_brand_classification: 'MANUFACTURER_AFTERMARKET',
    evidence_classification: 'AMAZON_LISTING_COMPATIBLE',
    focus_model: 'MS 250',
    model_compatibility: ['MS 250 (met 35 cm / 3/8" P 1,3 mm geleider 3005 000 4809)', '025 (met 35 cm / 3/8" P 1,3 mm geleider 3005 000 4809)', 'MS 210', 'MS 230', 'MS 180'],
    machine_compatibility: ['MS 250 (met 35 cm / 3/8" P 1,3 mm geleider 3005 000 4809)', '025 (met 35 cm / 3/8" P 1,3 mm geleider 3005 000 4809)', 'MS 210', 'MS 230', 'MS 180'],
    item_price: 7.99,
    shipping_to_nl_status: 'SHIPS_TO_NL_CONFIRMED',
    shipping_destination_country: 'NL',
    shipping_cost_nl: 10.00,
    shipping_checked_at: '2026-11-11',
    shipping_evidence_url: 'https://www.amazon.de/dp/B00LAHEP26',
    shipping_evidence_description: 'Confirmed on official Sägenspezi Amazon.de MS 250 (025) store page with NL destination (€7.99 item price + €10.00 Sägenspezi merchant shipping to NL).',
    currency: 'EUR',
    pilot_eligible: true,
    pilot_active: true,
    kill_switch_id: 'KILL_PILOT_DE_36360000050_MS250',
    compatibility_proof: 'Sägenspezi 35 cm Halbmeißel zaagketting met exacte specificaties voor STIHL 3636 000 0050 (63 PM3 50): kettingsteek 3/8" Picco, groefdikte 1,3 mm (.050") en 50 aandrijfschakels voor STIHL 025 / MS 250.',
    asin_product_identity_proof: 'Verified on official Sägenspezi Amazon.de Store (MS 250 / 025): ASIN B00LAHEP26 "35cm Sägenspezi Kette (Halbmeißel) 3/8\\"P 50TG 1,3mm passend für Stihl 025 MS250 MS 250".',
    independent_evidence_url: 'https://www.amazon.de/dp/B00LAHEP26',
    verifiable_evidence_sources: [
      {
        source_name: 'Sägenspezi Official Store Amazon.de (025 / MS 250)',
        source_type: 'AMAZON_MARKETPLACE_LISTING',
        source_url: 'https://www.amazon.de/dp/B00LAHEP26',
        url: storePageUrl,
        claim: '35cm Sägenspezi Kette (Halbmeißel) 3/8"P 50TG 1,3mm passend für Stihl 025 MS250 MS 250 (€7,99).',
        verified_attributes: ['asin', 'part_number', 'pitch', 'gauge', 'drive_links', 'seller_id', 'ships_to_nl']
      }
    ],
    direct_affiliate_url: 'https://www.amazon.de/dp/B00LAHEP26?tag=srihldecode00-21',
    search_fallback_url: 'https://www.amazon.de/s?k=STIHL+3636+000+0050&tag=srihldecode00-21',
    verification_date: '2026-11-11',
    status: 'ACTIVE',
    status_reason: 'Verified Sägenspezi 35cm 3/8"P 1.3mm 50DL semi-chisel chain for STIHL 025 / MS 250 with confirmed NL shipping.',
    evidence_audit_category: 'VERIFIED_ACTIVE'
  },

  // 3. Cat 5 — Zaagketting 40 cm 3/8" P 1,3 mm 55 TG (Halbmeißel): STIHL 3636 000 0055 -> B00LAHFGYW
  {
    part_number: '36360000055',
    part_number_formatted: '3636 000 0055',
    asin: 'B00LAHFGYW',
    marketplace: 'amazon.de',
    affiliate_tag: 'srihldecode00-21',
    manufacturer: 'Sägenspezi',
    brand: 'Sägenspezi',
    seller_name: 'Sägenspezi',
    seller_id: 'A1GMRJIURBAM28',
    manufacturer_part_number: '3636-000-0055-SPEZI-HM-MS250',
    product_title: '40cm Sägenspezi Kette (Halbmeißel) 3/8"P 55TG 1,3mm passend für Stihl 025 MS250 MS 250',
    package_quantity: 1,
    package_type: 'SINGLE_UNIT',
    oem_brand_classification: 'MANUFACTURER_AFTERMARKET',
    evidence_classification: 'AMAZON_LISTING_COMPATIBLE',
    focus_model: 'MS 250',
    model_compatibility: ['MS 250 (met 40 cm / 3/8" P 1,3 mm geleider 3005 000 4813, 55 TG)', '025 (met 40 cm / 3/8" P 1,3 mm geleider 3005 000 4813, 55 TG)', 'MS 210', 'MS 230', 'MS 180'],
    machine_compatibility: ['MS 250 (met 40 cm / 3/8" P 1,3 mm geleider 3005 000 4813, 55 TG)', '025 (met 40 cm / 3/8" P 1,3 mm geleider 3005 000 4813, 55 TG)', 'MS 210', 'MS 230', 'MS 180'],
    item_price: 8.99,
    shipping_to_nl_status: 'SHIPS_TO_NL_CONFIRMED',
    shipping_destination_country: 'NL',
    shipping_cost_nl: 10.00,
    shipping_checked_at: '2026-11-11',
    shipping_evidence_url: 'https://www.amazon.de/dp/B00LAHFGYW',
    shipping_evidence_description: 'Confirmed on official Sägenspezi Amazon.de MS 250 (025) store page with NL destination (€8.99 item price + €10.00 Sägenspezi merchant shipping to NL).',
    currency: 'EUR',
    pilot_eligible: true,
    pilot_active: true,
    kill_switch_id: 'KILL_PILOT_DE_36360000055_MS250',
    compatibility_proof: 'Sägenspezi 40 cm Halbmeißel zaagketting met exacte specificaties voor STIHL 3636 000 0055 (63 PM3 55): kettingsteek 3/8" Picco, groefdikte 1,3 mm (.050") en 55 aandrijfschakels voor STIHL 025 / MS 250.',
    asin_product_identity_proof: 'Verified on official Sägenspezi Amazon.de Store (MS 250 / 025): ASIN B00LAHFGYW "40cm Sägenspezi Kette (Halbmeißel) 3/8\\"P 55TG 1,3mm passend für Stihl 025 MS250 MS 250".',
    independent_evidence_url: 'https://www.amazon.de/dp/B00LAHFGYW',
    verifiable_evidence_sources: [
      {
        source_name: 'Sägenspezi Official Store Amazon.de (025 / MS 250)',
        source_type: 'AMAZON_MARKETPLACE_LISTING',
        source_url: 'https://www.amazon.de/dp/B00LAHFGYW',
        url: storePageUrl,
        claim: '40cm Sägenspezi Kette (Halbmeißel) 3/8"P 55TG 1,3mm passend für Stihl 025 MS250 MS 250 (€8,99).',
        verified_attributes: ['asin', 'part_number', 'pitch', 'gauge', 'drive_links', 'seller_id', 'ships_to_nl']
      }
    ],
    direct_affiliate_url: 'https://www.amazon.de/dp/B00LAHFGYW?tag=srihldecode00-21',
    search_fallback_url: 'https://www.amazon.de/s?k=STIHL+3636+000+0055&tag=srihldecode00-21',
    verification_date: '2026-11-11',
    status: 'ACTIVE',
    status_reason: 'Verified Sägenspezi 40cm 3/8"P 1.3mm 55DL semi-chisel chain for STIHL 025 / MS 250 with confirmed NL shipping.',
    evidence_audit_category: 'VERIFIED_ACTIVE'
  },

  // 4. Cat 7 — Kettingwiel 3/8" Picco 6Z: STIHL 1123 640 2073 -> B00LAHPSUO
  {
    part_number: '11236402073',
    part_number_formatted: '1123 640 2073',
    asin: 'B00LAHPSUO',
    marketplace: 'amazon.de',
    affiliate_tag: 'srihldecode00-21',
    manufacturer: 'Sägenspezi',
    brand: 'Sägenspezi',
    seller_name: 'Sägenspezi',
    seller_id: 'A1GMRJIURBAM28',
    manufacturer_part_number: '1123-640-2073-SPEZI-MS250',
    product_title: 'Sägenspezi Kettenrad 3/8" 6Z passend für Stihl 025 MS250 MS 250',
    package_quantity: 1,
    package_type: 'SINGLE_UNIT',
    oem_brand_classification: 'MANUFACTURER_AFTERMARKET',
    evidence_classification: 'AMAZON_LISTING_COMPATIBLE',
    focus_model: 'MS 250',
    model_compatibility: ['MS 250 (3/8" Picco 6Z uitvoering)', '025 (3/8" Picco 6Z uitvoering)', 'MS 210', 'MS 230', 'MS 170', 'MS 180'],
    machine_compatibility: ['MS 250 (3/8" Picco 6Z uitvoering)', '025 (3/8" Picco 6Z uitvoering)', 'MS 210', 'MS 230', 'MS 170', 'MS 180'],
    item_price: 8.99,
    shipping_to_nl_status: 'SHIPS_TO_NL_CONFIRMED',
    shipping_destination_country: 'NL',
    shipping_cost_nl: 10.00,
    shipping_checked_at: '2026-11-11',
    shipping_evidence_url: 'https://www.amazon.de/dp/B00LAHPSUO',
    shipping_evidence_description: 'Confirmed on official Sägenspezi Amazon.de MS 250 (025) store page with NL destination (€8.99 item price + €10.00 Sägenspezi merchant shipping to NL).',
    currency: 'EUR',
    pilot_eligible: true,
    pilot_active: true,
    kill_switch_id: 'KILL_PILOT_DE_11236402073_MS250',
    compatibility_proof: 'Sägenspezi 3/8" Picco 6-tands kettingwiel (Kettenrad 3/8" 6Z) voor STIHL 025 en MS 250 (uitvoeringen met 3/8" Picco snijgarnituur), vervangt STIHL 1123 640 2073 / 1123 640 2003.',
    asin_product_identity_proof: 'Verified on official Sägenspezi Amazon.de Store (MS 250 / 025): ASIN B00LAHPSUO "Sägenspezi Kettenrad 3/8\\" 6Z passend für Stihl 025 MS250 MS 250".',
    independent_evidence_url: 'https://www.amazon.de/dp/B00LAHPSUO',
    verifiable_evidence_sources: [
      {
        source_name: 'Sägenspezi Official Store Amazon.de (025 / MS 250)',
        source_type: 'AMAZON_MARKETPLACE_LISTING',
        source_url: 'https://www.amazon.de/dp/B00LAHPSUO',
        url: storePageUrl,
        claim: 'Sägenspezi Kettenrad 3/8" 6Z passend für Stihl 025 MS250 MS 250 (€8,99).',
        verified_attributes: ['asin', 'part_number', 'seller_id', 'model_compatibility', 'ships_to_nl']
      }
    ],
    direct_affiliate_url: 'https://www.amazon.de/dp/B00LAHPSUO?tag=srihldecode00-21',
    search_fallback_url: 'https://www.amazon.de/s?k=STIHL+1123+640+2073&tag=srihldecode00-21',
    verification_date: '2026-11-11',
    status: 'ACTIVE',
    status_reason: 'Verified Sägenspezi 3/8" 6T spur sprocket for STIHL 025 / MS 250 with confirmed NL shipping.',
    evidence_audit_category: 'VERIFIED_ACTIVE'
  },

  // 5. Cat 6 / Commercieel hergebruik combinatie Zaagblad + 2 Kettingen 40 cm 3/8" P 1,3 mm 55 TG: STIHL 3005 000 4813 -> B072PXRKSW
  {
    part_number: '30050004813',
    part_number_formatted: '3005 000 4813',
    asin: 'B072PXRKSW',
    marketplace: 'amazon.de',
    affiliate_tag: 'srihldecode00-21',
    manufacturer: 'Sägenspezi',
    brand: 'Sägenspezi',
    seller_name: 'Sägenspezi',
    seller_id: 'A1GMRJIURBAM28',
    manufacturer_part_number: '3005-000-4813-SPEZI-SET-MS250',
    product_title: '40cm Sägenspezi Schwert-Set Drive mit 2 Vollmeißelketten 3/8"P 55TG 1,3mm passend für Stihl 025 MS 250 MS250',
    package_quantity: 3,
    package_type: 'MULTI_PACK',
    oem_brand_classification: 'MANUFACTURER_AFTERMARKET',
    evidence_classification: 'AMAZON_LISTING_COMPATIBLE',
    focus_model: 'MS 250',
    model_compatibility: ['MS 250 (3/8" P 1,3 mm uitvoering, 40 cm / 55 TG)', '025 (3/8" P 1,3 mm uitvoering, 40 cm / 55 TG)', 'MS 210', 'MS 230'],
    machine_compatibility: ['MS 250 (3/8" P 1,3 mm uitvoering, 40 cm / 55 TG)', '025 (3/8" P 1,3 mm uitvoering, 40 cm / 55 TG)', 'MS 210', 'MS 230'],
    item_price: 39.99,
    shipping_to_nl_status: 'SHIPS_TO_NL_CONFIRMED',
    shipping_destination_country: 'NL',
    shipping_cost_nl: 10.00,
    shipping_checked_at: '2026-11-11',
    shipping_evidence_url: 'https://www.amazon.de/dp/B072PXRKSW',
    shipping_evidence_description: 'Confirmed on official Sägenspezi Amazon.de MS 250 (025) store page with NL destination ("Bezorging tussen 16 november - 19 november", direct "In winkelwagen leggen" CTA, €39.99 + €10.00 shipping).',
    currency: 'EUR',
    pilot_eligible: true,
    pilot_active: true,
    kill_switch_id: 'KILL_PILOT_DE_30050004813_MS250_SET',
    compatibility_proof: 'Sägenspezi 40 cm zaagblad + 2 Vollmeißel-kettingen combinatieset (3/8" Picco, 1,3 mm, 55 aandrijfschakels) voor STIHL 025 en MS 250 (komt overeen met geleider 3005 000 4813 + 2x ketting 3636 000 0055).',
    asin_product_identity_proof: 'Verified on official Sägenspezi Amazon.de Store (MS 250 / 025): ASIN B072PXRKSW "40cm Sägenspezi Schwert-Set Drive mit 2 Vollmeißelketten 3/8\\"P 55TG 1,3mm passend für Stihl 025 MS 250 MS250".',
    independent_evidence_url: 'https://www.amazon.de/dp/B072PXRKSW',
    verifiable_evidence_sources: [
      {
        source_name: 'Sägenspezi Official Store Amazon.de (025 / MS 250)',
        source_type: 'AMAZON_MARKETPLACE_LISTING',
        source_url: 'https://www.amazon.de/dp/B072PXRKSW',
        url: storePageUrl,
        claim: '40cm Sägenspezi Schwert-Set Drive mit 2 Vollmeißelketten 3/8"P 55TG 1,3mm passend für Stihl 025 MS 250 MS250 (€39,99).',
        verified_attributes: ['asin', 'part_number', 'pitch', 'gauge', 'drive_links', 'seller_id', 'ships_to_nl']
      }
    ],
    direct_affiliate_url: 'https://www.amazon.de/dp/B072PXRKSW?tag=srihldecode00-21',
    search_fallback_url: 'https://www.amazon.de/s?k=STIHL+3005+000+4813&tag=srihldecode00-21',
    verification_date: '2026-11-11',
    status: 'ACTIVE',
    status_reason: 'Verified Sägenspezi 40cm 3/8"P 1.3mm 55DL guide bar + 2 saw chains combo set for STIHL 025 / MS 250 with confirmed NL shipping.',
    evidence_audit_category: 'VERIFIED_ACTIVE'
  },

  // 6. Cat 6 / Commercieel hergebruik combinatie Zaagblad + 2 Kettingen 35 cm 3/8" P 1,3 mm 50 TG: STIHL 3005 000 4809 -> B00LA7AW0K
  {
    part_number: '30050004809',
    part_number_formatted: '3005 000 4809',
    asin: 'B00LA7AW0K',
    marketplace: 'amazon.de',
    affiliate_tag: 'srihldecode00-21',
    manufacturer: 'Sägenspezi',
    brand: 'Sägenspezi',
    seller_name: 'Sägenspezi',
    seller_id: 'A1GMRJIURBAM28',
    manufacturer_part_number: '3005-000-4809-SPEZI-SET-MS250',
    product_title: '35cm Sägenspezi Schwert-Set Drive mit 2 Halbmeißelketten 3/8"P 50TG 1,3mm passend für Stihl 025 MS 250 MS250',
    package_quantity: 3,
    package_type: 'MULTI_PACK',
    oem_brand_classification: 'MANUFACTURER_AFTERMARKET',
    evidence_classification: 'AMAZON_LISTING_COMPATIBLE',
    focus_model: 'MS 250',
    model_compatibility: ['MS 250 (3/8" P 1,3 mm uitvoering, 35 cm / 50 TG)', '025 (3/8" P 1,3 mm uitvoering, 35 cm / 50 TG)', 'MS 210', 'MS 230', 'MS 180'],
    machine_compatibility: ['MS 250 (3/8" P 1,3 mm uitvoering, 35 cm / 50 TG)', '025 (3/8" P 1,3 mm uitvoering, 35 cm / 50 TG)', 'MS 210', 'MS 230', 'MS 180'],
    item_price: 35.99,
    shipping_to_nl_status: 'SHIPS_TO_NL_CONFIRMED',
    shipping_destination_country: 'NL',
    shipping_cost_nl: 10.00,
    shipping_checked_at: '2026-11-11',
    shipping_evidence_url: 'https://www.amazon.de/dp/B00LA7AW0K',
    shipping_evidence_description: 'Confirmed on official Sägenspezi Amazon.de MS 250 (025) store page with NL destination ("Bezorging tussen 16 november - 19 november", direct "In winkelwagen leggen" CTA, €35.99 + €10.00 shipping).',
    currency: 'EUR',
    pilot_eligible: true,
    pilot_active: true,
    kill_switch_id: 'KILL_PILOT_DE_30050004809_MS250_SET',
    compatibility_proof: 'Sägenspezi 35 cm zaagblad + 2 Halbmeißel-kettingen combinatieset (3/8" Picco, 1,3 mm, 50 aandrijfschakels) voor STIHL 025 en MS 250 (komt overeen met geleider 3005 000 4809 + 2x ketting 3636 000 0050).',
    asin_product_identity_proof: 'Verified on official Sägenspezi Amazon.de Store (MS 250 / 025): ASIN B00LA7AW0K "35cm Sägenspezi Schwert-Set Drive mit 2 Halbmeißelketten 3/8\\"P 50TG 1,3mm passend für Stihl 025 MS 250 MS250".',
    independent_evidence_url: 'https://www.amazon.de/dp/B00LA7AW0K',
    verifiable_evidence_sources: [
      {
        source_name: 'Sägenspezi Official Store Amazon.de (025 / MS 250)',
        source_type: 'AMAZON_MARKETPLACE_LISTING',
        source_url: 'https://www.amazon.de/dp/B00LA7AW0K',
        url: storePageUrl,
        claim: '35cm Sägenspezi Schwert-Set Drive mit 2 Halbmeißelketten 3/8"P 50TG 1,3mm passend für Stihl 025 MS 250 MS250 (€35,99).',
        verified_attributes: ['asin', 'part_number', 'pitch', 'gauge', 'drive_links', 'seller_id', 'ships_to_nl']
      }
    ],
    direct_affiliate_url: 'https://www.amazon.de/dp/B00LA7AW0K?tag=srihldecode00-21',
    search_fallback_url: 'https://www.amazon.de/s?k=STIHL+3005+000+4809&tag=srihldecode00-21',
    verification_date: '2026-11-11',
    status: 'ACTIVE',
    status_reason: 'Verified Sägenspezi 35cm 3/8"P 1.3mm 50DL guide bar + 2 saw chains combo set for STIHL 025 / MS 250 with confirmed NL shipping.',
    evidence_audit_category: 'VERIFIED_ACTIVE'
  },

  // 7. Parked Research Item — Sägenspezi Zama Carburetor Diaphragm Kit (B00LAHUJAS): deactivated from 1123 007 1060 (Walbro K20-WAT) and parked under canonical Zama carburetor 1123 120 0606
  {
    part_number: '11231200606',
    part_number_formatted: '1123 120 0606',
    asin: 'B00LAHUJAS',
    marketplace: 'amazon.de',
    affiliate_tag: 'srihldecode00-21',
    manufacturer: 'Sägenspezi',
    brand: 'Sägenspezi',
    seller_name: 'Sägenspezi',
    seller_id: 'A1GMRJIURBAM28',
    manufacturer_part_number: 'SPEZI-ZAMA-MEMBRANKIT-MS250',
    product_title: 'Sägenspezi Vergasermembrankit für Zama passend für Stihl 025 MS250 MS 250',
    package_quantity: 1,
    package_type: 'SINGLE_UNIT',
    oem_brand_classification: 'MANUFACTURER_AFTERMARKET',
    evidence_classification: 'AMAZON_LISTING_COMPATIBLE',
    focus_model: 'MS 250',
    model_compatibility: ['MS 250 (met Zama C1Q carburateur, o.a. 1123 120 0606)', '025 (met Zama carburateur)'],
    machine_compatibility: ['MS 250 (met Zama C1Q carburateur, o.a. 1123 120 0606)', '025 (met Zama carburateur)'],
    item_price: 14.49,
    shipping_to_nl_status: 'SHIPS_TO_NL_CONFIRMED',
    shipping_destination_country: 'NL',
    shipping_cost_nl: 10.00,
    shipping_checked_at: '2026-11-11',
    shipping_evidence_url: 'https://www.amazon.de/dp/B00LAHUJAS',
    shipping_evidence_description: 'Confirmed on official Sägenspezi Amazon.de MS 250 (025) store page with NL destination (€14.49 item price + €10.00 Sägenspezi merchant shipping to NL).',
    currency: 'EUR',
    pilot_eligible: false,
    pilot_active: false,
    kill_switch_id: 'KILL_PILOT_DE_B00LAHUJAS_ZAMA_RESEARCH',
    compatibility_proof: 'Sägenspezi carburateur-membraanset voor Zama-carburateurs op STIHL 025 / MS 250; gedeactiveerd als exacte vervanger van 1123 007 1060 (Walbro K20-WAT) in afwachting van exacte OEM-revisieset- of accessoirekoppeling.',
    asin_product_identity_proof: 'Verified on official Sägenspezi Amazon.de Store (MS 250 / 025): ASIN B00LAHUJAS "Sägenspezi Vergasermembrankit für Zama passend für Stihl 025 MS250 MS 250".',
    independent_evidence_url: 'https://www.amazon.de/dp/B00LAHUJAS',
    verifiable_evidence_sources: [
      {
        source_name: 'Sägenspezi Official Store Amazon.de (025 / MS 250)',
        source_type: 'AMAZON_MARKETPLACE_LISTING',
        source_url: 'https://www.amazon.de/dp/B00LAHUJAS',
        url: storePageUrl,
        claim: 'Sägenspezi Vergasermembrankit für Zama passend für Stihl 025 MS250 MS 250 (€14,49).',
        verified_attributes: ['asin', 'seller_id', 'model_compatibility', 'ships_to_nl']
      }
    ],
    direct_affiliate_url: 'https://www.amazon.de/dp/B00LAHUJAS?tag=srihldecode00-21',
    search_fallback_url: 'https://www.amazon.de/s?k=STIHL+1123+120+0606&tag=srihldecode00-21',
    verification_date: '2026-11-11',
    status: 'RESEARCH_REQUIRED',
    status_reason: 'Parked for research: Zama carburetor diaphragm kit for 025 / MS 250 deactivated from 1123 007 1060 (Walbro K20-WAT) until exact OEM Zama repair kit part number or accessory relation is established.',
    evidence_audit_category: 'RESEARCH_REQUIRED'
  }
];

for (const off of ms250Offers) {
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
reg.policy.max_active_offers_per_marketplace = {
  'amazon.nl': 100,
  'amazon.de': 50
};
reg.policy.ms250_parked_research_backlog = [
  {
    category: 'Ontstekingsmodule MS 250',
    candidate_part_numbers: ['0000 400 1306', '1123 400 1301'],
    notes: 'Verify standard (025 / MS 250 / MS 250 C-B) vs ErgoStart (MS 250 C-BE) ignition module offers in future research batch.'
  },
  {
    category: 'STIHL Service Kit 2',
    candidate_part_numbers: ['1123 007 4100'],
    notes: 'Verify complete OEM or proven aftermarket maintenance kit for MS 210 / MS 230 / MS 250 in future research batch.'
  },
  {
    category: '.325" kettingwiel, 7 tanden',
    candidate_part_numbers: ['1123 640 2074', '1123 007 1032', '0000 642 1236'],
    notes: 'Verify .325" 7Z spur/rim sprocket for 025 / MS 250 without mixing 3/8" Picco sprockets.'
  },
  {
    category: '.325" zaagketting, 1,6 mm',
    candidate_part_numbers: ['3639 000 0062', '3686 000 0062', '3689 000 0062', '3686 000 0056'],
    notes: 'Verify .325" 1,6 mm (.063") saw chain with exact drive link count (62 TG for 40 cm / 56 TG for 35 cm).'
  },
  {
    category: 'Complete .325" zaagblad- en kettingset',
    candidate_part_numbers: ['3005 000 4713', '3005 000 4709'],
    notes: 'Verify complete .325" 1,6 mm guide bar + saw chain combo set for 025 / MS 250.'
  },
  {
    category: 'Zama carburateur-membraanset (B00LAHUJAS)',
    candidate_part_numbers: ['1123 120 0606'],
    notes: 'Deactivated from 1123 007 1060 (Walbro K20-WAT); verify exact Zama OEM repair kit reference or accessory relationship before activation.'
  }
];
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
console.log('✅ Registry updated for Phase 75G (MS 250 Zama/Walbro separation & parked research backlog). Metrics:', reg.metrics);
