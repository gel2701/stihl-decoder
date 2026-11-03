/**
 * src/affiliate/HistoricalMismatches.js
 *
 * Phase 60Q: Authoritative Historical Mismatch Registry & Permanent Negative Fixtures
 *
 * Catalogs known historical incorrect cross-references, invalid mappings, and corrupted GTINs.
 * Used for:
 * 1. Runtime guardrails in TwoGateVerifier and AmazonProductionOfferContract.
 * 2. Cross-manifest contradiction checking in check_affiliate_consistency.mjs.
 * 3. Permanent negative regression test fixtures in affiliate_quality_gate.test.js.
 */

import { PartNormalizer } from '../parts/PartNormalizer.js';

export const HISTORICAL_MISMATCH_RECORDS = [
  {
    id: 'MISMATCH_00004007025_CMR7H_PACK',
    part_number: '00004007025',
    part_name_canonical: 'Bougie ZK C 10',
    asin: 'B07RHQ5FR4',
    claimed_product: 'NGK CMR7H Single Spark Plug',
    claimed_mpn: 'CMR7H',
    mismatch_type: 'QUANTITY_AND_PART_MISMATCH',
    reason: 'STIHL 0000 400 7025 is a 10-pack wholesale box (ZK C 10); single piece NGK CMR7H (3066) is an unverified quantity mismatch.',
    rejection_gate: 'GATE_2'
  },
  {
    id: 'MISMATCH_00006421223_OREGON_18720_SPLINE',
    part_number: '00006421223',
    part_name_canonical: 'Kettingtandwiel .325" 7T SD7',
    asin: 'B000IBWVWG',
    claimed_product: 'Oregon 18720 Rim Sprocket',
    claimed_mpn: '18720',
    mismatch_type: 'TECHNICAL_SPECIFICATION_SPLINE_MISMATCH',
    reason: 'STIHL 0000 642 1223 is Standard 7-spline (SD7, ~22.2mm bore); Oregon 18720 is Small 7-spline (SM7, ~19.0mm bore) matching STIHL 1121 640 2004.',
    rejection_gate: 'GATE_2'
  },
  {
    id: 'MISMATCH_00006421223_OREGON_BAR_COMBO',
    part_number: '00006421223',
    part_name_canonical: 'Kettingtandwiel .325" 7T SD7',
    asin: 'B00004RA6N',
    claimed_product: 'Oregon Guide Bar & Chain Combo',
    claimed_mpn: '27788',
    mismatch_type: 'PRODUCT_CATEGORY_MISMATCH',
    reason: 'STIHL 0000 642 1223 is a rim sprocket; ASIN B00004RA6N is a guide bar combo.',
    rejection_gate: 'GATE_2'
  },
  {
    id: 'MISMATCH_00003503518_OREGON_33_518',
    part_number: '00003503518',
    part_name_canonical: 'Brandstoftankdop / Pickup',
    asin: 'B00004RA5B',
    claimed_product: 'Oregon 33-518 Ignition Coil',
    claimed_mpn: '33-518',
    mismatch_type: 'CROSS_MANUFACTURER_CATEGORY_MISMATCH',
    reason: 'Oregon 33-518 is an ignition module for Kohler small engines, not a STIHL fuel cap or pickup body.',
    rejection_gate: 'GATE_2'
  },
  {
    id: 'MISMATCH_11236402074_OREGON_106114',
    part_number: '11236402074',
    part_name_canonical: 'Rondsel met koppelingstrommel .325" 7T',
    asin: 'B00004RA7C',
    claimed_product: 'Oregon 106114 Clutch Drum',
    claimed_mpn: '106114',
    mismatch_type: 'CROSS_BRAND_INCOMPATIBILITY',
    reason: 'Oregon 106114 fits Husqvarna/Poulan chainsaws only; zero STIHL clutch drum compatibility.',
    rejection_gate: 'GATE_2'
  },
  {
    id: 'MISMATCH_42381401800_STENS_605_385',
    part_number: '42381401800',
    part_name_canonical: 'Luchtfilter TS 410 / TS 420',
    asin: 'B00004RA8D',
    claimed_product: 'Stens 605-385 Air Filter',
    claimed_mpn: '605-385',
    mismatch_type: 'MODEL_APPLICATION_MISMATCH',
    reason: 'Stens 605-385 replaces STIHL 1121 120 1618 for MS 260 chainsaws, not TS 410/420 cut-off saws.',
    rejection_gate: 'GATE_2'
  },
  {
    id: 'MISMATCH_B001RM8J76_WSR6F_CONFUSION',
    part_number: '11104007005',
    part_name_canonical: 'Bougie Bosch WSR 6 F',
    asin: 'B001RM8J76',
    claimed_product: 'Bosch WSR 6 F Spark Plug',
    claimed_mpn: 'WSR6F',
    mismatch_type: 'ASIN_IDENTITY_INVERSION',
    reason: 'ASIN B001RM8J76 is NGK BPMR7A (Stock 6703); Bosch WSR6F is ASIN B003VPU5IM. Claiming B001RM8J76 for WSR6F is an identity error.',
    rejection_gate: 'GATE_2'
  },
  {
    id: 'MISMATCH_00004007000_CMR6H_CONFUSION',
    part_number: '00004007000',
    part_name_canonical: 'Spark plug NGK BPMR7A',
    asin: 'B001RMA5S2',
    claimed_product: 'NGK CMR6H Spark Plug',
    claimed_mpn: 'CMR6H',
    mismatch_type: 'STIHL_PART_IDENTITY_MISMATCH',
    reason: 'STIHL 0000 400 7000 is M14 NGK BPMR7A (or Bosch WSR6F equivalent); NGK CMR6H is M10 compact plug STIHL 0000 400 7011.',
    rejection_gate: 'GATE_1_AND_2'
  },
  {
    id: 'MISMATCH_CMR6H_PARITY_ERROR_GTIN',
    part_number: '00004007011',
    part_name_canonical: 'Spark plug NGK CMR6H',
    asin: 'B001RMA5S2',
    claimed_product: 'NGK CMR6H',
    claimed_gtin: '0087295133652',
    mismatch_type: 'INVALID_GS1_CHECK_DIGIT',
    reason: '0087295133652 has invalid parity digit (2 vs expected 1). Legitimate GTIN is 0087295133651.',
    rejection_gate: 'GATE_1'
  }
];

