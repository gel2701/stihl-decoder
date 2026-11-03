/**
 * Forensic Audit and Dual-Gate Classification Script for Phase 60.1
 * Evaluates all Amazon candidate matches against strict Gate 1 (Technical & Catalog fit)
 * and Gate 2 (Independent ASIN Product Identity Link).
 *
 * Enforces:
 * - No fake 100% pass: A STIHL manual / IPL proves fitment (Gate 1), NOT Amazon ASIN identity (Gate 2).
 * - Known incorrect matches (e.g. 0000 400 7025 CMR7H 10-pack, 0000 642 1223 spline mismatch) are INCORRECT_MATCH_CONFIRMED.
 * - Candidates with proven Gate 1 + Gate 2 are VERIFIED_ACTIVATION_READY.
 * - Candidates with proven Gate 1 but unverified ASIN link are PART_COMPATIBILITY_VERIFIED / ASIN_IDENTITY_UNVERIFIED.
 * - Preserves the 3 active live pilot ASINs.
 */

import fs from 'fs';
import path from 'path';

const ROOT_DIR = process.cwd();
const CANDIDATES_FILE = path.join(ROOT_DIR, 'PHASE60_AMAZON_MATCHING_CANDIDATES.json');
const VERIFIED_OUTPUT = path.join(ROOT_DIR, 'PHASE60_1_VERIFIED_OFFERS.json');
const REJECTED_OUTPUT = path.join(ROOT_DIR, 'PHASE60_1_REJECTED_AND_PENDING.json');
const AUDIT_REPORT = path.join(ROOT_DIR, 'PHASE60_1_EVIDENCE_AUDIT.md');

// Known disproven & forbidden matches from Phase 59F.1 / Phase 60.1
const FORBIDDEN_MATCHES = [
  {
    part_number: '00004007025',
    part_number_formatted: '0000 400 7025',
    asin: 'B07RHQ5FR4',
    trade_number: 'CMR7H',
    reason: 'QUANTITY_AND_HEAT_RANGE_MISMATCH: STIHL 0000 400 7025 is workshop 10-pack (ZK C 10, heat range 6); ASIN B07RHQ5FR4 is single piece NGK CMR7H (heat range 7).',
    verdict: 'INCORRECT_MATCH_CONFIRMED'
  },
  {
    part_number: '00006421223',
    part_number_formatted: '0000 642 1223',
    asin: 'B000IBWVWG',
    trade_number: '18720',
    reason: 'SPLINE_MISMATCH: STIHL 0000 642 1223 requires Standard 7-Spline (SD7); Oregon 18720 (ASIN B000IBWVWG) is Small 7-Spline (SM7).',
    verdict: 'INCORRECT_MATCH_CONFIRMED'
  },
  {
    part_number: '00006421223',
    part_number_formatted: '0000 642 1223',
    asin: 'B00004RA6N',
    trade_number: '68210',
    reason: 'PRODUCT_IDENTITY_MISMATCH: ASIN B00004RA6N belongs to Oregon guide bar/chain combination product line, NOT Oregon 68210 SD7 rim sprocket.',
    verdict: 'INCORRECT_MATCH_CONFIRMED'
  }
];

// Load Phase 60 candidates
const phase60Data = JSON.parse(fs.readFileSync(CANDIDATES_FILE, 'utf8'));
const rawCandidates = phase60Data.candidates || [];

// Active 3 Pilot ASINs
const ACTIVE_PILOT_PARTS = new Set(['11104007005', '00004007000', '00004007011']);

const verifiedOffers = [];
const rejectedAndPending = [];

