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
    const normPart = PartNormalizer.normalizePartNumber(item.part_number);
    const cleanAsin = (item.asin || '').trim().toUpperCase();

    // 1. Validate Part Existence in Catalog
    if (!normPart || !canonicalPartsSet.has(normPart)) {
      report.invalid.push({ item, reason: `Part ${item.part_number} does not exist in canonical parts catalog` });
      continue;
    }

    // 2. Validate ASIN format
    if (!isValidAsin(cleanAsin)) {
      report.invalid.push({ item, reason: `Invalid ASIN format: ${item.asin}` });
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

    // 4. Volatile data rejection (disallow storing price/stock)
    if (item.price !== null && item.price !== undefined && item.price !== '') {
      report.rejected.push({ item, reason: 'Volatile facts (price) cannot be stored in static catalog offer' });
      continue;
    }
    if (item.in_stock !== null && item.in_stock !== undefined && item.in_stock !== '') {
      report.rejected.push({ item, reason: 'Volatile facts (in_stock) cannot be stored in static catalog offer' });
      continue;
    }

    // 5. Strict Contract Check
    const matchType = item.match_type || item.classification || MATCH_CLASSIFICATIONS.OEM_STIHL_EXACT;
    const isAftermarket = matchType === MATCH_CLASSIFICATIONS.AFTERMARKET_EXACT_REFERENCE || matchType === MATCH_CLASSIFICATIONS.VERIFIED_AFTERMARKET_EXACT;

    const candidateRecord = {
      part_number: normPart,
      asin: cleanAsin,
      marketplace: (item.marketplace || 'amazon.nl').trim().toLowerCase(),
      match_type: matchType,
      verification_status: item.verification_status || VERIFICATION_STATUSES.VERIFIED_EXACT_MATCH,
      verification_method: item.verification_method || VERIFICATION_METHODS.MANUAL_CATALOG_AUDIT,
      verified_at: item.verified_at || new Date().toISOString(),
      evidence_source: item.evidence_source || (Array.isArray(item.evidence_sources) && item.evidence_sources[0]?.url ? item.evidence_sources[0].url : ''),
      evidence_sources: Array.isArray(item.evidence_sources) ? item.evidence_sources : (item.evidence_source ? [{ type: 'REFERENCE', url: item.evidence_source, retrieved_at: item.verified_at || new Date().toISOString() }] : []),
      proof: item.proof || null,
      product_type: item.product_type || (isAftermarket ? PRODUCT_TYPES.AFTERMARKET : PRODUCT_TYPES.OEM),
      aftermarket_brand: item.aftermarket_brand || item.brand || null,
      brand: item.brand || item.aftermarket_brand || null,
      manufacturer_part_number: item.manufacturer_part_number || item.manufacturer_part || null,
      gtin: item.gtin || item.gtin_if_known || item.ean || item.upc || null,
      price: null,
      in_stock: null,
      enabled: true
    };

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
