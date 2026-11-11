/**
 * scripts/apply_phase76_ms440_fs460_expansion.mjs
 *
 * Phase 76: MS 440 + FS 460 Commercial Expansion
 *
 * 1. Reuses and aligns existing active offers for STIHL MS 440 (044) and FS 460 without duplicate ASIN registrations.
 * 2. Activates 15 proven Sägenspezi Amazon.de offers for STIHL MS 440 / 044 mapped to existing canonical 11-digit
 *    STIHL part numbers in data/parts_catalog.json (bringing total active offers from 84 to 99: 53 NL + 46 DE).
 * 3. Parks unverified / non-canonical / multi-model variation candidates in policy.phase76_ms440_fs460_parked_research_backlog.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const registryPath = path.join(rootDir, 'data', 'affiliate', 'verified_amazon_registry.json');
const runtimeOffersPath = path.join(rootDir, 'data', 'affiliate', 'amazon_part_offers.json');

const regDoc = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
const nowIso = new Date().toISOString();

function ensureModels(offer, modelsToAdd, proofAddition = null) {
  const existingModels = Array.isArray(offer.model_compatibility) ? [...offer.model_compatibility] : [];
  for (const m of modelsToAdd) {
    if (!existingModels.includes(m)) existingModels.push(m);
  }
  offer.model_compatibility = existingModels;
  offer.machine_compatibility = [...existingModels];
  if (proofAddition && offer.compatibility_proof && !offer.compatibility_proof.includes(proofAddition)) {
    offer.compatibility_proof = `${offer.compatibility_proof.replace(/\.$/, '')} (${proofAddition}).`;
  }
  offer.updated_at = nowIso;
}

// Step 2: Reuse & align existing active offers for MS 440 (044) and FS 460
for (const offer of regDoc.offers) {
  if (!offer.pilot_active) continue;

  // MS 440 / 044 reuse alignments
  if (offer.asin === 'B0068M5NAG' && offer.part_number === '11104007005') {
    ensureModels(offer, ['MS 440', '044'], 'ook geschikt voor MS 440 en 044');
  }
  if (offer.asin === 'B001RM8J76' && offer.part_number === '00004007000') {
    ensureModels(offer, ['MS 440', '044'], 'ook geschikt voor MS 440 en 044');
  }
  if (offer.asin === 'B0874SJ4CK' && offer.part_number === '00003503500') {
    ensureModels(offer, ['MS 440', '044'], 'ook geschikt voor MS 440 en 044');
  }
  if (offer.asin === 'B079DNH91X' && offer.part_number === '11291900601') {
    ensureModels(offer, ['MS 440', '044'], 'ook geschikt voor MS 440 en 044 volgens STIHL onderdelenlijst');
  }

  // FS 460 reuse alignments
  if (offer.asin === 'B01BBVB4HY' && offer.part_number === '40037102115') {
    ensureModels(offer, ['FS 460', 'FS 460 C-EM', 'FS 410', 'FS 360', 'FS 490']);
  }
  if (offer.asin === 'B0HLBXNGQQ' && offer.part_number === '00003503521') {
    ensureModels(offer, ['FS 460', 'FS 460 C-EM', 'FS 360', 'FS 410', 'MS 261', 'MS 362', 'MS 461'], 'geschikt voor FS 460 en 2-MIX bosmaaiers');
  }
  if (offer.asin === 'B0773YKFX3' && offer.part_number === '41303506200') {
    ensureModels(offer, ['FS 460', 'FS 410', 'FS 360', 'FS 240', 'BG 86', 'BR 600', 'HS 45'], 'ook geschikt voor FS 460');
  }
  if (offer.asin === 'B001RMA5S2' && offer.part_number === '00004007011') {
    ensureModels(offer, ['FS 460', 'FS 460 C-EM'], 'ook voor FS 460 2-MIX');
  }
  if (offer.asin === 'B09QH68W83' && offer.part_number === '00004007009') {
    ensureModels(offer, ['FS 460', 'FS 460 C-EM'], 'M10x1,0 2-MIX bougie, ook geschikt voor FS 460');
  }
  if (offer.asin === 'B077X8JMG9' && offer.part_number === '00004007009') {
    ensureModels(offer, ['FS 460', 'FS 460 C-EM'], 'M10x1,0 2-MIX bougie, ook geschikt voor FS 460');
  }
}

// Step 3 & 4: 15 proven new MS 440 / 044 offers from official Sägenspezi Amazon.de Store (14C69367-2EB1-4E51-AA4F-3D800995648C)
const MS440_STORE_URL = 'https://www.amazon.de/stores/page/14C69367-2EB1-4E51-AA4F-3D800995648C';

const newMs440Offers = [
  {
    part_number: '30030005217',
    part_number_formatted: '3003 000 5217',
    asin: 'B00LAHENAA',
    manufacturer_part_number: '3003-000-5217-SPEZI-SET-2VM-MS440',
    product_title: '45cm Sägenspezi Schwert-Set Drive mit 2 Vollmeißelketten 3/8" 66TG 1,6mm passend für Stihl 044 MS440 MS 440',
    package_quantity: 3,
    package_type: 'MULTI_PACK',
    item_price: 47.99,
    kill_switch_id: 'KILL_PILOT_DE_30030005217_B00LAHENAA_MS440',
    model_compatibility: ['MS 440 (45 cm / 18", 3/8", 1,6 mm, 66 TG, D025)', '044 (45 cm / 18", 3/8", 1,6 mm, 66 TG, D025)', 'MS 460', 'MS 461', 'MS 361'],
    compatibility_proof: 'Sägenspezi 45 cm (18") Drive geleider + 2 Vollmeißel-zaagkettingen (3/8" steek, 1,6 mm / .063" groefdikte, 66 aandrijfschakels, D025 / 3003-opname) passend voor STIHL 044 en MS 440 (geleider 3003 000 5217).',
    shipping_note: 'Confirmed on official Sägenspezi Amazon.de MS 440 (044) store page with NL destination ("Bezorging tussen 16 november - 19 november", direct "In winkelwagen leggen" CTA, €47.99 + €10.00 shipping).',
    verified_attributes: ['asin', 'part_number', 'pitch', 'gauge', 'drive_links', 'seller_id', 'ships_to_nl']
  },
  {
    part_number: '30030009417',
    part_number_formatted: '3003 000 9417',
    asin: 'B00LAHGMUE',
    manufacturer_part_number: '3003-000-9417-SPEZI-SET-4VM-MS440',
    product_title: '45cm Sägenspezi Schwert-Set Drive mit 4 Vollmeißelketten 3/8" 66TG 1,6mm passend für Stihl 044 MS440 MS 440',
    package_quantity: 5,
    package_type: 'MULTI_PACK',
    item_price: 71.99,
    kill_switch_id: 'KILL_PILOT_DE_30030009417_B00LAHGMUE_MS440',
    model_compatibility: ['MS 440 (45 cm / 18", 3/8", 1,6 mm, 66 TG, D025)', '044 (45 cm / 18", 3/8", 1,6 mm, 66 TG, D025)', 'MS 460', 'MS 461', 'MS 361'],
    compatibility_proof: 'Sägenspezi 45 cm (18") Drive geleider + 4 Vollmeißel-zaagkettingen (3/8" steek, 1,6 mm / .063" groefdikte, 66 aandrijfschakels, D025 / 3003-opname) passend voor STIHL 044 en MS 440 (geleider 3003 000 9417).',
    shipping_note: 'Confirmed on official Sägenspezi Amazon.de MS 440 (044) store page with NL destination ("Bezorging tussen 16 november - 19 november", direct "In winkelwagen leggen" CTA, €71.99 + €10.00 shipping).',
    verified_attributes: ['asin', 'part_number', 'pitch', 'gauge', 'drive_links', 'seller_id', 'ships_to_nl']
  },
  {
    part_number: '30030005221',
    part_number_formatted: '3003 000 5221',
    asin: 'B00LAHIYAU',
    manufacturer_part_number: '3003-000-5221-SPEZI-SET-2VM-MS440',
    product_title: '50cm Sägenspezi Schwert-Set Drive mit 2 Vollmeißelketten 3/8" 72TG 1,6mm passend für Stihl 044 MS440 MS 440',
    package_quantity: 3,
    package_type: 'MULTI_PACK',
    item_price: 52.99,
    kill_switch_id: 'KILL_PILOT_DE_30030005221_B00LAHIYAU_MS440',
    model_compatibility: ['MS 440 (50 cm / 20", 3/8", 1,6 mm, 72 TG, D025)', '044 (50 cm / 20", 3/8", 1,6 mm, 72 TG, D025)', 'MS 460', 'MS 461', 'MS 462'],
    compatibility_proof: 'Sägenspezi 50 cm (20") Drive geleider + 2 Vollmeißel-zaagkettingen (3/8" steek, 1,6 mm / .063" groefdikte, 72 aandrijfschakels, D025 / 3003-opname) passend voor STIHL 044 en MS 440 (geleider 3003 000 5221).',
    shipping_note: 'Confirmed on official Sägenspezi Amazon.de MS 440 (044) store page with NL destination ("Bezorging tussen 16 november - 19 november", direct "In winkelwagen leggen" CTA, €52.99 + €10.00 shipping).',
    verified_attributes: ['asin', 'part_number', 'pitch', 'gauge', 'drive_links', 'seller_id', 'ships_to_nl']
  },
  {
    part_number: '30030009421',
    part_number_formatted: '3003 000 9421',
    asin: 'B00LAHI9QE',
    manufacturer_part_number: '3003-000-9421-SPEZI-SET-2HM-MS440',
    product_title: '50cm Sägenspezi Schwert-Set Drive mit 2 Halbmeißelketten 3/8" 72TG 1,6mm passend für Stihl 044 MS 440 MS440',
    package_quantity: 3,
    package_type: 'MULTI_PACK',
    item_price: 52.99,
    kill_switch_id: 'KILL_PILOT_DE_30030009421_B00LAHI9QE_MS440',
    model_compatibility: ['MS 440 (50 cm / 20", 3/8", 1,6 mm, 72 TG, D025)', '044 (50 cm / 20", 3/8", 1,6 mm, 72 TG, D025)', 'MS 460', 'MS 461', 'MS 462'],
    compatibility_proof: 'Sägenspezi 50 cm (20") Drive geleider + 2 Halbmeißel-zaagkettingen (3/8" steek, 1,6 mm / .063" groefdikte, 72 aandrijfschakels, D025 / 3003-opname) passend voor STIHL 044 en MS 440 (geleider 3003 000 9421 + 2x ketting 3652 000 0072).',
    shipping_note: 'Confirmed on official Sägenspezi Amazon.de MS 440 (044) store page with NL destination ("Bezorging tussen 16 november - 19 november", direct "In winkelwagen leggen" CTA, €52.99 + €10.00 shipping).',
    verified_attributes: ['asin', 'part_number', 'pitch', 'gauge', 'drive_links', 'seller_id', 'ships_to_nl']
  },
  {
    part_number: '30030005231',
    part_number_formatted: '3003 000 5231',
    asin: 'B00LAHQF0Q',
    manufacturer_part_number: '3003-000-5231-SPEZI-BAR-63CM-MS440',
    product_title: '63cm Sägenspezi Führungsschiene Solid Drive 3/8" 84TG 1,6mm passend für Stihl 044 MS440 MS 440',
    package_quantity: 1,
    package_type: 'SINGLE_UNIT',
    item_price: 54.99,
    kill_switch_id: 'KILL_PILOT_DE_30030005231_B00LAHQF0Q_MS440',
    model_compatibility: ['MS 440 (63 cm / 25", 3/8", 1,6 mm, 84 TG, D025)', '044 (63 cm / 25", 3/8", 1,6 mm, 84 TG, D025)', 'MS 460', 'MS 461', 'MS 660'],
    compatibility_proof: 'Sägenspezi 63 cm (25") Solid Drive geleider (los zaagblad, 3/8" steek, 1,6 mm / .063" groefdikte, voor 84 aandrijfschakels, D025 / 3003-opname) passend voor STIHL 044 en MS 440 (vervangt STIHL 3003 000 5231).',
    shipping_note: 'Confirmed on official Sägenspezi Amazon.de MS 440 (044) store page with NL destination ("Bezorging tussen 16 november - 19 november", direct "In winkelwagen leggen" CTA, €54.99 + €10.00 shipping).',
    verified_attributes: ['asin', 'part_number', 'pitch', 'gauge', 'drive_links', 'seller_id', 'ships_to_nl']
  },
  {
    part_number: '30030009431',
    part_number_formatted: '3003 000 9431',
    asin: 'B00LAHMFU0',
    manufacturer_part_number: '3003-000-9431-SPEZI-SET-2VM-MS440',
    product_title: '63cm Sägenspezi Schwert-Set Solid Drive mit 2 Vollmeißelketten 3/8" 84TG 1,6mm passend für Stihl 044 MS440 MS 440',
    package_quantity: 3,
    package_type: 'MULTI_PACK',
    item_price: 74.99,
    kill_switch_id: 'KILL_PILOT_DE_30030009431_B00LAHMFU0_MS440',
    model_compatibility: ['MS 440 (63 cm / 25", 3/8", 1,6 mm, 84 TG, D025)', '044 (63 cm / 25", 3/8", 1,6 mm, 84 TG, D025)', 'MS 460', 'MS 461', 'MS 660'],
    compatibility_proof: 'Sägenspezi 63 cm (25") Solid Drive geleider + 2 Vollmeißel-zaagkettingen (3/8" steek, 1,6 mm / .063" groefdikte, 84 aandrijfschakels, D025 / 3003-opname) passend voor STIHL 044 en MS 440 (geleider 3003 000 9431).',
    shipping_note: 'Confirmed on official Sägenspezi Amazon.de MS 440 (044) store page with NL destination ("Bezorging tussen 16 november - 19 november", direct "In winkelwagen leggen" CTA, €74.99 + €10.00 shipping).',
    verified_attributes: ['asin', 'part_number', 'pitch', 'gauge', 'drive_links', 'seller_id', 'ships_to_nl']
  },
  {
    part_number: '30030006041',
    part_number_formatted: '3003 000 6041',
    asin: 'B00LAHP2KA',
    manufacturer_part_number: '3003-000-6041-SPEZI-SET-2VM-MS440',
    product_title: '75cm Sägenspezi Schwert-Set Solid Drive mit 2 Vollmeißelketten 3/8" 98TG 1,6mm passend für Stihl 044 MS440 MS 440',
    package_quantity: 3,
    package_type: 'MULTI_PACK',
    item_price: 88.99,
    kill_switch_id: 'KILL_PILOT_DE_30030006041_B00LAHP2KA_MS440',
    model_compatibility: ['MS 440 (75 cm / 30", 3/8", 1,6 mm, 98 TG, D025)', '044 (75 cm / 30", 3/8", 1,6 mm, 98 TG, D025)', 'MS 460', 'MS 461', 'MS 660'],
    compatibility_proof: 'Sägenspezi 75 cm (30") Solid Drive geleider + 2 Vollmeißel-zaagkettingen (3/8" steek, 1,6 mm / .063" groefdikte, 98 aandrijfschakels, D025 / 3003-opname) passend voor STIHL 044 en MS 440 (geleider 3003 000 6041).',
    shipping_note: 'Confirmed on official Sägenspezi Amazon.de MS 440 (044) store page with NL destination ("Bezorging tussen 16 november - 19 november", direct "In winkelwagen leggen" CTA, €88.99 + €10.00 shipping).',
    verified_attributes: ['asin', 'part_number', 'pitch', 'gauge', 'drive_links', 'seller_id', 'ships_to_nl']
  },
  {
    part_number: '00006421216',
    part_number_formatted: '0000 642 1216',
    asin: 'B00LPH14UW',
    manufacturer_part_number: '0000-642-1216-SPEZI-RIM8Z-MS440',
    product_title: 'SAEGENSPEZI Ringkettenrad 3/8" 8Z inkl. Nadellager, Aufnahme 22,3 mm, passend für Stihl 044 MS 440 046 MS 460 MS 341 MS 361 MS 362 MS 400 MS 441 MS 461 MS 462',
    package_quantity: 1,
    package_type: 'SINGLE_UNIT',
    item_price: 14.99,
    kill_switch_id: 'KILL_PILOT_DE_00006421216_B00LPH14UW_MS440',
    model_compatibility: ['MS 440 (3/8" 8Z, Standard Spline 22,3 mm)', '044 (3/8" 8Z, Standard Spline 22,3 mm)', 'MS 460', '046', 'MS 361', 'MS 362', 'MS 441', 'MS 461', 'MS 462'],
    compatibility_proof: 'Sägenspezi 3/8" 8-tands ringkettenrad (Rim Sprocket) inclusief naaldlager met grote 7-tands opname (22,3 mm Standard Spline SD7) voor STIHL 044 en MS 440 (vervangt STIHL 0000 642 1216 / 1128 007 1001).',
    shipping_note: 'Confirmed on official Sägenspezi Amazon.de MS 440 (044) store page with NL destination (€14.99 item price + €10.00 Sägenspezi merchant shipping to NL).',
    verified_attributes: ['asin', 'part_number', 'pitch', 'teeth', 'spline_size', 'seller_id', 'ships_to_nl']
  },
  {
    part_number: '11281202202',
    part_number_formatted: '1128 120 2202',
    asin: 'B07434JVX4',
    manufacturer_part_number: '1128-120-2202-SPEZI-FLANSCH-MS440',
    product_title: 'Sägenspezi Flansch Adapter passend für Stihl 044 MS 440 MS440',
    package_quantity: 1,
    package_type: 'SINGLE_UNIT',
    item_price: 7.99,
    kill_switch_id: 'KILL_PILOT_DE_11281202202_B07434JVX4_MS440',
    model_compatibility: ['MS 440', '044'],
    compatibility_proof: 'Sägenspezi luchtfilter-flensadapter voor STIHL 044 en MS 440 (vervangt STIHL 1128 120 2202).',
    shipping_note: 'Confirmed on official Sägenspezi Amazon.de MS 440 (044) store page with NL destination (€7.99 item price + €10.00 Sägenspezi merchant shipping to NL).',
    verified_attributes: ['asin', 'part_number', 'seller_id', 'model_compatibility', 'ships_to_nl']
  },
  {
    part_number: '00003503518',
    part_number_formatted: '0000 350 3518',
    asin: 'B00QM7TH36',
    manufacturer_part_number: '0000-350-3518-SPEZI-FUELSET-MS440',
    product_title: 'Sägenspezi Kraftstoffschlauch und Benzinfilter/Sägenspezi Kraftstofffilter Set passend für Stihl 044 MS440 MS 440',
    package_quantity: 2,
    package_type: 'MULTI_PACK',
    item_price: 6.79,
    kill_switch_id: 'KILL_PILOT_DE_00003503518_B00QM7TH36_MS440',
    model_compatibility: ['MS 440', '044'],
    compatibility_proof: 'Sägenspezi brandstofslang en brandstoffilterset specifiek passend voor STIHL 044 en MS 440 (zuigkop 0000 350 3518 + voorgevormde brandstofslang).',
    shipping_note: 'Confirmed on official Sägenspezi Amazon.de MS 440 (044) store page with NL destination (€6.79 item price + €10.00 Sägenspezi merchant shipping to NL).',
    verified_attributes: ['asin', 'part_number', 'seller_id', 'model_compatibility', 'ships_to_nl']
  },
  {
    part_number: '11286407112',
    part_number_formatted: '1128 640 7112',
    asin: 'B00LAHFW96',
    manufacturer_part_number: '1128-640-7112-SPEZI-WORM-MS440',
    product_title: 'Sägenspezi Schnecke für Ölpumpe passend für Stihl 044 MS440 MS 440',
    package_quantity: 1,
    package_type: 'SINGLE_UNIT',
    item_price: 4.89,
    kill_switch_id: 'KILL_PILOT_DE_11286407112_B00LAHFW96_MS440',
    model_compatibility: ['MS 440', '044'],
    compatibility_proof: 'Sägenspezi wormwiel (Schnecke) voor de oliepomp van STIHL 044 en MS 440 (vervangt STIHL 1128 640 7112).',
    shipping_note: 'Confirmed on official Sägenspezi Amazon.de MS 440 (044) store page with NL destination (€4.89 item price + €10.00 Sägenspezi merchant shipping to NL).',
    verified_attributes: ['asin', 'part_number', 'seller_id', 'model_compatibility', 'ships_to_nl']
  },
  {
    part_number: '11281200625',
    part_number_formatted: '1128 120 0625',
    asin: 'B00LAHQXLW',
    manufacturer_part_number: '1128-120-0625-SPEZI-CARB-MS440',
    product_title: 'Sägenspezi Vergaser passend für Stihl 044 MS440 MS 440',
    package_quantity: 1,
    package_type: 'SINGLE_UNIT',
    item_price: 32.49,
    kill_switch_id: 'KILL_PILOT_DE_11281200625_B00LAHQXLW_MS440',
    model_compatibility: ['MS 440', '044'],
    compatibility_proof: 'Sägenspezi vervangende carburateur passend voor STIHL 044 en MS 440 (vervangt STIHL 1128 120 0625 / Walbro HD-15D / HD-17D).',
    shipping_note: 'Confirmed on official Sägenspezi Amazon.de MS 440 (044) store page with NL destination (€32.49 item price + €10.00 Sägenspezi merchant shipping to NL).',
    verified_attributes: ['asin', 'part_number', 'seller_id', 'model_compatibility', 'ships_to_nl']
  },
  {
    part_number: '11280201227',
    part_number_formatted: '1128 020 1227',
    asin: 'B00LAHOFMQ',
    manufacturer_part_number: '1128-020-1227-SPEZI-CYL50-12MM-MS440',
    product_title: 'Sägenspezi Zylinder Kolben Set passend für Stihl 044 MS440 MS 440 50mm 12mm Kolbenbolzen',
    package_quantity: 1,
    package_type: 'SINGLE_UNIT',
    item_price: 69.99,
    kill_switch_id: 'KILL_PILOT_DE_11280201227_B00LAHOFMQ_MS440',
    model_compatibility: ['MS 440 (50 mm cilinder, 12 mm zuigerpen)', '044 (uitvoering met 12 mm zuigerpen; niet voor vroege 044 met 10 mm zuigerpen)'],
    compatibility_proof: 'Sägenspezi 50 mm cilinder- en zuigerset met 12 mm zuigerpen (Kolbenbolzen) passend voor STIHL MS 440 en 044 (12 mm uitvoering, vervangt STIHL 1128 020 1227).',
    shipping_note: 'Confirmed on official Sägenspezi Amazon.de MS 440 (044) store page with NL destination ("Bezorging tussen 16 november - 19 november", direct "In winkelwagen leggen" CTA, €69.99 + €10.00 shipping).',
    verified_attributes: ['asin', 'part_number', 'bore_diameter', 'wrist_pin_diameter', 'seller_id', 'ships_to_nl']
  },
  {
    part_number: '11280802115',
    part_number_formatted: '1128 080 2115',
    asin: 'B00LAHP3AE',
    manufacturer_part_number: '1128-080-2115-SPEZI-STARTER-MS440',
    product_title: 'Sägenspezi Starter passend für Stihl 044 MS440 MS 440',
    package_quantity: 1,
    package_type: 'SINGLE_UNIT',
    item_price: 37.99,
    kill_switch_id: 'KILL_PILOT_DE_11280802115_B00LAHP3AE_MS440',
    model_compatibility: ['MS 440', '044'],
    compatibility_proof: 'Sägenspezi trekstarter compleet (ventilatorhuis met terugloopstarter) passend voor STIHL 044 en MS 440 (vervangt STIHL 1128 080 2115).',
    shipping_note: 'Confirmed on official Sägenspezi Amazon.de MS 440 (044) store page with NL destination (€37.99 item price + €10.00 Sägenspezi merchant shipping to NL).',
    verified_attributes: ['asin', 'part_number', 'seller_id', 'model_compatibility', 'ships_to_nl']
  },
  {
    part_number: '11280071050',
    part_number_formatted: '1128 007 1050',
    asin: 'B00LAHMQD6',
    manufacturer_part_number: '1128-007-1050-SPEZI-GASKETS-MS440',
    product_title: 'Sägenspezi Dichtsatz passend für Stihl 044 MS440 MS 440',
    package_quantity: 1,
    package_type: 'SINGLE_UNIT',
    item_price: 12.99,
    kill_switch_id: 'KILL_PILOT_DE_11280071050_B00LAHMQD6_MS440',
    model_compatibility: ['MS 440', '044'],
    compatibility_proof: 'Sägenspezi motorpakkingset (Dichtsatz) passend voor STIHL 044 en MS 440 (vervangt STIHL 1128 007 1050).',
    shipping_note: 'Confirmed on official Sägenspezi Amazon.de MS 440 (044) store page with NL destination (€12.99 item price + €10.00 Sägenspezi merchant shipping to NL).',
    verified_attributes: ['asin', 'part_number', 'seller_id', 'model_compatibility', 'ships_to_nl']
  }
];

for (const item of newMs440Offers) {
  const existingIdx = regDoc.offers.findIndex(o => o.asin === item.asin && o.marketplace === 'amazon.de');
  const record = {
    part_number: item.part_number,
    part_number_formatted: item.part_number_formatted,
    asin: item.asin,
    marketplace: 'amazon.de',
    affiliate_tag: 'srihldecode00-21',
    manufacturer: 'Sägenspezi',
    brand: 'Sägenspezi',
    seller_name: 'Sägenspezi',
    seller_id: 'A1GMRJIURBAM28',
    manufacturer_part_number: item.manufacturer_part_number,
    product_title: item.product_title,
    package_quantity: item.package_quantity,
    package_type: item.package_type,
    oem_brand_classification: 'MANUFACTURER_AFTERMARKET',
    evidence_classification: 'AMAZON_LISTING_COMPATIBLE',
    focus_model: 'MS 440',
    model_compatibility: item.model_compatibility,
    machine_compatibility: [...item.model_compatibility],
    item_price: item.item_price,
    shipping_to_nl_status: 'SHIPS_TO_NL_CONFIRMED',
    shipping_destination_country: 'NL',
    shipping_cost_nl: 10,
    shipping_checked_at: '2026-11-11',
    shipping_evidence_url: `https://www.amazon.de/dp/${item.asin}`,
    shipping_evidence_description: item.shipping_note,
    currency: 'EUR',
    pilot_eligible: true,
    pilot_active: true,
    kill_switch_id: item.kill_switch_id,
    compatibility_proof: item.compatibility_proof,
    asin_product_identity_proof: `Verified on official Sägenspezi Amazon.de Store (044 / MS 440): ASIN ${item.asin} "${item.product_title}".`,
    independent_evidence_url: `https://www.amazon.de/dp/${item.asin}`,
    verifiable_evidence_sources: [
      {
        source_name: 'Sägenspezi Official Store Amazon.de (044 / MS 440)',
        source_type: 'AMAZON_MARKETPLACE_LISTING',
        source_url: `https://www.amazon.de/dp/${item.asin}`,
        url: MS440_STORE_URL,
        claim: `${item.product_title} (€${item.item_price.toFixed(2).replace('.', ',')}).`,
        verified_attributes: item.verified_attributes
      }
    ],
    direct_affiliate_url: `https://www.amazon.de/dp/${item.asin}?tag=srihldecode00-21`,
    search_fallback_url: `https://www.amazon.de/s?k=STIHL+${item.part_number_formatted.replace(/\s+/g, '+')}&tag=srihldecode00-21`,
    verification_date: '2026-11-11',
    status: 'ACTIVE',
    status_reason: `Verified Sägenspezi 044 / MS 440 replacement part (${item.part_number_formatted}) with confirmed NL shipping.`,
    evidence_audit_category: 'VERIFIED_ACTIVE',
    updated_at: nowIso
  };

  if (existingIdx >= 0) {
    regDoc.offers[existingIdx] = record;
  } else {
    regDoc.offers.push(record);
  }
}

// Document parked research backlog for MS 440 and FS 460
regDoc.policy = regDoc.policy || {};
regDoc.policy.phase76_ms440_fs460_parked_research_backlog = [
  {
    model: 'MS 440 / 044',
    category: 'Losse Vollmeißel zaagketting 50 cm (3/8" 1,6 mm 72 TG)',
    candidate_asin: 'B00LAHOD5A',
    candidate_part_numbers: ['3621 000 0072'],
    status: 'PARKED_FOR_LATER_RESEARCH',
    reason: 'B00LAHOD5A is een Vollmeißel (36 RS 72 = 3621 000 0072) ketting; in parts_catalog.json staat alleen 3652 000 0072 (36 RM 72 Halbmeißel). Geen tandtype-mismatch forceren.'
  },
  {
    model: 'MS 440 / 044',
    category: 'Oliepomp compleet & olieaanzuigfilter',
    candidate_asin: 'B00LAHRD6G',
    candidate_part_numbers: ['1128 640 3205', '1128 640 3206', '1117 640 3800'],
    status: 'PARKED_FOR_LATER_RESEARCH',
    reason: 'B00LAHRD6G is een keuzepagina ("verschillende modellen selecteerbaar") zonder vastgestelde MS 440 child-ASIN; wormwiel 1128 640 7112 (B00LAHFW96) is wel geactiveerd.'
  },
  {
    model: 'MS 440 / 044',
    category: 'HD2 hoofdluchtfilter & ontstekingsmodule',
    candidate_part_numbers: ['0000 140 4407', '1128 120 1602', '0000 400 1300'],
    status: 'PARKED_FOR_LATER_RESEARCH',
    reason: 'Nog geen geverifieerde Amazon.nl/Amazon.de aanbieding met bewezen NL-verzending voor het losse HD2 filterelement of ontstekingsmodule 0000 400 1300.'
  },
  {
    model: 'FS 460',
    category: 'Maaidraad (2,7 mm / 3,0 mm), maaimessen, carburateur (WTF) en M-Tronic ontstekingsmodule',
    candidate_part_numbers: ['0000 930 2227', '0000 930 2340', '4119 713 4100', '4147 120 0603', '4147 007 1700', '4147 400 4711'],
    status: 'PARKED_FOR_LATER_RESEARCH',
    reason: 'Sägenspezi voert geen FS 460 bosmaaier-assortiment; eerdere Amazon.nl kandidaten zijn geparkeerd als RESEARCH_REQUIRED totdat onafhankelijke ASIN- en verzendverificatie beschikbaar is.'
  }
];

// Update registry metrics
const allOffers = regDoc.offers;
const activeOffers = allOffers.filter(o => o.status === 'ACTIVE' && o.pilot_active === true);
const activeNl = activeOffers.filter(o => !o.marketplace || o.marketplace === 'amazon.nl');
const activeDe = activeOffers.filter(o => o.marketplace === 'amazon.de');
const researchCount = allOffers.filter(o => o.status === 'RESEARCH_REQUIRED').length;
const verifiedInactiveCount = allOffers.filter(o => o.status === 'VERIFIED' && !o.pilot_active).length;

regDoc.metrics = {
  ...regDoc.metrics,
  total_registered: allOffers.length,
  active: activeOffers.length,
  active_nl: activeNl.length,
  active_de: activeDe.length,
  research_required: researchCount,
  verified: verifiedInactiveCount,
  staged: 0,
  suspended: 0,
  last_updated: nowIso
};

fs.writeFileSync(registryPath, JSON.stringify(regDoc, null, 2) + '\n', 'utf8');

// Synchronize runtime amazon_part_offers.json
const runtimeDoc = JSON.parse(fs.readFileSync(runtimeOffersPath, 'utf8'));
runtimeDoc.offers = activeOffers;
runtimeDoc.generated_at = nowIso;
fs.writeFileSync(runtimeOffersPath, JSON.stringify(runtimeDoc, null, 2) + '\n', 'utf8');

console.log(`Updated registry: total=${allOffers.length}, active=${activeOffers.length} (NL=${activeNl.length}, DE=${activeDe.length}), research=${researchCount}, verified_inactive=${verifiedInactiveCount}`);