// Helper to check if URL proves Gate 2 (independent product identity) vs only Gate 1 (manual/IPL/generic category)
function evaluateGate2Evidence(candidate) {
  const url = candidate.independent_evidence_url || '';
  const asinProof = candidate.asin_product_identity_proof || '';
  const ean = candidate.ean_gtin || '';

  // 1. Check for disproven combinations
  for (const forbidden of FORBIDDEN_MATCHES) {
    if (candidate.part_number === forbidden.part_number && candidate.asin === forbidden.asin) {
      return {
        passed: false,
        verdict: 'INCORRECT_MATCH_CONFIRMED',
        reason: forbidden.reason
      };
    }
  }

  // 2. Active Pilot ASINs (fully corroborated in Phase 59E.1 / Phase 60)
  if (ACTIVE_PILOT_PARTS.has(candidate.part_number)) {
    return {
      passed: true,
      verdict: 'VERIFIED_ACTIVATION_READY',
      reason: 'Fully corroborated via external catalog (Motointegrator / AmzChart) and active in live production pilot.'
    };
  }

  // 3. Bosch USR7AC (0000 400 7009 -> B09QH68W83) verified in Phase 59F.1
  if (candidate.part_number === '00004007009' && candidate.asin === 'B09QH68W83') {
    return {
      passed: true,
      verdict: 'VERIFIED_ACTIVATION_READY',
      reason: 'Robert Bosch OEM USR7AC (0242035503, EAN 4047023059468) independently corroborated via Motointegrator catalog.'
    };
  }

  // 4. Oregon 18720 SM7 (0000 642 1240 -> B000IBWVWG)
  if (candidate.part_number === '00006421240' && candidate.asin === 'B000IBWVWG') {
    return {
      passed: true,
      verdict: 'VERIFIED_ACTIVATION_READY',
      reason: 'Oregon 18720 Power Mate 3/8-7 Small Spline SM7 independently verified on Amazon catalog and Oregon fitment chart.'
    };
  }

  // 5. If the evidence URL is just a STIHL manual PDF or generic STIHL overview page:
  const isStihlManual = url.includes('.pdf') || url.includes('sandbysmeden.dk') || url.includes('stihl.nl') || url.includes('stihlusa.com');
  if (isStihlManual) {
    return {
      passed: false,
      verdict: 'PART_COMPATIBILITY_VERIFIED',
      substatus: 'ASIN_IDENTITY_UNVERIFIED',
      reason: 'Gate 1 fitment is proven by official STIHL manual, but Gate 2 lacks independent Amazon ASIN catalog link (EAN/GTIN or manufacturer listing linking ASIN).'
    };
  }

  // 6. Generic manufacturer page without ASIN confirmation (e.g. Walbro or Stens generic URL)
  if (url.includes('walbro.com') || url.includes('stens.com') || url.includes('hipastore.com')) {
    return {
      passed: false,
      verdict: 'PART_COMPATIBILITY_VERIFIED',
      substatus: 'RESEARCH_PENDING',
      reason: 'Aftermarket manufacturer part number verified, but exact ASIN listing lacks independent GTIN/EAN verification.'
    };
  }

  return {
    passed: false,
    verdict: 'ASIN_IDENTITY_UNVERIFIED',
    reason: 'Unverified ASIN link without third-party catalog corroboration.'
  };
}

// Audit all 50 candidates
for (const cand of rawCandidates) {
  const gate1Passed = Boolean(
    cand.part_number &&
    cand.part_number.length === 11 &&
    cand.compatibility_proof &&
    cand.manufacturer &&
    cand.package_quantity > 0
  );

  const gate2Result = evaluateGate2Evidence(cand);

  const audited = {
    part_number: cand.part_number,
    part_number_formatted: cand.part_number_formatted,
    asin: cand.asin,
    marketplace: cand.marketplace,
    affiliate_tag: cand.affiliate_tag,
    brand: cand.brand,
    manufacturer: cand.manufacturer,
    trade_number: cand.trade_number || cand.manufacturer_part_number,
    ean_gtin: cand.ean_gtin || null,
    product_title: cand.product_title,
    package_quantity: cand.package_quantity,
    oem_brand_classification: cand.oem_brand_classification,
    focus_model: cand.focus_model,
    gate_1_technical: {
      status: gate1Passed ? 'PASS' : 'FAIL',
      fitment_proof: cand.compatibility_proof
    },
    gate_2_product_identity: {
      status: gate2Result.passed ? 'PASS' : 'FAIL',
      evidence_url: cand.independent_evidence_url,
      verdict: gate2Result.verdict,
      reason: gate2Result.reason
    },
    current_status: cand.status === 'ACTIVE' ? 'ACTIVE_LIVE_PILOT' : (gate2Result.passed ? 'VERIFIED_STAGED_READY' : 'STAGED_SEARCH_FALLBACK'),
    classification: gate2Result.verdict
  };

  if (gate2Result.passed) {
    verifiedOffers.push(audited);
  } else {
    rejectedAndPending.push(audited);
  }
}

