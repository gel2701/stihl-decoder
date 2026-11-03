/**
 * tests/affiliate_quality_gate.test.js
 *
 * Phase 60Q: Automated Quality Gate & Permanent Negative Regression Suite
 *
 * Verifies that:
 * 1. All historical incorrect matches fail verification immediately (fail closed).
 * 2. Valid positive control records pass TwoGateVerifier.
 * 3. Self-certifying or fabricated ASIN identity claims without independent proof fail.
 * 4. GS1 GTIN check digit validation strictly enforces correct parities and lengths.
 * 5. Packaging and quantity contradictions are caught and rejected.
 * 6. The 3 existing live pilot ASINs remain completely functional.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { TwoGateVerifier, GATE_STATUSES } from '../src/affiliate/TwoGateVerifier.js';
import { validateGtin, calculateGs1CheckDigit } from '../src/affiliate/GtinValidator.js';
import {
  HISTORICAL_MISMATCH_RECORDS,
  checkHistoricalMismatch
} from '../src/affiliate/HistoricalMismatches.js';

// --- Positive Control Records (Known Valid Matches) ---
const POSITIVE_CONTROLS = {
  BOSCH_WSR6F: {
    part_number: '11104007005',
    asin: 'B003VPU5IM',
    marketplace: 'amazon.nl',
    affiliate_tag: 'srihldecoder2-21',
    manufacturer: 'Robert Bosch GmbH',
    manufacturer_part_number: 'WSR6F',
    brand: 'Bosch',
    product_title: 'Bosch WSR6F Spark Plug',
    package_quantity: 1,
    is_multipack: false,
    ean_gtin: '3165141051063',
    oem_brand_classification: 'OEM_SUPPLIER_EQUIVALENT',
    compatibility_proof: 'STIHL 1110 400 7005 standard spark plug for 017-026, MS 170-MS 260',
    asin_product_identity_proof: 'Verified official Bosch packaging with ASIN B003VPU5IM matching WSR6F',
    independent_evidence_url: 'https://www.motointegrator.de/artikel/468993-zuendkerze-bosch-0-242-240-506-1-stueck',
    verification_date: '2026-11-01',
    status: 'ACTIVE'
  },
  NGK_BPMR7A: {
    part_number: '00004007000',
    asin: 'B001RM8J76',
    marketplace: 'amazon.nl',
    affiliate_tag: 'srihldecoder2-21',
    manufacturer: 'Niterra Co., Ltd. (NGK Spark Plugs)',
    manufacturer_part_number: 'BPMR7A',
    brand: 'NGK',
    product_title: 'NGK 6703 BPMR7A Standard Spark Plug',
    package_quantity: 1,
    is_multipack: false,
    ean_gtin: '0087295167038',
    oem_brand_classification: 'OEM_SUPPLIER_EQUIVALENT',
    compatibility_proof: 'STIHL 0000 400 7000 factory specification for MS 290, TS 400, TS 420',
    asin_product_identity_proof: 'ASIN B001RM8J76 matches NGK Stock 6703 BPMR7A',
    independent_evidence_url: 'https://amzchart.com/product-research/spark-plugs-15716421',
    verification_date: '2026-11-01',
    status: 'ACTIVE'
  },
  NGK_CMR6H: {
    part_number: '00004007011',
    asin: 'B001RMA5S2',
    marketplace: 'amazon.nl',
    affiliate_tag: 'srihldecoder2-21',
    manufacturer: 'Niterra Co., Ltd. (NGK Spark Plugs)',
    manufacturer_part_number: 'CMR6H',
    brand: 'NGK',
    product_title: 'NGK 3365 CMR6H Compact Spark Plug',
    package_quantity: 1,
    is_multipack: false,
    ean_gtin: '0087295133651',
    oem_brand_classification: 'OEM_SUPPLIER_EQUIVALENT',
    compatibility_proof: 'STIHL 0000 400 7011 compact plug for FS 460 C-EM, MS 261 C-M',
    asin_product_identity_proof: 'ASIN B001RMA5S2 matches NGK Stock 3365 CMR6H',
    independent_evidence_url: 'https://www.ngkntk.com/part-finder/product/CMR6H',
    verification_date: '2026-11-01',
    status: 'ACTIVE'
  }
};

test('Phase 60Q Gate 1 — GS1 GTIN Modulo-10 Check-Digit Validation Engine', () => {
  // Test mathematical algorithm
  assert.equal(calculateGs1CheckDigit('008729513365'), 1, 'NGK CMR6H 12-digit prefix requires check digit 1');
  assert.equal(calculateGs1CheckDigit('008729516703'), 8, 'NGK BPMR7A 12-digit prefix requires check digit 8');
  assert.equal(calculateGs1CheckDigit('316514105106'), 3, 'Bosch WSR6F 12-digit prefix requires check digit 3');

  // Valid GTIN formats
  assert.equal(validateGtin('0087295133651').valid, true, 'Valid GTIN-13 passes');
  assert.equal(validateGtin('0087295167038').valid, true, 'Valid GTIN-13 passes');
  assert.equal(validateGtin('3165141051063').valid, true, 'Valid GTIN-13 passes');
  assert.equal(validateGtin('12345670').valid, true, 'Valid GTIN-8 passes');
  assert.equal(validateGtin('012345678905').valid, true, 'Valid GTIN-12 passes');
  assert.equal(validateGtin('00012345678905').valid, true, 'Valid GTIN-14 passes');

  // Invalid GTIN parities (including historical mistake)
  const badCmr6h = validateGtin('0087295133652');
  assert.equal(badCmr6h.valid, false, '0087295133652 must fail GTIN parity check');
  assert.equal(badCmr6h.expectedCheckDigit, 1);
  assert.equal(badCmr6h.actualCheckDigit, 2);

  // Formatting / character rejections
  assert.equal(validateGtin('').valid, false, 'Empty GTIN fails');
  assert.equal(validateGtin(null).valid, false, 'Null GTIN fails');
  assert.equal(validateGtin('008729513365A').valid, false, 'Alphanumeric GTIN fails');
  assert.equal(validateGtin('12345').valid, false, 'Non-standard 5-digit GTIN fails');
});

test('Phase 60Q Gate 2 — All Historical Mistakes Permanently Rejected', () => {
  for (const mismatch of HISTORICAL_MISMATCH_RECORDS) {
    const detection = checkHistoricalMismatch(
      mismatch.part_number,
      mismatch.asin,
      mismatch.claimed_product,
      mismatch.claimed_gtin
    );

    assert.equal(
      detection.isMismatch,
      true,
      `Historical mismatch ${mismatch.id} (${mismatch.part_number} -> ${mismatch.asin || mismatch.claimed_gtin}) must be detected`
    );

    // TwoGateVerifier must fail closed on this candidate
    const mockCandidate = {
      part_number: mismatch.part_number,
      asin: mismatch.asin || 'B001RMA5S2',
      marketplace: 'amazon.nl',
      affiliate_tag: 'srihldecoder2-21',
      manufacturer: 'Generic Supplier',
      manufacturer_part_number: mismatch.claimed_mpn || 'GENERIC',
      brand: 'Generic',
      product_title: mismatch.claimed_product,
      ean_gtin: mismatch.claimed_gtin || '0087295133651',
      oem_brand_classification: 'MANUFACTURER_AFTERMARKET',
      compatibility_proof: 'Generic compatibility claim',
      asin_product_identity_proof: 'Generic ASIN claim',
      independent_evidence_url: 'https://example.com/evidence',
      verification_date: '2026-11-01'
    };

    const verResult = TwoGateVerifier.verifyOffer(mockCandidate);
    assert.equal(
      verResult.passed,
      false,
      `TwoGateVerifier must reject historical mismatch ${mismatch.id}: ${mismatch.reason}`
    );
  }
});

test('Phase 60Q Gate 3 — Positive Controls Pass TwoGateVerifier Cleanly', () => {
  for (const [key, candidate] of Object.entries(POSITIVE_CONTROLS)) {
    const res = TwoGateVerifier.verifyOffer(candidate);
    assert.equal(
      res.passed,
      true,
      `Positive control ${key} (${candidate.part_number} -> ${candidate.asin}) must pass TwoGateVerifier: ${res.errors.join('; ')}`
    );
    assert.equal(res.overall_status, GATE_STATUSES.PASS);
    assert.equal(res.errors.length, 0);
  }
});

test('Phase 60Q Gate 4 — Uncorroborated / Staged ASIN Claims Rejected', () => {
  // A. Candidate marked ASIN_IDENTITY_UNVERIFIED must fail
  const unverifiedCandidate = {
    ...POSITIVE_CONTROLS.BOSCH_WSR6F,
    status: 'ASIN_IDENTITY_UNVERIFIED'
  };
  const unverifiedRes = TwoGateVerifier.verifyOffer(unverifiedCandidate);
  assert.equal(unverifiedRes.passed, false, 'Candidate with status ASIN_IDENTITY_UNVERIFIED must fail verification');
  assert.ok(unverifiedRes.errors.some(e => e.includes('ASIN_IDENTITY_UNVERIFIED')));

  // B. Manufacturer PDF IPL as sole source cannot prove third-party Amazon ASIN
  const iplOnlyCandidate = {
    ...POSITIVE_CONTROLS.NGK_CMR6H,
    independent_evidence_url: 'https://www.sandbysmeden.dk/wp-content/uploads/2023/09/Stihl-FS-460.pdf',
    verifiable_evidence_sources: []
  };
  const iplRes = TwoGateVerifier.verifyOffer(iplOnlyCandidate);
  assert.equal(iplRes.passed, false, 'Manufacturer PDF IPL cannot prove Amazon ASIN identity');
  assert.ok(iplRes.errors.some(e => e.includes('ASIN_IDENTITY_UNVERIFIED')));

  // C. Disallowed volatile fact (static price) fails Gate 2
  const priceCandidate = {
    ...POSITIVE_CONTROLS.BOSCH_WSR6F,
    price: '4.95'
  };
  const priceRes = TwoGateVerifier.verifyOffer(priceCandidate);
  assert.equal(priceRes.passed, false, 'Candidate with static price must fail Gate 2');
  assert.ok(priceRes.errors.some(e => e.includes('Disallowed volatile fact')));

  // D. Invalid GTIN fails Gate 1
  const badGtinCandidate = {
    ...POSITIVE_CONTROLS.NGK_CMR6H,
    ean_gtin: '0087295133652' // invalid parity bit
  };
  const badGtinRes = TwoGateVerifier.verifyOffer(badGtinCandidate);
  assert.equal(badGtinRes.passed, false, 'Candidate with invalid GTIN must fail Gate 1');
  assert.ok(badGtinRes.errors.some(e => e.includes('INVALID_GTIN')));
});

test('Phase 60Q Gate 5 — Packaging Quantity Integrity Enforcement', () => {
  const invalidQtyCandidate = {
    ...POSITIVE_CONTROLS.BOSCH_WSR6F,
    package_quantity: 0
  };
  const res = TwoGateVerifier.verifyOffer(invalidQtyCandidate);
  assert.equal(res.passed, false, 'package_quantity 0 must fail verification');
  assert.ok(res.errors.some(e => e.includes('package_quantity')));
});
