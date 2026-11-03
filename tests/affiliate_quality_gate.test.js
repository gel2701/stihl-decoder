/**
 * tests/affiliate_quality_gate.test.js
 *
 * Phase 60Q / 60Q.1: Automated Quality Gate & Adversarial Regression Suite
 *
 * Verifies that:
 * 1. GS1 GTIN check digit validation strictly enforces correct parities and lengths.
 * 2. All historical incorrect matches fail verification immediately (fail closed).
 * 3. Valid positive control records with traceable evidence pass TwoGateVerifier cleanly.
 * 4. Adversarial tests reject:
 *    - Fake ASIN proof text (agent-generated / title-only claims)
 *    - Genuine manufacturer page containing no ASIN
 *    - Random HTTPS URLs / untrusted domains
 *    - Fabricated source classifications
 *    - asin_identity_corroborated: true without real evidence
 *    - Correct MPN with wrong ASIN
 *    - Correct ASIN with wrong EAN
 *    - Correct product with wrong package quantity
 * 5. Production activation path (VerifiedOfferRegistry + AmazonProductionOfferContract)
 *    fails closed against adversarial candidates and protects active production offers.
 * 6. Explicit lifecycle taxonomy statuses are strictly adhered to.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TwoGateVerifier,
  GATE_STATUSES,
  VALID_OFFER_STATUSES,
  UNVERIFIED_ASIN_STATUSES
} from '../src/affiliate/TwoGateVerifier.js';
import { validateGtin, calculateGs1CheckDigit } from '../src/affiliate/GtinValidator.js';
import {
  HISTORICAL_MISMATCH_RECORDS,
  checkHistoricalMismatch
} from '../src/affiliate/HistoricalMismatches.js';
import { VerifiedOfferRegistry } from '../src/affiliate/VerifiedOfferRegistry.js';

// --- Positive Control Records (Authoritative Production & Staged Matches with Traceable Evidence) ---
const POSITIVE_CONTROLS = {
  BOSCH_WSR6F: {
    part_number: '11104007005',
    asin: 'B0068M5NAG',
    marketplace: 'amazon.nl',
    affiliate_tag: 'srihldecoder2-21',
    manufacturer: 'Bosch Automotive Aftermarket',
    manufacturer_part_number: '0242240506',
    trade_number: 'WSR6F',
    brand: 'Bosch',
    product_title: 'Bosch 0242240506 Spark Plug WSR6F',
    package_quantity: 1,
    is_multipack: false,
    ean_gtin: '3165141051063',
    oem_brand_classification: 'OEM_SUPPLIER_EQUIVALENT',
    compatibility_proof: 'STIHL 1110 400 7005 standard spark plug for 017-026, MS 170-MS 260',
    asin_product_identity_proof: 'Bosch Zündkerze WSR6F (Herstellernummer: 0 242 240 506 / 0242240506, EAN: 3165141051063) confirms Amazon ASIN B0068M5NAG.',
    independent_evidence_url: 'https://www.motointegrator.de/artikel/468993-zuendkerze-bosch-0-242-240-506-1-stueck',
    verifiable_evidence_sources: [
      {
        type: 'EXTERNAL_CATALOG',
        url: 'https://www.motointegrator.de/artikel/468993-zuendkerze-bosch-0-242-240-506-1-stueck',
        title: 'Bosch Automotive Aftermarket',
        claim: 'Bosch Zündkerze WSR6F (Herstellernummer: 0 242 240 506 / 0242240506, EAN: 3165141051063) confirms Amazon ASIN B0068M5NAG.',
        retrieved_at: '2026-11-01'
      }
    ],
    verification_date: '2026-11-01',
    status: 'ACTIVE'
  },
  NGK_BPMR7A: {
    part_number: '00004007000',
    asin: 'B001RM8J76',
    marketplace: 'amazon.nl',
    affiliate_tag: 'srihldecoder2-21',
    manufacturer: 'Niterra Co., Ltd. (NGK Spark Plugs)',
    manufacturer_part_number: 'BPMR7A / 6703',
    trade_number: 'BPMR7A',
    brand: 'NGK',
    product_title: 'NGK 6703 BPMR7A Standard Spark Plug',
    package_quantity: 1,
    is_multipack: false,
    ean_gtin: '0087295167038',
    oem_brand_classification: 'OEM_SUPPLIER_EQUIVALENT',
    compatibility_proof: 'STIHL 0000 400 7000 factory specification for MS 290, TS 400, TS 420',
    asin_product_identity_proof: 'AmzChart product intelligence confirms Amazon ASIN B001RM8J76 is authentic NGK BPMR7A (Stock 6703, GTIN 0087295167038).',
    independent_evidence_url: 'https://amzchart.com/product-research/spark-plugs-15716421',
    verifiable_evidence_sources: [
      {
        type: 'EXTERNAL_CATALOG',
        url: 'https://amzchart.com/product-research/spark-plugs-15716421',
        title: 'Niterra Co., Ltd. (NGK Spark Plugs)',
        claim: 'AmzChart product intelligence confirms Amazon ASIN B001RM8J76 is authentic NGK BPMR7A (Stock 6703, GTIN 0087295167038).',
        retrieved_at: '2026-11-01'
      }
    ],
    verification_date: '2026-11-01',
    status: 'ACTIVE'
  },
  NGK_CMR6H: {
    part_number: '00004007011',
    asin: 'B001RMA5S2',
    marketplace: 'amazon.nl',
    affiliate_tag: 'srihldecoder2-21',
    manufacturer: 'Niterra Co., Ltd. (NGK Spark Plugs)',
    manufacturer_part_number: 'CMR6H / 3365',
    trade_number: 'CMR6H',
    brand: 'NGK',
    product_title: 'NGK 3365 CMR6H Compact Spark Plug',
    package_quantity: 1,
    is_multipack: false,
    ean_gtin: '0087295133651',
    oem_brand_classification: 'OEM_SUPPLIER_EQUIVALENT',
    compatibility_proof: 'STIHL 0000 400 7011 compact plug for FS 460 C-EM, MS 261 C-M',
    asin_product_identity_proof: 'NGK Zündkerze CMR6H (MPN CMR6H, Stock 3365, EAN 0087295133651) confirms Amazon ASIN B001RMA5S2.',
    independent_evidence_url: 'https://www.motointegrator.de/artikel/842061-zuendkerze-ngk-cmr6h-3365-1-stueck',
    verifiable_evidence_sources: [
      {
        type: 'EXTERNAL_CATALOG',
        url: 'https://www.motointegrator.de/artikel/842061-zuendkerze-ngk-cmr6h-3365-1-stueck',
        title: 'Niterra Co., Ltd. (NGK Spark Plugs)',
        claim: 'NGK Zündkerze CMR6H (MPN CMR6H, Stock 3365, EAN 0087295133651) confirms Amazon ASIN B001RMA5S2.',
        retrieved_at: '2026-11-01'
      }
    ],
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

  // Restricted GS1 distribution prefixes (coupon / internal)
  assert.equal(validateGtin('2001234567899').valid, false, 'Prefix 200 restricted distribution fails');
  assert.equal(validateGtin('0401234567899').valid, false, 'Prefix 040 restricted distribution fails');
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

test('Phase 60Q.1 Gate 4 — Adversarial Regression Suite (Closing Verification Loopholes)', () => {
  const base = POSITIVE_CONTROLS.BOSCH_WSR6F;

  // 1. Fake ASIN proof text (agent-generated / title-only match claims)
  const fakeProofCandidate = {
    ...base,
    asin_product_identity_proof: 'Confirmed match by agent text analysis. 100% genuine match verified.',
    independent_evidence_url: 'https://www.motointegrator.de/artikel/468993-zuendkerze-bosch-0-242-240-506-1-stueck',
    verifiable_evidence_sources: []
  };
  const fakeRes = TwoGateVerifier.verifyOffer(fakeProofCandidate);
  assert.equal(fakeRes.passed, false, 'Fake ASIN proof text must fail verification');
  assert.ok(fakeRes.errors.some(e => e.includes('SELF_CERTIFIED_PROOF_REJECTED')), 'Must reject self-certified agent claim');

  // 2. Genuine manufacturer page containing no ASIN
  const mfrNoAsinCandidate = {
    ...POSITIVE_CONTROLS.NGK_CMR6H,
    independent_evidence_url: 'https://www.ngkntk.com/part-finder/product/CMR6H',
    verifiable_evidence_sources: [
      {
        type: 'MANUFACTURER_CATALOG',
        url: 'https://www.ngkntk.com/part-finder/product/CMR6H',
        title: 'NGK Part Finder CMR6H',
        claim: 'NGK Spark Plug CMR6H (Stock No 3365, M10x1.0 thread, hex 16mm). Official manufacturer specifications.',
        retrieved_at: '2026-11-01'
      }
    ]
  };
  const mfrRes = TwoGateVerifier.verifyOffer(mfrNoAsinCandidate);
  assert.equal(mfrRes.passed, false, 'Genuine manufacturer page without ASIN cannot prove ASIN identity');
  assert.ok(mfrRes.errors.some(e => e.includes('contains no attributable corroboration for Amazon ASIN')));

  // 3. Random HTTPS URL / untrusted domain
  const randomUrlCandidate = {
    ...base,
    independent_evidence_url: 'https://random-blog.example.org/stihl-chainsaw-repair-guide',
    verifiable_evidence_sources: []
  };
  const randomRes = TwoGateVerifier.verifyOffer(randomUrlCandidate);
  assert.equal(randomRes.passed, false, 'Random blog URL must fail verification');
  assert.ok(randomRes.errors.some(e => e.includes('UNTRUSTED_EVIDENCE_SOURCE')));

  // 4. Fabricated source classifications
  const fabricatedTypeCandidate = {
    ...base,
    verifiable_evidence_sources: [
      {
        type: 'AMAZON_CATALOG_VERIFIED',
        url: 'https://generic-store.example/item',
        title: 'Fabricated Store',
        claim: 'Generic statement claiming match without proof',
        retrieved_at: '2026-11-01'
      }
    ]
  };
  const fabRes = TwoGateVerifier.verifyOffer(fabricatedTypeCandidate);
  assert.equal(fabRes.passed, false, 'Fabricated source classification label must not grant pass');
  assert.ok(fabRes.errors.some(e => e.includes('UNTRUSTED_EVIDENCE_SOURCE') || e.includes('GENERIC_EVIDENCE_URL_REJECTED')));

  // 5. asin_identity_corroborated: true without real evidence
  const booleanBypassCandidate = {
    ...base,
    asin_identity_corroborated: true,
    independent_evidence_url: 'https://www.sandbysmeden.dk/wp-content/uploads/2023/09/Stihl-FS-460.pdf',
    verifiable_evidence_sources: []
  };
  const boolRes = TwoGateVerifier.verifyOffer(booleanBypassCandidate);
  assert.equal(boolRes.passed, false, 'asin_identity_corroborated: true cannot bypass IPL evidence rejection');
  assert.ok(boolRes.errors.some(e => e.includes('ASIN_IDENTITY_UNVERIFIED')));

  // 6. Correct MPN with the wrong ASIN
  const wrongAsinCandidate = {
    ...POSITIVE_CONTROLS.NGK_BPMR7A,
    asin: 'B001RMA5S2', // NGK BPMR7A candidate pointing to CMR6H ASIN
    verifiable_evidence_sources: [
      {
        type: 'EXTERNAL_CATALOG',
        url: 'https://amzchart.com/product-research/spark-plugs-15716421',
        title: 'Niterra Co., Ltd. (NGK Spark Plugs)',
        claim: 'AmzChart product intelligence confirms Amazon ASIN B001RM8J76 is authentic NGK BPMR7A (Stock 6703).',
        retrieved_at: '2026-11-01'
      }
    ]
  };
  const wrongAsinRes = TwoGateVerifier.verifyOffer(wrongAsinCandidate);
  assert.equal(wrongAsinRes.passed, false, 'Evidence citing a conflicting ASIN must fail');
  assert.ok(wrongAsinRes.errors.some(e => e.includes('ASIN_MISMATCH') || e.includes('KNOWN_PART_NUMBER_MISMATCH')));

  // 7. Correct ASIN with wrong EAN
  const wrongEanCandidate = {
    ...POSITIVE_CONTROLS.NGK_CMR6H,
    ean_gtin: '0087295133652' // invalid parity check-digit
  };
  const wrongEanRes = TwoGateVerifier.verifyOffer(wrongEanCandidate);
  assert.equal(wrongEanRes.passed, false, 'Corrupted EAN must fail Gate 1');
  assert.ok(wrongEanRes.errors.some(e => e.includes('INVALID_GTIN')));

  // Contradictory EAN in evidence source
  const swappedEanCandidate = {
    ...POSITIVE_CONTROLS.NGK_CMR6H,
    ean_gtin: '0087295133651',
    verifiable_evidence_sources: [
      {
        type: 'EXTERNAL_CATALOG',
        url: 'https://www.motointegrator.de/artikel/842061-zuendkerze-ngk-cmr6h-3365-1-stueck',
        title: 'NGK Spark Plugs',
        claim: 'NGK Zündkerze CMR6H confirms Amazon ASIN B001RMA5S2 with EAN 3165141051063.', // Bosch EAN
        retrieved_at: '2026-11-01'
      }
    ]
  };
  const swappedEanRes = TwoGateVerifier.verifyOffer(swappedEanCandidate);
  assert.equal(swappedEanRes.passed, false, 'Contradictory GTIN in evidence source must fail');
  assert.ok(swappedEanRes.errors.some(e => e.includes('GTIN_MISMATCH')));

  // 8. Correct product with wrong package quantity
  const multiPackCandidate = {
    ...base,
    product_title: 'Bosch WSR6F Spark Plug (Pack of 10)',
    package_quantity: 1
  };
  const multiPackRes = TwoGateVerifier.verifyOffer(multiPackCandidate);
  assert.equal(multiPackRes.passed, false, 'Pack of 10 with package_quantity 1 must fail');
  assert.ok(multiPackRes.errors.some(e => e.includes('PACKAGE_QUANTITY_MISMATCH')));

  // 9. Status marked ASIN_IDENTITY_UNVERIFIED fails closed
  const unverifiedStatusCandidate = {
    ...base,
    status: 'ASIN_IDENTITY_UNVERIFIED'
  };
  const unverifiedRes = TwoGateVerifier.verifyOffer(unverifiedStatusCandidate);
  assert.equal(unverifiedRes.passed, false, 'Status ASIN_IDENTITY_UNVERIFIED must fail');
  assert.ok(unverifiedRes.errors.some(e => e.includes('ASIN_IDENTITY_UNVERIFIED')));
});

test('Phase 60Q.1 Gate 5 — Production Activation Path Guardrails (VerifiedOfferRegistry)', () => {
  const registry = new VerifiedOfferRegistry({
    productionActivationAllowed: true,
    activeWhitelist: ['11104007005', '00004007000', '00004007011']
  });

  // A. Positive control registers cleanly as ACTIVE
  const regPositive = registry.registerOffer({
    ...POSITIVE_CONTROLS.BOSCH_WSR6F,
    status: 'ACTIVE'
  });
  assert.equal(regPositive.success, true, 'Positive control must register successfully in ACTIVE status');

  // B. Adversarial fake-proof candidate fails registration for ACTIVE or VERIFIED
  const regAdversarial = registry.registerOffer({
    ...POSITIVE_CONTROLS.BOSCH_WSR6F,
    asin_product_identity_proof: 'Confirmed match by agent text analysis.',
    verifiable_evidence_sources: [],
    status: 'ACTIVE'
  });
  assert.equal(regAdversarial.success, false, 'Adversarial candidate cannot achieve ACTIVE status in registry');
  assert.ok(regAdversarial.errors[0].includes('Two-Gate verification failed'));

  // C. Unverified candidate fails registration when requesting VERIFIED status
  const regUnverified = registry.registerOffer({
    ...POSITIVE_CONTROLS.NGK_CMR6H,
    status: 'VERIFIED',
    asin_identity_verified: false
  });
  assert.equal(regUnverified.success, false, 'Unverified candidate cannot achieve VERIFIED status');

  // D. Staged unverified candidate fails promotion to VERIFIED_WITH_INDEPENDENT_ASIN_EVIDENCE
  const regStagedPromotion = registry.registerOffer({
    ...POSITIVE_CONTROLS.NGK_CMR6H,
    status: 'VERIFIED_WITH_INDEPENDENT_ASIN_EVIDENCE',
    independent_evidence_url: 'https://www.sandbysmeden.dk/wp-content/uploads/2023/09/Stihl-FS-460.pdf',
    verifiable_evidence_sources: []
  });
  assert.equal(regStagedPromotion.success, false, 'Candidate with IPL cannot be promoted to VERIFIED_WITH_INDEPENDENT_ASIN_EVIDENCE');
});

test('Phase 60Q.1 Gate 6 — Lifecycle Taxonomy Invariants', () => {
  const requiredStatuses = [
    'VERIFIED_WITH_INDEPENDENT_ASIN_EVIDENCE',
    'PART_COMPATIBILITY_ONLY',
    'ASIN_IDENTITY_UNVERIFIED',
    'CONFLICTING_EVIDENCE',
    'INCORRECT_MATCH_CONFIRMED'
  ];

  for (const st of requiredStatuses) {
    assert.ok(VALID_OFFER_STATUSES.has(st), `VALID_OFFER_STATUSES must contain "${st}"`);
  }

  assert.ok(UNVERIFIED_ASIN_STATUSES.has('ASIN_IDENTITY_UNVERIFIED'));
  assert.ok(UNVERIFIED_ASIN_STATUSES.has('PART_COMPATIBILITY_ONLY'));
  assert.ok(UNVERIFIED_ASIN_STATUSES.has('CONFLICTING_EVIDENCE'));
  assert.ok(UNVERIFIED_ASIN_STATUSES.has('INCORRECT_MATCH_CONFIRMED'));
});