/**
 * Checks whether a candidate part number + ASIN or metadata matches a known historical mismatch.
 *
 * @param {string} partNumber - STIHL part number
 * @param {string} [asin] - Candidate ASIN
 * @param {string} [titleOrProduct] - Title, product description, or MPN string
 * @param {string} [gtin] - Candidate GTIN
 * @returns {{ isMismatch: boolean, record?: Object }}
 */
export function checkHistoricalMismatch(partNumber, asin = '', titleOrProduct = '', gtin = '') {
  if (!partNumber || typeof partNumber !== 'string') {
    return { isMismatch: false };
  }

  const normPart = PartNormalizer.normalizePartNumber(partNumber);
  const cleanAsin = typeof asin === 'string' ? asin.trim().toUpperCase() : '';
  const desc = typeof titleOrProduct === 'string' ? titleOrProduct.toLowerCase() : '';
  const cleanGtin = typeof gtin === 'string' ? gtin.replace(/[-\s]/g, '') : '';

  for (const rec of HISTORICAL_MISMATCH_RECORDS) {
    if (rec.part_number !== normPart) continue;

    // Check by GTIN match (for GTIN-specific defects, only GTIN triggers mismatch)
    if (rec.mismatch_type === 'INVALID_GS1_CHECK_DIGIT') {
      if (cleanGtin && rec.claimed_gtin && cleanGtin === rec.claimed_gtin) {
        return { isMismatch: true, record: rec };
      }
      continue;
    }

    // Check by ASIN match
    if (cleanAsin && rec.asin === cleanAsin) {
      return { isMismatch: true, record: rec };
    }

    // Check by MPN / Title pattern match
    if (desc) {
      if (rec.claimed_mpn && desc.includes(rec.claimed_mpn.toLowerCase())) {
        // Special case: 00004007000 vs CMR6H
        if (normPart === '00004007000' && (desc.includes('cmr6h') || desc.includes('3365'))) {
          return { isMismatch: true, record: rec };
        }
        // Special case: 00004007025 vs CMR7H
        if (normPart === '00004007025' && (desc.includes('cmr7h') || desc.includes('3066'))) {
          return { isMismatch: true, record: rec };
        }
        // Special case: 00006421223 vs 18720
        if (normPart === '00006421223' && (desc.includes('18720') || desc.includes('sm7') || desc.includes('small spline'))) {
          return { isMismatch: true, record: rec };
        }
        // Special case: 00003503518 vs 33-518
        if (normPart === '00003503518' && desc.includes('33-518')) {
          return { isMismatch: true, record: rec };
        }
        // Special case: 11236402074 vs 106114
        if (normPart === '11236402074' && desc.includes('106114')) {
          return { isMismatch: true, record: rec };
        }
        // Special case: 42381401800 vs 605-385
        if (normPart === '42381401800' && desc.includes('605-385')) {
          return { isMismatch: true, record: rec };
        }
      }
    }
  }

  // Cross-check ASIN inversion: B001RM8J76 paired with WSR6F regardless of part number
  if (cleanAsin === 'B001RM8J76' && desc.includes('wsr6f')) {
    return {
      isMismatch: true,
      record: HISTORICAL_MISMATCH_RECORDS.find(r => r.id === 'MISMATCH_B001RM8J76_WSR6F_CONFUSION')
    };
  }

  return { isMismatch: false };
}
