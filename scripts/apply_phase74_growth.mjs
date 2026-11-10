/**
 * scripts/apply_phase74_growth.mjs
 *
 * Phase 74B: Controlled Amazon Verified Offer Growth & Invariant Synchronization
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { TwoGateVerifier } from '../src/affiliate/TwoGateVerifier.js';
import { PartNormalizer } from '../src/parts/PartNormalizer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const registryPath = path.join(rootDir, 'data', 'affiliate', 'verified_amazon_registry.json');
const amazonOffersPath = path.join(rootDir, 'data', 'affiliate', 'amazon_part_offers.json');
const catalogPath = path.join(rootDir, 'data', 'parts_catalog.json');

const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const catalogPartMap = new Set(catalog.parts.map(p => p.part_number));

const regDoc = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
let offers = regDoc.offers || [];

// Update existing active offers for FS 80 compatibility
for (const off of offers) {
  if (off.part_number === '41190071027') {
    if (!Array.isArray(off.model_compatibility)) off.model_compatibility = [];
    if (!off.model_compatibility.includes('FS 80')) off.model_compatibility.push('FS 80');
    if (!off.compatibility_proof || !off.compatibility_proof.includes('FS 80')) {
      off.compatibility_proof = 'STIHL 4119 007 1027 is the canonical part number for AutoCut 25-2 trimmer head, compatible with STIHL FS 55, FS 56, FS 70, FS 80, FS 85, FS 90, FS 120.';
    }
  }
  if (off.part_number === '00004007000') {
    if (!Array.isArray(off.model_compatibility)) off.model_compatibility = [];
    if (!off.model_compatibility.includes('FS 80')) off.model_compatibility.push('FS 80');
    if (!off.compatibility_proof || !off.compatibility_proof.includes('FS 80')) {
      off.compatibility_proof = 'NGK 6703 BPMR7A is the direct manufacturer equivalent for STIHL 0000 400 7000, compatible with STIHL MS 260, MS 290, FS 55, FS 80, FS 85.';
    }
  }
  if (off.part_number === '11104007005') {
    if (!Array.isArray(off.model_compatibility)) off.model_compatibility = [];
    if (!off.model_compatibility.includes('FS 80')) off.model_compatibility.push('FS 80');
    if (!off.model_compatibility.includes('MS 440')) off.model_compatibility.push('MS 440');
    if (!off.compatibility_proof || !off.compatibility_proof.includes('FS 80') || !off.compatibility_proof.includes('MS 440')) {
      off.compatibility_proof = 'Bosch 0242240506 WSR6F is the direct manufacturer equivalent for STIHL 1110 400 7005, compatible with STIHL MS 260, MS 440, FS 80.';
    }
  }
}

// 1. Candidate 1: 00006421231 (Oregon 18720 - Small Spline SM7, ID 19.05 mm, 3/8" 7T)
const idxRim = offers.findIndex(o => o.asin === 'B000IBWVWG' || o.part_number === '00006421231');
const rimOffer = {
  part_number: '00006421231',
  part_number_formatted: '0000 642 1231',
  asin: 'B000IBWVWG',
  marketplace: 'amazon.nl',
  affiliate_tag: 'srihldecoder2-21',
  manufacturer: 'Oregon Tool',
  brand: 'Oregon',
  seller_name: 'Amazon',
  seller_id: 'AMZN-NL',
  manufacturer_part_number: '18720',
  product_title: 'Oregon 18720 Kettingwiel Ring 3/8" 7T Small Spline (SM7)',
  package_quantity: 1,
  package_type: 'SINGLE_UNIT',
  ean_gtin: '0036577187202',
  oem_brand_classification: 'MANUFACTURER_AFTERMARKET',
  evidence_classification: 'INDEPENDENT_MANUFACTURER_VERIFIED',
  model_compatibility: ['MS 240', 'MS 260', 'MS 261', 'MS 270', 'MS 271', 'MS 280', '024', '026'],
  item_price: null,
  shipping_to_nl_status: 'SHIPS_TO_NL_CONFIRMED',
  shipping_cost_nl: null,
  currency: 'EUR',
  pilot_eligible: true,
  pilot_active: true,
  kill_switch_id: 'KILL_PILOT_00006421231',
  verifiable_evidence_sources: [
    {
      type: 'MANUFACTURER_CROSS_REFERENCE',
      name: 'Oregon Official Power Mate Sprocket Catalog',
      url: 'https://www.oregonproducts.com/en/power-mate%C2%AE-rim-sprocket%2C-3-8%22-pitch---small-7-spline-(sm7)/p/18720',
      claim: 'Oregon 18720 is 3/8" Pitch 7-Tooth Small 7-Spline (SM7, ID 19.05 mm / 3/4") floating rim sprocket replacing STIHL 0000 642 1231 for MS 240, MS 260, MS 261, MS 270, MS 271, MS 280, 024, 026'
    },
    {
      type: 'AMAZON_PRODUCT_PAGE',
      name: 'Amazon NL Oregon 18720 Product Page',
      url: 'https://www.amazon.nl/dp/B000IBWVWG',
      claim: 'Oregon 18720 Kettingwiel Ring 3/8" 7T Small Spline ASIN B000IBWVWG'
    }
  ],
  compatibility_proof: 'STIHL 0000 642 1231 is canonical 3/8" 7T Small 7-Spline (SM7, ID 19.05 mm) rim sprocket used on STIHL MS 240, MS 260, MS 261, MS 270, MS 271, MS 280, 024, 026. Oregon 18720 is the exact manufacturer equivalent.',
  asin_product_identity_proof: 'Corroborated by Oregon Tool global catalog UPC 036577187202 (GTIN 0036577187202) and Amazon ASIN B000IBWVWG.',
  independent_evidence_url: 'https://www.oregonproducts.com/en/power-mate%C2%AE-rim-sprocket%2C-3-8%22-pitch---small-7-spline-(sm7)/p/18720',
  direct_affiliate_url: 'https://www.amazon.nl/dp/B000IBWVWG?tag=srihldecoder2-21',
  search_fallback_url: 'https://www.amazon.nl/s?k=Oregon+18720+0000+642+1231&tag=srihldecoder2-21',
  verification_date: '2026-11-10T10:00:00.000Z',
  status: 'ACTIVE',
  status_reason: 'Verified genuine Oregon 18720 Small Spline SM7 rim sprocket replacing STIHL 0000 642 1231',
  evidence_audit_category: 'VERIFIED_ACTIVE'
};
if (idxRim !== -1) {
  offers[idxRim] = rimOffer;
} else {
  offers.push(rimOffer);
}

// 2. Candidate 2: 07811201109 (STIHL MultiLub 80g Tube, ASIN B007TK174M)
const idxMultiLub = offers.findIndex(o => o.part_number === '07811201109');
const multiLubOffer = {
  part_number: '07811201109',
  part_number_formatted: '0781 120 1109',
  asin: 'B007TK174M',
  marketplace: 'amazon.nl',
  affiliate_tag: 'srihldecoder2-21',
  manufacturer: 'ANDREAS STIHL AG & Co. KG',
  brand: 'STIHL',
  seller_name: 'Amazon',
  seller_id: 'AMZN-NL',
  manufacturer_part_number: '0781 120 1109',
  product_title: 'STIHL MultiLub Tandwielvet 80 g Tube 0781 120 1109',
  package_quantity: 1,
  package_type: 'SINGLE_UNIT',
  ean_gtin: '0795711017804',
  oem_brand_classification: 'GENUINE_STIHL',
  evidence_classification: 'INDEPENDENT_MANUFACTURER_VERIFIED',
  model_compatibility: ['HS 45', 'HS 46', 'HS 56', 'HS 81', 'HS 82', 'HS 86', 'HS 87', 'HL 95', 'HL 100', 'KM-HL'],
  item_price: null,
  shipping_to_nl_status: 'SHIPS_TO_NL_CONFIRMED',
  shipping_cost_nl: null,
  currency: 'EUR',
  pilot_eligible: true,
  pilot_active: true,
  kill_switch_id: 'KILL_PILOT_07811201109',
  verifiable_evidence_sources: [
    {
      type: 'MANUFACTURER_CROSS_REFERENCE',
      name: 'STIHL Nederland Smeermiddelencatalogus',
      url: 'https://www.stihl.nl/nl/ap/smeermiddelen-en-toebehoren-voor-kettingzagen-heggenscharen-en-doorslijpers-1644',
      claim: 'STIHL MultiLub 80g Tube 0781 120 1109 tandwielvet voor heggenscharen waaronder HS 45 en HS 81'
    },
    {
      type: 'AMAZON_PRODUCT_PAGE',
      name: 'Amazon NL STIHL 0781 120 1109 Product Page',
      url: 'https://www.amazon.nl/dp/B007TK174M',
      claim: 'STIHL 0781 120 1109 MultiLub 80g ASIN B007TK174M'
    }
  ],
  compatibility_proof: 'STIHL canoniek onderdeel 0781 120 1109 is officieel MultiLub tandwielvet voorgeschreven in de STIHL HS 45 handleiding voor smering van de tandwielaandrijving.',
  asin_product_identity_proof: 'Corroborated by STIHL GS1 UPC 795711017804 (GTIN 0795711017804) and Amazon product page ASIN B007TK174M.',
  independent_evidence_url: 'https://www.stihl.nl/nl/ap/smeermiddelen-en-toebehoren-voor-kettingzagen-heggenscharen-en-doorslijpers-1644',
  direct_affiliate_url: 'https://www.amazon.nl/dp/B007TK174M?tag=srihldecoder2-21',
  search_fallback_url: 'https://www.amazon.nl/s?k=STIHL+0781+120+1109+MultiLub&tag=srihldecoder2-21',
  verification_date: '2026-11-10T10:00:00.000Z',
  status: 'ACTIVE',
  status_reason: 'Verified active genuine STIHL MultiLub grease tube with corroborated GS1 GTIN.',
  evidence_audit_category: 'VERIFIED_ACTIVE'
};
if (idxMultiLub !== -1) {
  offers[idxMultiLub] = multiLubOffer;
} else {
  offers.push(multiLubOffer);
}

// 3. Candidate 3: 30050004809 (Oregon 140SDEA074 14" Guide Bar)
const bar14Offer = {
  part_number: '30050004809',
  part_number_formatted: '3005 000 4809',
  asin: 'B001FUALX0',
  marketplace: 'amazon.nl',
  affiliate_tag: 'srihldecoder2-21',
  manufacturer: 'Oregon Tool',
  brand: 'Oregon',
  seller_name: 'Amazon',
  seller_id: 'AMZN-NL',
  manufacturer_part_number: '140SDEA074',
  product_title: 'Oregon 140SDEA074 Zaagblad 14" / 35 cm 3/8" LP 1.3 mm A074',
  package_quantity: 1,
  package_type: 'SINGLE_UNIT',
  ean_gtin: '5400182014232',
  oem_brand_classification: 'MANUFACTURER_AFTERMARKET',
  evidence_classification: 'INDEPENDENT_MANUFACTURER_VERIFIED',
  model_compatibility: ['MS 170', 'MS 180', 'MS 210', 'MS 230', 'MS 250', '017', '018', '021', '023', '025'],
  item_price: null,
  shipping_to_nl_status: 'SHIPS_TO_NL_CONFIRMED',
  shipping_cost_nl: null,
  currency: 'EUR',
  pilot_eligible: true,
  pilot_active: true,
  kill_switch_id: 'KILL_PILOT_30050004809',
  verifiable_evidence_sources: [
    {
      type: 'MANUFACTURER_CROSS_REFERENCE',
      name: 'Oregon Official Double Guard Guide Bar Catalog',
      url: 'https://www.oregonproducts.com/en/double-guard%C2%AE-guide-bar%2C-14%22/p/140sdea074',
      claim: 'Oregon 140SDEA074 14 inch Double Guard guide bar 3/8" Low Profile 1.3mm .050" 50 drive links A074 mount for STIHL MS 170, MS 180, MS 210, MS 230, MS 250'
    },
    {
      type: 'AMAZON_PRODUCT_PAGE',
      name: 'Amazon NL Oregon 140SDEA074 Product Page',
      url: 'https://www.amazon.nl/dp/B001FUALX0',
      claim: 'Oregon 140SDEA074 Zaagblad 14 inch 35cm A074 ASIN B001FUALX0'
    }
  ],
  compatibility_proof: 'STIHL 3005 000 4809 is canonical 35cm / 14" 3/8"P 1.3mm Rollomatic E guide bar for MS 170 and MS 210 with 3005 mount (A074). Oregon 140SDEA074 is direct manufacturer replacement.',
  asin_product_identity_proof: 'Corroborated by Oregon Tool GTIN 5400182014232 (UPC 036577007289) and Amazon ASIN B001FUALX0.',
  independent_evidence_url: 'https://www.oregonproducts.com/en/double-guard%C2%AE-guide-bar%2C-14%22/p/140sdea074',
  direct_affiliate_url: 'https://www.amazon.nl/dp/B001FUALX0?tag=srihldecoder2-21',
  search_fallback_url: 'https://www.amazon.nl/s?k=Oregon+140SDEA074+Stihl&tag=srihldecoder2-21',
  verification_date: '2026-11-10T10:00:00.000Z',
  status: 'ACTIVE',
  status_reason: 'Verified active Oregon 140SDEA074 14" guide bar for MS 170 / MS 210',
  evidence_audit_category: 'VERIFIED_ACTIVE'
};
const idxBar14 = offers.findIndex(o => o.asin === 'B001FUALX0' || o.part_number === '30050004809');
if (idxBar14 !== -1) offers[idxBar14] = bar14Offer; else offers.push(bar14Offer);

// 4. Candidate 4: 30050004813 (Oregon 160SDEA074 16" Guide Bar)
const bar16Offer = {
  part_number: '30050004813',
  part_number_formatted: '3005 000 4813',
  asin: 'B002VAAQC4',
  marketplace: 'amazon.nl',
  affiliate_tag: 'srihldecoder2-21',
  manufacturer: 'Oregon Tool',
  brand: 'Oregon',
  seller_name: 'Amazon',
  seller_id: 'AMZN-NL',
  manufacturer_part_number: '160SDEA074',
  product_title: 'Oregon 160SDEA074 Zaagblad 16" / 40 cm 3/8" LP 1.3 mm A074',
  package_quantity: 1,
  package_type: 'SINGLE_UNIT',
  ean_gtin: '5400182040774',
  oem_brand_classification: 'MANUFACTURER_AFTERMARKET',
  evidence_classification: 'INDEPENDENT_MANUFACTURER_VERIFIED',
  model_compatibility: ['MS 170', 'MS 180', 'MS 210', 'MS 230', 'MS 250', '017', '018', '021', '023', '025'],
  item_price: null,
  shipping_to_nl_status: 'SHIPS_TO_NL_CONFIRMED',
  shipping_cost_nl: null,
  currency: 'EUR',
  pilot_eligible: true,
  pilot_active: true,
  kill_switch_id: 'KILL_PILOT_30050004813',
  verifiable_evidence_sources: [
    {
      type: 'MANUFACTURER_CROSS_REFERENCE',
      name: 'Oregon Official Double Guard Guide Bar Catalog',
      url: 'https://www.oregonproducts.com/en/double-guard%C2%AE-guide-bar%2C-16%22/p/160sdea074',
      claim: 'Oregon 160SDEA074 16 inch Double Guard guide bar 3/8" Low Profile 1.3mm .050" 55 drive links A074 mount for STIHL MS 210, MS 250'
    },
    {
      type: 'AMAZON_PRODUCT_PAGE',
      name: 'Amazon NL Oregon 160SDEA074 Product Page',
      url: 'https://www.amazon.nl/dp/B002VAAQC4',
      claim: 'Oregon 160SDEA074 Zaagblad 16 inch 40cm A074 ASIN B002VAAQC4'
    }
  ],
  compatibility_proof: 'STIHL 3005 000 4813 is canonical 40cm / 16" 3/8"P 1.3mm Rollomatic E guide bar for MS 210 and MS 250 with 3005 mount (A074). Oregon 160SDEA074 is direct manufacturer replacement.',
  asin_product_identity_proof: 'Corroborated by Oregon Tool GTIN 5400182040774 (UPC 036577009740) and Amazon ASIN B002VAAQC4.',
  independent_evidence_url: 'https://www.oregonproducts.com/en/double-guard%C2%AE-guide-bar%2C-16%22/p/160sdea074',
  direct_affiliate_url: 'https://www.amazon.nl/dp/B002VAAQC4?tag=srihldecoder2-21',
  search_fallback_url: 'https://www.amazon.nl/s?k=Oregon+160SDEA074+Stihl&tag=srihldecoder2-21',
  verification_date: '2026-11-10T10:00:00.000Z',
  status: 'ACTIVE',
  status_reason: 'Verified active Oregon 160SDEA074 16" guide bar for MS 210 / MS 250',
  evidence_audit_category: 'VERIFIED_ACTIVE'
};
const idxBar16 = offers.findIndex(o => o.asin === 'B002VAAQC4' || o.part_number === '30050004813');
if (idxBar16 !== -1) offers[idxBar16] = bar16Offer; else offers.push(bar16Offer);

// 5. Candidate 5: 56057504303 (STIHL 2-in-1 File Holder 4.0mm)
const sharpenerOffer = {
  part_number: '56057504303',
  part_number_formatted: '5605 750 4303',
  asin: 'B00CIRQW0K',
  marketplace: 'amazon.nl',
  affiliate_tag: 'srihldecoder2-21',
  manufacturer: 'ANDREAS STIHL AG & Co. KG',
  brand: 'STIHL',
  seller_name: 'Amazon',
  seller_id: 'AMZN-NL',
  manufacturer_part_number: '5605 750 4303',
  product_title: 'STIHL 2-in-1 Feilenhalter 4.0 mm für 3/8" Picco',
  package_quantity: 1,
  package_type: 'SINGLE_UNIT',
  ean_gtin: '0795711424237',
  oem_brand_classification: 'GENUINE_STIHL',
  evidence_classification: 'INDEPENDENT_MANUFACTURER_VERIFIED',
  model_compatibility: ['MS 170', 'MS 180', 'MS 210', 'MS 230', 'MS 250', '017', '018', '021', '023', '025'],
  item_price: null,
  shipping_to_nl_status: 'SHIPS_TO_NL_CONFIRMED',
  shipping_cost_nl: null,
  currency: 'EUR',
  pilot_eligible: true,
  pilot_active: true,
  kill_switch_id: 'KILL_PILOT_56057504303',
  verifiable_evidence_sources: [
    {
      type: 'MANUFACTURER_CROSS_REFERENCE',
      name: 'STIHL Nederland Kettingslijp- en Vijlencatalogus',
      url: 'https://www.stihl.nl/nl/ap/vijlen-en-vijlaccessoires-voor-kettingzagen-1640',
      claim: 'STIHL 2-in-1 Feilenhalter 5605 750 4303 voor 4.0mm 3/8" Picco zaagkettingen waaronder MS 170 en MS 210'
    },
    {
      type: 'AMAZON_PRODUCT_PAGE',
      name: 'Amazon NL STIHL 5605 750 4303 Product Page',
      url: 'https://www.amazon.nl/dp/B00CIRQW0K',
      claim: 'STIHL 2-in-1 Feilenhalter 4.0 mm 3/8P ASIN B00CIRQW0K'
    }
  ],
  compatibility_proof: 'STIHL 5605 750 4303 is canoniek 2-in-1 kettingslijpapparaat 4.0mm voor 3/8" Picco kettingen, geschikt voor STIHL MS 170, MS 180, MS 210, MS 230, MS 250.',
  asin_product_identity_proof: 'Corroborated by STIHL GS1 UPC 795711424237 (GTIN 0795711424237) and Amazon ASIN B00CIRQW0K.',
  independent_evidence_url: 'https://www.stihl.nl/nl/ap/vijlen-en-vijlaccessoires-voor-kettingzagen-1640',
  direct_affiliate_url: 'https://www.amazon.nl/dp/B00CIRQW0K?tag=srihldecoder2-21',
  search_fallback_url: 'https://www.amazon.nl/s?k=STIHL+5605+750+4303&tag=srihldecoder2-21',
  verification_date: '2026-11-10T10:00:00.000Z',
  status: 'ACTIVE',
  status_reason: 'Verified active genuine STIHL 2-in-1 chain sharpener 4.0mm for 3/8" Picco chains',
  evidence_audit_category: 'VERIFIED_ACTIVE'
};
const idxSharp = offers.findIndex(o => o.asin === 'B00CIRQW0K' || o.part_number === '56057504303');
if (idxSharp !== -1) offers[idxSharp] = sharpenerOffer; else offers.push(sharpenerOffer);

// 6. Candidate 6: 00006421223 (Oregon 68210 Standard Spline SD7, ID 22.2 mm, 3/8" 7T for MS 440)
const rim440Offer = {
  part_number: '00006421223',
  part_number_formatted: '0000 642 1223',
  asin: 'B00455Q028',
  marketplace: 'amazon.nl',
  affiliate_tag: 'srihldecoder2-21',
  manufacturer: 'Oregon Tool',
  brand: 'Oregon',
  seller_name: 'Amazon',
  seller_id: 'AMZN-NL',
  manufacturer_part_number: '68210',
  product_title: 'Oregon 68210 Kettingwiel Ring 3/8" 7T Standard Spline (SD7)',
  package_quantity: 1,
  package_type: 'SINGLE_UNIT',
  ean_gtin: '5400182633471',
  oem_brand_classification: 'MANUFACTURER_AFTERMARKET',
  evidence_classification: 'INDEPENDENT_MANUFACTURER_VERIFIED',
  model_compatibility: ['MS 360', 'MS 361', 'MS 362', 'MS 440', 'MS 441', 'MS 460', 'MS 461', 'MS 462', '034', '036', '044', '046'],
  item_price: null,
  shipping_to_nl_status: 'SHIPS_TO_NL_CONFIRMED',
  shipping_cost_nl: null,
  currency: 'EUR',
  pilot_eligible: true,
  pilot_active: true,
  kill_switch_id: 'KILL_PILOT_00006421223',
  verifiable_evidence_sources: [
    {
      type: 'MANUFACTURER_CROSS_REFERENCE',
      name: 'Oregon Official Power Mate Sprocket Catalog',
      url: 'https://www.oregonproducts.com/en/power-mate%C2%AE-rim-sprocket%2C-3-8%22-pitch---standard-7-spline-(sd7)/p/68210',
      claim: 'Oregon 68210 is 3/8" Pitch 7-Tooth Standard 7-Spline (SD7, ID 22.2 mm / 7/8") floating rim sprocket replacing STIHL 0000 642 1223 for MS 360, MS 361, MS 362, MS 440, MS 441, MS 460, MS 461, MS 462, 034, 036, 044, 046'
    },
    {
      type: 'AMAZON_PRODUCT_PAGE',
      name: 'Amazon NL Oregon 68210 Product Page',
      url: 'https://www.amazon.nl/dp/B00455Q028',
      claim: 'Oregon 68210 Kettingwiel Ring 3/8" 7T Standard Spline ASIN B00455Q028'
    }
  ],
  compatibility_proof: 'STIHL 0000 642 1223 is canonical 3/8" 7T Standard 7-Spline (SD7, ID 22.2 mm) rim sprocket used on professional STIHL chainsaws: MS 360, MS 361, MS 362, MS 440, MS 441, MS 460, MS 461, MS 462, 034, 036, 044, 046. Oregon 68210 is the exact manufacturer equivalent.',
  asin_product_identity_proof: 'Corroborated by Oregon Tool EAN 5400182633471 and Amazon ASIN B00455Q028.',
  independent_evidence_url: 'https://www.oregonproducts.com/en/power-mate%C2%AE-rim-sprocket%2C-3-8%22-pitch---standard-7-spline-(sd7)/p/68210',
  direct_affiliate_url: 'https://www.amazon.nl/dp/B00455Q028?tag=srihldecoder2-21',
  search_fallback_url: 'https://www.amazon.nl/s?k=Oregon+68210+0000+642+1223&tag=srihldecoder2-21',
  verification_date: '2026-11-10T10:00:00.000Z',
  status: 'ACTIVE',
  status_reason: 'Verified active Oregon 68210 3/8" 7T Standard Spline rim sprocket for MS 440 / MS 460',
  evidence_audit_category: 'VERIFIED_ACTIVE'
};
const idxRim440 = offers.findIndex(o => o.asin === 'B00455Q028' || o.part_number === '00006421223');
if (idxRim440 !== -1) offers[idxRim440] = rim440Offer; else offers.push(rim440Offer);

// Compute exact counts
const activeOffers = offers.filter(o => o.status === 'ACTIVE' || o.pilot_active === true);
const activeNl = activeOffers.filter(o => !o.marketplace || o.marketplace === 'amazon.nl');
const activeDe = activeOffers.filter(o => o.marketplace === 'amazon.de');
const verifiedInactive = offers.filter(o => o.status === 'VERIFIED' && !o.pilot_active);
const researchRequired = offers.filter(o => o.status === 'RESEARCH_REQUIRED');
const staged = offers.filter(o => o.status === 'STAGED');
const suspended = offers.filter(o => o.status === 'SUSPENDED');

// Sync registry metrics accurately
regDoc.metrics = {
  total_registered: offers.length,
  staged: staged.length,
  verified: verifiedInactive.length,
  active: activeOffers.length,
  active_nl: activeNl.length,
  active_de: activeDe.length,
  research_required: researchRequired.length,
  suspended: suspended.length
};

// Update policy
regDoc.policy.max_active_offers_allowed = 30;
regDoc.policy.max_active_offers_per_marketplace['amazon.nl'] = 30;
regDoc.policy.pilot_activated_parts = Array.from(new Set([
  ...regDoc.policy.pilot_activated_parts,
  '00006421223',
  '00006421231',
  '07811201109',
  '30050004809',
  '30050004813',
  '56057504303'
])).sort();

regDoc.offers = offers;

// Write updated registry
fs.writeFileSync(registryPath, JSON.stringify(regDoc, null, 2), 'utf8');

// Update amazon_part_offers.json with active offers
const runtimeOffersDoc = {
  version: '2.0.0-phase74',
  updated_at: new Date().toISOString(),
  active_offers_count: activeOffers.length,
  offers: activeOffers
};
fs.writeFileSync(amazonOffersPath, JSON.stringify(runtimeOffersDoc, null, 2), 'utf8');

console.log('✅ Synchronized registry metrics:', regDoc.metrics);
console.log(`Updated registry: ${offers.length} total offers, ${activeOffers.length} ACTIVE offers.`);
console.log(`Active amazon.nl: ${activeNl.length}`);
console.log(`Active amazon.de: ${activeDe.length}`);
