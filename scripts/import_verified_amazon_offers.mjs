/**
 * Script: Manual Verified Amazon ASIN Intake Tool
 * Phase 56C — Affiliate Production Verification & Conversion Readiness
 *
 * Implements strict, fail-closed validation and ingestion for manually audited
 * or API-verified Amazon product matches.
 *
 * Usage:
 *   node scripts/import_verified_amazon_offers.mjs [--file <path>] [--dry-run]
 *
 * INVARIANTS:
 * - Pre-write validation: Part exists, valid ASIN, valid marketplace, ISO timestamp, provenance.
 * - Zero partial writes: Rejects batch entirely if any candidate is invalid or conflicting.
 * - No duplicate part numbers, no duplicate ASINs.
 * - Disallow temporary prices / stock claims as static facts.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { PartNormalizer } from '../src/parts/PartNormalizer.js';
import {
  AmazonExactMatchVerifier,
  MATCH_CLASSIFICATIONS,
  VERIFICATION_METHODS,
  PRODUCT_TYPES
} from '../src/affiliate/AmazonExactMatchVerifier.js';
import {
  isValidAsin,
  isValidIsoTimestamp,
  ALLOWED_AMAZON_MARKETPLACES,
  VERIFICATION_STATUSES
} from '../src/affiliate/AmazonAffiliateProvider.js';
import {
  PRODUCTION_VERIFIED_CLASSIFICATIONS,
  isProductionVerifiedClassification,
  isValidEvidenceSource,
  isKnownPartNumberMismatch,
  isValidStructuredProof,
  isProductionVerifiedAmazonOffer
} from '../src/affiliate/AmazonProductionOfferContract.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const offersPath = path.join(rootDir, 'data', 'affiliate', 'amazon_part_offers.json');
const catalogPath = path.join(rootDir, 'data', 'parts_catalog.json');

export function importVerifiedOffers(options = {}) {
  const filePath = options.file || path.join(rootDir, 'data', 'affiliate', 'incoming_verified_offers.json');
  const dryRun = Boolean(options.dryRun);

  const report = {
    total_input: 0,
    accepted: [],
    rejected: [],
    ambiguous: [],
    duplicate: [],
    invalid: [],
    dry_run: dryRun,
    written: false,
    errors: []
  };

  if (!fs.existsSync(filePath)) {
    report.errors.push(`Input file not found: ${filePath}`);
    return report;
  }

  // Load canonical parts set for existence check
  let canonicalPartsSet = new Set();
  if (fs.existsSync(catalogPath)) {
    try {
      const catalogDoc = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
      if (catalogDoc.parts) {
        canonicalPartsSet = new Set(
          Array.isArray(catalogDoc.parts)
            ? catalogDoc.parts.map(p => PartNormalizer.normalizePartNumber(p.part_number)).filter(Boolean)
            : Object.keys(catalogDoc.parts)
        );
      }
    } catch (err) {
      report.errors.push(`Failed loading parts catalog: ${err.message}`);
      return report;
    }
  }

  // Load existing offers
  const existingDoc = JSON.parse(fs.readFileSync(offersPath, 'utf8'));
  const existingOffers = Array.isArray(existingDoc.offers) ? existingDoc.offers : [];
  const existingPartSet = new Set(existingOffers.map(o => PartNormalizer.normalizePartNumber(o.part_number)).filter(Boolean));
  const existingAsinSet = new Set(existingOffers.map(o => (o.asin || '').trim().toUpperCase()).filter(Boolean));

  // Parse incoming candidates
  let rawItems = [];
  const rawContent = fs.readFileSync(filePath, 'utf8').trim();
  if (rawContent.startsWith('{') || rawContent.startsWith('[')) {
    const parsed = JSON.parse(rawContent);
    rawItems = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.offers) ? parsed.offers : [parsed]);
  } else {
    // CSV parser
    const lines = rawContent.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length > 1) {
      const header = lines[0].split(',').map(h => h.trim());
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim());
        const row = {};
        header.forEach((h, idx) => { row[h] = cols[idx] || ''; });
        rawItems.push(row);
      }
    }
  }

  report.total_input = rawItems.length;

  const batchPartSet = new Set();
  const batchAsinSet = new Set();

  for (const item of rawItems) {
    try {
    const normPart = PartNormalizer.normalizePartNumber(item && item.part_number);
    const cleanAsin = (item && typeof item.asin === 'string') ? item.asin.trim().toUpperCase() : '';

    // 1. Validate Part Existence in Catalog
    if (!normPart || !canonicalPartsSet.has(normPart)) {
      report.invalid.push({ item, reason: `Part ${item && item.part_number} does not exist in canonical parts catalog` });
      continue;
    }

    // 2. Validate ASIN type + format (type-guarded: non-strings rejected, never coerced)
    if (typeof item.asin !== 'string' || !isValidAsin(cleanAsin)) {
      report.invalid.push({ item, reason: `Invalid ASIN format: ${item.asin}` });
      continue;
    }

    // 2b. Validate marketplace type (non-string marketplace is malformed input)
    if (item.marketplace !== undefined && item.marketplace !== null && typeof item.marketplace !== 'string') {
      report.rejected.push({ item, reason: 'Marketplace must be a string (malformed input rejected)' });
      continue;
    }

    // 3. Duplicate checks
    if (existingPartSet.has(normPart) || batchPartSet.has(normPart)) {
      report.duplicate.push({ item, reason: `Duplicate mapping for part number ${normPart}` });
      continue;
    }
    if (existingAsinSet.has(cleanAsin) || batchAsinSet.has(cleanAsin)) {
      report.duplicate.push({ item, reason: `Duplicate ASIN ${cleanAsin} already mapped` });
      continue;
    }
    batchPartSet.add(normPart);
    batchAsinSet.add(cleanAsin);

    // 4. Volatile data rejection (disallow storing price/stock)
    if (item.price !== null && item.price !== undefined && item.price !== '') {
      report.rejected.push({ item, reason: 'Volatile facts (price) cannot be stored in static catalog offer' });
      continue;
    }
    if (item.in_stock !== null && item.in_stock !== undefined && item.in_stock !== '') {
      report.rejected.push({ item, reason: 'Volatile facts (in_stock) cannot be stored in static catalog offer' });
      continue;
    }

    // 5. Check Classification ALLOWLIST BEFORE DEFAULTING (Phase 57A.2 Section 19, 20)
    const rawClassification = item.classification || item.match_type;
    if (!rawClassification || !isProductionVerifiedClassification(rawClassification)) {
      report.rejected.push({
        item,
        reason: `Classification "${rawClassification}" is not permitted for production import. Only production-verified classifications (${Array.from(PRODUCTION_VERIFIED_CLASSIFICATIONS).join(', ')}) are accepted.`
      });
      continue;
    }

    // 6. Explicit Verification Metadata Required (Section 21 - Zero auto-verified defaults)
    if (!item.verification_status) {
      report.rejected.push({ item, reason: 'Missing explicit verification_status (auto-defaulting is forbidden)' });
      continue;
    }
    if (!item.verification_method) {
      report.rejected.push({ item, reason: 'Missing explicit verification_method (auto-defaulting is forbidden)' });
      continue;
    }
    if (!item.verified_at) {
      report.rejected.push({ item, reason: 'Missing explicit verified_at (auto-defaulting is forbidden)' });
      continue;
    }

    // 7. Structured Proof Required (Section 16, 17) - Zero auto-generated proof for ANY production class
    const isAftermarket = rawClassification === MATCH_CLASSIFICATIONS.AFTERMARKET_EXACT_REFERENCE || rawClassification === MATCH_CLASSIFICATIONS.VERIFIED_AFTERMARKET_EXACT;
    if (!item.proof || typeof item.proof !== 'object' || Array.isArray(item.proof)) {
      report.rejected.push({ item, reason: 'Structured proof object is required for all production-verified classifications (missing or invalid proof)' });
      continue;
    }
    const proof = item.proof;
    if (!isValidStructuredProof(proof, isAftermarket)) {
      const reason = proof.exact_part_number_found !== true
        ? 'proof.exact_part_number_found must be true for production import'
        : proof.asin_identity_verified !== true
          ? 'proof.asin_identity_verified must be true for production import'
          : proof.marketplace_verified !== true
            ? 'proof.marketplace_verified must be true for production import'
            : 'proof.replacement_reference_verified must be true for aftermarket production import';
      report.rejected.push({ item, reason });
      continue;
    }

    // 8. Evidence Sources Required (Section 12, 13, 14) - Structured array only, zero synthetic conversion
    if (!Array.isArray(item.evidence_sources) || item.evidence_sources.length === 0) {
      report.rejected.push({ item, reason: 'evidence_sources must be a non-empty array of valid structured evidence source objects' });
      continue;
    }
    const hasInvalidEvidence = item.evidence_sources.some(s => !isValidEvidenceSource(s));
    if (hasInvalidEvidence) {
      report.rejected.push({ item, reason: 'evidence_sources contains empty or invalid evidence source objects' });
      continue;
    }
    const evidenceSources = item.evidence_sources;

    // 9. Known Part Number Identity Mismatch Check (Section 13, 33)
    if (isKnownPartNumberMismatch(normPart, cleanAsin, item.product || item.title || item.candidate_product)) {
      report.rejected.push({ item, reason: 'PART_NUMBER_PRODUCT_IDENTITY_MISMATCH: Candidate part number and product identity mismatch (known cross-number error)' });
      continue;
    }

    // 10. Strict Contract Check & Candidate Record Construction
    const matchType = rawClassification;

    const candidateRecord = {
      part_number: normPart,
      asin: cleanAsin,
      marketplace: (typeof item.marketplace === 'string' && item.marketplace.trim() ? item.marketplace : 'amazon.nl').trim().toLowerCase(),
      match_type: matchType,
      classification: matchType,
      verification_status: item.verification_status,
      verification_method: item.verification_method,
      verified_at: item.verified_at,
      evidence_source: (evidenceSources && evidenceSources[0]?.url) || '',
      evidence_sources: evidenceSources,
      proof: proof,
      product_type: item.product_type || (isAftermarket ? PRODUCT_TYPES.AFTERMARKET : PRODUCT_TYPES.OEM),
      aftermarket_brand: item.aftermarket_brand || item.brand || null,
      brand: item.brand || item.aftermarket_brand || null,
      manufacturer_part_number: item.manufacturer_part_number || item.manufacturer_part || null,
      gtin: item.gtin || item.gtin_if_known || item.ean || item.upc || null,
      price: null,
      in_stock: null,
      enabled: true
    };

    if (!isProductionVerifiedAmazonOffer(candidateRecord)) {
      report.rejected.push({ item: candidateRecord, reason: 'Candidate record failed central isProductionVerifiedAmazonOffer contract' });
      continue;
    }

    const validation = AmazonExactMatchVerifier.validateCandidate(candidateRecord);
    if (!validation.valid) {
      if (validation.classification === MATCH_CLASSIFICATIONS.AMBIGUOUS) {
        report.ambiguous.push({ item: candidateRecord, reason: validation.errors.join('; ') });
      } else {
        report.rejected.push({ item: candidateRecord, reason: validation.errors.join('; ') });
      }
      continue;
    }

    batchPartSet.add(normPart);
    batchAsinSet.add(cleanAsin);
    report.accepted.push(candidateRecord);
    } catch (err) {
      // Fail closed: a malformed record must never abort batch processing.
      report.invalid.push({ item, reason: `Malformed import record rejected: ${err && err.message ? err.message : 'unexpected error'}` });
    }
  }

  // Fail-closed write decision:
  // Write only if:
  // 1. At least 1 item was accepted
  // 2. ZERO invalid, ZERO rejected, ZERO ambiguous, ZERO duplicate
  // 3. Not dry-run
  const isAllClean = report.invalid.length === 0 &&
                     report.rejected.length === 0 &&
                     report.ambiguous.length === 0 &&
                     report.duplicate.length === 0;

  if (isAllClean && report.accepted.length > 0 && !dryRun) {
    const updatedOffers = [...existingOffers, ...report.accepted];
    const newDoc = {
      ...existingDoc,
      updated_at: new Date().toISOString(),
      offers: updatedOffers
    };
    fs.writeFileSync(offersPath, JSON.stringify(newDoc, null, 2) + '\n');
    report.written = true;
  }

  return report;
}

// CLI execution
if (process.argv[1] && process.argv[1].endsWith('import_verified_amazon_offers.mjs')) {
  const args = process.argv.slice(2);
  let fileArg = null;
  let dryRunArg = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file' && args[i + 1]) fileArg = args[++i];
    if (args[i] === '--dry-run') dryRunArg = true;
  }

  console.log('▶ Running Verified Amazon ASIN Intake Tool...');
  const res = importVerifiedOffers({ file: fileArg, dryRun: dryRunArg });
  console.log(JSON.stringify({
    total_input: res.total_input,
    accepted: res.accepted.length,
    rejected: res.rejected.length,
    ambiguous: res.ambiguous.length,
    duplicate: res.duplicate.length,
    invalid: res.invalid.length,
    written: res.written,
    dry_run: res.dry_run
  }, null, 2));

  if (res.errors.length > 0) {
    console.error('Errors:', res.errors);
    process.exit(1);
  }
}
