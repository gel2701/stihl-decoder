/**
 * scripts/check_affiliate_consistency.mjs
 *
 * Phase 60Q: Cross-Manifest Contradiction & Data Integrity Checker
 *
 * Performs read-only consistency auditing across all affiliate manifests and registries:
 * - Part number vs Manufacturer / MPN / GTIN
 * - ASIN vs Manufacturer / MPN
 * - Packaging quantity & multi-pack consistency
 * - Historical mismatch registry violations
 * - GS1 Modulo-10 GTIN check-digit compliance
 * - Active vs Staged authorization invariants
 *
 * Fails with exit code 1 if any active or verified production offer contains contradictions.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PartNormalizer } from '../src/parts/PartNormalizer.js';
import { validateGtin } from '../src/affiliate/GtinValidator.js';
import { checkHistoricalMismatch } from '../src/affiliate/HistoricalMismatches.js';
import { TwoGateVerifier } from '../src/affiliate/TwoGateVerifier.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Mandatory authorized pilot ASINs
const AUTHORIZED_PILOT_PARTS = new Set([
  '11104007005', // Bosch WSR6F
  '00004007000', // NGK BPMR7A
  '00004007011'  // NGK CMR6H
]);

export function checkAffiliateConsistency() {
  console.log('===============================================================');
  console.log('🛡️  PHASE 60Q: CROSS-MANIFEST AFFILIATE CONSISTENCY CHECKER');
  console.log('===============================================================\n');

  const catalogPath = path.join(rootDir, 'data', 'parts_catalog.json');
  if (!fs.existsSync(catalogPath)) {
    throw new Error('Missing canonical parts catalog at data/parts_catalog.json');
  }
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const canonicalParts = new Map(catalog.parts.map(p => [p.part_number, p]));
  console.log(`Loaded ${canonicalParts.size} canonical parts from catalog.\n`);

  const manifestFiles = [
    { name: 'data/affiliate/amazon_part_offers.json', type: 'RUNTIME_ACTIVE' },
    { name: 'data/affiliate/verified_amazon_registry.json', type: 'REGISTRY' },
    { name: 'PHASE60_1_VERIFIED_OFFERS.json', type: 'VERIFIED_OFFERS' },
    { name: 'PHASE60_1_REJECTED_AND_PENDING.json', type: 'REJECTED_PENDING' },
    { name: 'PHASE60_AMAZON_MATCHING_CANDIDATES.json', type: 'CANDIDATES' }
  ];

  let totalScanned = 0;
  let contradictions = [];
  let gtinErrors = [];
  let unverifiedActives = [];
  let unauthorizedActives = [];

  for (const manifest of manifestFiles) {
    const fullPath = path.join(rootDir, manifest.name);
    if (!fs.existsSync(fullPath)) {
      console.log(`⏩ Skipping optional/missing manifest: ${manifest.name}`);
      continue;
    }

    let doc;
    try {
      doc = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    } catch (err) {
      contradictions.push({ file: manifest.name, error: `JSON Parse Error: ${err.message}` });
      continue;
    }

    const records = Array.isArray(doc)
      ? doc
      : (doc.offers || doc.verified_offers || doc.candidates || doc.items || doc.rejected_or_pending || []);

    console.log(`▶ Auditing ${records.length} records in ${manifest.name} (${manifest.type})...`);

    for (const rec of records) {
      totalScanned++;
      const normPart = PartNormalizer.normalizePartNumber(rec.part_number);
      const asin = typeof rec.asin === 'string' ? rec.asin.trim().toUpperCase() : '';
      const title = rec.product_title || rec.title || rec.matched_title || rec.product || '';
      const gtin = rec.ean_gtin || rec.gtin || rec.ean || '';
      const status = rec.status || 'STAGED';

      // 1. Canonical Part Grounding
      if (!normPart || !canonicalParts.has(normPart)) {
        contradictions.push({
          file: manifest.name,
          part_number: rec.part_number,
          asin,
          error: `Part number "${rec.part_number}" does not exist in canonical parts catalog.`
        });
      }

      // 2. GTIN / EAN GS1 Check-Digit Verification
      if (gtin) {
        const gtinRes = validateGtin(gtin);
        if (!gtinRes.valid) {
          gtinErrors.push({
            file: manifest.name,
            part_number: normPart,
            asin,
            gtin,
            error: gtinRes.error
          });
        }
      }

      // 3. Historical Mismatch Check
      const mismatchCheck = checkHistoricalMismatch(normPart, asin, title, gtin);
      if (mismatchCheck.isMismatch) {
        // If present in REJECTED_PENDING, it is quarantined (valid negative storage)
        // If present in ACTIVE or VERIFIED, it is a critical violation!
        const isQuarantined = manifest.type === 'REJECTED_PENDING' || status === 'INCORRECT_MATCH_CONFIRMED' || status === 'SUSPENDED';
        if (!isQuarantined) {
          contradictions.push({
            file: manifest.name,
            part_number: normPart,
            asin,
            error: `CRITICAL_MISMATCH_DETECTED: ${mismatchCheck.record.reason}`
          });
        }
      }

      // 4. TwoGate Compliance for ACTIVE or VERIFIED offers
      if (status === 'ACTIVE' || status === 'VERIFIED') {
        const twoGate = TwoGateVerifier.verifyOffer(rec, { catalogPartMap: canonicalParts });
        if (!twoGate.passed) {
          contradictions.push({
            file: manifest.name,
            part_number: normPart,
            asin,
            status,
            error: `TwoGateVerifier failed for ${status} offer: ${twoGate.errors.join('; ')}`
          });
        }

        // Active Authorization Invariant: only the 3 authorized pilot parts may be ACTIVE
        if (status === 'ACTIVE' && !AUTHORIZED_PILOT_PARTS.has(normPart)) {
          unauthorizedActives.push({
            file: manifest.name,
            part_number: normPart,
            asin,
            error: `Unauthorized active offer: ${normPart} is not in authorized pilot whitelist`
          });
        }
      }

      // 5. ASIN_IDENTITY_UNVERIFIED Safety Check
      if (rec.status === 'ASIN_IDENTITY_UNVERIFIED' && rec.is_active === true) {
        unverifiedActives.push({
          file: manifest.name,
          part_number: normPart,
          asin,
          error: 'Offer is marked ASIN_IDENTITY_UNVERIFIED but has is_active === true'
        });
      }
    }
  }

  console.log('\n===============================================================');
  console.log('📊 AUDIT SUMMARY REPORT');
  console.log('===============================================================');
  console.log(`TOTAL_RECORDS_SCANNED       : ${totalScanned}`);
  console.log(`CONTRADICTION_VIOLATIONS    : ${contradictions.length}`);
  console.log(`GTIN_CHECK_DIGIT_FAILURES   : ${gtinErrors.length}`);
  console.log(`UNVERIFIED_ACTIVE_LEAKS     : ${unverifiedActives.length}`);
  console.log(`UNAUTHORIZED_ACTIVE_OFFERS  : ${unauthorizedActives.length}`);
  console.log('===============================================================\n');

  if (contradictions.length > 0 || gtinErrors.length > 0 || unverifiedActives.length > 0 || unauthorizedActives.length > 0) {
    console.error('❌ CONSISTENCY AUDIT FAILED:');
    for (const c of contradictions) console.error(`  - [CONTRADICTION] ${c.file} (${c.part_number || 'N/A'}): ${c.error}`);
    for (const g of gtinErrors) console.error(`  - [GTIN ERROR] ${g.file} (${g.part_number}): ${g.gtin} - ${g.error}`);
    for (const u of unverifiedActives) console.error(`  - [UNVERIFIED ACTIVE] ${u.file} (${u.part_number}): ${u.error}`);
    for (const a of unauthorizedActives) console.error(`  - [UNAUTHORIZED ACTIVE] ${a.file} (${a.part_number}): ${a.error}`);
    return { success: false, contradictions, gtinErrors, unverifiedActives, unauthorizedActives };
  }

  console.log('✅ ALL AFFILIATE MANIFESTS, GTINS, AND OFFERS ARE 100% CONSISTENT AND VERIFIED CLEAN!\n');
  return { success: true };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = checkAffiliateConsistency();
  if (!result.success) {
    process.exit(1);
  }
}