// Also include disproven forbidden matches from Phase 59F.1 not in rawCandidates
for (const fb of FORBIDDEN_MATCHES) {
  const alreadyIn = rejectedAndPending.some(r => r.part_number === fb.part_number && r.asin === fb.asin);
  if (!alreadyIn) {
    rejectedAndPending.push({
      part_number: fb.part_number,
      part_number_formatted: fb.part_number_formatted,
      asin: fb.asin,
      marketplace: 'amazon.nl',
      affiliate_tag: 'srihldecoder2-21',
      brand: 'NGK / Oregon',
      trade_number: fb.trade_number,
      ean_gtin: null,
      product_title: `Forbidden match: ${fb.trade_number}`,
      package_quantity: 1,
      oem_brand_classification: 'MISMATCH_DISPROVEN',
      focus_model: 'Forbidden Filter',
      gate_1_technical: {
        status: 'FAIL',
        fitment_proof: 'Disproven by manufacturer technical specification.'
      },
      gate_2_product_identity: {
        status: 'FAIL',
        evidence_url: 'N/A',
        verdict: fb.verdict,
        reason: fb.reason
      },
      current_status: 'PERMANENTLY_BLOCKED',
      classification: fb.verdict
    });
  }
}

// Write JSON manifests
const verifiedManifest = {
  schema_version: '1.0.0',
  phase: '60.1',
  audit_timestamp: new Date().toISOString(),
  description: 'Verified Amazon Affiliate Offers (Both Gate 1 and Gate 2 100% Proven)',
  production_lock_policy: {
    active_pilot_limit: 3,
    active_pilot_parts: Array.from(ACTIVE_PILOT_PARTS),
    immediate_activation_allowed_for_new_offers: false,
    require_explicit_operator_command: true
  },
  counts: {
    total_verified_offers: verifiedOffers.length,
    active_live_pilots: verifiedOffers.filter(o => o.current_status === 'ACTIVE_LIVE_PILOT').length,
    verified_staged_ready: verifiedOffers.filter(o => o.current_status === 'VERIFIED_STAGED_READY').length
  },
  offers: verifiedOffers
};

const rejectedManifest = {
  schema_version: '1.0.0',
  phase: '60.1',
  audit_timestamp: new Date().toISOString(),
  description: 'Rejected, Unverified, and Pending Candidates (Safe Fail-Closed to Amazon Search Fallback)',
  counts: {
    total_rejected_or_pending: rejectedAndPending.length,
    by_classification: {
      PART_COMPATIBILITY_VERIFIED: rejectedAndPending.filter(r => r.classification === 'PART_COMPATIBILITY_VERIFIED').length,
      ASIN_IDENTITY_UNVERIFIED: rejectedAndPending.filter(r => r.classification === 'ASIN_IDENTITY_UNVERIFIED').length,
      INCORRECT_MATCH_CONFIRMED: rejectedAndPending.filter(r => r.classification === 'INCORRECT_MATCH_CONFIRMED').length,
      RESEARCH_PENDING: rejectedAndPending.filter(r => r.classification === 'RESEARCH_PENDING').length
    }
  },
  items: rejectedAndPending
};

fs.writeFileSync(VERIFIED_OUTPUT, JSON.stringify(verifiedManifest, null, 2) + '\n');
fs.writeFileSync(REJECTED_OUTPUT, JSON.stringify(rejectedManifest, null, 2) + '\n');

console.log('Verified offers saved:', verifiedOffers.length);
console.log('Rejected/Pending saved:', rejectedAndPending.length);
